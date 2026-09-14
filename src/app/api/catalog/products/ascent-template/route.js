import { getClient, query } from "@/lib/db";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureConstructionSchema } from "@/lib/constructionSchema";
import { generateProductBarcode } from "@/lib/productBarcode";
import { requireAuth, requirePermission, requireStore } from "@/lib/api-protection";

const MATERIAL_UNITS = [
  "PCS", "NOS", "BAG", "KG", "MT", "CUM", "CFT", "MTR", "SQM", "RMT", "LTR", "SET", "ROLL",
  "BOX", "PKT", "PAIR", "BUNDLE", "DRUM", "CAN", "TIN", "QUINTAL", "GRAMS",
];

const text = (value) => String(value ?? "").trim();
const normalizedName = (value) => text(value).replace(/\s+/g, " ");

function parseRate(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : fallback;
  const clean = String(value).replace(/[₹$€£,\s]/g, "").trim();
  const parsed = parseFloat(clean);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeUnit(rawUnit) {
  const u = String(rawUnit || "")
    .trim()
    .toUpperCase()
    .replace(/[\.\s_-]+/g, "");
  if (!u) return "PCS";

  if (["PC", "PCS", "PIECE", "PIECES", "EACH", "EA", "UNIT", "UNITS"].includes(u)) return "PCS";
  if (["NO", "NOS", "NUM", "NUMBER", "NUMBERS"].includes(u)) return "NOS";
  if (["BAG", "BAGS", "BGS"].includes(u)) return "BAG";
  if (["KG", "KGS", "KILOGRAM", "KILOGRAMS", "KILO", "KILOS"].includes(u)) return "KG";
  if (["MT", "TON", "TONS", "TONNE", "TONNES", "METRICTON", "METRICTONNE"].includes(u)) return "MT";
  if (["CUM", "CUMTR", "CUBICMETER", "CUBICMETRE", "M3", "CU.M", "CUBICM"].includes(u)) return "CUM";
  if (["CFT", "CUFT", "CUBICFEET", "FT3", "CU.FT"].includes(u)) return "CFT";
  if (["MTR", "METER", "METERS", "METRE", "METRES", "M", "MR"].includes(u)) return "MTR";
  if (["SQM", "SQMTR", "SQUAREMETER", "SQUAREMETRE", "M2", "SQ.M"].includes(u)) return "SQM";
  if (["RMT", "RUNNINGMETER", "RUNNINGMETRE", "RUNNINGMTR", "R.MTR", "RM"].includes(u)) return "RMT";
  if (["LTR", "LITRE", "LITRES", "LITER", "LITERS", "L", "LT", "LTS"].includes(u)) return "LTR";
  if (["SET", "SETS"].includes(u)) return "SET";
  if (["ROLL", "ROLLS", "ROL"].includes(u)) return "ROLL";
  if (["BOX", "BOXES", "BX"].includes(u)) return "BOX";
  if (["PKT", "PACKET", "PACKETS", "PACK", "PACKS"].includes(u)) return "PKT";
  if (["PAIR", "PAIRS", "PR"].includes(u)) return "PAIR";
  if (["BUNDLE", "BUNDLES", "BDL"].includes(u)) return "BUNDLE";
  if (["DRUM", "DRUMS"].includes(u)) return "DRUM";
  if (["CAN", "CANS"].includes(u)) return "CAN";
  if (["TIN", "TINS"].includes(u)) return "TIN";
  if (["QUINTAL", "QTL", "QUINTALS"].includes(u)) return "QUINTAL";
  if (["G", "GM", "GMS", "GRAM", "GRAMS"].includes(u)) return "GRAMS";

  if (MATERIAL_UNITS.includes(u)) return u;
  if (/^[A-Z]{2,10}$/.test(u)) return u;
  return "PCS";
}

function createRowGetter(row) {
  const normalizedKeyMap = new Map();
  for (const [key, value] of Object.entries(row || {})) {
    const cleanKey = String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (cleanKey && !normalizedKeyMap.has(cleanKey)) {
      normalizedKeyMap.set(cleanKey, value);
    }
  }

  return function get(aliases, fallback = "") {
    for (const alias of aliases) {
      const cleanAlias = String(alias)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (normalizedKeyMap.has(cleanAlias)) {
        const val = normalizedKeyMap.get(cleanAlias);
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return val;
        }
      }
    }
    return fallback;
  };
}

async function getWarehouse(id) {
  const result = await query(
    `SELECT id, name FROM stores
     WHERE id = $1
       AND LOWER(COALESCE(NULLIF(location_type, ''), meta->>'locationType', 'store')) = 'warehouse'`,
    [id],
  );
  return result.rows[0] || null;
}

async function resolveOrCreateIdByName(client, table, value) {
  const name = normalizedName(value);
  if (!name) return null;
  const result = await client.query(
    `SELECT id FROM ${table}
     WHERE regexp_replace(lower(trim(name)), '\\s+', ' ', 'g') = $1
     LIMIT 1`,
    [name.toLowerCase()],
  );
  if (result.rows[0]?.id) return result.rows[0].id;

  try {
    const inserted = await client.query(
      `INSERT INTO ${table} (name, is_active) VALUES ($1, true) RETURNING id`,
      [name],
    );
    return inserted.rows[0]?.id || null;
  } catch {
    const retry = await client.query(
      `SELECT id FROM ${table}
       WHERE regexp_replace(lower(trim(name)), '\\s+', ' ', 'g') = $1
       LIMIT 1`,
      [name.toLowerCase()],
    );
    return retry.rows[0]?.id || null;
  }
}

function normalizeRow(row, index) {
  const get = createRowGetter(row);

  const nameRaw = get([
    "Material Name", "Product Name", "Item Name", "Material", "Item", "Product",
    "Material Description", "Item Description", "Name",
  ]);
  const name = normalizedName(nameRaw);

  const code = text(get([
    "Material Code", "Product Code", "Item Code", "Code", "Item ID", "Product ID", "Material ID",
  ]));
  const barcode = text(get(["Barcode / QR", "Barcode/QR", "Barcode", "QR Code", "QR", "UPC", "EAN"]));
  const sku = text(get(["Supplier / Internal SKU", "Supplier/Internal SKU", "Supplier SKU", "Internal SKU", "SKU", "Part No", "Part Number"]));
  const specification = text(get(["Specification / Grade", "Specification/Grade", "Specification", "Grade", "Spec", "Description", "Details"]));
  const remarks = text(get(["Remarks", "Remark", "Notes", "Comment", "Comments"]));
  const category = text(get(["Category", "Material Category", "Group", "Material Group", "Category Name"]));
  const brand = text(get(["Make / Brand", "Make/Brand", "Brand", "Make", "Brand Name", "Manufacturer Brand"]));
  const manufacturer = text(get(["Manufacturer", "Mfg", "Vendor", "Manufacturer Name"]));
  const hsnCode = text(get(["HSN / SAC Code", "HSN/SAC Code", "HSN Code", "SAC Code", "HSN", "SAC"])) || null;

  const unitRaw = get(["Unit of Measure", "Unit", "UOM", "Measurement Unit", "UOM Code"]);
  const unit = normalizeUnit(unitRaw);

  const costPrice = parseRate(get(["Estimated Purchase Rate", "Purchase Rate", "Cost Price", "Cost", "Purchase Price", "Rate", "Buy Rate"]), 0);
  const referenceRate = parseRate(get(["Reference Rate", "MRP", "Market Rate", "Ref Rate", "Standard Rate", "List Price"]), 0);
  const issueRate = parseRate(get(["Issue Rate", "Selling Price", "Sale Rate", "Issue Price", "Store Rate"]), 0);
  const reorderLevel = parseRate(get(["Reorder Level", "Min Stock", "Reorder Qty", "Minimum Stock", "Safety Stock", "Reorder"]), 0);

  const description = [specification && `Specification: ${specification}`, remarks]
    .filter(Boolean)
    .join(" | ") || null;

  const errors = [];
  if (!name) errors.push("Material Name is required");

  return {
    row: index + 2,
    errors,
    name,
    unit,
    code: code || null,
    barcode: barcode || null,
    sku: sku || null,
    description,
    category,
    brand,
    manufacturer,
    hsnCode,
    costPrice,
    referenceRate,
    issueRate,
    reorderLevel,
  };
}

export async function GET(request) {
  try {
    await Promise.all([ensureCatalogExtrasSchema(), ensureConstructionSchema()]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permission = requirePermission(auth.user, "MATERIAL_VIEW", "MATERIAL_IMPORT");
    if (permission.error) return permission.error;

    const warehouseId = Number(new URL(request.url).searchParams.get("warehouse_id") || 0);
    if (!warehouseId) {
      const rows = await query(
        `SELECT id, name FROM stores
         WHERE LOWER(COALESCE(NULLIF(location_type, ''), meta->>'locationType', 'store')) = 'warehouse'
         ORDER BY name`,
      );
      const allowed = rows.rows.filter((warehouse) => !requireStore(auth.user, warehouse.id).error);
      return successResponse({ records: allowed });
    }

    const access = requireStore(auth.user, warehouseId);
    if (access.error) return access.error;
    const warehouse = await getWarehouse(warehouseId);
    if (!warehouse)
      return validationError([{ field: "warehouse_id", message: "Select a valid warehouse" }]);
    return successResponse({ warehouse });
  } catch (error) {
    return errorResponse(error.message || "Unable to load material import setup");
  }
}

export async function POST(request) {
  let client;
  try {
    await Promise.all([ensureCatalogExtrasSchema(), ensureConstructionSchema()]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permission = requirePermission(auth.user, "MATERIAL_IMPORT");
    if (permission.error) return permission.error;

    const body = await request.json().catch(() => ({}));
    const warehouseId = Number(body.warehouse_id || 0);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length)
      return validationError([{ field: "rows", message: "Add at least one material row before uploading" }]);

    if (warehouseId) {
      const access = requireStore(auth.user, warehouseId);
      if (access.error) return access.error;
      const warehouse = await getWarehouse(warehouseId);
      if (!warehouse)
        return validationError([{ field: "warehouse_id", message: "Select a valid warehouse" }]);
    }

    // Filter out completely empty rows (e.g. blank lines in template or empty cells)
    const validRows = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || typeof r !== "object") continue;
      const hasAnyValue = Object.values(r).some(
        (v) => v !== null && v !== undefined && String(v).trim() !== ""
      );
      if (hasAnyValue) {
        validRows.push({ rowData: r, originalIndex: i });
      }
    }

    if (!validRows.length) {
      return validationError(
        [{ field: "rows", message: "No material rows found. Please fill in material details in the Excel template before uploading." }],
        "The uploaded file does not contain any material rows."
      );
    }

    if (validRows.length > 1000)
      return validationError([{ field: "rows", message: "Upload up to 1,000 materials at a time" }]);

    const normalized = validRows.map(({ rowData, originalIndex }) =>
      normalizeRow(rowData, originalIndex)
    );

    const rowErrors = normalized.flatMap((row) =>
      row.errors.map((message) => ({
        field: `row_${row.row}`,
        message: `Row ${row.row}: ${message}`,
      }))
    );

    if (rowErrors.length) {
      return validationError(
        rowErrors,
        `Validation failed for ${rowErrors.length} row(s). Please fix the highlighted issues and try again.`
      );
    }

    const isPreview = Boolean(body.preview);
    const skipped = [];
    const seenNames = new Map();
    const rowsToProcess = [];

    for (const row of normalized) {
      const key = row.name.toLowerCase();
      if (seenNames.has(key)) {
        skipped.push({
          row: row.row,
          material: row.name,
          reason: `Duplicate in this Excel sheet (already processed from row ${seenNames.get(key)})`,
        });
      } else {
        seenNames.set(key, row.row);
        rowsToProcess.push(row);
      }
    }

    if (isPreview) {
      const previewRows = [];
      let toCreate = 0;
      let existingCount = 0;
      let duplicateInSheetCount = 0;

      for (const row of normalized) {
        const isDuplicateInSheet = seenNames.has(row.name.toLowerCase()) && seenNames.get(row.name.toLowerCase()) !== row.row;
        if (isDuplicateInSheet) {
          duplicateInSheetCount++;
          previewRows.push({
            row: row.row,
            name: row.name,
            code: row.code,
            barcode: row.barcode,
            sku: row.sku,
            unit: row.unit,
            category: row.category,
            brand: row.brand,
            costPrice: row.costPrice,
            referenceRate: row.referenceRate,
            issueRate: row.issueRate,
            reorderLevel: row.reorderLevel,
            status: "skipped",
            statusLabel: "Duplicate",
            note: `Duplicate of row ${seenNames.get(row.name.toLowerCase())}`,
          });
          continue;
        }

        const existingRes = await query(
          `SELECT id, name FROM products
           WHERE lower(name) = lower($1)
              OR ($2::text IS NOT NULL AND product_id = $2)
              OR ($3::text IS NOT NULL AND barcode = $3)
              OR ($4::text IS NOT NULL AND sku = $4)
           ORDER BY id ASC LIMIT 1`,
          [row.name, row.code, row.barcode, row.sku],
        );

        if (existingRes.rows[0]) {
          existingCount++;
          previewRows.push({
            row: row.row,
            name: row.name,
            code: row.code,
            barcode: row.barcode,
            sku: row.sku,
            unit: row.unit,
            category: row.category,
            brand: row.brand,
            costPrice: row.costPrice,
            referenceRate: row.referenceRate,
            issueRate: row.issueRate,
            reorderLevel: row.reorderLevel,
            status: "exists",
            statusLabel: "Already Exists",
            note: `Already exists in system as "${existingRes.rows[0].name}"`,
          });
        } else {
          toCreate++;
          previewRows.push({
            row: row.row,
            name: row.name,
            code: row.code,
            barcode: row.barcode,
            sku: row.sku,
            unit: row.unit,
            category: row.category,
            brand: row.brand,
            costPrice: row.costPrice,
            referenceRate: row.referenceRate,
            issueRate: row.issueRate,
            reorderLevel: row.reorderLevel,
            status: "new",
            statusLabel: "New Material",
            note: "Will be created in Material Master",
          });
        }
      }

      return successResponse(
        {
          preview: true,
          isMaterialCreate: true,
          total: normalized.length,
          toCreate,
          changed: toCreate,
          unchanged: existingCount,
          existing: existingCount,
          skipped: duplicateInSheetCount,
          rows: previewRows,
        },
        `Preview ready: ${toCreate} new material(s) ready to create, ${existingCount} already exist, ${duplicateInSheetCount} duplicate(s).`
      );
    }

    client = await getClient();
    await client.query("BEGIN");
    let created = 0;
    let linked = 0;

    for (const row of rowsToProcess) {
      const existing = await client.query(
        `SELECT id, name FROM products
         WHERE lower(name) = lower($1)
            OR ($2::text IS NOT NULL AND product_id = $2)
            OR ($3::text IS NOT NULL AND barcode = $3)
            OR ($4::text IS NOT NULL AND sku = $4)
         ORDER BY id ASC LIMIT 1`,
        [row.name, row.code, row.barcode, row.sku],
      );

      let productId = existing.rows[0]?.id;
      if (!productId) {
        const categoryId = await resolveOrCreateIdByName(client, "categories", row.category);
        const brandId = await resolveOrCreateIdByName(client, "brands", row.brand);
        const manufacturerId = await resolveOrCreateIdByName(client, "manufacturers", row.manufacturer);

        const createdProduct = await client.query(
          `INSERT INTO products (
             product_id, name, description, barcode, sku, category_id, brand_id, manufacturer_id,
             hsn_code, mrp, selling_price, cost_price, unit, is_active, is_service,
             allow_discount_on_pos, include_tax, stock_item_type, inventory_method
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, $13, true, false,
             false, false, 'unbatched', 'direct'
           ) RETURNING id, barcode`,
          [row.code, row.name, row.description, row.barcode, row.sku, categoryId, brandId, manufacturerId,
            row.hsnCode, row.referenceRate, row.issueRate, row.costPrice, row.unit],
        );
        productId = createdProduct.rows[0].id;
        if (!createdProduct.rows[0].barcode) {
          await client.query("UPDATE products SET barcode = $1, updated_at = NOW() WHERE id = $2", [
            generateProductBarcode(productId), productId,
          ]);
        }
        created += 1;
      } else {
        skipped.push({ row: row.row, material: row.name, reason: `Already exists as \"${existing.rows[0].name}\"` });
      }

      if (warehouseId) {
        const warehouseLink = await client.query(
          `INSERT INTO product_warehouses (product_id, warehouse_id, is_active, created_at, updated_at)
           VALUES ($1, $2, true, NOW(), NOW())
           ON CONFLICT (product_id, warehouse_id) DO UPDATE SET is_active = true, updated_at = NOW()
           RETURNING product_id`,
          [productId, warehouseId],
        );
        await client.query(
          `INSERT INTO product_saleability (product_id, store_id, is_active, selling_price, mrp, low_stock_value, minimum_base_quantity)
           VALUES ($1, $2, true, $3, $4, $5, 0)
           ON CONFLICT (product_id, store_id) DO UPDATE SET
             is_active = true, low_stock_value = EXCLUDED.low_stock_value, updated_at = NOW()`,
          [productId, warehouseId, row.issueRate, row.referenceRate, row.reorderLevel],
        );
        if (warehouseLink.rows[0]) linked += 1;
      }
    }

    await client.query("COMMIT");
    return successResponse(
      { created, linked, skipped, processed: normalized.length },
      warehouseId
        ? "Material master import completed and linked to the selected warehouse. Use Warehouse Stock In to add physical stock."
        : "Material master import completed. Use Warehouse Stock In to add physical stock and make materials available at a warehouse or site.",
    );
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return errorResponse(error.message || "Unable to import material master");
  } finally {
    client?.release();
  }
}

