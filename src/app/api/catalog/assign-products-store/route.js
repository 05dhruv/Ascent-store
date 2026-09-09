import { getClient, query } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  validationError,
  notFoundError,
} from "@/lib/api-response";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import {
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { validatePriceSet } from "@/lib/priceIntegrity";

function rowToBool(value) {
  return value === true || value === "true";
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeSheetRow(row = {}) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );
}

function sheetValue(row, ...keys) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function parseSheetBoolean(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["yes", "true", "1", "active", "assigned"].includes(normalized))
    return true;
  if (["no", "false", "0", "inactive", "unassigned"].includes(normalized))
    return false;
  return null;
}

function parseOptionalSheetNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "")
    return { value: null };
  const number = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(number) || number < 0)
    return { error: "Enter a valid non-negative number" };
  return { value: number };
}

function assignmentValuesEqual(current, next) {
  return Math.abs(Number(current || 0) - Number(next || 0)) < 0.000001;
}

function assignmentChange(field, label, from, to) {
  return { field, label, from, to };
}

async function findSheetProduct(client, row) {
  const identifiers = [
    ["id", sheetValue(row, "Product ID")],
    ["product_id", sheetValue(row, "Product Code")],
    ["barcode", sheetValue(row, "Barcode")],
    ["sku", sheetValue(row, "SKU")],
  ];
  for (const [column, rawValue] of identifiers) {
    const value = String(rawValue || "").trim();
    if (!value) continue;
    const result = await client.query(
      `SELECT id FROM products WHERE ${column}::text = $1 LIMIT 2`,
      [value],
    );
    if (result.rows.length === 1) return result.rows[0].id;
    if (result.rows.length > 1) return null;
  }
  return null;
}

async function patchAssignmentSheet(client, rows, storeId, preview) {
  const result = {
    changed: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    rows: [],
  };
  const seenProductIds = new Set();

  for (let index = 0; index < rows.length; index++) {
    const rowNumber = index + 2;
    const row = normalizeSheetRow(rows[index]);
    const productId = await findSheetProduct(client, row);
    if (!productId) {
      result.skipped++;
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productName: sheetValue(row, "Product Name") || "-",
        barcode: sheetValue(row, "Barcode", "SKU") || "-",
        error: "Product could not be matched uniquely",
      });
      continue;
    }
    if (seenProductIds.has(String(productId))) {
      result.skipped++;
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productId,
        productName: sheetValue(row, "Product Name") || "-",
        barcode: sheetValue(row, "Barcode", "SKU") || "-",
        error: "Duplicate product row in the uploaded sheet",
      });
      continue;
    }
    seenProductIds.add(String(productId));

    const desiredAssigned = parseSheetBoolean(
      sheetValue(row, "Sell on Store"),
    );
    if (desiredAssigned === null) {
      result.skipped++;
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productId,
        productName: sheetValue(row, "Product Name") || "-",
        barcode: sheetValue(row, "Barcode", "SKU") || "-",
        error: 'Sell on Store must be "Yes" or "No"',
      });
      continue;
    }

    const currentResult = await client.query(
      `SELECT p.id, p.name, p.barcode, p.sku,
              COALESCE(ps.is_active, false) AS is_assigned,
              COALESCE(ps.mrp, p.mrp, 0) AS store_mrp,
              COALESCE(ps.selling_price, p.selling_price, 0) AS store_selling_price,
              COALESCE(ps.franchise_cost, latest_transfer.cost_price, p.cost_price, 0) AS franchise_cost,
              COALESCE(ps.low_stock_value, 0) AS low_stock_level,
              COALESCE(ps.minimum_base_quantity, 0) AS safe_stock_level
       FROM products p
       LEFT JOIN product_saleability ps
         ON ps.product_id = p.id AND ps.store_id = $2
       LEFT JOIN LATERAL (
         SELECT sti.cost_price
         FROM stock_transfer_items sti
         INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
         WHERE st.destination_id = $2
           AND st.status = 'confirmed'
           AND sti.product_id = p.id
           AND COALESCE(sti.cost_price, 0) > 0
         ORDER BY COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
         LIMIT 1
       ) latest_transfer ON TRUE
       WHERE p.id = $1`,
      [productId, storeId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      result.skipped++;
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productId,
        error: "Product no longer exists",
      });
      continue;
    }

    const changes = [];
    if (Boolean(current.is_assigned) !== desiredAssigned) {
      changes.push(
        assignmentChange(
          "is_assigned",
          "Sell on Store",
          current.is_assigned ? "Yes" : "No",
          desiredAssigned ? "Yes" : "No",
        ),
      );
    }

    const numberFields = [
      ["mrp", "M.R.P", "store_mrp"],
      ["franchise_cost", "Franchise Cost", "franchise_cost"],
      ["selling_price", "Selling Price", "store_selling_price"],
      ["safe_stock_level", "Safe Stock Level", "safe_stock_level"],
      ["low_stock_level", "Low Stock Level", "low_stock_level"],
    ];
    const nextValues = {};
    let numberError = "";
    for (const [field, label, currentKey] of numberFields) {
      const parsed = parseOptionalSheetNumber(sheetValue(row, label));
      if (parsed.error) {
        numberError = `${label}: ${parsed.error}`;
        break;
      }
      nextValues[field] =
        parsed.value === null ? Number(current[currentKey] || 0) : parsed.value;
      if (
        desiredAssigned &&
        parsed.value !== null &&
        !assignmentValuesEqual(current[currentKey], parsed.value)
      ) {
        changes.push(
          assignmentChange(
            field,
            label,
            Number(current[currentKey] || 0),
            parsed.value,
          ),
        );
      }
    }
    if (numberError) {
      result.skipped++;
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productId,
        productName: current.name,
        barcode: current.barcode || current.sku || "-",
        error: numberError,
      });
      continue;
    }

    if (desiredAssigned) {
      const priceValidation = validatePriceSet({
        mrp: nextValues.mrp,
        sellingPrice: nextValues.selling_price,
        costPrice: nextValues.franchise_cost,
      });
      if (!priceValidation.valid) {
        result.skipped++;
        result.rows.push({
          row: rowNumber,
          status: "skipped",
          productId,
          productName: current.name,
          barcode: current.barcode || current.sku || "-",
          error: priceValidation.error,
        });
        continue;
      }
    }

    if (!changes.length) {
      result.unchanged++;
      result.rows.push({
        row: rowNumber,
        status: "unchanged",
        productId,
        productName: current.name,
        barcode: current.barcode || current.sku || "-",
        changes: [],
      });
      continue;
    }

    result.changed++;
    if (!preview) {
      if (desiredAssigned) {
        await client.query(
          `INSERT INTO product_saleability (
             product_id, store_id, is_active, mrp, selling_price,
             franchise_cost, minimum_base_quantity, low_stock_value, created_at, updated_at
           )
           VALUES ($1, $2, true, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (product_id, store_id) DO UPDATE
             SET is_active = true,
                 mrp = EXCLUDED.mrp,
                 selling_price = EXCLUDED.selling_price,
                 franchise_cost = EXCLUDED.franchise_cost,
                 minimum_base_quantity = EXCLUDED.minimum_base_quantity,
                 low_stock_value = EXCLUDED.low_stock_value,
                 updated_at = NOW()`,
          [
            productId,
            storeId,
            nextValues.mrp,
            nextValues.selling_price,
            nextValues.franchise_cost,
            nextValues.safe_stock_level,
            nextValues.low_stock_level,
          ],
        );
      } else {
        await client.query(
          `UPDATE product_saleability
           SET is_active = false, updated_at = NOW()
           WHERE product_id = $1 AND store_id = $2`,
          [productId, storeId],
        );
      }
      result.updated++;
    }
    result.rows.push({
      row: rowNumber,
      status: preview ? "changed" : "updated",
      productId,
      productName: current.name,
      barcode: current.barcode || current.sku || "-",
      changes,
    });
  }

  return result;
}

export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "VIEW_CATALOG",
      "MANAGE_CATALOG",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const storeId =
      Number(
        searchParams.get("storeId") || searchParams.get("store_id") || 0,
      ) || null;
    const search = String(searchParams.get("search") || "").trim();
    const scope = String(searchParams.get("scope") || "assigned").toLowerCase();
    const brandIds = [
      ...new Set(
        String(searchParams.get("brand_ids") || "")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isSafeInteger(value) && value > 0),
      ),
    ];
    const categoryIds = [
      ...new Set(
        String(searchParams.get("category_ids") || "")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isSafeInteger(value) && value > 0),
      ),
    ];
    if (!storeId)
      return validationError([
        { field: "storeId", message: "Store is required" },
      ]);
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const params = [storeId];
    const where = ["p.is_active IS DISTINCT FROM false"];
    const countParams = [];
    const countWhere = ["p.is_active IS DISTINCT FROM false"];
    if (scope !== "all") {
      where.push("COALESCE(ps.is_active, false) = true");
      countWhere.push(`EXISTS (
        SELECT 1 FROM product_saleability ps_count
        WHERE ps_count.product_id = p.id
          AND ps_count.store_id = $1
          AND ps_count.is_active = true
      )`);
      countParams.push(storeId);
    }
    if (search) {
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
      where.push(
        `(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length} OR p.product_id ILIKE $${params.length})`,
      );
      countWhere.push(
        `(p.name ILIKE $${countParams.length} OR p.sku ILIKE $${countParams.length} OR p.barcode ILIKE $${countParams.length} OR p.product_id ILIKE $${countParams.length})`,
      );
    }
    if (brandIds.length) {
      params.push(brandIds);
      countParams.push(brandIds);
      where.push(`p.brand_id = ANY($${params.length}::bigint[])`);
      countWhere.push(
        `p.brand_id = ANY($${countParams.length}::bigint[])`,
      );
    }
    if (categoryIds.length) {
      params.push(categoryIds);
      countParams.push(categoryIds);
      where.push(`p.category_id = ANY($${params.length}::bigint[])`);
      countWhere.push(
        `p.category_id = ANY($${countParams.length}::bigint[])`,
      );
    }

    const totalRes = await query(
      `SELECT COUNT(*)::int AS total
       FROM products p
       WHERE ${countWhere.join(" AND ")}`,
      countParams,
    );

    const res = await query(
      `SELECT p.id, p.product_id, p.name, p.barcode, p.sku, p.brand_id,
              b.name AS brand_name, p.category_id,
              c.name AS category_name, p.mrp, p.selling_price,
              COALESCE(ps.franchise_cost, latest_transfer.cost_price, p.cost_price, 0) AS franchise_cost,
              COALESCE(ps.low_stock_value, 0) AS low_stock_level,
              COALESCE(ps.minimum_base_quantity, 0) AS safe_stock_level,
              COALESCE(ps.is_active, false) AS is_assigned,
              COALESCE(ps.selling_price, p.selling_price, 0) AS store_selling_price,
              COALESCE(ps.mrp, p.mrp, 0) AS store_mrp,
              COALESCE(store_stock.available_qty, 0) AS store_stock_qty,
              latest_receipt.vendor_name,
              latest_receipt.vendor_city,
              latest_receipt.vendor_state,
              latest_receipt.vendor_location
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_saleability ps ON ps.product_id = p.id AND ps.store_id = $1
       LEFT JOIN LATERAL (
         SELECT sti.cost_price
         FROM stock_transfer_items sti
         INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
         WHERE st.destination_id = $1
           AND st.status = 'confirmed'
           AND sti.product_id = p.id
           AND COALESCE(sti.cost_price, 0) > 0
         ORDER BY COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
         LIMIT 1
       ) latest_transfer ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(ib.available_qty) AS available_qty
         FROM inventory_batches ib
         WHERE ib.product_id = p.id
           AND ib.store_id = $1
           AND ib.status = 'active'
           AND ib.available_qty > 0
       ) store_stock ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(NULLIF(si.vendor_name, ''), v.name) AS vendor_name,
           COALESCE(NULLIF(v.city, ''), NULLIF(si.meta->>'vendorCity', '')) AS vendor_city,
           COALESCE(NULLIF(v.state, ''), NULLIF(si.meta->>'vendorState', '')) AS vendor_state,
           CONCAT_WS(', ',
             COALESCE(NULLIF(v.city, ''), NULLIF(si.meta->>'vendorCity', '')),
             COALESCE(NULLIF(v.state, ''), NULLIF(si.meta->>'vendorState', ''))
           ) AS vendor_location
         FROM stock_in_items sii
         INNER JOIN stock_in si ON si.id = sii.stock_in_id
         LEFT JOIN vendors v ON v.id = si.vendor_id
         WHERE sii.product_id = p.id
           AND si.destination_id = $1
           AND si.status = 'confirmed'
           AND (si.vendor_id IS NOT NULL OR NULLIF(si.vendor_name, '') IS NOT NULL)
         ORDER BY COALESCE(si.confirmed_at, si.created_at) DESC, sii.id DESC
         LIMIT 1
       ) latest_receipt ON TRUE
       WHERE ${where.join(" AND ")}
       ORDER BY p.name ASC`,
      params,
    );

    return successResponse(
      {
        records: res.rows,
        total: Number(totalRes.rows[0]?.total || res.rows.length),
      },
      "Products fetched",
    );
  } catch (err) {
    console.error("[assign-products-store GET]", err);
    return errorResponse("Failed to fetch products");
  }
}

export async function POST(request) {
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, "MANAGE_CATALOG");
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const storeId = Number(body.storeId || body.store_id || 0) || null;
    if (!storeId) {
      return validationError([
        { field: "storeId", message: "Store is required" },
      ]);
    }
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const productId = Number(body.productId || body.product_id || 0) || null;
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.map(Number).filter(Boolean)
      : null;

    if (!productId && (!productIds || productIds.length === 0)) {
      return validationError([
        { field: "productId", message: "Product(s) and store are required" },
      ]);
    }

    const assign = body.assign !== false && body.is_active !== false;

    if (productIds && productIds.length > 0) {
      if (assign) {
        await query(
          `INSERT INTO product_saleability (
             product_id, store_id, is_active, selling_price, mrp, low_stock_value, minimum_base_quantity, created_at, updated_at
           )
           SELECT p.id, $2, true, p.selling_price, p.mrp, 0, 0, NOW(), NOW()
           FROM products p
           JOIN stores s ON s.id = $2
           WHERE p.id = ANY($1::bigint[])
           ON CONFLICT (product_id, store_id) DO UPDATE
             SET is_active = true,
                 updated_at = NOW()`,
          [productIds, storeId],
        );
      } else {
        await query(
          `UPDATE product_saleability
           SET is_active = false, updated_at = NOW()
           WHERE store_id = $2 AND product_id = ANY($1::bigint[])`,
          [productIds, storeId],
        );
      }

      return successResponse(
        { productIds, storeId, isAssigned: assign },
        assign ? "Products assigned in bulk" : "Products unassigned in bulk",
      );
    }

    const hasSellingPrice = Object.prototype.hasOwnProperty.call(
      body,
      "selling_price",
    );
    const hasMrp = Object.prototype.hasOwnProperty.call(body, "mrp");
    const hasLowStockValue = Object.prototype.hasOwnProperty.call(
      body,
      "low_stock_value",
    );
    const hasMinimumBaseQuantity =
      Object.prototype.hasOwnProperty.call(body, "minimum_base_quantity") ||
      Object.prototype.hasOwnProperty.call(body, "mbq");
    if (assign) {
      const currentPrice = await query(
        `SELECT COALESCE(ps.mrp, p.mrp, 0) AS mrp,
                COALESCE(ps.selling_price, p.selling_price, 0) AS selling_price,
                COALESCE(ps.franchise_cost, p.cost_price, 0) AS cost_price
         FROM products p
         LEFT JOIN product_saleability ps ON ps.product_id = p.id AND ps.store_id = $2
         WHERE p.id = $1`,
        [productId, storeId],
      );
      if (!currentPrice.rows.length) return notFoundError("Product or store was not found");
      const priceValidation = validatePriceSet({
        mrp: hasMrp ? body.mrp : currentPrice.rows[0].mrp,
        sellingPrice: hasSellingPrice ? body.selling_price : currentPrice.rows[0].selling_price,
        costPrice: currentPrice.rows[0].cost_price,
      });
      if (!priceValidation.valid) {
        return validationError(
          [{ field: "price", message: priceValidation.error }],
          priceValidation.error,
        );
      }
      const result = await query(
        `INSERT INTO product_saleability (
           product_id, store_id, is_active, selling_price, mrp, low_stock_value, minimum_base_quantity, created_at, updated_at
         )
         SELECT p.id, $2, true, COALESCE($3, p.selling_price, 0), COALESCE($4, p.mrp, 0), COALESCE($7, 0), COALESCE($8, 0), NOW(), NOW()
         FROM products p
         JOIN stores s ON s.id = $2
         WHERE p.id = $1
         ON CONFLICT (product_id, store_id) DO UPDATE
           SET is_active = true,
               selling_price = CASE WHEN $5 THEN EXCLUDED.selling_price ELSE product_saleability.selling_price END,
               mrp = CASE WHEN $6 THEN EXCLUDED.mrp ELSE product_saleability.mrp END,
               low_stock_value = CASE WHEN $9 THEN EXCLUDED.low_stock_value ELSE product_saleability.low_stock_value END,
               minimum_base_quantity = CASE WHEN $10 THEN EXCLUDED.minimum_base_quantity ELSE product_saleability.minimum_base_quantity END,
               updated_at = NOW()
         RETURNING product_id, store_id, is_active`,
        [
          productId,
          storeId,
          toFiniteNumber(body.selling_price, null),
          toFiniteNumber(body.mrp, null),
          hasSellingPrice,
          hasMrp,
          toFiniteNumber(body.low_stock_value, null),
          toFiniteNumber(body.minimum_base_quantity ?? body.mbq, null),
          hasLowStockValue,
          hasMinimumBaseQuantity,
        ],
      );
      if (!result.rows.length)
        return notFoundError("Product or store was not found");
    } else {
      const result = await query(
        `UPDATE product_saleability
         SET is_active = false, updated_at = NOW()
         WHERE product_id = $1 AND store_id = $2
         RETURNING product_id, store_id, is_active`,
        [productId, storeId],
      );
      if (!result.rows.length)
        return notFoundError("Product assignment was not found");
    }

    return successResponse(
      { productId, storeId, isAssigned: rowToBool(assign) },
      assign ? "Product assigned" : "Product unassigned",
    );
  } catch (err) {
    console.error("[assign-products-store POST]", err);
    return errorResponse("Failed to update assignment", 500, err);
  }
}

export async function PATCH(request) {
  let client;
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, "MANAGE_CATALOG");
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const storeId = Number(body.storeId || body.store_id || 0) || null;
    if (!storeId)
      return validationError([
        { field: "storeId", message: "Store is required" },
      ]);
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const rows = Array.isArray(body.rows)
      ? body.rows.filter((row) =>
          Object.values(row || {}).some(
            (value) => String(value ?? "").trim() !== "",
          ),
        )
      : [];
    if (!rows.length)
      return validationError([
        { field: "rows", message: "Upload at least one product row" },
      ]);
    if (rows.length > 20000)
      return validationError([
        { field: "rows", message: "A maximum of 20,000 rows is supported" },
      ]);

    client = await getClient();
    const preview = body.preview === true;
    if (!preview) await client.query("BEGIN");
    const result = await patchAssignmentSheet(client, rows, storeId, preview);
    if (!preview) await client.query("COMMIT");
    return successResponse(
      result,
      preview
        ? `${result.changed} assignment(s) changed, ${result.unchanged} unchanged, ${result.skipped} skipped`
        : `${result.updated} assignment(s) updated, ${result.unchanged} unchanged, ${result.skipped} skipped`,
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[assign-products-store PATCH]", err);
    return errorResponse("Failed to bulk edit product assignments", 500, err);
  } finally {
    if (client) client.release();
  }
}
