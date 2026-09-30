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
    const groupIds = Array.isArray(body.groupIds || body.productIds) ? (body.groupIds || body.productIds) : [];
    const storeIds = Array.isArray(body.storeIds) ? body.storeIds : [];
    const pairs = (assignments.length
      ? assignments.map((item) => ({ groupId: Number(item.groupId || item.group_id), storeId: Number(item.storeId || item.store_id) }))
      : groupIds.flatMap((gid) => storeIds.map((sid) => ({ groupId: Number(gid), storeId: Number(sid) })))
    ).filter((item) => Number.isSafeInteger(item.groupId) && item.groupId > 0 && Number.isSafeInteger(item.storeId) && item.storeId > 0);

    if (!pairs.length) return errorResponse('groupIds and storeIds required', 400);
    if (pairs.length > MAX_PAIRS) {
      return errorResponse(`Too many assignments in one request (max ${MAX_PAIRS})`, 400);
    }

    const result = await query(
      `WITH input AS (
         SELECT DISTINCT product_group_id, store_id
         FROM unnest($1::bigint[], $2::bigint[]) AS t(product_group_id, store_id)
       ), inserted AS (
         INSERT INTO product_group_stores (product_group_id, store_id, created_at)
         SELECT i.product_group_id, i.store_id, NOW()
         FROM input i
         WHERE NOT EXISTS (
           SELECT 1 FROM product_group_stores pgs
           WHERE pgs.product_group_id = i.product_group_id AND pgs.store_id = i.store_id
         )
         ON CONFLICT DO NOTHING
         RETURNING 1
       )
       SELECT COUNT(*)::int AS applied FROM inserted`,
      [pairs.map((p) => p.groupId), pairs.map((p) => p.storeId)]
    );

    const applied = result.rows[0]?.applied || 0;
    return successResponse({ applied, skipped: pairs.length - applied }, 'Bulk assign completed');
  } catch (err) {
    console.error(err);
    return errorResponse('Bulk assign failed');
  }
}
