import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureCustomerCreditAdvancedConfigsSchema } from '@/lib/customerCreditAdvancedConfigsSchema';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function parsePositiveInteger(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function mapManageRow(row, index, page, pageSize) {
  return {
    id: row.id,
    sNo: (page - 1) * pageSize + index + 1,
    customerId: row.customer_code || String(row.id),
    customerName: row.customer_name || '',
    mobileNumber: row.mobile_number || '',
    fromDate: row.from_date,
    toDate: row.to_date,
    creditLimit: Number(row.credit_limit || 0),
    selected: true,
  };
}

export async function GET(request) {
  try {
    await Promise.all([ensureCustomersSchema(), ensureCustomerCreditAdvancedConfigsSchema()]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(url.searchParams.get('pageSize'), 10);
    const search = normalizeText(url.searchParams.get('search'));

    const params = [];
    const where = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where.push(`(
        COALESCE(c.customer_code, '') ILIKE $${idx}
        OR TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) ILIKE $${idx}
        OR COALESCE(c.mobile_number, '') ILIKE $${idx}
      )`);
    }

    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) return NextResponse.json({ rows: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
      params.push(assignedStores);
      where.push(`COALESCE(cfg.store_id, c.store_id) = ANY($${params.length}::int[])`);
    }

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT c.id,
             c.customer_code,
             TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name,
             c.mobile_number,
             cfg.start_date AS from_date,
             cfg.end_date AS to_date,
             COALESCE(cfg.credit_limit, c.credit_limit, 0) AS credit_limit,
             COUNT(*) OVER()::INT AS total_count
      FROM customers c
      LEFT JOIN customer_credit_advanced_configs cfg ON cfg.customer_id = c.id
      ${whereSql}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const res = await query(sql, params);
    const rows = Array.isArray(res.rows) ? res.rows : [];
    const total = rows.length ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: rows.map((row, index) => mapManageRow(row, index, page, pageSize)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-credit-advanced-configs-manage GET]', err.message);
    return NextResponse.json(
      { rows: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 }, error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await ensureCustomerCreditAdvancedConfigsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const customerId = parsePositiveInteger(body.customerId, 0);
    const creditLimit = Number(body.creditLimit || 0);
    const fromDate = parseDate(body.fromDate);
    const toDate = parseDate(body.toDate);

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const current = await query(
      `SELECT COALESCE(cfg.store_id, c.store_id) AS store_id
       FROM customers c
       LEFT JOIN customer_credit_advanced_configs cfg ON cfg.customer_id = c.id
       WHERE c.id = $1`,
      [customerId]
    );
    const storeCheck = requireStore(auth.user, current.rows[0]?.store_id);
    if (storeCheck.error) return storeCheck.error;

    const res = await query(
      `UPDATE customer_credit_advanced_configs
       SET credit_limit = $2,
           start_date = COALESCE($3::date, start_date),
           end_date = COALESCE($4::date, end_date),
           updated_at = NOW()
       WHERE customer_id = $1
       RETURNING id`,
      [customerId, creditLimit, fromDate, toDate]
    );

    return NextResponse.json({ ok: true, updated: res.rowCount || 0 });
  } catch (err) {
    console.error('[customer-credit-advanced-configs-manage POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to update row' }, { status: 500 });
  }
}

export default null;
