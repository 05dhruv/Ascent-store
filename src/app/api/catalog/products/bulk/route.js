import { query } from "@/lib/db";
import {
  errorResponse,
  successResponse,
  validationError,
} from "@/lib/api-response";
import { auditLog, requireAuth, requirePermission } from "@/lib/api-protection";
import { validatePriceSet } from "@/lib/priceIntegrity";

const FIELD_DEFINITIONS = {
  name: { column: "name", type: "text" },
  description: { column: "description", type: "text" },
  image_url: { column: "image_url", type: "image_url" },
  barcode: { column: "barcode", type: "text" },
  sku: { column: "sku", type: "text" },
  category_id: { column: "category_id", type: "nullable_id" },
  brand_id: { column: "brand_id", type: "nullable_id" },
  department_id: { column: "department_id", type: "nullable_id" },
  tax_id: { column: "tax_id", type: "nullable_id" },
  mrp: { column: "mrp", type: "number" },
  selling_price: { column: "selling_price", type: "number" },
  cost_price: { column: "cost_price", type: "number" },
  unit: { column: "unit", type: "unit" },
  is_active: { column: "is_active", type: "boolean" },
  allow_discount_on_pos: {
    column: "allow_discount_on_pos",
    type: "boolean",
  },
  include_tax: { column: "include_tax", type: "boolean" },
  inventory_method: { column: "inventory_method", type: "inventory_method" },
  stock_item_type: { column: "stock_item_type", type: "stock_item_type" },
};

const FIELD_LABELS = {
  name: "Product Name",
  description: "Description",
  image_url: "Image URL",
  barcode: "Barcode",
  sku: "SKU",
  category_id: "Category",
  brand_id: "Brand",
  department_id: "Department",
  tax_id: "Tax",
  mrp: "MRP",
  selling_price: "Selling Price",
  cost_price: "Cost Price",
  unit: "Unit",
  is_active: "Status",
  allow_discount_on_pos: "Allow Discount On POS",
  include_tax: "Price Includes Tax",
  inventory_method: "Inventory Method",
  stock_item_type: "Stock Item Type",
};

const BULK_EDIT_ALIASES = {
  product_id: "id",
  product_master_id: "id",
  id: "id",
  product_name: "name",
  name: "name",
  description: "description",
  image: "image_url",
  image_url: "image_url",
  image_link: "image_url",
  product_image: "image_url",
  barcode: "barcode",
  sku: "sku",
  brand_id: "brand_id",
  brand: "brand_name",
  brand_name: "brand_name",
  category_id: "category_id",
  category: "category_name",
  category_name: "category_name",
  department_id: "department_id",
  department: "department_name",
  department_name: "department_name",
  tax_id: "tax_id",
  tax: "tax_name",
  tax_name: "tax_name",
  mrp: "mrp",
  cost_price: "cost_price",
  selling_price: "selling_price",
  unit: "unit",
  status: "is_active",
  active: "is_active",
  is_active: "is_active",
  price_includes_tax: "include_tax",
  include_tax: "include_tax",
  allow_discount_on_pos: "allow_discount_on_pos",
  inventory_method: "inventory_method",
  stock_item_type: "stock_item_type",
};

function normalizeIds(ids) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRow(row = {}) {
  return Object.entries(row || {}).reduce((acc, [key, value]) => {
    const normalized = normalizeKey(key);
    const mapped = BULK_EDIT_ALIASES[normalized] || normalized;
    acc[mapped] = typeof value === "string" ? value.trim() : value;
    return acc;
  }, {});
}

function normalizeUnit(value) {
  const unit = String(value || "PCS")
    .trim()
    .toUpperCase();
  if (["G", "GM", "GRAM", "GRAMS"].includes(unit)) return "GRAMS";
  return ["PCS", "KG", "GRAMS", "LTR"].includes(unit) ? unit : "PCS";
}

function normalizeValue(type, value) {
  if (type === "text") {
    const text = String(value ?? "").trim();
    return text || null;
  }

  if (type === "image_url") {
    const text = String(value ?? "").trim();
    if (!text) return null;
    if (/^https?:\/\/\S+$/i.test(text) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(text)) {
      return text;
    }
    throw new Error("Image URL must be a complete http(s) URL or an image data URL");
  }

  if (type === "nullable_id") {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  if (type === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  if (type === "boolean") {
    const text = String(value ?? "")
      .trim()
      .toLowerCase();
    if (["active", "yes", "y", "1", "true", "on"].includes(text)) return true;
    if (["inactive", "no", "n", "0", "false", "off"].includes(text))
      return false;
    return value === true || value === "true";
  }

  if (type === "unit") return normalizeUnit(value);

  if (type === "inventory_method") {
    return String(value || "").toLowerCase() === "indirect"
      ? "indirect"
      : "direct";
  }

  if (type === "stock_item_type") {
    return String(value || "").toLowerCase() === "batched"
      ? "batched"
      : "unbatched";
  }

  return value;
}

function valuesEqual(current, next, type) {
  if (type === "number") return Number(current || 0) === Number(next || 0);
  if (type === "boolean") return Boolean(current) === Boolean(next);
  if (type === "nullable_id") {
    const currentId =
      current === null || current === undefined ? null : Number(current);
    const nextId = next === null || next === undefined ? null : Number(next);
    return currentId === nextId;
  }
  return String(current ?? "") === String(next ?? "");
}

function displayValue(value, type) {
  if (value === null || value === undefined || value === "") return "-";
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "number") return Number(value || 0);
  return String(value);
}

function isBlank(value) {
  return value === "" || value === null || value === undefined;
}

async function fetchReferenceMaps() {
  const [brands, categories, departments, taxes] = await Promise.all([
    query("SELECT id, name FROM brands"),
    query("SELECT id, name FROM categories"),
    query("SELECT id, name FROM departments"),
    query("SELECT id, name FROM taxes"),
  ]);

  const makeMap = (rows) =>
    new Map(
      rows.map((row) => [
        String(row.name || "")
          .trim()
          .toLowerCase(),
        Number(row.id),
      ]),
    );

  return {
    brand_name: makeMap(brands.rows),
    category_name: makeMap(categories.rows),
    department_name: makeMap(departments.rows),
    tax_name: makeMap(taxes.rows),
  };
}

function applyReferenceNames(row, maps) {
  const out = { ...row };
  for (const [nameKey, idKey] of [
    ["brand_name", "brand_id"],
    ["category_name", "category_id"],
    ["department_name", "department_id"],
    ["tax_name", "tax_id"],
  ]) {
    if (!isBlank(out[idKey]) || isBlank(out[nameKey])) continue;
    const id = maps[nameKey]?.get(String(out[nameKey]).trim().toLowerCase());
    if (id) out[idKey] = id;
  }
  return out;
}

async function findProduct(row) {
  const id = Number(row.id || 0);
  if (Number.isInteger(id) && id > 0) {
    const result = await query("SELECT * FROM products WHERE id = $1 LIMIT 1", [
      id,
    ]);
    if (result.rows[0]) return result.rows[0];
  }

  for (const field of ["barcode", "sku"]) {
    const value = String(row[field] || "").trim();
    if (!value) continue;
    const result = await query(
      `SELECT * FROM products WHERE ${field} = $1 ORDER BY id ASC LIMIT 2`,
      [value],
    );
    if (result.rows.length === 1) return result.rows[0];
    if (result.rows.length > 1) {
      return { __error: `Multiple products found for ${field} ${value}` };
    }
  }

  return null;
}

async function validateBarcodeChange({ productId, barcode, stockItemType }) {
  const normalizedBarcode = String(barcode || "").trim();
  if (!normalizedBarcode) return null;

  const duplicates = await query(
    `SELECT id, name, stock_item_type
     FROM products
     WHERE barcode = $1 AND id <> $2
     LIMIT 5`,
    [normalizedBarcode, Number(productId)],
  );
  if (!duplicates.rows.length) return null;

  const incomingType = normalizeValue("stock_item_type", stockItemType);
  const blocked = duplicates.rows.find(
    (row) =>
      normalizeValue("stock_item_type", row.stock_item_type) !== "batched" ||
      incomingType !== "batched",
  );
  return blocked
    ? `Barcode already used by "${blocked.name}". Duplicate barcodes are allowed only when both products are batched.`
    : null;
}

async function patchFromRows(rows, { preview = false, userId = null } = {}) {
  const maps = await fetchReferenceMaps();
  const result = {
    changed: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
    ids: [],
    rows: [],
  };

  for (const [index, sourceRow] of rows.entries()) {
    const rowNumber = index + 2;
    const row = applyReferenceNames(normalizeRow(sourceRow), maps);
    const product = await findProduct(row);

    if (!product) {
      result.skipped += 1;
      const error = { row: rowNumber, error: "Product not found" };
      result.errors.push(error);
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productName: row.name || "-",
        barcode: row.barcode || row.sku || "-",
        changes: [],
        error: error.error,
      });
      continue;
    }
    if (product.__error) {
      result.skipped += 1;
      const error = { row: rowNumber, error: product.__error };
      result.errors.push(error);
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productName: row.name || "-",
        barcode: row.barcode || row.sku || "-",
        changes: [],
        error: error.error,
      });
      continue;
    }

    const setClauses = [];
    const values = [];
    const changes = [];
    const nextPrice = {
      mrp: Number(product.mrp || 0),
      sellingPrice: Number(product.selling_price || 0),
      costPrice: Number(product.cost_price || 0),
    };
    let fieldError = "";

    for (const [field, definition] of Object.entries(FIELD_DEFINITIONS)) {
      if (!Object.prototype.hasOwnProperty.call(row, field)) continue;
      if (field !== "barcode" && isBlank(row[field])) continue;

      let normalized;
      try {
        normalized = normalizeValue(definition.type, row[field]);
      } catch (error) {
        fieldError = error.message || `Invalid ${FIELD_LABELS[field] || field}`;
        break;
      }
      if (field === "barcode" && isBlank(normalized)) continue;
      if (
        valuesEqual(product[definition.column], normalized, definition.type)
      ) {
        continue;
      }

      values.push(normalized);
      setClauses.push(`${definition.column} = $${values.length}`);
      if (field === "mrp") nextPrice.mrp = normalized;
      if (field === "selling_price") nextPrice.sellingPrice = normalized;
      if (field === "cost_price") nextPrice.costPrice = normalized;
      changes.push({
        field,
        label: FIELD_LABELS[field] || field,
        from: displayValue(product[definition.column], definition.type),
        to: displayValue(normalized, definition.type),
      });
    }

    if (fieldError) {
      result.skipped += 1;
      result.errors.push({ row: rowNumber, error: fieldError });
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || product.sku || "-",
        changes: [],
        error: fieldError,
      });
      continue;
    }

    const priceValidation = validatePriceSet(nextPrice);
    if (!priceValidation.valid) {
      result.skipped += 1;
      result.errors.push({ row: rowNumber, error: priceValidation.error });
      result.rows.push({
        row: rowNumber,
        status: "skipped",
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || product.sku || "-",
        changes,
        error: priceValidation.error,
      });
      continue;
    }

    if (!setClauses.length) {
      result.unchanged += 1;
      result.rows.push({
        row: rowNumber,
        status: "unchanged",
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || product.sku || "-",
        changes: [],
      });
      continue;
    }

    const nextBarcodeIndex = setClauses.findIndex((clause) =>
      clause.startsWith("barcode ="),
    );
    if (nextBarcodeIndex >= 0) {
      const barcode = values[nextBarcodeIndex];
      const stockTypeIndex = setClauses.findIndex((clause) =>
        clause.startsWith("stock_item_type ="),
      );
      const stockItemType =
        stockTypeIndex >= 0 ? values[stockTypeIndex] : product.stock_item_type;
      const barcodeError = await validateBarcodeChange({
        productId: product.id,
        barcode,
        stockItemType,
      });
      if (barcodeError) {
        result.skipped += 1;
        result.errors.push({ row: rowNumber, error: barcodeError });
        result.rows.push({
          row: rowNumber,
          status: "skipped",
          productId: product.id,
          productName: product.name,
          barcode: product.barcode || product.sku || "-",
          changes,
          error: barcodeError,
        });
        continue;
      }
    }

    result.changed += 1;
    if (preview) {
      result.rows.push({
        row: rowNumber,
        status: "changed",
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || product.sku || "-",
        changes,
      });
      continue;
    }

    values.push(product.id);
    const updated = await query(
      `UPDATE products
       SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id`,
      values,
    );
    if (updated.rowCount) {
      result.updated += 1;
      result.ids.push(product.id);
      if (changes.some((change) => ["mrp", "selling_price", "cost_price"].includes(change.field))) {
        await auditLog(userId, "product.prices_updated_bulk", "product", product.id, {
          productName: product.name,
          barcode: product.barcode || product.sku || null,
          changes,
          source: "bulk_product_update",
        });
      }
      result.rows.push({
        row: rowNumber,
        status: "updated",
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || product.sku || "-",
        changes,
      });
    }
  }

  return result;
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "MATERIAL_IMPORT");
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    if (Array.isArray(body.rows)) {
      const rows = body.rows.filter((row) =>
        Object.values(row || {}).some(
          (value) => String(value ?? "").trim() !== "",
        ),
      );
      if (!rows.length) {
        return validationError({ rows: "Upload at least one product row" });
      }
      const preview = body.preview === true;
      const result = await patchFromRows(rows, { preview, userId: auth.user.id });
      return successResponse(
        result,
        preview
          ? `${result.changed} product(s) changed, ${result.unchanged} unchanged, ${result.skipped} skipped`
          : `${result.updated} product(s) updated, ${result.unchanged} unchanged, ${result.skipped} skipped`,
      );
    }

    const ids = normalizeIds(body.ids);
    const updates = body.updates || {};

    if (!ids.length) {
      return validationError({ ids: "Select at least one product" });
    }

    const setClauses = [];
    const values = [];

    for (const [field, definition] of Object.entries(FIELD_DEFINITIONS)) {
      if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
      values.push(normalizeValue(definition.type, updates[field]));
      setClauses.push(`${definition.column} = $${values.length}`);
    }

    if (!setClauses.length) {
      return validationError({
        updates: "Choose at least one field to update",
      });
    }

    const priceFieldsChanged = ["mrp", "selling_price", "cost_price"].some((field) =>
      Object.prototype.hasOwnProperty.call(updates, field),
    );
    if (priceFieldsChanged) {
      const existing = await query(
        `SELECT id, mrp, selling_price, cost_price FROM products WHERE id = ANY($1::int[])`,
        [ids],
      );
      for (const product of existing.rows) {
        const priceValidation = validatePriceSet({
          mrp: Object.prototype.hasOwnProperty.call(updates, "mrp") ? updates.mrp : product.mrp,
          sellingPrice: Object.prototype.hasOwnProperty.call(updates, "selling_price") ? updates.selling_price : product.selling_price,
          costPrice: Object.prototype.hasOwnProperty.call(updates, "cost_price") ? updates.cost_price : product.cost_price,
        });
        if (!priceValidation.valid) return validationError({ price: priceValidation.error });
      }
    }

    values.push(ids);
    const idsParam = values.length;

    const result = await query(
      `UPDATE products
       SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = ANY($${idsParam}::int[])
       RETURNING id`,
      values,
    );

    if (setClauses.some((clause) => /^(mrp|selling_price|cost_price)\s*=/.test(clause))) {
      for (const row of result.rows) {
        await auditLog(auth.user.id, "product.prices_updated_bulk", "product", row.id, {
          changedFields: Object.keys(updates).filter((field) =>
            ["mrp", "selling_price", "cost_price"].includes(field),
          ),
          source: "bulk_product_update",
        });
      }
    }

    return successResponse(
      {
        updated: result.rowCount,
        ids: result.rows.map((row) => row.id),
      },
      `${result.rowCount} product(s) updated successfully`,
    );
  } catch (err) {
    return errorResponse(err.message);
  }
}
