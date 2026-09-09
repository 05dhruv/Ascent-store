import { getClient, query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/apiResponse';

export async function POST(req) {
  let client;
  try {
    const body = await req.json();
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    const productIds = body.productIds || [];
    const storeIds = body.storeIds || [];
    const pairs = assignments.length
      ? assignments
          .map((item) => ({ productId: Number(item.productId || item.product_id), storeId: Number(item.storeId || item.store_id) }))
          .filter((item) => item.productId && item.storeId)
      : productIds.flatMap((pid) => storeIds.map((sid) => ({ productId: Number(pid), storeId: Number(sid) })));

    if (!pairs.length) {
      return errorResponse('productIds and storeIds required', 400);
    }

    client = await getClient();
    await client.query('BEGIN');

    let applied = 0;
    let skipped = 0;
    for (const { productId: pid, storeId: sid } of pairs) {
        const existing = await client.query(
          `SELECT 1
           FROM product_saleability
           WHERE product_id = $1
             AND store_id = $2
             AND is_active = TRUE
           LIMIT 1`,
          [pid, sid]
        );
        if (existing.rows.length) {
          skipped++;
          continue;
        }

        await client.query(
          `INSERT INTO product_saleability (product_id, store_id, is_active, created_at, updated_at)
           VALUES ($1, $2, true, NOW(), NOW())
           ON CONFLICT (product_id, store_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()`,
          [pid, sid]
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
