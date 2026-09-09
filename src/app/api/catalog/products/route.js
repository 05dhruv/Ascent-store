import { query, getClient } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  validationError,
} from "@/lib/api-response";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureStockOutSchema } from "@/lib/stockOutSchema";
import { ensureSalesBillingSchema } from "@/lib/salesBillingSchema";
import {
  ensureInventoryBatchSchema,
  receiveBatchStock,
} from "@/lib/inventoryBatching";
import { ensureProductDiscountSchema } from "@/lib/productDiscountSchema";
import { ensureProductImageSchema } from "@/lib/productImageSchema";
import {
  getAssignedStoreIds,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { generateProductBarcode, normalizeBarcode } from "@/lib/productBarcode";
import { validatePriceSet } from "@/lib/priceIntegrity";

function duplicateProductMessage(error) {
  const detail =
    `${error?.constraint || ""} ${error?.detail || ""}`.toLowerCase();
  if (detail.includes("barcode"))
    return "Product with this barcode already exists";
  if (detail.includes("product_id"))
    return "Product with this Product ID already exists";
  if (detail.includes("sku")) return "Product with this SKU already exists";
  return "A product with one of these unique identifiers already exists";
}

function normalizeUnit(value) {
  const unit = String(value || "PCS")
    .trim()
    .toUpperCase();
  if (["G", "GM", "GRAM", "GRAMS"].includes(unit)) return "GRAMS";
  return ["PCS", "KG", "GRAMS", "LTR"].includes(unit) ? unit : "PCS";
}

function normalizeLegacyGramPrices(row) {
  if (normalizeUnit(row.unit) !== "GRAMS") return row;

  const sellingPrice = Number(row.selling_price || 0);
  const mrp = Number(row.mrp || 0);
  const hasDoubleConvertedMrp =
    mrp > 0 && sellingPrice > 0 && mrp < sellingPrice / 100;

  if (!hasDoubleConvertedMrp) return row;

  const correctedMrp = mrp * 1000;
  const correctedMinMrp = Number(row.min_mrp || 0) * 1000;
  const correctedMaxMrp = Number(row.max_mrp || 0) * 1000;

  return {
    ...row,
    mrp: correctedMrp,
    min_mrp: correctedMinMrp || correctedMrp,
    max_mrp: correctedMaxMrp || correctedMrp,
  };
}

function resolveInventoryUnit(row) {
  const batchUnit = row.batch_unit ? normalizeUnit(row.batch_unit) : null;
  if (batchUnit) return { ...row, unit: batchUnit };

  const masterUnit = normalizeUnit(row.unit);
  const activeBatches = Number(row.active_batch_count || 0);
  const stock = Number(row.actual_stock || 0);
  const maxMrp = Number(row.max_mrp || row.mrp || 0);
  const maxSellingPrice = Number(
    row.max_selling_price || row.selling_price || 0,
  );

  // Older loose-stock imports did not snapshot their transaction unit and a
  // few product masters were consequently left as PCS.  A large active stock
  // with sub-rupee batch prices is unambiguous per-gram inventory evidence.
  // Keep ordinary packaged products on their explicitly saved master unit.
  const isLegacyLooseGramStock =
    masterUnit === "PCS" &&
    activeBatches > 0 &&
    stock >= 1000 &&
    maxMrp > 0 &&
    maxMrp <= 1 &&
    maxSellingPrice > 0 &&
    maxSellingPrice <= 1;

  return {
    ...row,
    unit: isLegacyLooseGramStock ? "GRAMS" : masterUnit,
  };
}

function normalizeStockItemType(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "batched"
    ? "batched"
    : "unbatched";
}

async function validateBarcodeAvailability(
  client,
  { barcode, stockItemType, excludeId = null },
) {
  const normalizedBarcode = String(barcode || "").trim();
  if (!normalizedBarcode) return null;

  const params = [normalizedBarcode];
  const excludeClause = excludeId ? `AND id <> $2` : "";
  if (excludeId) params.push(Number(excludeId));

  const duplicates = await client.query(
    `SELECT id, name, stock_item_type
     FROM products
     WHERE barcode = $1
       ${excludeClause}
     LIMIT 5`,
    params,
  );
  if (!duplicates.rows.length) return null;

  const incomingType = normalizeStockItemType(stockItemType);
  const blocked = duplicates.rows.find(
    (row) =>
      normalizeStockItemType(row.stock_item_type) !== "batched" ||
      incomingType !== "batched",
  );
  if (blocked) {
    return `Barcode already used by "${blocked.name}". Duplicate barcodes are allowed only when both products are batched.`;
  }
  return null;
}

// ─── GET /api/catalog/products ───────────────────────────────
export async function GET(request) {
  try {
    await Promise.allSettled([
      ensureStockInSchema(),
      ensureStockOutSchema(),
      ensureSalesBillingSchema(),
      ensureInventoryBatchSchema(),
      ensureProductImageSchema(),
    ]);

    await ensureProductDiscountSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "VIEW_CATALOG",
      "MANAGE_CATALOG",
      "MANAGE_STOCK_REQUISITION",
      "CREATE_STORE_PURCHASE_ORDER",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const idsParam = searchParams.get("ids") || "";
    const department_id = searchParams.get("department_id") || "";
    const category_id = searchParams.get("category_id") || "";
    const brand_id = searchParams.get("brand_id") || "";
    const brandIds = [
      ...new Set(
        (searchParams.get("brand_ids") || "")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isSafeInteger(value) && value > 0),
      ),
    ];
    const is_active = searchParams.get("is_active");
    const returnAll = ["true", "1", "yes"].includes(
      String(searchParams.get("all") || "").toLowerCase(),
    );
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");
    const offset = (page - 1) * pageSize;
    const requestedStoreId =
      Number(
        searchParams.get("store_id") || searchParams.get("storeId") || 0,
      ) || null;
    const requestedWarehouseId =
      Number(searchParams.get("warehouse_id") || 0) || null;
    const includeAllProducts = ["true", "1", "yes"].includes(
      String(searchParams.get("includeAllProducts") || "").toLowerCase(),
    );
    const allAssignedStores = ["true", "1", "yes"].includes(
      String(searchParams.get("all_assigned_stores") || "").toLowerCase(),
    );
    const storeCostOnly =
      auth.user.permissions?.includes("CREATE_STORE_PURCHASE_ORDER") &&
      !auth.user.permissions?.some((permission) =>
        ["VIEW_CATALOG", "MANAGE_CATALOG", "*"].includes(permission),
      );
    if (storeCostOnly && !requestedStoreId && !allAssignedStores) {
      return errorResponse(
        "Select an assigned store before viewing product cost",
        400,
      );
    }

    const conditions = [];
    const params = [];
    let i = 1;
    let stockStoreFilter = "";
    const requestedIds = idsParam
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (requestedIds.length) {
      conditions.push(`p.id = ANY($${i}::int[])`);
      params.push(requestedIds);
      i++;
    }

    if (requestedStoreId) {
      const storeCheck = requireStore(auth.user, requestedStoreId);
      if (storeCheck.error) return storeCheck.error;
      if (!includeAllProducts) {
        conditions.push(
          `EXISTS (SELECT 1 FROM product_saleability ps_scope WHERE ps_scope.product_id = p.id AND ps_scope.store_id = $${i} AND ps_scope.is_active = TRUE)`,
        );
      } else {
        // Keep the store parameter referenced in the count query while allowing
        // promotion lookups to search the complete product master.
        conditions.push(`$${i}::bigint IS NOT NULL`);
      }
      params.push(requestedStoreId);
      stockStoreFilter = `AND store_id = $${i}`;
      i++;
    } else if (!requestedWarehouseId && auth.user.role !== "super_admin") {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) {
        conditions.push("1 = 0");
        stockStoreFilter = "AND 1 = 0";
      } else {
        conditions.push(
          `EXISTS (SELECT 1 FROM product_saleability ps_scope WHERE ps_scope.product_id = p.id AND ps_scope.store_id = ANY($${i}::int[]) AND ps_scope.is_active = TRUE)`,
        );
        params.push(assignedStores);
        stockStoreFilter = `AND store_id = ANY($${i}::int[])`;
        i++;
      }
    }

    if (requestedWarehouseId) {
      const warehouseCheck = requireStore(auth.user, requestedWarehouseId);
      if (warehouseCheck.error) return warehouseCheck.error;
      // Keep the warehouse parameter part of the main product predicate too.
      // The count query uses this predicate, while the stock aggregation below
      // uses the same placeholder to calculate the displayed stock.
      conditions.push(
        `(p.id IN (SELECT ib_scope.product_id FROM inventory_batches ib_scope WHERE ib_scope.store_id = $${i} AND ib_scope.status = 'active' AND ib_scope.available_qty > 0))`,
      );
      params.push(requestedWarehouseId);
      stockStoreFilter = `AND store_id = $${i}`;
      i++;
    }

    if (search) {
      conditions.push(
        `(p.name ILIKE $${i} OR p.barcode ILIKE $${i} OR p.sku ILIKE $${i} OR p.product_id ILIKE $${i})`,
      );
      params.push(`%${search}%`);
      i++;
    }
    if (category_id) {
      conditions.push(`p.category_id = $${i}`);
      params.push(category_id);
      i++;
    }
    if (department_id) {
      conditions.push(`p.department_id = $${i}`);
      params.push(department_id);
      i++;
    }
    if (brandIds.length) {
      conditions.push(`p.brand_id = ANY($${i}::int[])`);
      params.push(brandIds);
      i++;
    } else if (brand_id) {
      conditions.push(`p.brand_id = $${i}`);
      params.push(brand_id);
      i++;
    }
    if (is_active !== null && is_active !== "") {
      conditions.push(`p.is_active = $${i}`);
      params.push(is_active === "true");
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = returnAll
      ? null
      : await query(`SELECT COUNT(*) FROM products p ${where}`, params);
    const total = returnAll ? 0 : parseInt(countResult.rows[0].count);

    const paginationSql = returnAll ? "" : `LIMIT $${i} OFFSET $${i + 1}`;
    const queryParams = returnAll ? params : [...params, pageSize, offset];
    // Store-specific assignments are an explicit pricing fallback. Batch
    // prices remain the primary source because transfers snapshot the actual
    // price that applies at the destination location.
    const storeAssignmentJoin = `LEFT JOIN product_saleability ps_store
           ON ps_store.product_id = p.id
          AND ps_store.store_id = ${requestedStoreId || 0}
          AND ps_store.is_active = TRUE`;

    const result = await query(
      `SELECT
        p.id, p.product_id, p.name, p.barcode, p.sku,
        COALESCE(p.category_id, b.category_id) AS category_id,
        p.sub_category_id, p.brand_id, p.manufacturer_id,
        p.department_id, p.income_head_id, p.tax_id,
        COALESCE(NULLIF(latest_store_batch.mrp, 0), NULLIF(batch_agg.min_mrp, 0), NULLIF(ps_store.mrp, 0), p.mrp, 0) AS mrp,
        COALESCE(NULLIF(latest_store_batch.selling_price, 0), NULLIF(batch_agg.min_selling_price, 0), NULLIF(ps_store.selling_price, 0), p.selling_price, 0) AS selling_price,
        COALESCE(NULLIF(latest_store_batch.cost_price, 0), NULLIF(batch_agg.min_cost_price, 0), NULLIF(batch_agg.stock_cost / NULLIF(batch_agg.qty, 0), 0), NULLIF(ps_store.franchise_cost, 0), p.cost_price, 0) AS cost_price,
        p.unit,
        p.is_active, p.is_service, p.image_url, p.allow_discount_on_pos, p.include_tax,
        p.stock_item_type, p.inventory_method, p.hsn_code, p.charge_id,
        p.created_at, p.updated_at,
        COALESCE(c.name, bc.name) AS category_name,
        sc.name AS sub_category_name,
        b.name  AS brand_name,
        m.name  AS manufacturer_name,
        d.name  AS department_name,
        ih.name AS income_head_name,
        t.name  AS tax_name,
        t.rate  AS tax_rate,
        COALESCE(batch_agg.qty, 0) AS actual_stock,
        COALESCE(batch_agg.active_batch_count, 0) AS active_batch_count,
        batch_agg.min_cost_price, batch_agg.max_cost_price,
        batch_agg.min_selling_price, batch_agg.max_selling_price,
        batch_agg.min_mrp, batch_agg.max_mrp,
        batch_agg.batch_unit,
        CASE
          WHEN latest_store_batch.batch_id IS NOT NULL
           AND (COALESCE(latest_store_batch.mrp, 0) > 0
             OR COALESCE(latest_store_batch.selling_price, 0) > 0
             OR COALESCE(latest_store_batch.cost_price, 0) > 0)
            THEN CASE WHEN latest_store_batch.status = 'active' THEN 'active_batch' ELSE 'last_batch' END
          WHEN COALESCE(batch_agg.active_batch_count, 0) > 0 THEN 'active_batch_range'
          WHEN ps_store.product_id IS NOT NULL
           AND (COALESCE(ps_store.mrp, 0) > 0
             OR COALESCE(ps_store.selling_price, 0) > 0
             OR COALESCE(ps_store.franchise_cost, 0) > 0)
            THEN 'store_assignment'
          ELSE 'product_master'
        END AS price_source
       FROM products p
       LEFT JOIN categories     c   ON p.category_id     = c.id
       LEFT JOIN sub_categories sc  ON p.sub_category_id = sc.id
       LEFT JOIN brands         b   ON p.brand_id        = b.id
       LEFT JOIN categories     bc  ON b.category_id     = bc.id
       LEFT JOIN manufacturers  m   ON p.manufacturer_id = m.id
       LEFT JOIN departments    d   ON p.department_id   = d.id
       LEFT JOIN income_heads   ih  ON p.income_head_id  = ih.id
       LEFT JOIN taxes          t   ON p.tax_id          = t.id
       ${storeAssignmentJoin}
       LEFT JOIN LATERAL (
         SELECT ib.id AS batch_id,
                ib.status,
                ib.cost_price,
                NULLIF(ib.meta->>'sellingPrice', '')::numeric AS selling_price,
                NULLIF(ib.meta->>'mrp', '')::numeric AS mrp
         FROM inventory_batches ib
         WHERE ib.product_id = p.id
           ${stockStoreFilter}
         ORDER BY CASE WHEN ib.status = 'active' THEN 0 ELSE 1 END,
                  ib.created_at DESC NULLS LAST, ib.id DESC
         LIMIT 1
       ) latest_store_batch ON TRUE
       LEFT JOIN (
         SELECT product_id,
                SUM(available_qty) AS qty,
                SUM(available_qty * cost_price) AS stock_cost,
                COUNT(*)::INT AS active_batch_count,
                MIN(cost_price) AS min_cost_price,
                MAX(cost_price) AS max_cost_price,
                MIN(NULLIF(meta->>'sellingPrice', '')::numeric) AS min_selling_price,
                MAX(NULLIF(meta->>'sellingPrice', '')::numeric) AS max_selling_price,
                MIN(NULLIF(meta->>'mrp', '')::numeric) AS min_mrp,
                MAX(NULLIF(meta->>'mrp', '')::numeric) AS max_mrp,
                MAX(NULLIF(meta->>'unit', '')) AS batch_unit
         FROM inventory_batches
         WHERE status = 'active'
           ${stockStoreFilter}
           ${storeCostOnly ? "AND store_id IN (SELECT id FROM stores WHERE LOWER(COALESCE(meta->>'locationType', 'Store')) = 'store')" : ""}
           AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         GROUP BY product_id
       ) batch_agg ON batch_agg.product_id = p.id
       ${where}
       ORDER BY p.id DESC
       ${paginationSql}`,
      queryParams,
    );

    return successResponse({
      records: result.rows
        .map(resolveInventoryUnit)
        .map(normalizeLegacyGramPrices),
      total: returnAll ? result.rows.length : total,
      page,
      pageSize: returnAll ? result.rows.length : pageSize,
      totalPages: returnAll ? 1 : Math.ceil(total / pageSize),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

// ─── POST /api/catalog/products ──────────────────────────────
export async function POST(request) {
  try {
    await ensureStockInSchema();
    await ensureInventoryBatchSchema();
    await ensureProductDiscountSchema();
    await ensureProductImageSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "MANAGE_CATALOG");
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return validationError({ name: "Product name is required" });
    }
    const priceValidation = validatePriceSet({
      mrp: body.mrp,
      sellingPrice: body.selling_price,
      costPrice: body.cost_price,
    });
    if (!priceValidation.valid)
      return validationError({ price: priceValidation.error });

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const barcodeError = await validateBarcodeAvailability(client, {
        barcode: body.barcode,
        stockItemType: body.stock_item_type,
      });
      if (barcodeError) {
        await client.query("ROLLBACK");
        return validationError({ barcode: barcodeError }, barcodeError);
      }

      const result = await client.query(
        `INSERT INTO products (
          product_id, name, description, barcode, sku,
          category_id, sub_category_id, brand_id, manufacturer_id,
          department_id, income_head_id, tax_id,
          mrp, selling_price, cost_price, unit,
          is_active, is_service, image_url, allow_discount_on_pos, include_tax,
          stock_item_type, inventory_method, hsn_code, charge_id
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15, COALESCE($16, 'PCS'),
          COALESCE($17, true), COALESCE($18, false), $19, COALESCE($20, false), COALESCE($21, false),
          $22, $23, $24, $25
        ) RETURNING *`,
        [
          body.product_id || null,
          body.name.trim(),
          body.description || null,
          body.barcode || null,
          body.sku || null,
          body.category_id || null,
          body.sub_category_id || null,
          body.brand_id || null,
          body.manufacturer_id || null,
          body.department_id || null,
          body.income_head_id || null,
          body.tax_id || null,
          body.mrp || 0,
          body.selling_price || 0,
          body.cost_price || 0,
          normalizeUnit(body.unit),
          body.is_active ?? true,
          body.is_service ?? false,
          body.image_url || null,
          body.allow_discount_on_pos ?? false,
          body.include_tax ?? false,
          normalizeStockItemType(body.stock_item_type),
          body.inventory_method || "direct",
          body.hsn_code || null,
          body.charge_id || null,
        ],
      );

      const createdProduct = result.rows[0];
      if (!normalizeBarcode(createdProduct.barcode)) {
        const generatedBarcode = generateProductBarcode(createdProduct.id);
        const barcodeUpdate = await client.query(
          "UPDATE products SET barcode = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
          [generatedBarcode, createdProduct.id],
        );
        Object.assign(createdProduct, barcodeUpdate.rows[0]);
      }
      const openingStockQty = Number(body.opening_stock_qty || 0);
      const inventoryStoreId = body.inventory_store_id
        ? Number(body.inventory_store_id)
        : null;
      const manageInventoryEnabled = body.manage_inventory_enabled !== false;
      if (inventoryStoreId) {
        const storeCheck = requireStore(auth.user, inventoryStoreId);
        if (storeCheck.error) {
          await client.query("ROLLBACK");
          return storeCheck.error;
        }
      } else if (openingStockQty > 0 && auth.user.role !== "super_admin") {
        await client.query("ROLLBACK");
        return errorResponse("Store is required for opening stock", 403);
      }

      if (manageInventoryEnabled && openingStockQty > 0) {
        const stockInInsert = await client.query(
          `INSERT INTO stock_in (
            method,
            destination_id,
            apply_taxes,
            add_products_prefill,
            status,
            vendor_name,
            invoice_date,
            invoice_number,
            other_charges,
            remarks,
            total_items,
            total_cost,
            total_tax,
            reference_type,
            reference_id,
            meta,
            created_at,
            confirmed_at
          ) VALUES (
            'new',
            $1,
            true,
            false,
            'confirmed',
            'Opening Stock',
            CURRENT_DATE,
            $2,
            0,
            'Opening stock from product creation',
            $3,
            $4,
            0,
            'product',
            $5,
            $6,
            NOW(),
            NOW()
          ) RETURNING id`,
          [
            inventoryStoreId,
            `OPEN-${createdProduct.id}`,
            openingStockQty,
            openingStockQty * Number(body.cost_price || 0),
            String(createdProduct.id),
            JSON.stringify({
              source: "product-create",
              disable_billing_on_zero: !!body.disable_billing_on_zero,
              disable_sales_on_expiry: !!body.disable_sales_on_expiry,
              inventory_method: body.inventory_method || "direct",
              stock_item_type: body.stock_item_type || "unbatched",
              default_low_stock_value: Number(
                body.default_low_stock_value || 0,
              ),
              minimum_base_quantity: Number(
                body.minimum_base_quantity || body.mbq || 0,
              ),
            }),
          ],
        );

        const stockInId = stockInInsert.rows[0].id;
        await client.query(
          "UPDATE stock_in SET transaction_id = $1 WHERE id = $2",
          [`STK-${String(stockInId).padStart(4, "0")}`, stockInId],
        );
        const stockInItemRes = await client.query(
          `INSERT INTO stock_in_items (stock_in_id, product_id, product_name, qty, cost_price, mrp, selling_price, tax_value, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW())
           RETURNING id`,
          [
            stockInId,
            createdProduct.id,
            createdProduct.name,
            openingStockQty,
            Number(body.cost_price || 0),
            Number(body.mrp || 0),
            Number(body.selling_price || 0),
          ],
        );

        await receiveBatchStock(client, {
          stockInId,
          stockInItemId: stockInItemRes.rows[0]?.id,
          productId: createdProduct.id,
          storeId: inventoryStoreId,
          qty: openingStockQty,
          costPrice: Number(body.cost_price || 0),
          batchNo: body.batch_no || body.batchNo || `OPEN-${createdProduct.id}`,
          mfgDate: body.mfg_date || body.mfgDate || null,
          expiryDate: body.expiry_date || body.expiryDate || null,
          meta: {
            source: "product-create",
            productName: createdProduct.name,
            costPrice: Number(body.cost_price || 0),
            mrp: Number(body.mrp || 0),
            sellingPrice: Number(body.selling_price || 0),
          },
        });
      }

      await client.query("COMMIT");
      return successResponse(
        createdProduct,
        "Product created successfully",
        201,
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === "23505") {
      return errorResponse(duplicateProductMessage(err), 409);
    }
    return errorResponse(err.message);
  }
}
