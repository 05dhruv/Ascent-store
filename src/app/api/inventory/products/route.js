import { query } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureStoresSchema } from "@/lib/storesSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { repairStockTransferSaleabilityPrices } from "@/lib/stockTransferSaleabilityRepair";
import {
  appendStoreScope,
  getAssignedStoreIds,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addProductSearchFilter(filters, params, search) {
  const raw = String(search || "").trim();
  if (!raw) return;

  params.push(`%${raw}%`);
  const textParam = params.length;
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  params.push(`%${compact}%`);
  const compactParam = params.length;

  filters.push(`(
    COALESCE(p.name, '') ILIKE $${textParam}
    OR COALESCE(p.sku, '') ILIKE $${textParam}
    OR COALESCE(p.barcode, '') ILIKE $${textParam}
    OR LOWER(REGEXP_REPLACE(COALESCE(p.name, ''), '[^a-zA-Z0-9]+', '', 'g')) ILIKE $${compactParam}
    OR LOWER(REGEXP_REPLACE(COALESCE(p.sku, ''), '[^a-zA-Z0-9]+', '', 'g')) ILIKE $${compactParam}
    OR LOWER(REGEXP_REPLACE(COALESCE(p.barcode, ''), '[^a-zA-Z0-9]+', '', 'g')) ILIKE $${compactParam}
  )`);
}

export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    await ensureStoresSchema();
    await ensureInventoryBatchSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const dashboardInventory = ["1", "true", "yes"].includes(
      String(searchParams.get("dashboard_inventory") || "").toLowerCase(),
    );
    if (dashboardInventory) {
      const dashboardPermissionCheck = requirePermission(
        auth.user,
        "VIEW_STORE_INVENTORY_DASHBOARD",
        "VIEW_STORE_PRODUCT_INVENTORY",
      );
      if (dashboardPermissionCheck.error) return dashboardPermissionCheck.error;
    } else {
      const permissionCheck = requirePermission(
        auth.user,
        "MANAGE_STOCK_VALIDATION",
        "VIEW_INVENTORY",
        "MANAGE_INVENTORY",
      );
      if (permissionCheck.error) return permissionCheck.error;
    }

    const search = searchParams.get("search") || "";
    const brandId = Number(searchParams.get("brand_id") || 0) || null;
    const vendorName = String(
      searchParams.get("vendor") || searchParams.get("vendor_name") || "",
    ).trim();
    let storeId = Number(searchParams.get("store_id") || 0) || null;
    const warehouseStock = searchParams.get("warehouse_stock") === "true";
    const storeOnlyViewer =
      auth.user.permissions?.includes("VIEW_STORE_PRODUCT_INVENTORY") &&
      !auth.user.permissions?.some((permission) =>
        ["VIEW_INVENTORY", "MANAGE_INVENTORY", "*"].includes(permission),
      );
    if (warehouseStock && storeOnlyViewer) {
      return errorResponse(
        "Warehouse inventory and pricing are not available for this permission",
        403,
      );
    }
    const batchVariants = ["1", "true", "yes"].includes(
      String(searchParams.get("batch_variants") || "").toLowerCase(),
    );
    const includeMaster = ["1", "true", "yes"].includes(
      String(searchParams.get("include_master") || "").toLowerCase(),
    );
    const includeExpired = ["1", "true", "yes"].includes(
      String(searchParams.get("include_expired") || "").toLowerCase(),
    );
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const offset = (page - 1) * pageSize;

    if (warehouseStock) {
      const params = [];
      const filters = [`TRUE`];
      const warehouseStoreWhere = [];
      const scope = appendStoreScope(
        warehouseStoreWhere,
        params,
        "id",
        auth.user,
      );
      if (scope.error) return scope.error;

      addProductSearchFilter(filters, params, search);
      if (brandId) {
        params.push(brandId);
        filters.push(`p.brand_id = $${params.length}`);
      }
      if (vendorName) {
        params.push(vendorName);
        filters.push(`EXISTS (
          SELECT 1
          FROM stock_in_items sii_vendor
          INNER JOIN stock_in si_vendor ON si_vendor.id = sii_vendor.stock_in_id
          WHERE sii_vendor.product_id = p.id
            AND si_vendor.status = 'confirmed'
            AND LOWER(COALESCE(si_vendor.vendor_name, '')) = LOWER($${params.length})
        )`);
      }

      const where = filters.length ? `AND ${filters.join(" AND ")}` : "";

      const warehouseInventoryQuery = `
        WITH warehouse_locations AS (
          SELECT id
          FROM stores
          WHERE LOWER(COALESCE(meta->>'locationType', 'Warehouse')) = 'warehouse'
            ${warehouseStoreWhere.length ? `AND ${warehouseStoreWhere.join(" AND ")}` : ""}
        ), movement_products AS (
          SELECT
            ib.product_id,
            SUM(ib.available_qty) AS available_qty,
            SUM(ib.available_qty * COALESCE(NULLIF(ib.cost_price, 0), p_cost.cost_price, 0)) AS stock_cost
          FROM inventory_batches ib
          LEFT JOIN products p_cost ON p_cost.id = ib.product_id
          INNER JOIN warehouse_locations wl ON wl.id = ib.store_id
          WHERE ib.status = 'active'
            AND ib.available_qty > 0
            AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
          GROUP BY ib.product_id
        )
        SELECT
          COALESCE(p.id, mp.product_id) AS id,
          COALESCE(p.product_id::text, mp.product_id::text) AS product_id,
          COALESCE(p.name, '') AS name,
          COALESCE(p.sku, '') AS sku,
          COALESCE(p.barcode, '') AS barcode,
          COALESCE(p.mrp, 0) AS mrp,
          COALESCE(p.selling_price, 0) AS selling_price,
          CASE WHEN mp.available_qty > 0
            THEN COALESCE(mp.stock_cost, 0) / mp.available_qty
            ELSE COALESCE(p.cost_price, 0)
          END AS cost_price,
          COALESCE(mp.stock_cost, 0) AS "stockCost",
          c.name AS "categoryName",
          b.name AS "brandName",
          COALESCE(mp.available_qty, 0) AS "availableStock",
          COALESCE(t.rate, 0) AS "taxRate"
        FROM movement_products mp
        LEFT JOIN products p ON p.id = mp.product_id
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN taxes t ON p.tax_id = t.id
        WHERE COALESCE(mp.available_qty, 0) > 0
        ${where}
      `;

      const count = await query(
        `SELECT
           COUNT(*)::int AS count,
           COALESCE(SUM(inventory."availableStock"), 0) AS total_units,
           COALESCE(SUM(inventory."stockCost"), 0) AS total_stock_cost
         FROM (${warehouseInventoryQuery}) inventory`,
        params,
      );

      params.push(pageSize, offset);

      const result = await query(
        `SELECT * FROM (${warehouseInventoryQuery}) inventory
         ORDER BY name ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return successResponse({
        records: result.rows.map((row) => ({
          ...row,
          availableStock: toNumber(row.availableStock),
          cost_price: toNumber(row.cost_price),
          stockCost: toNumber(row.stockCost),
        })),
        total: count.rows[0]?.count || 0,
        summary: {
          totalProducts: count.rows[0]?.count || 0,
          totalUnits: toNumber(count.rows[0]?.total_units),
          totalStockCost: toNumber(count.rows[0]?.total_stock_cost),
        },
        page,
        pageSize,
        totalPages: Math.ceil((count.rows[0]?.count || 0) / pageSize),
      });
    }

    if (!storeId && auth.user.role !== "super_admin") {
      storeId = getAssignedStoreIds(auth.user)[0] || null;
    }

    if (!storeId) {
      return successResponse({
        records: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      });
    }

    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;
    await repairStockTransferSaleabilityPrices(storeId);

    if (storeOnlyViewer) {
      const location = await query(`SELECT meta FROM stores WHERE id = $1`, [
        storeId,
      ]);
      if (
        String(
          location.rows[0]?.meta?.locationType || "Store",
        ).toLowerCase() === "warehouse"
      ) {
        return errorResponse(
          "Warehouse inventory and pricing are not available for this permission",
          403,
        );
      }
    }

    if (batchVariants) {
      const params = [storeId];
      const filters = [`COALESCE(p.is_active, TRUE) = TRUE`];

      addProductSearchFilter(filters, params, search);
      if (brandId) {
        params.push(brandId);
        filters.push(`p.brand_id = $${params.length}`);
      }
      if (vendorName) {
        params.push(vendorName);
        filters.push(`EXISTS (
          SELECT 1
          FROM stock_in_items sii_vendor
          INNER JOIN stock_in si_vendor ON si_vendor.id = sii_vendor.stock_in_id
          WHERE sii_vendor.product_id = p.id
            AND si_vendor.status = 'confirmed'
            AND LOWER(COALESCE(si_vendor.vendor_name, '')) = LOWER($${params.length})
        )`);
      }

      const where = filters.length ? `AND ${filters.join(" AND ")}` : "";
      const batchRowsQuery = `
          SELECT
            p.id,
            p.product_id::text AS product_id,
            p.name,
            COALESCE(p.sku, '') AS sku,
            COALESCE(p.barcode, '') AS barcode,
            COALESCE(
              NULLIF(ib.meta->>'mrp', '')::numeric,
              NULLIF(source_transfer_item.destination_mrp, 0),
              NULLIF(source_transfer_item.mrp, 0),
              NULLIF(transfer_price.mrp, 0),
              NULLIF(ps.mrp, 0),
              p.mrp,
              0
            ) AS mrp,
            COALESCE(
              NULLIF(ib.meta->>'sellingPrice', '')::numeric,
              NULLIF(source_transfer_item.selling_price, 0),
              NULLIF(transfer_price.selling_price, 0),
              NULLIF(ps.selling_price, 0),
              p.selling_price,
              0
            ) AS selling_price,
            COALESCE(
              NULLIF(ib.cost_price, 0),
              NULLIF(ib.meta->>'costPrice', '')::numeric,
              p.cost_price,
              0
            ) AS cost_price,
            c.name AS "categoryName",
            b.name AS "brandName",
            COALESCE(ib.available_qty, 0) AS "availableStock",
            COALESCE(t.rate, 0) AS "taxRate",
            ib.id AS "batchId",
            ib.batch_no AS "batchNo",
            ib.expiry_date AS "expiryDate",
            ib.meta AS "batchMeta"
          FROM inventory_batches ib
          INNER JOIN products p ON p.id = ib.product_id
          LEFT JOIN product_saleability ps ON ps.product_id = p.id AND ps.store_id = $1 AND ps.is_active = TRUE
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN brands b ON p.brand_id = b.id
          LEFT JOIN taxes t ON p.tax_id = t.id
          LEFT JOIN stock_transfer_items source_transfer_item
            ON ib.source_type = 'stock_transfer'
           AND source_transfer_item.id = CASE
             WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
               THEN NULLIF(ib.source_id, '')::BIGINT
             ELSE NULL
           END
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) AS mrp,
              sti.selling_price,
              COALESCE(st.confirmed_at, st.created_at) AS confirmed_at
            FROM stock_transfer_items sti
            INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
            WHERE st.status = 'confirmed'
              AND st.destination_id = $1
              AND sti.product_id = p.id
              AND (
                COALESCE(sti.selling_price, 0) > 0
                OR COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
              )
            ORDER BY COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
            LIMIT 1
          ) transfer_price ON TRUE
          WHERE ib.store_id = $1
            AND ib.status = 'active'
            AND ib.available_qty > 0
            ${includeExpired ? "" : "AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)"}
            ${where}
        `;

      const masterRowsQuery = `
          SELECT
            p.id,
            p.product_id::text AS product_id,
            p.name,
            COALESCE(p.sku, '') AS sku,
            COALESCE(p.barcode, '') AS barcode,
            COALESCE(
              NULLIF(ps.mrp, 0),
              NULLIF(transfer_price.mrp, 0),
              p.mrp,
              0
            ) AS mrp,
            COALESCE(
              NULLIF(ps.selling_price, 0),
              NULLIF(transfer_price.selling_price, 0),
              p.selling_price,
              0
            ) AS selling_price,
            COALESCE(p.cost_price, 0) AS cost_price,
            c.name AS "categoryName",
            b.name AS "brandName",
            0::numeric AS "availableStock",
            COALESCE(t.rate, 0) AS "taxRate",
            NULL::bigint AS "batchId",
            NULL::text AS "batchNo",
            NULL::date AS "expiryDate",
            '{}'::jsonb AS "batchMeta"
          FROM products p
          LEFT JOIN product_saleability ps ON ps.product_id = p.id AND ps.store_id = $1 AND ps.is_active = TRUE
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN brands b ON p.brand_id = b.id
          LEFT JOIN taxes t ON p.tax_id = t.id
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) AS mrp,
              sti.selling_price,
              COALESCE(st.confirmed_at, st.created_at) AS confirmed_at
            FROM stock_transfer_items sti
            INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
            WHERE st.status = 'confirmed'
              AND st.destination_id = $1
              AND sti.product_id = p.id
              AND (
                COALESCE(sti.selling_price, 0) > 0
                OR COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
              )
            ORDER BY COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
            LIMIT 1
          ) transfer_price ON TRUE
          WHERE COALESCE(p.is_active, TRUE) = TRUE
            AND NOT EXISTS (
              SELECT 1
              FROM inventory_batches existing_ib
              WHERE existing_ib.store_id = $1
                AND existing_ib.product_id = p.id
                AND existing_ib.status = 'active'
                AND existing_ib.available_qty > 0
                ${includeExpired ? "" : "AND (existing_ib.expiry_date IS NULL OR existing_ib.expiry_date >= CURRENT_DATE)"}
            )
            ${where}
        `;

      const inventoryQuery = includeMaster
        ? `
          ${batchRowsQuery}
          UNION ALL
          ${masterRowsQuery}
        `
        : batchRowsQuery;

      const count = await query(
        `SELECT COUNT(*)::int AS count FROM (${inventoryQuery}) inventory`,
        params,
      );

      params.push(pageSize, offset);
      const result = await query(
        `SELECT * FROM (${inventoryQuery}) inventory
         ORDER BY name ASC, "batchNo" ASC, mrp ASC, cost_price ASC, "batchId" ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return successResponse({
        records: result.rows.map((row) => ({
          ...row,
          batch_id: row.batchId,
          batch_no: row.batchNo,
          expiry_date: row.expiryDate,
          availableStock: toNumber(row.availableStock),
          existingQty: toNumber(row.availableStock),
          existing_qty: toNumber(row.availableStock),
          cost_price: toNumber(row.cost_price),
          variantKey: `${row.id}:batch:${row.batchId}:mrp:${toNumber(row.mrp)}:exp:${row.expiryDate || ""}`,
        })),
        total: count.rows[0]?.count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count.rows[0]?.count || 0) / pageSize),
      });
    }

    const params = [storeId];
    const filters = [`TRUE`];

    addProductSearchFilter(filters, params, search);
    if (brandId) {
      params.push(brandId);
      filters.push(`p.brand_id = $${params.length}`);
    }
    if (vendorName) {
      params.push(vendorName);
      filters.push(`EXISTS (
        SELECT 1
        FROM stock_in_items sii_vendor
        INNER JOIN stock_in si_vendor ON si_vendor.id = sii_vendor.stock_in_id
        WHERE sii_vendor.product_id = p.id
          AND si_vendor.status = 'confirmed'
          AND LOWER(COALESCE(si_vendor.vendor_name, '')) = LOWER($${params.length})
      )`);
    }

    const where = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const inventoryQuery = `
      WITH movement_products AS (
        SELECT
          ib.product_id,
          SUM(ib.available_qty) AS available_qty,
          SUM(ib.available_qty * COALESCE(NULLIF(ib.cost_price, 0), p_cost.cost_price, 0)) AS stock_cost
        FROM inventory_batches ib
        LEFT JOIN products p_cost ON p_cost.id = ib.product_id
        WHERE ib.store_id = $1
          AND ib.status = 'active'
          AND ib.available_qty > 0
          ${includeExpired ? "" : "AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)"}
        GROUP BY ib.product_id
      )
      SELECT
        COALESCE(p.id, mp.product_id) AS id,
        COALESCE(p.product_id::text, mp.product_id::text) AS product_id,
        COALESCE(p.name, '') AS name,
        COALESCE(p.sku, '') AS sku,
        COALESCE(p.barcode, '') AS barcode,
        COALESCE(
          NULLIF(ps.mrp, 0),
          NULLIF(transfer_price.mrp, 0),
          p.mrp,
          0
        ) AS mrp,
        COALESCE(
          NULLIF(ps.selling_price, 0),
          NULLIF(transfer_price.selling_price, 0),
          p.selling_price,
          0
        ) AS selling_price,
        CASE WHEN mp.available_qty > 0
          THEN COALESCE(mp.stock_cost, 0) / mp.available_qty
          ELSE COALESCE(p.cost_price, 0)
        END AS cost_price,
        COALESCE(mp.stock_cost, 0) AS "stockCost",
        c.name AS "categoryName",
        b.name AS "brandName",
        COALESCE(mp.available_qty, 0) AS "availableStock",
        COALESCE(t.rate, 0) AS "taxRate"
      FROM movement_products mp
      LEFT JOIN products p ON p.id = mp.product_id
      LEFT JOIN product_saleability ps ON ps.product_id = p.id AND ps.store_id = $1 AND ps.is_active = TRUE
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN taxes t ON p.tax_id = t.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) AS mrp,
          sti.selling_price,
          COALESCE(st.confirmed_at, st.created_at) AS confirmed_at
        FROM stock_transfer_items sti
        INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
        WHERE st.status = 'confirmed'
          AND st.destination_id = $1
          AND sti.product_id = p.id
          AND (
            COALESCE(sti.selling_price, 0) > 0
            OR COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
          )
        ORDER BY COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
        LIMIT 1
      ) transfer_price ON TRUE
      WHERE COALESCE(mp.available_qty, 0) > 0
      ${where}
    `;

    const count = await query(
      `SELECT
         COUNT(*)::int AS count,
         COALESCE(SUM(inventory."availableStock"), 0) AS total_units,
         COALESCE(SUM(inventory."stockCost"), 0) AS total_stock_cost
       FROM (${inventoryQuery}) inventory`,
      params,
    );

    params.push(pageSize, offset);

    const result = await query(
      `SELECT * FROM (${inventoryQuery}) inventory
       ORDER BY name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return successResponse({
      records: result.rows.map((row) => ({
        ...row,
        availableStock: toNumber(row.availableStock),
        cost_price: toNumber(row.cost_price),
        stockCost: toNumber(row.stockCost),
      })),
      total: count.rows[0]?.count || 0,
      summary: {
        totalProducts: count.rows[0]?.count || 0,
        totalUnits: toNumber(count.rows[0]?.total_units),
        totalStockCost: toNumber(count.rows[0]?.total_stock_cost),
      },
      page,
      pageSize,
      totalPages: Math.ceil((count.rows[0]?.count || 0) / pageSize),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}
