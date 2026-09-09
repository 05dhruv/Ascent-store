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

function mapApprovalRow(row, index, page, pageSize) {
  return {
    id: row.id,
    sNo: (page - 1) * pageSize + index + 1,
    customerId: row.customer_code || String(row.customer_id || ''),
    customerName: row.customer_name || '',
    mobileNumber: row.mobile_number || '',
    startDate: row.start_date,
    endDate: row.end_date,
    creditLimit: Number(row.credit_limit || 0),
    status: row.status || 'Pending',
    region: row.region_name || '',
    storeId: row.store_id,
  };
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureCustomerCreditAdvancedConfigsSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(url.searchParams.get('pageSize'), 10);
    const search = normalizeText(url.searchParams.get('search'));
    const region = normalizeText(url.searchParams.get('region'));
    const status = normalizeText(url.searchParams.get('status'));
    const dateFrom = parseDate(url.searchParams.get('dateFrom'));
    const dateTo = parseDate(url.searchParams.get('dateTo'));

    const where = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where.push(`(
        CAST(cfg.id AS TEXT) ILIKE $${idx}
        OR COALESCE(c.customer_code, '') ILIKE $${idx}
        OR TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) ILIKE $${idx}
        OR COALESCE(c.mobile_number, '') ILIKE $${idx}
      )`);
    }

    if (region && region.toLowerCase() !== 'all') {
      params.push(region);
      const idx = params.length;
      where.push(`(
        CAST(cfg.store_id AS TEXT) = $${idx}
        OR COALESCE(cfg.region_name, '') = $${idx}
        OR COALESCE(s.name, '') = $${idx}
      )`);
    }

    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) return NextResponse.json({ rows: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
      params.push(assignedStores);
      where.push(`cfg.store_id = ANY($${params.length}::int[])`);
    }

    if (status && status.toLowerCase() !== 'all') {
      params.push(status);
      const idx = params.length;
      where.push(`LOWER(COALESCE(cfg.status, 'pending')) = LOWER($${idx})`);
    }

    if (dateFrom) {
      params.push(dateFrom);
      const idx = params.length;
      where.push(`COALESCE(cfg.start_date, cfg.created_at::date) >= $${idx}::date`);
    }

    if (dateTo) {
      params.push(dateTo);
      const idx = params.length;
      where.push(`COALESCE(cfg.end_date, cfg.start_date, cfg.created_at::date) <= $${idx}::date`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    params.push(pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const result = await query(
      `
        SELECT
          cfg.id,
          cfg.customer_id,
          c.customer_code,
          TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name,
          c.mobile_number,
          cfg.start_date,
          cfg.end_date,
          cfg.credit_limit,
          cfg.status,
          cfg.region_name,
          cfg.store_id,
          COUNT(*) OVER()::INT AS total_count
        FROM customer_credit_advanced_configs cfg
        JOIN customers c ON c.id = cfg.customer_id
        LEFT JOIN stores s ON s.id = cfg.store_id
        ${whereSql}
        ORDER BY cfg.id DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      params
    );

    const rows = Array.isArray(result.rows) ? result.rows : [];
    const total = rows.length ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: rows.map((row, index) => mapApprovalRow(row, index, page, pageSize)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-credit-advanced-configs-approval GET]', err.message);
    return NextResponse.json(
      {
        rows: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        error: err.message || 'Failed to fetch credit advanced config approval rows',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    await ensureCustomerCreditAdvancedConfigsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const id = parsePositiveInteger(body.id, 0);
    const nextStatus = normalizeText(body.status);

    const allowedStatuses = ['Pending', 'Approved', 'Rejected', 'Active'];
    if (!id) {
      return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });
    }

    if (!nextStatus || !allowedStatuses.includes(nextStatus)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });
    }

    const current = await query('SELECT store_id FROM customer_credit_advanced_configs WHERE id = $1', [id]);
    const storeCheck = requireStore(auth.user, current.rows[0]?.store_id);
    if (storeCheck.error) return storeCheck.error;

    const updated = await query(
      `
        UPDATE customer_credit_advanced_configs
        SET status = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, status
      `,
      [id, nextStatus]
    );

    if (!updated.rowCount) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, row: updated.rows[0] });
  } catch (err) {
    console.error('[customer-credit-advanced-configs-approval PATCH]', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to update approval status' },
      { status: 500 }
    );
  }
}

export default null;
