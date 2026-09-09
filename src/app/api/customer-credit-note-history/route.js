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

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function mapHistoryRow(row, index, page, pageSize) {
  const amount = Number(row.amount || 0);
  const redeemAmount = Number(row.redeem_amount || amount || 0);

  return {
    sNo: (page - 1) * pageSize + index + 1,
    creditNoteId: row.credit_note_id || `CN-${String(row.id).padStart(6, '0')}`,
    storeId: row.store_id || '—',
    customerId: row.customer_id || '—',
    customerName: row.customer_name || '—',
    customerPhone: row.customer_phone || '—',
    amount,
    issuedOnOrderId: row.issued_on_order_id || '—',
    issueDate: row.issue_date || '—',
    issueTime: row.issue_time || '—',
    redeemedOnOrderId: row.redeemed_on_order_id || '—',
    redeemedStoreId: row.redeemed_store_id || '—',
    redeemedStoreName: row.redeemed_store_name || '—',
    redeemDate: row.redeem_date || '—',
    redeemTime: row.redeem_time || '—',
    redeemAmount,
    amountCredited: Number(row.amount_credited || amount || 0),
    taxId: row.tax_id || '—',
    taxName: row.tax_name || '—',
    taxPercentage: row.tax_percentage || '—',
    taxValue: Number(row.tax_value || 0),
    totalTaxValue: Number(row.total_tax_value || row.tax_value || 0),
    tdsId: row.tds_id || '—',
    tdsName: row.tds_name || '—',
    tdsPercentage: row.tds_percentage || '—',
    tdsValue: Number(row.tds_value || 0),
    tcsId: row.tcs_id || '—',
    tcsName: row.tcs_name || '—',
    tcsPercentage: row.tcs_percentage || '—',
    tcsValue: Number(row.tcs_value || 0),
    refundAmount: Number(row.refund_amount || row.write_off_amount || 0),
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
    const dateFrom = normalizeDate(searchParams.get('dateFrom'));
    const dateTo = normalizeDate(searchParams.get('dateTo'));
    const store = normalizeText(searchParams.get('store'));
    const customer = normalizeText(searchParams.get('customer'));
    const search = normalizeText(searchParams.get('search'));

    const whereClauses = ["COALESCE(iso.invoice_id, iso.transaction_id, '') <> ''"];
    const params = [];

    if (dateFrom) {
      params.push(dateFrom);
      whereClauses.push(`COALESCE(iso.invoice_date, iso.booking_date, iso.auto_invoice_date, iso.created_at::date) >= $${params.length}::date`);
    }

    if (dateTo) {
      params.push(dateTo);
      whereClauses.push(`COALESCE(iso.invoice_date, iso.booking_date, iso.auto_invoice_date, iso.created_at::date) <= $${params.length}::date`);
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

    if (customer) {
      params.push(`%${customer}%`);
      const customerParam = params.length;
      whereClauses.push(`(
        COALESCE(c.customer_code, '') ILIKE $${customerParam}
        OR COALESCE(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') ILIKE $${customerParam}
        OR COALESCE(c.mobile_number, '') ILIKE $${customerParam}
        OR COALESCE(c.email_address, '') ILIKE $${customerParam}
      )`);
    }

    if (search) {
      params.push(`%${search}%`);
      const searchParam = params.length;
      whereClauses.push(`(
        COALESCE(iso.transaction_id, '') ILIKE $${searchParam}
        OR COALESCE(iso.invoice_id, '') ILIKE $${searchParam}
        OR COALESCE(iso.sales_order_id, '') ILIKE $${searchParam}
        OR COALESCE(iso.auto_invoice_id, '') ILIKE $${searchParam}
        OR COALESCE(c.customer_code, '') ILIKE $${searchParam}
        OR COALESCE(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') ILIKE $${searchParam}
        OR COALESCE(c.mobile_number, '') ILIKE $${searchParam}
        OR COALESCE(s.name, '') ILIKE $${searchParam}
        OR COALESCE(iso.meta->>'tax_id', '') ILIKE $${searchParam}
        OR COALESCE(iso.meta->>'tax_name', '') ILIKE $${searchParam}
        OR COALESCE(iso.meta->>'tds_id', '') ILIKE $${searchParam}
        OR COALESCE(iso.meta->>'tcs_id', '') ILIKE $${searchParam}
      )`);
    }

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;
    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const result = await query(
      `
        SELECT
          iso.id,
          COALESCE(iso.transaction_id, iso.invoice_id, 'CN-' || iso.id::text) AS credit_note_id,
          CAST(iso.store_id AS TEXT) AS store_id,
          COALESCE(c.customer_code, c.id::text) AS customer_id,
          TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name,
          c.mobile_number AS customer_phone,
          GREATEST(
            COALESCE(iso.gross_bill, 0)
            + COALESCE(iso.additional_charge_value, 0)
            - COALESCE(iso.total_discount, 0)
            - COALESCE(iso.write_off_amount, 0),
            0
          ) AS amount,
          iso.sales_order_id AS issued_on_order_id,
          COALESCE(iso.invoice_date, iso.booking_date, iso.created_at::date) AS issue_date,
          TO_CHAR(COALESCE(iso.updated_at, iso.created_at), 'HH24:MI:SS') AS issue_time,
          COALESCE(NULLIF(iso.auto_invoice_id, ''), iso.invoice_id) AS redeemed_on_order_id,
          COALESCE(NULLIF(iso.meta->>'redeemed_store_id', ''), CAST(iso.store_id AS TEXT)) AS redeemed_store_id,
          COALESCE(NULLIF(iso.meta->>'redeemed_store_name', ''), s.name) AS redeemed_store_name,
          COALESCE(iso.auto_invoice_date, iso.converted_at::date, iso.invoice_date, iso.created_at::date) AS redeem_date,
          TO_CHAR(COALESCE(iso.converted_at, iso.updated_at, iso.created_at), 'HH24:MI:SS') AS redeem_time,
          COALESCE(iso.write_off_amount, 0) AS redeem_amount,
          GREATEST(
            COALESCE(iso.gross_bill, 0)
            + COALESCE(iso.additional_charge_value, 0)
            - COALESCE(iso.total_discount, 0)
            - COALESCE(iso.write_off_amount, 0),
            0
          ) AS amount_credited,
          iso.meta->>'tax_id' AS tax_id,
          iso.meta->>'tax_name' AS tax_name,
          iso.meta->>'tax_percentage' AS tax_percentage,
          iso.meta->>'tax_value' AS tax_value,
          iso.meta->>'total_tax_value' AS total_tax_value,
          iso.meta->>'tds_id' AS tds_id,
          iso.meta->>'tds_name' AS tds_name,
          iso.meta->>'tds_percentage' AS tds_percentage,
          iso.tds_value AS tds_value,
          iso.meta->>'tcs_id' AS tcs_id,
          iso.meta->>'tcs_name' AS tcs_name,
          iso.meta->>'tcs_percentage' AS tcs_percentage,
          iso.tcs_value AS tcs_value,
          iso.meta->>'refund_amount' AS refund_amount,
          COUNT(*) OVER()::INT AS total_count
        FROM invoice_sales_orders iso
        LEFT JOIN customers c ON (
          iso.booking_id = c.customer_code
          OR iso.booking_id = c.id::text
          OR (iso.meta->>'customer_id') = c.id::text
        )
        LEFT JOIN stores s ON s.id = iso.store_id
        ${whereSql}
        ORDER BY COALESCE(iso.invoice_date, iso.booking_date, iso.auto_invoice_date, iso.created_at::date) DESC, iso.id DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      params
    );

    const rows = result.rows || [];
    const total = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: rows.map((row, index) => mapHistoryRow(row, index, page, pageSize)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-credit-note-history GET]', err.message);
    return NextResponse.json(
      {
        rows: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 1,
        },
        error: err.message || 'Failed to fetch credit note history',
      },
      { status: 500 }
    );
  }
}
