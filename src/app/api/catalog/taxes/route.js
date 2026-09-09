import { query } from '@/lib/db';
import { successResponse, errorResponse, notFound, validationError } from '@/lib/apiResponse';
import { ensureCatalogExtrasSchema } from '@/lib/catalogExtrasSchema';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

// ─── GET /api/catalog/taxes ───────────────────────────────
export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      'VIEW_TAXES',
      'MANAGE_TAXES',
      'VIEW_PRODUCTS',
      'MANAGE_PRODUCTS'
    );
    if (permissionCheck.error) return permissionCheck.error;
    const { searchParams } = new URL(request.url);
    const search   = searchParams.get('search')   || '';
    const page     = parseInt(searchParams.get('page')     || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const offset   = (page - 1) * pageSize;

    const filters = [];
    const params = [];
    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) {
        filters.push('t.store_id IS NULL');
      } else {
        params.push(assignedStores);
        filters.push(`(t.store_id IS NULL OR t.store_id = ANY($${params.length}::int[]))`);
      }
    }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`t.name ILIKE $${params.length}`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM taxes t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT t.id, t.name, t.rate, t.tax_type, t.hsn_code, t.is_active, t.created_at,
              t.parent_tax_id,
              pt.name AS parent_tax_name,
              t.store_id,
              s.name AS store_name
       FROM taxes t
       LEFT JOIN taxes pt ON pt.id = t.parent_tax_id
       LEFT JOIN stores s ON s.id = t.store_id
       ${whereClause}
       ORDER BY t.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return successResponse({
      records: result.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

// ─── POST /api/catalog/taxes ──────────────────────────────
export async function POST(request) {
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_TAXES', 'MANAGE_PRODUCTS');
    if (permissionCheck.error) return permissionCheck.error;
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return validationError({ name: 'Name is required' });
    }
    const storeId = body.store_id || null;
    if (storeId) {
      const storeCheck = requireStore(auth.user, storeId);
      if (storeCheck.error) return storeCheck.error;
    }

    const result = await query(
      `INSERT INTO taxes (name, rate, tax_type, hsn_code, is_active, parent_tax_id, store_id)
       VALUES ($1, $2, COALESCE($3,'GST'), $4, COALESCE($5, true), $6, $7)
       RETURNING *`,
      [
        body.name?.trim(),
        body.rate || 0,
        body.tax_type || 'GST',
        body.hsn_code || null,
        body.is_active ?? true,
        body.parent_tax_id || null,
        storeId,
      ]
    );

    return successResponse(result.rows[0], 'Tax created successfully', 201);
  } catch (err) {
    if (err.code === '23505') {
      return errorResponse('Tax already exists', 409);
    }
    return errorResponse(err.message);
  }
}
