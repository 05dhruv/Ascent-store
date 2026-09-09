import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';
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

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapListRow(row, index, page, pageSize) {
  return {
    id: row.id,
    sNo: (page - 1) * pageSize + index + 1,
    customerId: row.customer_code || String(row.customer_id),
    customerName: row.customer_name || '',
    mobileNumber: row.mobile_number || '',
    startDate: row.start_date,
    endDate: row.end_date,
    creditLimit: Number(row.credit_limit || 0),
    creditConsumed: Number(row.credit_consumed || 0),
    status: row.status || 'Active',
    region: row.region_name || '',
    storeId: row.store_id,
    customerGroup: row.customer_group || '',
  };
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureInvoiceSalesOrdersSchema(),
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
    const dateFrom = parseDate(url.searchParams.get('dateFrom'));
    const dateTo = parseDate(url.searchParams.get('dateTo'));

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

    if (region && region.toLowerCase() !== 'all') {
      params.push(region);
      const idx = params.length;
      where.push(`(
        COALESCE(cfg.region_name, '') = $${idx}
        OR s.name = $${idx}
        OR CAST(cfg.store_id AS TEXT) = $${idx}
      )`);
    }

    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) return NextResponse.json({ rows: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
      params.push(assignedStores);
      where.push(`cfg.store_id = ANY($${params.length}::int[])`);
    }

    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      const startIdx = params.length - 1;
      where.push(`(
        COALESCE(cfg.start_date, cfg.created_at::date) BETWEEN $${startIdx}::date AND $${startIdx + 1}::date
      )`);
    }

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT cfg.id,
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
             cfg.customer_group,
             COALESCE(SUM(iso.write_off_amount), 0) AS credit_consumed,
             COUNT(*) OVER()::INT AS total_count
      FROM customer_credit_advanced_configs cfg
      JOIN customers c ON c.id = cfg.customer_id
      LEFT JOIN stores s ON s.id = cfg.store_id
      LEFT JOIN invoice_sales_orders iso ON (
        iso.booking_id = c.customer_code
        OR iso.booking_id = c.id::text
        OR (iso.meta->>'customer_id') = c.id::text
      )
      ${whereSql}
      GROUP BY cfg.id, cfg.customer_id, c.customer_code, c.first_name, c.last_name, c.mobile_number,
               cfg.start_date, cfg.end_date, cfg.credit_limit, cfg.status, cfg.region_name, cfg.store_id, cfg.customer_group
      ORDER BY cfg.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const res = await query(sql, params);
    const rows = Array.isArray(res.rows) ? res.rows : [];
    const total = rows.length ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: rows.map((row, index) => mapListRow(row, index, page, pageSize)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-credit-advanced-configs GET]', err.message);
    return NextResponse.json(
      {
        rows: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        error: err.message || 'Failed to fetch credit advanced configs',
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await Promise.all([ensureCustomersSchema(), ensureCustomerCreditAdvancedConfigsSchema()]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const region = normalizeText(body.region) || 'All';
    const storeId = body.storeId === '' || body.storeId == null ? null : parsePositiveInteger(body.storeId, null);
    const customerGroup = normalizeText(body.customerGroup) || null;
    const status = normalizeText(body.status) || 'Active';
    const items = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json({ error: 'At least one customer configuration is required' }, { status: 400 });
    }
    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const saved = [];

    for (const item of items) {
      const customerId = parsePositiveInteger(item.customerId, 0);
      if (!customerId) continue;

      const startDate = parseDate(item.startDate);
      const endDate = parseDate(item.endDate);
      const creditLimit = parseNumber(item.creditLimit, 0);

      const upsert = await query(
        `INSERT INTO customer_credit_advanced_configs (
           customer_id, store_id, region_name, customer_group, start_date, end_date, credit_limit, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (customer_id)
         DO UPDATE SET
           store_id = EXCLUDED.store_id,
           region_name = EXCLUDED.region_name,
           customer_group = EXCLUDED.customer_group,
           start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date,
           credit_limit = EXCLUDED.credit_limit,
           status = EXCLUDED.status,
           updated_at = NOW()
         RETURNING id, customer_id`,
        [customerId, storeId, region, customerGroup, startDate, endDate, creditLimit, status]
      );

      await query('UPDATE customers SET credit_limit = $1, updated_at = NOW() WHERE id = $2', [creditLimit, customerId]);
      saved.push(upsert.rows[0]);
    }

    if (!saved.length) {
      return NextResponse.json({ error: 'No valid rows to save' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, savedCount: saved.length, rows: saved }, { status: 201 });
  } catch (err) {
    console.error('[customer-credit-advanced-configs POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to save credit advanced configs' }, { status: 500 });
  }
}

export default null;
