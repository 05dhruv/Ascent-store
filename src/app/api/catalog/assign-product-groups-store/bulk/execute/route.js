import { getClient } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/apiResponse';

export async function POST(req) {
  let client;
  try {
    const body = await req.json();
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    const groupIds = body.groupIds || body.productIds || [];
    const storeIds = body.storeIds || [];
    const pairs = assignments.length
      ? assignments
          .map((item) => ({ groupId: Number(item.groupId || item.group_id), storeId: Number(item.storeId || item.store_id) }))
          .filter((item) => item.groupId && item.storeId)
      : groupIds.flatMap((gid) => storeIds.map((sid) => ({ groupId: Number(gid), storeId: Number(sid) })));

    if (!pairs.length) return errorResponse('groupIds and storeIds required', 400);

    client = await getClient();
    await client.query('BEGIN');

    let applied = 0;
    let skipped = 0;
    for (const { groupId: gid, storeId: sid } of pairs) {
        const existing = await client.query(
          `SELECT 1
           FROM product_group_stores
           WHERE product_group_id = $1
             AND store_id = $2
           LIMIT 1`,
          [gid, sid]
        );
        if (existing.rows.length) {
          skipped++;
          continue;
        }

        await client.query(
          `INSERT INTO product_group_stores (product_group_id, store_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING`,
          [gid, sid]
        );
        applied++;
    }

    await client.query('COMMIT');
    return successResponse({ applied, skipped }, 'Bulk assign completed');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    console.error(err);
    return errorResponse('Bulk assign failed');
  } finally {
    if (client) client.release();
  }
}
