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
    const storeIds = Array.isArray(body.storeIds) ? body.storeIds : [];
    const pairs = (assignments.length
      ? assignments.map((item) => ({ productId: Number(item.productId || item.product_id), storeId: Number(item.storeId || item.store_id) }))
      : productIds.flatMap((pid) => storeIds.map((sid) => ({ productId: Number(pid), storeId: Number(sid) })))
    ).filter((item) => Number.isSafeInteger(item.productId) && item.productId > 0 && Number.isSafeInteger(item.storeId) && item.storeId > 0);

    if (!pairs.length) {
      return errorResponse('productIds and storeIds required', 400);
    }
    if (pairs.length > MAX_PAIRS) {
      return errorResponse(`Too many assignments in one request (max ${MAX_PAIRS})`, 400);
    }

    const result = await query(
      `WITH input AS (
         SELECT DISTINCT product_id, store_id
         FROM unnest($1::bigint[], $2::bigint[]) AS t(product_id, store_id)
       ), upserted AS (
         INSERT INTO product_saleability (product_id, store_id, is_active, created_at, updated_at)
         SELECT i.product_id, i.store_id, true, NOW(), NOW()
         FROM input i
         WHERE NOT EXISTS (
           SELECT 1 FROM product_saleability ps
           WHERE ps.product_id = i.product_id AND ps.store_id = i.store_id AND ps.is_active = TRUE
         )
         ON CONFLICT (product_id, store_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()
         RETURNING 1
       )
       SELECT COUNT(*)::int AS applied FROM upserted`,
      [pairs.map((p) => p.productId), pairs.map((p) => p.storeId)]
    );

    const applied = result.rows[0]?.applied || 0;
    return successResponse({ applied, skipped: pairs.length - applied }, 'Bulk assign completed');
  } catch (err) {
    console.error(err);
    return errorResponse('Bulk assign failed');
  }
}
