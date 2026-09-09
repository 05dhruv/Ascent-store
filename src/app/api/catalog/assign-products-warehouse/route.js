import { query } from '@/lib/db';
import { successResponse, errorResponse, validationError } from '@/lib/api-response';
import { ensureCatalogExtrasSchema } from '@/lib/catalogExtrasSchema';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CATALOG', 'MANAGE_CATALOG');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const warehouseId = Number(searchParams.get('warehouseId') || searchParams.get('warehouse_id') || 0) || null;
    const search = String(searchParams.get('search') || '').trim();
    if (!warehouseId) return validationError([{ field: 'warehouseId', message: 'Warehouse is required' }]);
    const storeCheck = requireStore(auth.user, warehouseId);
    if (storeCheck.error) return storeCheck.error;

    const params = [warehouseId];
    const where = ['p.is_active IS DISTINCT FROM false'];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.product_id ILIKE $${params.length})`);
    }

    const res = await query(
      `SELECT p.id, p.product_id, p.name, p.sku,
              COALESCE(pw.is_active, false) AS is_assigned,
              0 AS safe_stock_level,
              0 AS low_stock_level
       FROM products p
       LEFT JOIN product_warehouses pw ON pw.product_id = p.id AND pw.warehouse_id = $1
       WHERE ${where.join(' AND ')}
       ORDER BY p.name ASC
       LIMIT 1000`,
      params
    );

    return successResponse({ records: res.rows }, 'Products fetched');
  } catch (err) {
    console.error('[assign-products-warehouse GET]', err);
    return errorResponse('Failed to fetch products');
  }
}

export async function POST(request) {
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CATALOG');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const productId = Number(body.productId || body.product_id || 0) || null;
    const warehouseId = Number(body.warehouseId || body.warehouse_id || 0) || null;
    if (!productId || !warehouseId) return validationError([{ field: 'productId', message: 'Product and warehouse are required' }]);
    const storeCheck = requireStore(auth.user, warehouseId);
    if (storeCheck.error) return storeCheck.error;

    const assign = body.assign !== false && body.is_active !== false;
    if (assign) {
      await query(
        `INSERT INTO product_warehouses (product_id, warehouse_id, is_active, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW())
         ON CONFLICT (product_id, warehouse_id) DO UPDATE SET is_active = true, updated_at = NOW()`,
        [productId, warehouseId]
      );
    } else {
      await query(`UPDATE product_warehouses SET is_active = false, updated_at = NOW() WHERE product_id = $1 AND warehouse_id = $2`, [productId, warehouseId]);
    }

    return successResponse({ productId, warehouseId, isAssigned: assign }, assign ? 'Product assigned' : 'Product unassigned');
  } catch (err) {
    console.error('[assign-products-warehouse POST]', err);
    return errorResponse('Failed to update assignment');
  }
}
