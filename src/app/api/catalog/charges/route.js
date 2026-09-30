import { query } from '@/lib/db';
import { clampPageSize, LOOKUP_MAX_PAGE_SIZE } from "@/lib/pagination";
import { successResponse, errorResponse, notFound, validationError } from '@/lib/apiResponse';
import { ensureCatalogExtrasSchema } from '@/lib/catalogExtrasSchema';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

const ensureChargesColumns = makeSchemaEnsurer('charges_extended_columns', async () => {
  for (const sql of [
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS tax_id BIGINT REFERENCES taxes(id) ON DELETE SET NULL`,
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL`,
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL`,
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS charge_applied_on VARCHAR(50) NOT NULL DEFAULT 'Product'`,
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS apply_on_order_delivery BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS max_order_value NUMERIC`,
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS apply_only_online_orders BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'Any'`,
    `ALTER TABLE charges ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'Both'`,
  ]) {
    await query(sql);
  }
});

// ─── GET /api/catalog/charges ───────────────────────────────
export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_PRODUCTS', 'MANAGE_PRODUCTS');
    if (permissionCheck.error) return permissionCheck.error;
    await ensureChargesColumns().catch(() => {});
    const { searchParams } = new URL(request.url);
    const search   = searchParams.get('search')   || '';
    const page     = parseInt(searchParams.get('page')     || '1');
    const pageSize = clampPageSize(searchParams.get("pageSize"), { fallback: 10, max: LOOKUP_MAX_PAGE_SIZE });
    const offset   = (page - 1) * pageSize;

    const filters = [];
    const params = [];
    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) filters.push('1 = 0');
      else {
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
      `SELECT COUNT(*) FROM charges t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT t.id, t.name, t.charge_type, t.amount, t.is_active, t.created_at,
              t.charge_applied_on, t.apply_on_order_delivery, t.max_order_value,
              t.tax_id, tx.name AS tax_name,
              t.store_id, s.name AS store_name,
              t.apply_only_online_orders, t.order_type, t.channel, t.department_id,
              d.name AS department_name
       FROM charges t
       LEFT JOIN taxes tx ON tx.id = t.tax_id
       LEFT JOIN stores s ON s.id = t.store_id
       LEFT JOIN departments d ON d.id = t.department_id
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

// ─── POST /api/catalog/charges ──────────────────────────────
export async function POST(request) {
  try {
    await ensureCatalogExtrasSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PRODUCTS');
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
      `INSERT INTO charges (
         name, charge_type, amount, is_active,
         charge_applied_on, apply_on_order_delivery, max_order_value,
         tax_id, store_id, apply_only_online_orders,
         order_type, channel, department_id
       ) VALUES (
         $1, COALESCE($2,'FIXED'), COALESCE($3,0), COALESCE($4, true),
         COALESCE($5,'Product'), COALESCE($6,false), COALESCE($7,0),
         $8, $9, COALESCE($10,false),
         $11, $12, $13
       )
       RETURNING *`,
      [
        body.name?.trim(),
        body.charge_type || 'FIXED',
        body.amount || 0,
        body.is_active ?? true,
        body.charge_applied_on || 'Product',
        body.apply_on_order_delivery ?? false,
        body.max_order_value || 0,
        body.tax_id || null,
        storeId,
        body.apply_only_online_orders ?? false,
        body.order_type || null,
        body.channel || null,
        body.department_id || null,
      ]
    );

    return successResponse(result.rows[0], 'Charge created successfully', 201);
  } catch (err) {
    if (err.code === '23505') {
      return errorResponse('Charge already exists', 409);
    }
    return errorResponse(err.message);
  }
}
