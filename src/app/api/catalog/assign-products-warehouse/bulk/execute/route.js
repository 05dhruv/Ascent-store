import { getClient } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/apiResponse';

export async function POST(req) {
  let client;
  try {
    const body = await req.json();
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    const productIds = body.productIds || [];
    const warehouseIds = body.warehouseIds || [];
    const pairs = assignments.length
      ? assignments
          .map((item) => ({ productId: Number(item.productId || item.product_id), warehouseId: Number(item.warehouseId || item.warehouse_id) }))
          .filter((item) => item.productId && item.warehouseId)
      : productIds.flatMap((pid) => warehouseIds.map((wid) => ({ productId: Number(pid), warehouseId: Number(wid) })));

    if (!pairs.length) {
      return errorResponse('productIds and warehouseIds required', 400);
    }

    client = await getClient();
    await client.query('BEGIN');

    let applied = 0;
    let skipped = 0;
    for (const { productId: pid, warehouseId: wid } of pairs) {
        const existing = await client.query(
          `SELECT 1
           FROM product_warehouses
           WHERE product_id = $1
             AND warehouse_id = $2
             AND is_active = TRUE
           LIMIT 1`,
          [pid, wid]
        );
        if (existing.rows.length) {
          skipped++;
          continue;
        }

        await client.query(
          `INSERT INTO product_warehouses (product_id, warehouse_id, is_active, created_at, updated_at)
           VALUES ($1, $2, true, NOW(), NOW())
           ON CONFLICT (product_id, warehouse_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()`,
          [pid, wid]
        );
        applied++;
    }

    await client.query('COMMIT');
    return successResponse({ applied, skipped }, 'Bulk assign to warehouses completed');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    console.error(err);
    return errorResponse('Bulk assign failed');
  } finally {
    if (client) client.release();
  }
}
