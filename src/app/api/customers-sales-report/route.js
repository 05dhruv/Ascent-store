import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { getAssignedStoreIds, requireAuth, requirePermission } from '@/lib/api-protection';

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.trunc(number);
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : '';
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function mapCustomerSalesRow(row, index, page, pageSize) {
  return {
    sNo: (page - 1) * pageSize + index + 1,
    customerId: row.customer_id || '—',
    name: row.customer_name || '—',
    mobile: row.mobile || '—',
    email: row.email || '—',
    orders: Number(row.orders || 0),
    sales: Number(row.sales || 0),
    pointsEarned: Number(row.points_earned || 0),
    pointsBurned: Number(row.points_burned || 0),
    customerSince: row.customer_since || null,
  };
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureInvoiceSalesOrdersSchema(),
      ensureSalesBillingSchema(),
      ensureStockInSchema(),
    ]);

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(searchParams.get('pageSize'), 10);
    const dateFrom = normalizeDate(searchParams.get('dateFrom'));
    const dateTo = normalizeDate(searchParams.get('dateTo'));
    const store = normalizeText(searchParams.get('store'));
    const search = normalizeText(searchParams.get('search'));

    const params = [];
    const orderFilters = [];

    if (dateFrom) {
      params.push(dateFrom);
      orderFilters.push(`order_date >= $${params.length}::date`);
    }

    if (dateTo) {
      params.push(dateTo);
      orderFilters.push(`order_date <= $${params.length}::date`);
    }

    if (store && store.toLowerCase() !== 'all') {
      params.push(store);
      orderFilters.push(`(CAST(store_id AS TEXT) = $${params.length} OR LOWER(COALESCE(store_name, '')) = LOWER($${params.length}))`);
    }

    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) {
        return NextResponse.json({ rows: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
      }
      params.push(assignedStores);
      orderFilters.push(`store_id = ANY($${params.length}::int[])`);
    }

    if (search) {
      params.push(`%${search}%`);
    }

    const summaryFilters = [...orderFilters];
    if (search) {
      summaryFilters.push(`(
        COALESCE(customer_id, '') ILIKE $${params.length}
        OR COALESCE(customer_name, '') ILIKE $${params.length}
        OR COALESCE(mobile, '') ILIKE $${params.length}
        OR COALESCE(email, '') ILIKE $${params.length}
      )`);
    }

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;
    const summaryWhereSql = summaryFilters.length ? `WHERE ${summaryFilters.join(' AND ')}` : '';

    const result = await query(
      `
        WITH invoice_orders AS (
          SELECT
            COALESCE(c.customer_code, c.id::text, NULLIF(iso.customer_mobile, ''), NULLIF(iso.customer_name, ''), 'invoice:' || iso.id::text) AS customer_id,
            COALESCE(
              NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''),
              NULLIF(TRIM(iso.customer_name), ''),
              'Invoice Customer'
            ) AS customer_name,
            COALESCE(c.mobile_number, iso.customer_mobile, '') AS mobile,
            COALESCE(c.email_address, '') AS email,
            iso.store_id,
            s.name AS store_name,
            COALESCE(iso.invoice_date, iso.booking_date, iso.auto_invoice_date, iso.created_at::date) AS order_date,
            COALESCE(iso.gross_bill, 0)
              + COALESCE(iso.additional_charge_value, 0)
              - COALESCE(iso.total_discount, 0)
              - COALESCE(iso.write_off_amount, 0) AS sales_amount,
            COALESCE(
              NULLIF(iso.meta->>'loyalty_earned', '')::NUMERIC,
              NULLIF(iso.meta->>'earned_points', '')::NUMERIC,
              NULLIF(iso.meta->>'points_earned', '')::NUMERIC,
              0
            ) AS loyalty_earned,
            COALESCE(
              NULLIF(iso.meta->>'loyalty_redeemed', '')::NUMERIC,
              NULLIF(iso.meta->>'points_redeemed', '')::NUMERIC,
              NULLIF(iso.meta->>'redeemed_points', '')::NUMERIC,
              0
            ) AS loyalty_redeemed
          FROM invoice_sales_orders iso
          LEFT JOIN stores s ON s.id = iso.store_id
          LEFT JOIN customers c ON (
            iso.booking_id = c.customer_code
            OR iso.booking_id = c.id::TEXT
            OR (iso.meta->>'customer_id') = c.id::TEXT
            OR (
              NULLIF(TRIM(iso.customer_mobile), '') IS NOT NULL
              AND c.mobile_number = TRIM(iso.customer_mobile)
            )
          )
          WHERE COALESCE(NULLIF(iso.invoice_id, ''), '') <> ''
        ),
        bill_orders AS (
          SELECT
            COALESCE(c.customer_code, c.id::text, NULLIF(sb.customer_mobile, ''), NULLIF(sb.customer_name, ''), 'bill:' || sb.id::text) AS customer_id,
            COALESCE(
              NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''),
              NULLIF(TRIM(sb.customer_name), ''),
              'Walk-in Customer'
            ) AS customer_name,
            COALESCE(c.mobile_number, sb.customer_mobile, '') AS mobile,
            COALESCE(c.email_address, '') AS email,
            sb.store_id,
            s.name AS store_name,
            sb.created_at::date AS order_date,
            COALESCE(sb.grand_total, 0) AS sales_amount,
            0::numeric AS loyalty_earned,
            0::numeric AS loyalty_redeemed
          FROM sales_bills sb
          LEFT JOIN stores s ON s.id = sb.store_id
          LEFT JOIN customers c ON (
            NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL
            AND c.mobile_number = TRIM(sb.customer_mobile)
          ) OR (
            NULLIF(TRIM(sb.customer_name), '') IS NOT NULL
            AND LOWER(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))) = LOWER(TRIM(sb.customer_name))
          )
          WHERE sb.status IN ('paid', 'completed')
            AND (
              NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL
              OR NULLIF(TRIM(sb.customer_name), '') IS NOT NULL
            )
        ),
        filtered_orders AS (
          SELECT * FROM invoice_orders
          UNION ALL
          SELECT * FROM bill_orders
        ),
        customer_summary AS (
          SELECT
            customer_id,
            MAX(customer_name) AS customer_name,
            MAX(mobile) AS mobile,
            MAX(email) AS email,
            COUNT(*)::INT AS orders,
            COALESCE(SUM(sales_amount), 0) AS sales,
            COALESCE(SUM(loyalty_earned), 0) AS points_earned,
            COALESCE(SUM(loyalty_redeemed), 0) AS points_burned,
            MIN(order_date) AS customer_since
          FROM filtered_orders
          ${summaryWhereSql}
          GROUP BY customer_id
        )
        SELECT *, COUNT(*) OVER()::INT AS total_count
        FROM customer_summary
        ORDER BY sales DESC, customer_name ASC, customer_id ASC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      params
    );

    const rows = result.rows || [];
    const total = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: rows.map((row, index) => mapCustomerSalesRow(row, index, page, pageSize)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customers-sales-report GET]', err.message);
    return NextResponse.json(
      {
        rows: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 1,
        },
        error: err.message || 'Failed to fetch customers sales report',
      },
      { status: 500 }
    );
  }
}
