import { query } from '@/lib/db';
import { requireAccess } from "@/lib/api-protection";
import { successResponse, errorResponse } from '@/lib/apiResponse';

const MAX_PAIRS = 50000;

export async function POST(req) {
  try {
    const auth = await requireAccess(req, "MANAGE_CATALOG");
    if (auth.error) return auth.error;
    const body = await req.json();
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    const productIds = Array.isArray(body.productIds) ? body.productIds : [];
    const warehouseIds = Array.isArray(body.warehouseIds) ? body.warehouseIds : [];
    const pairs = (assignments.length
      ? assignments.map((item) => ({ productId: Number(item.productId || item.product_id), warehouseId: Number(item.warehouseId || item.warehouse_id) }))
      : productIds.flatMap((pid) => warehouseIds.map((wid) => ({ productId: Number(pid), warehouseId: Number(wid) })))
    ).filter((item) => Number.isSafeInteger(item.productId) && item.productId > 0 && Number.isSafeInteger(item.warehouseId) && item.warehouseId > 0);

    if (!pairs.length) {
      return errorResponse('productIds and warehouseIds required', 400);
    }
    if (pairs.length > MAX_PAIRS) {
      return errorResponse(`Too many assignments in one request (max ${MAX_PAIRS})`, 400);
    }

    const result = await query(
      `WITH input AS (
         SELECT DISTINCT product_id, warehouse_id
         FROM unnest($1::bigint[], $2::bigint[]) AS t(product_id, warehouse_id)
       ), upserted AS (
         INSERT INTO product_warehouses (product_id, warehouse_id, is_active, created_at, updated_at)
         SELECT i.product_id, i.warehouse_id, true, NOW(), NOW()
         FROM input i
         WHERE NOT EXISTS (
           SELECT 1 FROM product_warehouses pw
           WHERE pw.product_id = i.product_id AND pw.warehouse_id = i.warehouse_id AND pw.is_active = TRUE
         )
         ON CONFLICT (product_id, warehouse_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()
         RETURNING 1
       )
       SELECT COUNT(*)::int AS applied FROM upserted`,
      [pairs.map((p) => p.productId), pairs.map((p) => p.warehouseId)]
    );

    const applied = result.rows[0]?.applied || 0;
    return successResponse({ applied, skipped: pairs.length - applied }, 'Bulk assign to warehouses completed');
  } catch (err) {
    console.error(err);
    return errorResponse('Bulk assign failed');
  }
}
