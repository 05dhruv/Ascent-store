import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { getAssignedStoreIds, requireAuth, requirePermission } from '@/lib/api-protection';

function parsePositiveInteger(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.trunc(num);
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : '';
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function mapSettlementRow(row, index, page, pageSize) {
  const amountPaid = Number(row.amount_paid || 0);

  return {
    sNo: (page - 1) * pageSize + index + 1,
    creditTransactionId: row.credit_transaction_id || `CR-${String(row.id).padStart(6, '0')}`,
    customerId: row.customer_id || `C-${row.customer_pk || 'NA'}`,
    customerName: row.customer_name || '—',
    orderId: row.order_id || '—',
    redeemedStoreId: row.redeemed_store_id || '—',
    redeemedStoreName: row.redeemed_store_name || '—',
    redeemOrderId: row.redeem_order_id || '—',
    phone: row.phone || '—',
    email: row.email || '—',
    transactionType: row.transaction_type || 'Credit Settlement',
    amountPaid,
    paymentType: row.payment_type || '—',
    referenceId: row.reference_id || '—',
    bankRrn: row.bank_rrn || '—',
    approvalCode: row.approval_code || '—',
    acquiringBankCode: row.acquiring_bank_code || '—',
    paymentDate: row.payment_date || null,
    paymentTime: row.payment_time || null,
    user: row.user_name || '—',
    transactionId: row.transaction_id || row.credit_transaction_id || `TRX-${String(row.id).padStart(6, '0')}`,
  };
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureInvoiceSalesOrdersSchema(),
      ensureStockInSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);

    const page = parsePositiveInteger(searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(searchParams.get('pageSize'), 10);
    const search = normalizeText(searchParams.get('search'));
    const store = normalizeText(searchParams.get('store'));
    const dateFrom = normalizeDate(searchParams.get('dateFrom'));
    const dateTo = normalizeDate(searchParams.get('dateTo'));

    const whereClauses = ["COALESCE(iso.invoice_id, '') <> ''"];
    const params = [];

    if (dateFrom) {
      params.push(dateFrom);
      whereClauses.push(`COALESCE(iso.invoice_date, iso.updated_at::date, iso.created_at::date) >= $${params.length}::date`);
    }

    if (dateTo) {
      params.push(dateTo);
      whereClauses.push(`COALESCE(iso.invoice_date, iso.updated_at::date, iso.created_at::date) <= $${params.length}::date`);
    }

    if (store && store.toLowerCase() !== 'all') {
      params.push(store);
      whereClauses.push(`(CAST(iso.store_id AS TEXT) = $${params.length} OR LOWER(COALESCE(s.name, '')) = LOWER($${params.length}))`);
    }

    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) {
        return NextResponse.json({ rows: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
      }
      params.push(assignedStores);
      whereClauses.push(`iso.store_id = ANY($${params.length}::int[])`);
    }

    if (search) {
      params.push(`%${search}%`);
      const searchParamIndex = params.length;
      whereClauses.push(`(
        COALESCE(iso.transaction_id, '') ILIKE $${searchParamIndex}
        OR COALESCE(iso.invoice_id, '') ILIKE $${searchParamIndex}
        OR COALESCE(iso.sales_order_id, '') ILIKE $${searchParamIndex}
        OR COALESCE(c.customer_code, '') ILIKE $${searchParamIndex}
        OR COALESCE(c.first_name, '') ILIKE $${searchParamIndex}
        OR COALESCE(c.last_name, '') ILIKE $${searchParamIndex}
        OR COALESCE(c.mobile_number, '') ILIKE $${searchParamIndex}
        OR COALESCE(c.email_address, '') ILIKE $${searchParamIndex}
        OR COALESCE(s.name, '') ILIKE $${searchParamIndex}
        OR COALESCE(iso.meta->>'reference_id', '') ILIKE $${searchParamIndex}
        OR COALESCE(iso.meta->>'bank_rrn', '') ILIKE $${searchParamIndex}
      )`);
    }

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const res = await query(
      `
        SELECT
          iso.id,
          iso.transaction_id,
          COALESCE(iso.transaction_id, iso.invoice_id, 'CR-' || iso.id::text) AS credit_transaction_id,
          c.id AS customer_pk,
          COALESCE(c.customer_code, c.id::text) AS customer_id,
          TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name,
          iso.sales_order_id AS order_id,
          CAST(iso.store_id AS TEXT) AS redeemed_store_id,
          s.name AS redeemed_store_name,
          iso.invoice_id AS redeem_order_id,
          c.mobile_number AS phone,
          c.email_address AS email,
          COALESCE(iso.meta->>'transaction_type', iso.channel, iso.status) AS transaction_type,
          GREATEST(
            COALESCE(iso.gross_bill, 0)
            + COALESCE(iso.additional_charge_value, 0)
            - COALESCE(iso.total_discount, 0)
            - COALESCE(iso.write_off_amount, 0),
            0
          ) AS amount_paid,
          COALESCE(iso.meta->>'payment_type', iso.channel) AS payment_type,
          iso.meta->>'reference_id' AS reference_id,
          iso.meta->>'bank_rrn' AS bank_rrn,
          iso.meta->>'approval_code' AS approval_code,
          iso.meta->>'acquiring_bank_code' AS acquiring_bank_code,
          COALESCE(iso.invoice_date, iso.updated_at::date, iso.created_at::date) AS payment_date,
          TO_CHAR(COALESCE(iso.updated_at, iso.created_at), 'HH24:MI:SS') AS payment_time,
          COALESCE(iso.billing_username, iso.created_by, 'System') AS user_name,
          COUNT(*) OVER()::INT AS total_count
        FROM invoice_sales_orders iso
        LEFT JOIN customers c ON (
          iso.booking_id = c.customer_code
          OR iso.booking_id = c.id::text
          OR (iso.meta->>'customer_id') = c.id::text
        )
        LEFT JOIN stores s ON s.id = iso.store_id
        ${whereSql}
        ORDER BY COALESCE(iso.invoice_date, iso.updated_at::date, iso.created_at::date) DESC, iso.id DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      params
    );

    const rows = res.rows || [];
    const total = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: rows.map((row, index) => mapSettlementRow(row, index, page, pageSize)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-credit-settlement GET]', err.message);
    return NextResponse.json(
      {
        rows: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 1,
        },
        error: err.message || 'Failed to fetch credit settlement report',
      },
      { status: 500 }
    );
  }
}
