import { successResponse, errorResponse } from "@/lib/api-response";
import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { generateProductBarcode, normalizeBarcode } from "@/lib/productBarcode";

function parseIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .slice(0, 500);
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "VIEW_CATALOG",
      "MANAGE_CATALOG",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const ids = parseIds(body.ids);
    if (!ids.length) return errorResponse("Select products to print barcodes");

    await ensureInventoryBatchSchema();

    const productResult = await query(
      `SELECT
         p.id, p.product_id, p.name, p.barcode, p.sku, p.unit,
         p.mrp, p.selling_price, p.cost_price,
         c.name AS category_name,
         b.name AS brand_name,
         exact_batch_expiry.batch_no,
         exact_batch_expiry.mfg_date,
         exact_batch_expiry.expiry_date,
         exact_batch_expiry.expiry_options
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN LATERAL (
         SELECT
           CASE
             WHEN COUNT(*) = 1 THEN MIN(batch_expiries.expiry_date)
             ELSE NULL
           END AS expiry_date,
           CASE
             WHEN COUNT(*) = 1 THEN MIN(batch_expiries.batch_no)
             ELSE NULL
           END AS batch_no,
           CASE
             WHEN COUNT(*) = 1 THEN MIN(batch_expiries.mfg_date)
             ELSE NULL
           END AS mfg_date,
           COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'expiryDate', batch_expiries.expiry_date,
                 'mfgDate', batch_expiries.mfg_date,
                 'batchNo', batch_expiries.batch_no,
                 'availableQty', batch_expiries.available_qty,
                 'batchCount', batch_expiries.batch_count
               )
               ORDER BY batch_expiries.expiry_date
             ) FILTER (WHERE batch_expiries.expiry_date IS NOT NULL),
             '[]'::jsonb
           ) AS expiry_options
         FROM (
           SELECT
             ib.expiry_date,
             MIN(ib.batch_no) AS batch_no,
             MIN(ib.mfg_date) AS mfg_date,
             SUM(ib.available_qty) AS available_qty,
             COUNT(*) AS batch_count
           FROM inventory_batches ib
           WHERE ib.product_id = p.id
             AND ib.status = 'active'
             AND ib.available_qty > 0
             AND ib.expiry_date IS NOT NULL
           GROUP BY ib.expiry_date
         ) batch_expiries
       ) exact_batch_expiry ON TRUE
       WHERE p.id = ANY($1::int[])
       ORDER BY array_position($1::int[], p.id::int)`,
      [ids],
    );

    const records = [];
    for (const product of productResult.rows) {
      if (normalizeBarcode(product.barcode)) {
        records.push(product);
        continue;
      }
      const generatedBarcode = generateProductBarcode(product.id);
      const updated = await query(
        `UPDATE products
         SET barcode = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, product_id, name, barcode, sku, unit, mrp, selling_price, cost_price`,
        [generatedBarcode, product.id],
      );
      records.push({
        ...product,
        ...updated.rows[0],
      });
    }

    return successResponse({ records }, "Barcode labels ready");
  } catch (err) {
    return errorResponse(err.message);
  }
}
