import { getClient, query } from "@/lib/db";
import {
  errorResponse,
  successResponse,
  validationError,
} from "@/lib/api-response";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureWarehouseProductDetailsSchema } from "@/lib/warehouseProductDetailsSchema";
import {
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";

const isAscent = (name) =>
  String(name || "")
    .toLowerCase()
    .includes("ascent");
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function getWarehouse(id) {
  const result = await query(
    `SELECT id, name FROM stores
     WHERE id = $1 AND LOWER(COALESCE(meta->>'locationType', 'Store')) = 'warehouse'`,
    [id],
  );
  return result.rows[0] || null;
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCatalogExtrasSchema(),
      ensureWarehouseProductDetailsSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permission = requirePermission(
      auth.user,
      "VIEW_CATALOG",
      "MANAGE_CATALOG",
    );
    if (permission.error) return permission.error;

    const warehouseId = Number(
      new URL(request.url).searchParams.get("warehouse_id") || 0,
    );
    if (!warehouseId) {
      const rows = await query(
        `SELECT id, name FROM stores
         WHERE LOWER(COALESCE(meta->>'locationType', 'Store')) = 'warehouse'
         ORDER BY name`,
      );
      const allowed = [];
      for (const warehouse of rows.rows) {
        if (!requireStore(auth.user, warehouse.id).error)
          allowed.push({ ...warehouse, isAscent: isAscent(warehouse.name) });
      }
      return successResponse({ records: allowed });
    }

    const access = requireStore(auth.user, warehouseId);
    if (access.error) return access.error;
    const warehouse = await getWarehouse(warehouseId);
    if (!warehouse || !isAscent(warehouse.name))
      return validationError([
        { field: "warehouse_id", message: "Ascent warehouse is required" },
      ]);
    const records = await query(
      `SELECT p.id, p.name, wd.quantity, wd.rate, wd.value, wd.unit, wd.size
       FROM warehouse_product_details wd
       INNER JOIN products p ON p.id = wd.product_id
       WHERE wd.warehouse_id = $1
       ORDER BY p.name`,
      [warehouseId],
    );
    return successResponse({ warehouse, records: records.rows });
  } catch (error) {
    return errorResponse(error.message || "Unable to load Ascent template");
  }
}

export async function POST(request) {
  let client;
  try {
    await Promise.all([
      ensureCatalogExtrasSchema(),
      ensureWarehouseProductDetailsSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permission = requirePermission(auth.user, "MANAGE_CATALOG");
    if (permission.error) return permission.error;
    const body = await request.json().catch(() => ({}));
    const warehouseId = Number(body.warehouse_id || 0);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!warehouseId || !rows.length)
      return validationError([
        {
          field: "rows",
          message: "Warehouse and at least one row are required",
        },
      ]);
    const access = requireStore(auth.user, warehouseId);
    if (access.error) return access.error;
    const warehouse = await getWarehouse(warehouseId);
    if (!warehouse || !isAscent(warehouse.name))
      return validationError([
        { field: "warehouse_id", message: "Ascent warehouse is required" },
      ]);

    const normalized = rows.map((row, index) => {
      const name = String(row["Material Name"] || row["Item Name"] || "").trim();
      const unit = String(row["Unit of Measure"] || row.Unit || "")
        .trim()
        .toUpperCase();
      const size = String(row["Specification / Grade"] || row.Size || "").trim();
      const quantity = number(row["Opening Quantity"] ?? row.Quantity);
      const rate = number(row["Estimated Rate / Unit"] ?? row.Rate);
      if (
        !name ||
        !size ||
        quantity <= 0 ||
        rate < 0 ||
        !["PCS", "PKT", "BAG", "KG", "MT", "CUM", "CFT", "MTR", "SQM", "LTR", "NOS"].includes(unit)
      ) {
        throw new Error(
          `Row ${index + 2}: Material Name, Opening Quantity, Estimated Rate / Unit, Unit of Measure, and Specification / Grade are required`,
        );
      }
      return { name, unit, size, quantity, rate, value: quantity * rate };
    });

    client = await getClient();
    await client.query("BEGIN");
    for (const row of normalized) {
      const existing = await client.query(
        `SELECT p.id FROM products p
         INNER JOIN product_warehouses pw ON pw.product_id = p.id AND pw.warehouse_id = $2 AND pw.is_active = true
         WHERE LOWER(p.name) = LOWER($1) LIMIT 1`,
        [row.name, warehouseId],
      );
      let productId = existing.rows[0]?.id;
      if (!productId) {
        const created = await client.query(
          `INSERT INTO products (name, unit, cost_price, selling_price, mrp, is_active, stock_item_type, inventory_method)
           VALUES ($1, $2, 0, 0, 0, true, 'unbatched', 'direct') RETURNING id`,
          [row.name, row.unit],
        );
        productId = created.rows[0].id;
      }
      await client.query(
        `INSERT INTO product_warehouses (product_id, warehouse_id, is_active, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW())
         ON CONFLICT (product_id, warehouse_id) DO UPDATE SET is_active = true, updated_at = NOW()`,
        [productId, warehouseId],
      );
      await client.query(
        `INSERT INTO product_saleability (product_id, store_id, is_active, selling_price, mrp)
         VALUES ($1, $2, true, 0, 0)
         ON CONFLICT (product_id, store_id) DO UPDATE SET is_active = true, updated_at = NOW()`,
        [productId, warehouseId],
      );
      await client.query(
        `INSERT INTO warehouse_product_details (product_id, warehouse_id, quantity, rate, value, unit, size, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
           quantity = EXCLUDED.quantity, rate = EXCLUDED.rate, value = EXCLUDED.value,
           unit = EXCLUDED.unit, size = EXCLUDED.size, updated_at = NOW()`,
        [
          productId,
          warehouseId,
          row.quantity,
          row.rate,
          row.value,
          row.unit,
          row.size,
        ],
      );
    }
    await client.query("COMMIT");
    return successResponse(
      { processed: normalized.length },
      "Ascent products uploaded",
    );
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return errorResponse(error.message || "Unable to upload Ascent products");
  } finally {
    client?.release();
  }
}
