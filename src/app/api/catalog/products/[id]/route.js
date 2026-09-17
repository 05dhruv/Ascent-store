import { getClient, query } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  notFoundError,
  validationError,
} from "@/lib/api-response";
import { auditLog, requireAuth, requirePermission } from "@/lib/api-protection";
import { setRecycleBinContext } from "@/lib/recycleBin";
import { ensureProductDiscountSchema } from "@/lib/productDiscountSchema";
import { ensureProductImageSchema } from "@/lib/productImageSchema";
import { ensureProductDimensionsSchema } from "@/lib/productDimensionsSchema";
import { validatePriceSet } from "@/lib/priceIntegrity";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureStockTransferSchema } from "@/lib/stockTransferSchema";

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

const VALID_UNITS = [
  "PCS",
  "BAGS",
  "KG",
  "TONNE",
  "MTR",
  "RFT",
  "SQFT",
  "SQMT",
  "CUM",
  "CFT",
  "LTR",
  "BUNDLE",
  "BOX",
  "GRAMS",
  "NOS",
  "SET",
  "COIL",
  "ROLL",
  "PKT",
  "TRIP",
  "BRASS",
];

function normalizeUnit(value) {
  const unit = String(value || "PCS")
    .trim()
    .toUpperCase();
  if (["G", "GM", "GRAM", "GRAMS"].includes(unit)) return "GRAMS";
  if (["BAG", "BAGS"].includes(unit)) return "BAGS";
  if (["TON", "TONS", "TONNE", "TONNES", "MT"].includes(unit)) return "TONNE";
  if (["METER", "METRE", "METERS", "MTR", "M"].includes(unit)) return "MTR";
  if (["RFT", "RUNNING FEET", "RUNNING FOOT", "RMT"].includes(unit)) return "RFT";
  if (["SQFT", "SQ.FT", "SQ FT", "SFT"].includes(unit)) return "SQFT";
  if (["SQMT", "SQM", "SQ.MTR", "SQ MTR"].includes(unit)) return "SQMT";
  if (["CUM", "CU.M", "CUBIC METER", "CUBIC METRE"].includes(unit)) return "CUM";
  if (["CFT", "CU.FT", "CUBIC FEET"].includes(unit)) return "CFT";
  if (["L", "LTR", "LITRE", "LITER", "LITRES"].includes(unit)) return "LTR";
  if (["BUNDLE", "BDL", "BUNDLES"].includes(unit)) return "BUNDLE";
  if (["BOX", "BOXES", "CTN", "CARTON"].includes(unit)) return "BOX";
  if (["NO", "NOS", "NUMBERS", "PIECE", "PIECES"].includes(unit)) return "NOS";
  if (["SET", "SETS"].includes(unit)) return "SET";
  if (["COIL", "COILS"].includes(unit)) return "COIL";
  if (["ROLL", "ROLLS"].includes(unit)) return "ROLL";
  if (["PKT", "PACKET", "PACK"].includes(unit)) return "PKT";
  if (["TRIP", "TRIPS"].includes(unit)) return "TRIP";
  if (["BRASS"].includes(unit)) return "BRASS";

  return VALID_UNITS.includes(unit) ? unit : "PCS";
}

function normalizeStockItemType(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "batched"
    ? "batched"
    : "unbatched";
}

async function validateBarcodeAvailability({
  barcode,
  stockItemType,
  excludeId,
}) {
  const normalizedBarcode = String(barcode || "").trim();
  if (!normalizedBarcode) return null;

  const duplicates = await query(
    `SELECT id, name, stock_item_type
     FROM products
     WHERE barcode = $1
       AND id <> $2
     LIMIT 5`,
    [normalizedBarcode, Number(excludeId)],
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

const SELECT_PRODUCT = `
  SELECT
    p.id, p.product_id, p.name, p.description, p.barcode, p.sku,
    p.mrp, p.selling_price, p.cost_price, p.unit,
    p.length, p.width, p.height, p.dimension_unit, p.dimensions, p.weight_per_unit,
    p.is_active, p.is_service, p.image_url, p.allow_discount_on_pos, p.include_tax,
    p.stock_item_type, p.inventory_method, p.hsn_code, p.charge_id,
    COALESCE(p.category_id, b.category_id) AS category_id,
    p.sub_category_id, p.brand_id,
    p.manufacturer_id, p.department_id, p.income_head_id, p.tax_id,
    p.created_at, p.updated_at,
    COALESCE(c.name, bc.name) AS category_name,
    sc.name AS sub_category_name,
    b.name  AS brand_name,
    m.name  AS manufacturer_name,
    d.name  AS department_name,
    ih.name AS income_head_name,
    t.name  AS tax_name,
    t.rate  AS tax_rate
  FROM products p
  LEFT JOIN categories     c  ON p.category_id     = c.id
  LEFT JOIN sub_categories sc ON p.sub_category_id = sc.id
  LEFT JOIN brands         b  ON p.brand_id        = b.id
  LEFT JOIN categories     bc ON b.category_id     = bc.id
  LEFT JOIN manufacturers  m  ON p.manufacturer_id = m.id
  LEFT JOIN departments    d  ON p.department_id   = d.id
  LEFT JOIN income_heads   ih ON p.income_head_id  = ih.id
  LEFT JOIN taxes          t  ON p.tax_id          = t.id
`;

// ─── GET /api/catalog/products/[id] ──────────────────────────
export async function GET(request, { params }) {
  try {
    await ensureProductDimensionsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, "MATERIAL_VIEW", "MATERIAL_EDIT");
    if (permissionCheck.error) return permissionCheck.error;
    const resolvedParams = await params;
    const productId = Number(resolvedParams?.id);
    if (!Number.isFinite(productId)) {
      return errorResponse("Invalid product id", 400);
    }

    const result = await query(`${SELECT_PRODUCT} WHERE p.id = $1`, [
      productId,
    ]);
    if (!result.rows.length) return notFoundError("Product not found");

    let batches = [];
    let batchLoadWarning = "";
    try {
      await ensureProductDiscountSchema();
      await ensureProductImageSchema();
      await ensureStockInSchema();
      await ensureStockTransferSchema();
      await ensureInventoryBatchSchema();
      const batchResult = await query(
      `SELECT ib.id, ib.store_id, s.name AS store_name, ib.batch_no,
              ib.expiry_date, ib.received_qty, ib.available_qty,
              effective.cost_price, effective.mrp, effective.selling_price,
              effective.price_source, ib.status
       FROM inventory_batches ib
       LEFT JOIN stores s ON s.id = ib.store_id
       LEFT JOIN products batch_product ON batch_product.id = ib.product_id
       LEFT JOIN product_saleability ps
         ON ps.product_id = ib.product_id AND ps.store_id = ib.store_id
       LEFT JOIN stock_in_items source_stock_in
         ON ib.source_type = 'stock_in'
        AND source_stock_in.id = CASE
          WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
            THEN NULLIF(ib.source_id, '')::bigint
          ELSE NULL
        END
       LEFT JOIN stock_transfer_items source_transfer
         ON ib.source_type = 'stock_transfer'
        AND source_transfer.id = CASE
          WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
            THEN NULLIF(ib.source_id, '')::bigint
          ELSE NULL
        END
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(
             CASE WHEN COALESCE(ib.meta->>'costPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                  THEN NULLIF((ib.meta->>'costPrice')::numeric, 0) END,
             NULLIF(source_transfer.cost_price, 0),
             NULLIF(source_stock_in.cost_price, 0),
             NULLIF(ib.cost_price, 0),
             batch_product.cost_price,
             0
           ) AS cost_price,
           COALESCE(
             CASE WHEN COALESCE(ib.meta->>'mrp', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                  THEN NULLIF((ib.meta->>'mrp')::numeric, 0) END,
             NULLIF(source_transfer.destination_mrp, 0),
             NULLIF(source_transfer.mrp, 0),
             NULLIF(source_stock_in.mrp, 0),
             NULLIF(ps.mrp, 0),
             batch_product.mrp,
             0
           ) AS mrp,
           COALESCE(
             CASE WHEN COALESCE(ib.meta->>'sellingPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                  THEN NULLIF((ib.meta->>'sellingPrice')::numeric, 0) END,
             NULLIF(source_transfer.selling_price, 0),
             NULLIF(source_stock_in.selling_price, 0),
             NULLIF(ps.selling_price, 0),
             batch_product.selling_price,
             0
           ) AS selling_price,
           CASE
             WHEN COALESCE(ib.meta->>'mrp', '') ~ '^-?[0-9]+([.][0-9]+)?$'
              AND (ib.meta->>'mrp')::numeric > 0 THEN 'Batch'
             WHEN ib.source_type = 'stock_transfer'
              AND COALESCE(source_transfer.destination_mrp, source_transfer.mrp, 0) > 0 THEN 'Stock Transfer'
             WHEN ib.source_type = 'stock_in' AND COALESCE(source_stock_in.mrp, 0) > 0 THEN 'Stock In'
             WHEN COALESCE(ps.mrp, 0) > 0 THEN 'Store Assignment'
             ELSE 'Product Master'
           END AS price_source
       ) effective ON TRUE
       WHERE ib.product_id = $1
       ORDER BY s.name, ib.expiry_date NULLS LAST, ib.created_at DESC`,
      [productId],
      );
      batches = batchResult.rows;
    } catch (batchError) {
      console.error(`Unable to load batches for product ${productId}:`, batchError);
      batchLoadWarning =
        "Batch information could not be loaded for this product. You can still edit and save its product details.";
    }

    return successResponse({ ...result.rows[0], batches, batchLoadWarning });
  } catch (err) {
    return errorResponse(err.message);
  }
}

// ─── PUT /api/catalog/products/[id] ──────────────────────────
export async function PUT(request, { params }) {
  try {
    await ensureProductDimensionsSchema();
    await ensureProductDiscountSchema();
    await ensureProductImageSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, "MATERIAL_EDIT");
    if (permissionCheck.error) return permissionCheck.error;
    const resolvedParams = await params;
    const productId = Number(resolvedParams?.id);
    if (!Number.isFinite(productId)) {
      return errorResponse("Invalid product id", 400);
    }

    const body = await request.json();

    const previousResult = await query(
      `SELECT id, name, barcode, sku, mrp, selling_price, cost_price FROM products WHERE id = $1`,
      [productId],
    );
    if (!previousResult.rows.length) return notFoundError("Product not found");
    const previous = previousResult.rows[0];

    if (!body.name?.trim()) {
      return validationError({ name: "Product name is required" });
    }

    const nextPrices = {
      mrp: body.mrp ?? previous.mrp,
      sellingPrice: body.selling_price ?? previous.selling_price,
      costPrice: body.cost_price ?? previous.cost_price,
    };
    const pricesChanged =
      Number(nextPrices.mrp) !== Number(previous.mrp) ||
      Number(nextPrices.sellingPrice) !== Number(previous.selling_price) ||
      Number(nextPrices.costPrice) !== Number(previous.cost_price);
    if (pricesChanged) {
      const priceValidation = validatePriceSet(nextPrices);
      if (!priceValidation.valid) return validationError({ price: priceValidation.error }, priceValidation.error);
    }

    const barcodeError = await validateBarcodeAvailability({
      barcode: body.barcode,
      stockItemType: body.stock_item_type,
      excludeId: productId,
    });
    if (barcodeError)
      return validationError({ barcode: barcodeError }, barcodeError);

    const result = await query(
      `UPDATE products SET
        product_id      = $1,
        name            = $2,
        description     = $3,
        barcode         = $4,
        sku             = $5,
        category_id     = $6,
        sub_category_id = $7,
        brand_id        = $8,
        manufacturer_id = $9,
        department_id   = $10,
        income_head_id  = $11,
        tax_id          = $12,
        mrp             = $13,
        selling_price   = $14,
        cost_price      = $15,
        unit            = $16,
        length          = $17,
        width           = $18,
        height          = $19,
        dimension_unit  = $20,
        dimensions      = $21,
        weight_per_unit = $22,
        is_active       = $23,
        is_service      = $24,
        image_url       = $25,
        allow_discount_on_pos = $26,
        include_tax     = $27,
        stock_item_type = $28,
        inventory_method = $29,
        hsn_code        = $30,
        charge_id       = $31,
        updated_at      = NOW()
       WHERE id = $32
       RETURNING *`,
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
        body.length ? Number(body.length) : null,
        body.width ? Number(body.width) : null,
        body.height ? Number(body.height) : null,
        body.dimension_unit ? String(body.dimension_unit).trim().toUpperCase() : "MM",
        body.dimensions?.trim() || null,
        body.weight_per_unit ? Number(body.weight_per_unit) : null,
        body.is_active ?? true,
        body.is_service ?? false,
        body.image_url || null,
        body.allow_discount_on_pos ?? false,
        body.include_tax ?? false,
        normalizeStockItemType(body.stock_item_type),
        body.inventory_method || "direct",
        body.hsn_code || null,
        body.charge_id || null,
        productId,
      ],
    );

    if (!result.rows.length) return notFoundError("Product not found");
    const next = result.rows[0];
    const savedPricesChanged =
      Number(previous.mrp) !== Number(next.mrp) ||
      Number(previous.selling_price) !== Number(next.selling_price) ||
      Number(previous.cost_price) !== Number(next.cost_price);
    if (savedPricesChanged) {
      await auditLog(auth.user.id, "product.prices_updated", "product", productId, {
        productName: next.name,
        barcode: next.barcode,
        previous: {
          mrp: Number(previous.mrp),
          sellingPrice: Number(previous.selling_price),
          costPrice: Number(previous.cost_price),
        },
        next: {
          mrp: Number(next.mrp),
          sellingPrice: Number(next.selling_price),
          costPrice: Number(next.cost_price),
        },
      });
    }
    return successResponse(result.rows[0], "Product updated successfully");
  } catch (err) {
    if (err.code === "23505") {
      return errorResponse(duplicateProductMessage(err), 409);
    }
    return errorResponse(err.message);
  }
}

// ─── DELETE /api/catalog/products/[id] ───────────────────────
export async function DELETE(request, { params }) {
  let client;
  try {
    await ensureProductDiscountSchema();
    await ensureProductImageSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, "MATERIAL_EDIT");
    if (permissionCheck.error) return permissionCheck.error;

    const resolvedParams = await params;
    const productId = Number(resolvedParams?.id);
    if (!Number.isFinite(productId)) {
      return errorResponse("Invalid product id", 400);
    }

    client = await getClient();
    await client.query("BEGIN");
    await setRecycleBinContext(
      client,
      auth.user.id,
      "Product deleted from catalog",
    );
    const result = await client.query(
      `DELETE FROM products WHERE id = $1 RETURNING id`,
      [productId],
    );
    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return notFoundError("Product not found");
    }
    await client.query("COMMIT");
    return successResponse({ id: productId }, "Product deleted successfully");
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return errorResponse(err.message);
  } finally {
    client?.release();
  }
}
