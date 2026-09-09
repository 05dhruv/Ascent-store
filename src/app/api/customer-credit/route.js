import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureStoresSchema } from '@/lib/storesSchema';
import { getStoreScope, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function parsePositiveInteger(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function buildCreditQuery({ store, search, page, pageSize, storeIds }) {
  const params = [];
  const where = [];

  if (Array.isArray(storeIds)) {
    if (!storeIds.length) {
      where.push('1 = 0');
    } else {
      params.push(storeIds);
      where.push(`store_id = ANY($${params.length}::int[])`);
    }
  }

  if (store && store.toLowerCase() !== 'all') {
    params.push(store);
    const idx = params.length;
    where.push(`(CAST(store_id AS TEXT) = $${idx} OR LOWER(COALESCE(store_name, '')) = LOWER($${idx}))`);
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    where.push(`(
      COALESCE(name, '') ILIKE $${idx}
      OR COALESCE(mobile_number, '') ILIKE $${idx}
      OR COALESCE(email_address, '') ILIKE $${idx}
      OR COALESCE(customer_code, '') ILIKE $${idx}
      OR COALESCE(customer_type, '') ILIKE $${idx}
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const sql = `
    WITH credit_sources AS (
      SELECT
        COALESCE(c.id::text, 'bill:' || sb.id::text) AS customer_key,
        c.id AS customer_id,
        COALESCE(c.customer_code, '') AS customer_code,
        COALESCE(NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), NULLIF(TRIM(sb.customer_name), ''), 'Walk-in Customer') AS name,
        COALESCE(c.mobile_number, sb.customer_mobile, '') AS mobile_number,
        COALESCE(c.email_address, '') AS email_address,
        COALESCE(c.customer_type, CASE WHEN c.id IS NULL THEN 'BILLED' ELSE 'INDIVIDUAL' END) AS customer_type,
        sb.store_id,
        s.name AS store_name,
        GREATEST(
          COALESCE(sb.balance_amount, 0),
          CASE WHEN LOWER(COALESCE(sb.payment_mode, '')) = 'credit'
            THEN GREATEST(COALESCE(sb.grand_total, 0) - COALESCE(sb.paid_amount, 0), 0)
            ELSE 0
          END
        ) AS amount_due,
        sb.created_at
      FROM sales_bills sb
      LEFT JOIN customers c ON (
        NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL
        AND c.mobile_number = TRIM(sb.customer_mobile)
      ) OR (
        NULLIF(TRIM(sb.customer_name), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))) = LOWER(TRIM(sb.customer_name))
      )
      LEFT JOIN stores s ON s.id = sb.store_id
      WHERE LOWER(COALESCE(sb.status, '')) NOT IN ('void', 'cancelled', 'canceled')
        AND (
          NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL
          OR NULLIF(TRIM(sb.customer_name), '') IS NOT NULL
        )

      UNION ALL

      SELECT
        COALESCE(c.id::text, 'invoice:' || iso.id::text) AS customer_key,
        c.id AS customer_id,
        COALESCE(c.customer_code, '') AS customer_code,
        COALESCE(NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), NULLIF(TRIM(iso.customer_name), ''), 'Invoice Customer') AS name,
        COALESCE(c.mobile_number, iso.customer_mobile, '') AS mobile_number,
        COALESCE(c.email_address, '') AS email_address,
        COALESCE(c.customer_type, CASE WHEN c.id IS NULL THEN 'INVOICE' ELSE 'INDIVIDUAL' END) AS customer_type,
        iso.store_id,
        s.name AS store_name,
        GREATEST(
          COALESCE(iso.gross_bill, 0)
          + COALESCE(iso.additional_charge_value, 0)
          - COALESCE(iso.total_discount, 0)
          - COALESCE(iso.write_off_amount, 0),
          0
        ) AS amount_due,
        iso.created_at
      FROM invoice_sales_orders iso
      LEFT JOIN customers c ON (
        iso.meta->>'customer_id' = c.id::text
        OR iso.booking_id = c.customer_code
        OR iso.booking_id = c.id::text
        OR (
          NULLIF(TRIM(iso.customer_mobile), '') IS NOT NULL
          AND c.mobile_number = TRIM(iso.customer_mobile)
        )
      )
      LEFT JOIN stores s ON s.id = iso.store_id
      WHERE LOWER(COALESCE(iso.status, '')) NOT IN ('paid', 'settled', 'converted', 'void', 'cancelled', 'canceled')
    ),
    filtered AS (
      SELECT * FROM credit_sources
      ${whereSql}
    ),
    grouped AS (
      SELECT
        customer_key,
        MAX(customer_id) AS id,
        MAX(customer_code) AS customer_code,
        MAX(name) AS name,
        MAX(mobile_number) AS mobile_number,
        MAX(email_address) AS email_address,
        MAX(customer_type) AS customer_type,
        STRING_AGG(DISTINCT COALESCE(store_name, 'Store'), ', ' ORDER BY COALESCE(store_name, 'Store')) AS stores,
        SUM(amount_due) AS amount_due,
        MAX(created_at) AS last_credit_at
      FROM filtered
      GROUP BY customer_key
    )
    SELECT *, COUNT(*) OVER()::INT AS total_count
    FROM grouped
    ORDER BY amount_due DESC, last_credit_at DESC NULLS LAST, name ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  return { sql, params };
}

export async function POST(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureStoresSchema(),
      ensureSalesBillingSchema(),
      ensureInvoiceSalesOrdersSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const page = parsePositiveInteger(body.page, 1);
    const pageSize = parsePositiveInteger(body.pageSize, 10);
    const store = normalizeText(body.store);
    const search = normalizeText(body.search);
    let storeIds = null;
    if (store && store.toLowerCase() !== 'all' && /^\d+$/.test(store)) {
      const storeCheck = requireStore(auth.user, Number(store));
      if (storeCheck.error) return storeCheck.error;
    } else {
      const scope = getStoreScope(auth.user);
      if (scope.error) return scope.error;
      storeIds = scope.storeIds;
    }
    const { sql, params } = buildCreditQuery({ store, search, page, pageSize, storeIds });

    const res = await query(sql, params);
    const rows = res.rows.map((r) => ({
      id: r.id,
      customer_code: r.customer_code || '',
      name: r.name,
      mobile_number: r.mobile_number,
      email_address: r.email_address,
      customer_type: r.customer_type,
      stores: r.stores || '',
      amount_due: r.amount_due ? Number(r.amount_due).toFixed(2) : '0.00',
    }));
    const total = res.rows.length ? Number(res.rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-credit POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureStoresSchema(),
      ensureSalesBillingSchema(),
      ensureInvoiceSalesOrdersSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(url.searchParams.get('pageSize'), 10);
    const store = normalizeText(url.searchParams.get('store'));
    const search = normalizeText(url.searchParams.get('search'));
    let storeIds = null;
    if (store && store.toLowerCase() !== 'all' && /^\d+$/.test(store)) {
      const storeCheck = requireStore(auth.user, Number(store));
      if (storeCheck.error) return storeCheck.error;
    } else {
      const scope = getStoreScope(auth.user);
      if (scope.error) return scope.error;
      storeIds = scope.storeIds;
    }
    const { sql, params } = buildCreditQuery({ store, search, page, pageSize, storeIds });
    const res = await query(sql, params);
    const total = res.rows.length ? Number(res.rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: res.rows.map((r) => ({
        id: r.id,
        customer_code: r.customer_code || '',
        name: r.name,
        mobile_number: r.mobile_number,
        email_address: r.email_address,
        customer_type: r.customer_type,
        stores: r.stores || '',
        amount_due: r.amount_due ? Number(r.amount_due).toFixed(2) : '0.00',
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-credit GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
