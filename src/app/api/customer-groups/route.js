import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureCustomerGroupsSchema } from '@/lib/customerGroupsSchema';
import { requireAuth, requirePermission } from '@/lib/api-protection';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function mapCustomerGroupRow(row) {
  return {
    id: row.id,
    name: row.group_name,
    group_name: row.group_name,
    code: row.group_code,
    group_code: row.group_code,
    description: row.description || '',
    is_default: row.is_default,
    default: row.is_default,
    template_filename: row.template_filename || '',
    template_uploaded_at: row.template_uploaded_at,
    total_customers: Number(row.total_customers || 0),
    customers: Number(row.total_customers || 0),
    status: row.status,
    created_at: row.created_at,
  };
}

async function ensureSchemas() {
  await ensureCustomersSchema();
  await ensureCustomerGroupsSchema();
}

async function clearExistingDefault() {
  await query('UPDATE customer_groups SET is_default = FALSE, updated_at = NOW() WHERE is_default = TRUE');
}

export async function GET(request) {
  try {
    await ensureSchemas();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const search = normalizeText(searchParams.get('search'));
    const status = normalizeText(searchParams.get('status'));
    const params = [];
    const where = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        cg.group_name ILIKE $${params.length}
        OR cg.group_code ILIKE $${params.length}
        OR COALESCE(cg.description, '') ILIKE $${params.length}
      )`);
    }

    if (status && status.toLowerCase() !== 'all') {
      params.push(status);
      where.push(`LOWER(cg.status) = LOWER($${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await query(
      `SELECT
         cg.id,
         cg.group_name,
         cg.group_code,
         cg.description,
         cg.is_default,
         cg.template_filename,
         cg.template_uploaded_at,
         COALESCE(customer_counts.total_customers, 0)::int AS total_customers,
         cg.status,
         cg.created_at
       FROM customer_groups cg
       LEFT JOIN (
         SELECT customer_group_id, COUNT(*)::int AS total_customers
         FROM customers
         WHERE customer_group_id IS NOT NULL
         GROUP BY customer_group_id
       ) customer_counts ON customer_counts.customer_group_id = cg.id
       ${whereSql}
       ORDER BY cg.is_default DESC, cg.created_at DESC, cg.id DESC`,
      params
    );

    return NextResponse.json(res.rows.map(mapCustomerGroupRow));
  } catch (err) {
    console.error('[customer groups GET]', err.message);
    return NextResponse.json({ error: 'Failed to fetch customer groups' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureSchemas();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const groupName = normalizeText(body.group_name ?? body.groupName);
    const groupCode = normalizeText(body.group_code ?? body.groupCode);
    const description = normalizeText(body.description);
    const isDefault = normalizeBoolean(body.is_default ?? body.isDefault);
    const templateFilename = normalizeText(body.template_filename ?? body.templateFileName);

    if (!groupName) return NextResponse.json({ error: 'Customer group name is required' }, { status: 400 });
    if (!groupCode) return NextResponse.json({ error: 'Customer group code is required' }, { status: 400 });

    if (isDefault) await clearExistingDefault();

    const res = await query(
      `INSERT INTO customer_groups (
         group_name, group_code, description, is_default, template_filename, template_uploaded_at, total_customers, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'Active', NOW())
       RETURNING id, group_name, group_code, description, is_default, template_filename, template_uploaded_at, total_customers, status, created_at`,
      [groupName, groupCode, description, isDefault, templateFilename, templateFilename ? new Date().toISOString() : null]
    );

    return NextResponse.json(mapCustomerGroupRow(res.rows[0]), { status: 201 });
  } catch (err) {
    console.error('[customer groups POST]', err.message);
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Customer group code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message || 'Failed to create customer group' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    await ensureSchemas();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: 'Customer group id is required' }, { status: 400 });

    if (body.action === 'set_default') {
      await clearExistingDefault();
      await query('UPDATE customer_groups SET is_default = TRUE, status = $1, updated_at = NOW() WHERE id = $2', ['Active', id]);
    } else if (body.action === 'toggle_status') {
      const status = normalizeText(body.status) || 'Inactive';
      await query('UPDATE customer_groups SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    } else {
      const groupName = normalizeText(body.group_name ?? body.groupName);
      const groupCode = normalizeText(body.group_code ?? body.groupCode);
      const description = normalizeText(body.description);
      const isDefault = normalizeBoolean(body.is_default ?? body.isDefault);

      if (!groupName) return NextResponse.json({ error: 'Customer group name is required' }, { status: 400 });
      if (!groupCode) return NextResponse.json({ error: 'Customer group code is required' }, { status: 400 });
      if (isDefault) await clearExistingDefault();

      await query(
        `UPDATE customer_groups
         SET group_name = $1,
             group_code = $2,
             description = $3,
             is_default = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [groupName, groupCode, description, isDefault, id]
      );
    }

    const res = await query(
      `SELECT cg.id, cg.group_name, cg.group_code, cg.description, cg.is_default, cg.template_filename,
              cg.template_uploaded_at, COALESCE(customer_counts.total_customers, 0)::int AS total_customers,
              cg.status, cg.created_at
       FROM customer_groups cg
       LEFT JOIN (
         SELECT customer_group_id, COUNT(*)::int AS total_customers
         FROM customers
         WHERE customer_group_id IS NOT NULL
         GROUP BY customer_group_id
       ) customer_counts ON customer_counts.customer_group_id = cg.id
       WHERE cg.id = $1`,
      [id]
    );

    if (!res.rows[0]) return NextResponse.json({ error: 'Customer group not found' }, { status: 404 });
    return NextResponse.json(mapCustomerGroupRow(res.rows[0]));
  } catch (err) {
    console.error('[customer groups PATCH]', err.message);
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Customer group code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message || 'Failed to update customer group' }, { status: 500 });
  }
}
