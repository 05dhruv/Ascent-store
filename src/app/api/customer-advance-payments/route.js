import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureCustomerAdvancePaymentsSchema } from '@/lib/customerAdvancePaymentsSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function parsePositiveInteger(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function parseAmount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
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

function mapRow(row, index, page, pageSize) {
  return {
    id: row.customer_id,
    sNo: (page - 1) * pageSize + index + 1,
    customerId: row.customer_code || String(row.customer_id),
    customerName: row.customer_name || '',
    mobileNumber: row.mobile_number || '',
    emailAddress: row.email_address || '',
    customerType: row.customer_type || '',
    customerBalance: Number(row.customer_balance || 0),
    storeId: row.store_id,
    storeName: row.store_name || '',
    regionName: row.region_name || '',
    lastPaymentDate: row.last_payment_date || null,
  };
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureCustomerAdvancePaymentsSchema(),
      ensureStockInSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(url.searchParams.get('pageSize'), 10);
    const store = normalizeText(url.searchParams.get('store'));
    const customerType = normalizeText(url.searchParams.get('customerType'));
    const search = normalizeText(url.searchParams.get('search'));

    const params = [];
    const where = [];

    if (store && store.toLowerCase() !== 'all') {
      params.push(store);
      const idx = params.length;
      where.push(`(
        CAST(balance.store_id AS TEXT) = $${idx}
        OR LOWER(COALESCE(balance.store_name, '')) = LOWER($${idx})
        OR COALESCE(balance.region_name, '') = $${idx}
      )`);
    }

    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) return NextResponse.json({ rows: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
      params.push(assignedStores);
      where.push(`balance.store_id = ANY($${params.length}::int[])`);
    }

    if (customerType && customerType.toLowerCase() !== 'all') {
      params.push(customerType);
      const idx = params.length;
      where.push(`LOWER(COALESCE(balance.customer_type, '')) = LOWER($${idx})`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where.push(`(
        COALESCE(balance.customer_code, '') ILIKE $${idx}
        OR COALESCE(balance.customer_name, '') ILIKE $${idx}
        OR COALESCE(balance.mobile_number, '') ILIKE $${idx}
        OR COALESCE(balance.email_address, '') ILIKE $${idx}
        OR CAST(balance.customer_id AS TEXT) ILIKE $${idx}
      )`);
    }

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await query(
      `
        WITH balance AS (
          SELECT
            c.id AS customer_id,
            c.customer_code,
            TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name,
            c.mobile_number,
            c.email_address,
            c.customer_type,
            COALESCE(SUM(cap.amount - cap.used_amount), 0) AS customer_balance,
            MAX(cap.payment_date) AS last_payment_date,
            MAX(cap.store_id) AS store_id,
            MAX(s.name) AS store_name,
            MAX(cap.reference_id) AS region_name,
            COUNT(*) OVER()::INT AS total_count
          FROM customers c
          LEFT JOIN customer_advance_payments cap ON cap.customer_id = c.id
          LEFT JOIN stores s ON s.id = cap.store_id
          GROUP BY c.id, c.customer_code, c.first_name, c.last_name, c.mobile_number, c.email_address, c.customer_type
        )
        SELECT *
        FROM balance
        ${whereSql}
        ORDER BY customer_balance DESC, customer_name ASC, customer_id ASC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      params
    );

    const rows = Array.isArray(result.rows) ? result.rows : [];
    const total = rows.length ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: rows.map((row, index) => mapRow(row, index, page, pageSize)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-advance-payments GET]', err.message);
    return NextResponse.json(
      {
        rows: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        error: err.message || 'Failed to fetch customer advance payments',
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureCustomerAdvancePaymentsSchema(),
      ensureStockInSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const customerId = parsePositiveInteger(body.customerId, 0);
    const amount = parseAmount(body.amount, 0);
    const storeId = body.storeId === '' || body.storeId == null ? null : parsePositiveInteger(body.storeId, null);
    const paymentMode = normalizeText(body.paymentMode) || 'Cash';
    const referenceId = normalizeText(body.referenceId);
    const remarks = normalizeText(body.remarks);
    const paymentDate = parseDate(body.paymentDate) || new Date().toISOString().slice(0, 10);
    const createdBy = normalizeText(body.createdBy) || 'System';

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
    }

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const result = await query(
      `
        INSERT INTO customer_advance_payments (
          customer_id, store_id, amount, used_amount, balance_amount,
          payment_mode, reference_id, remarks, payment_date, created_by
        ) VALUES ($1, $2, $3, 0, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [customerId, storeId, amount, paymentMode, referenceId, remarks, paymentDate, createdBy]
    );

    return NextResponse.json({ ok: true, id: result.rows[0].id }, { status: 201 });
  } catch (err) {
    console.error('[customer-advance-payments POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to add money' }, { status: 500 });
  }
}

export default null;
