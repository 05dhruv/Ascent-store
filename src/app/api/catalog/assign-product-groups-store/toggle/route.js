import { getClient, query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/apiResponse';
import { ensureCatalogExtrasSchema } from '@/lib/catalogExtrasSchema';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

export async function POST(req) {
  let client;
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CATALOG');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await req.json();
    const groupId = body.groupId;
    const storeId = body.storeId;
    const assign = body.assign === true;

    if (!groupId || !storeId) return errorResponse('groupId and storeId required', 400);
    const storeCheck = requireStore(auth.user, Number(storeId));
    if (storeCheck.error) return storeCheck.error;

    client = await getClient();
    await client.query('BEGIN');

    if (assign) {
      await client.query(`INSERT INTO product_group_stores (product_group_id, store_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`, [groupId, storeId]);
    } else {
      await client.query(`DELETE FROM product_group_stores WHERE product_group_id = $1 AND store_id = $2`, [groupId, storeId]);
    }

    await client.query('COMMIT');
    return successResponse({}, assign ? 'Assigned' : 'Unassigned');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    console.error(err);
    return errorResponse('Toggle failed');
  } finally {
    if (client) client.release();
  }
}
