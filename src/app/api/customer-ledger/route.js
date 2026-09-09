import { successResponse, errorResponse } from '@/lib/api-response';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/api-protection';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureCustomerAdvancePaymentsSchema } from '@/lib/customerAdvancePaymentsSchema';

function parseDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10);
}

function money(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getStoreScope(user, params, alias = 'x') {
  if (user.role === 'super_admin') return '';
  const stores = (user.assigned_stores || []).map(Number).filter(Number.isFinite);
  if (!stores.length) return ' AND 1 = 0';
  params.push(stores);
  return ` AND (${alias}.store_id IS NULL OR ${alias}.store_id = ANY($${params.length}::int[]))`;
}

function mapRow(row) {
  const amount = Number(row.transaction_amount || 0);
  const opening = Number(row.opening_balance || 0);
  const closing = Number(row.closing_balance || 0);
  return {
    storeId: row.store_id || '',
    storeName: row.store_name || '',
    customerId: row.customer_id || '',
    customerName: row.customer_name || 'Walk-in Customer',
    customerAccountId: row.customer_account_id || '',
    date: row.transaction_date,
    transactionId: row.transaction_id,
    posDate: row.pos_date || row.transaction_date,
    transactionType: row.transaction_type,
    openingBalance: money(opening),
    transactionAmount: money(amount),
    closingBalance: money(closing),
    transactionActivity: row.transaction_activity,
    phone: row.phone || '',
    paymentType: row.payment_type || '',
    store: row.store_name || '',
    remarks: row.remarks || '',
    settlementStatus: row.settlement_status || '',
  };
}

export async function POST(request) {
  try {
    await ensureCustomersSchema();
    await ensureSalesBillingSchema();
    await ensureCustomerAdvancePaymentsSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const today = new Date().toISOString().slice(0, 10);
    const dateFrom = parseDate(body.dateFrom || body.from || body.startDate, today);
    const dateTo = parseDate(body.dateTo || body.to || body.endDate, dateFrom);
    const customerId = Number(body.customerId || 0) || null;
    const search = String(body.customer || body.search || '').trim();

    const params = [dateFrom, dateTo];
    const salesStoreScope = getStoreScope(auth.user, params, 'sb');
    const advanceStoreScope = getStoreScope(auth.user, params, 'cap');
    const filters = [];

    if (customerId) {
      params.push(customerId);
      filters.push(`customer_id = $${params.length}`);
    } else if (search) {
      params.push(`%${search.toLowerCase()}%`);
      filters.push(`(LOWER(customer_name) LIKE $${params.length} OR LOWER(phone) LIKE $${params.length})`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const result = await query(
      `WITH ledger_source AS (
         SELECT
           sb.id::text AS source_id,
           COALESCE(c.id, 0)::bigint AS customer_id,
           COALESCE(c.customer_code, CASE WHEN c.id IS NOT NULL THEN 'CUST-' || c.id::text ELSE '' END) AS customer_account_id,
           COALESCE(NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), sb.customer_name, 'Walk-in Customer') AS customer_name,
           COALESCE(c.mobile_number, sb.customer_mobile, '') AS phone,
           sb.store_id,
           s.name AS store_name,
           sb.created_at::date AS transaction_date,
           sb.created_at::date AS pos_date,
           COALESCE(sb.bill_number, 'BILL-' || sb.id::text) AS transaction_id,
           'Sale' AS transaction_type,
           'Sale invoice' AS transaction_activity,
           COALESCE(sb.payment_mode, '') AS payment_type,
           COALESCE(sb.grand_total, 0)::numeric AS transaction_amount,
           CASE WHEN LOWER(COALESCE(sb.payment_mode, '')) = 'credit' THEN 'Unsettled' ELSE 'Settled' END AS settlement_status,
           COALESCE(sb.remarks, '') AS remarks,
           sb.created_at
         FROM sales_bills sb
         LEFT JOIN stores s ON s.id = sb.store_id
         LEFT JOIN customers c
           ON NULLIF(c.mobile_number, '') IS NOT NULL
          AND NULLIF(sb.customer_mobile, '') IS NOT NULL
          AND REGEXP_REPLACE(c.mobile_number, '\\D', '', 'g') = REGEXP_REPLACE(sb.customer_mobile, '\\D', '', 'g')
         WHERE sb.status IN ('paid', 'completed')${salesStoreScope}

         UNION ALL

         SELECT
           cap.id::text AS source_id,
           c.id::bigint AS customer_id,
           COALESCE(c.customer_code, 'CUST-' || c.id::text) AS customer_account_id,
           NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') AS customer_name,
           COALESCE(c.mobile_number, '') AS phone,
           cap.store_id,
           s.name AS store_name,
           cap.payment_date AS transaction_date,
           cap.payment_date AS pos_date,
           COALESCE(cap.reference_id, 'ADV-' || cap.id::text) AS transaction_id,
           'Advance Payment' AS transaction_type,
           'Customer advance received' AS transaction_activity,
           COALESCE(cap.payment_mode, '') AS payment_type,
           -COALESCE(cap.amount, 0)::numeric AS transaction_amount,
           CASE WHEN COALESCE(cap.balance_amount, 0) > 0 THEN 'Open' ELSE 'Adjusted' END AS settlement_status,
           COALESCE(cap.remarks, '') AS remarks,
           cap.created_at
         FROM customer_advance_payments cap
         INNER JOIN customers c ON c.id = cap.customer_id
         LEFT JOIN stores s ON s.id = cap.store_id
         WHERE 1=1${advanceStoreScope}
       ),
       filtered AS (
         SELECT * FROM ledger_source
         ${whereSql}
       ),
       with_balance AS (
         SELECT
           *,
           COALESCE(
             SUM(transaction_amount) OVER (
               PARTITION BY customer_id
               ORDER BY transaction_date, created_at, transaction_id
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
             ),
             0
           ) AS opening_balance,
           SUM(transaction_amount) OVER (
             PARTITION BY customer_id
             ORDER BY transaction_date, created_at, transaction_id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS closing_balance
         FROM filtered
       )
       SELECT *
       FROM with_balance
       WHERE transaction_date BETWEEN $1::date AND $2::date
       ORDER BY transaction_date DESC, created_at DESC, transaction_id DESC
       LIMIT 500`,
      params
    );

    const rows = result.rows.map(mapRow);
    return successResponse({
      rows,
      summary: {
        totalTransactions: rows.length,
        totalDebit: money(result.rows.reduce((sum, row) => sum + Math.max(0, Number(row.transaction_amount || 0)), 0)),
        totalCredit: money(Math.abs(result.rows.reduce((sum, row) => sum + Math.min(0, Number(row.transaction_amount || 0)), 0))),
      },
    });
  } catch (err) {
    console.error('[customer-ledger POST]', err);
    return errorResponse(err.message || 'Failed to fetch customer ledger');
  }
}
