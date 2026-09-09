import { requireAuth, requirePermission } from '@/lib/api-protection';
import { successResponse, errorResponse } from '@/lib/api-response';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return toNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function addStoreScope(user, params, alias = 'sb') {
  if (user.role === 'super_admin') return '';
  const assignedStores = (user.assigned_stores || []).map(Number).filter(Number.isFinite);
  if (!assignedStores.length) return ' AND 1 = 0';
  params.push(assignedStores);
  return ` AND ${alias}.store_id = ANY($${params.length}::int[])`;
}

export async function GET(request) {
  try {
    await ensureCustomersSchema();
    await ensureSalesBillingSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const salesParams = [];
    const salesStoreScope = addStoreScope(auth.user, salesParams);
    const salesResult = await query(
      `SELECT COALESCE(SUM(sb.grand_total), 0) AS total_sales
       FROM sales_bills sb
       WHERE sb.status IN ('paid', 'completed')${salesStoreScope}`,
      salesParams
    );

    const statsParams = [];
    const statsStoreScope = addStoreScope(auth.user, statsParams);
    const registeredStatsStoreScope = addStoreScope(auth.user, statsParams, 'c');
    const statsResult = await query(
      `WITH registered_customers AS (
         SELECT
           CASE
             WHEN NULLIF(TRIM(mobile_number), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(mobile_number))
             WHEN NULLIF(TRIM(customer_code), '') IS NOT NULL THEN 'c:' || LOWER(TRIM(customer_code))
             ELSE 'id:' || id::text
           END AS customer_key,
           status
         FROM customers c
         WHERE 1 = 1${registeredStatsStoreScope}
       ),
       billed_customers AS (
         SELECT DISTINCT
           CASE
             WHEN NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(sb.customer_mobile))
             WHEN NULLIF(TRIM(sb.customer_name), '') IS NOT NULL THEN 'n:' || LOWER(TRIM(sb.customer_name))
             ELSE 'bill:' || sb.id::text
           END AS customer_key
         FROM sales_bills sb
         WHERE sb.status IN ('paid', 'completed')${statsStoreScope}
           AND (
             NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL
             OR NULLIF(TRIM(sb.customer_name), '') IS NOT NULL
           )
       ),
       all_customers AS (
         SELECT customer_key FROM registered_customers
         UNION
         SELECT customer_key FROM billed_customers
       )
       SELECT
         (SELECT COUNT(*)::int FROM all_customers) AS total_customers,
         (
           (SELECT COUNT(*)::int FROM registered_customers WHERE LOWER(COALESCE(status, '')) = 'active')
           +
           (SELECT COUNT(*)::int FROM billed_customers b WHERE NOT EXISTS (
             SELECT 1 FROM registered_customers r WHERE r.customer_key = b.customer_key
           ))
         ) AS active_customers,
         (SELECT COUNT(*)::int FROM registered_customers WHERE LOWER(COALESCE(status, '')) <> 'active') AS inactive_customers`,
      statsParams
    );

    const newParams = [];
    const newStoreScope = addStoreScope(auth.user, newParams);
    const registeredNewStoreScope = addStoreScope(auth.user, newParams, 'c');
    const newCustomersResult = await query(
      `WITH first_seen AS (
         SELECT
           CASE
             WHEN NULLIF(TRIM(mobile_number), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(mobile_number))
             WHEN NULLIF(TRIM(customer_code), '') IS NOT NULL THEN 'c:' || LOWER(TRIM(customer_code))
             ELSE 'id:' || id::text
           END AS customer_key,
           MIN(created_at::date) AS first_seen_date
         FROM customers c
         WHERE 1 = 1${registeredNewStoreScope}
         GROUP BY 1
         UNION ALL
         SELECT
           CASE
             WHEN NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(sb.customer_mobile))
             WHEN NULLIF(TRIM(sb.customer_name), '') IS NOT NULL THEN 'n:' || LOWER(TRIM(sb.customer_name))
             ELSE 'bill:' || sb.id::text
           END AS customer_key,
           MIN(sb.created_at::date) AS first_seen_date
         FROM sales_bills sb
         WHERE sb.status IN ('paid', 'completed')${newStoreScope}
           AND (
             NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL
             OR NULLIF(TRIM(sb.customer_name), '') IS NOT NULL
           )
         GROUP BY 1
       ),
       deduped AS (
         SELECT customer_key, MIN(first_seen_date) AS first_seen_date
         FROM first_seen
         GROUP BY customer_key
       )
       SELECT
         day::date AS date,
         TO_CHAR(day::date, 'DD Mon') AS label,
         COUNT(d.customer_key)::int AS value
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') day
       LEFT JOIN deduped d ON d.first_seen_date = day::date
       GROUP BY day
       ORDER BY day`,
      newParams
    );

    const activeParams = [];
    const activeStoreScope = addStoreScope(auth.user, activeParams);
    const activeCustomersResult = await query(
      `SELECT
         day::date AS date,
         TO_CHAR(day::date, 'DD Mon') AS label,
         COUNT(DISTINCT CASE
           WHEN NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(sb.customer_mobile))
           WHEN NULLIF(TRIM(sb.customer_name), '') IS NOT NULL THEN 'n:' || LOWER(TRIM(sb.customer_name))
           ELSE 'bill:' || sb.id::text
         END)::int AS value
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') day
       LEFT JOIN sales_bills sb
         ON sb.created_at::date = day::date
        AND sb.status IN ('paid', 'completed')${activeStoreScope}
       GROUP BY day
       ORDER BY day`,
      activeParams
    );

    const topParams = [];
    const topStoreScope = addStoreScope(auth.user, topParams);
    const topCustomersResult = await query(
      `WITH billed AS (
         SELECT
           CASE
             WHEN NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(sb.customer_mobile))
             WHEN NULLIF(TRIM(sb.customer_name), '') IS NOT NULL THEN 'n:' || LOWER(TRIM(sb.customer_name))
             ELSE 'bill:' || sb.id::text
           END AS customer_key,
           NULLIF(TRIM(sb.customer_name), '') AS bill_name,
           NULLIF(TRIM(sb.customer_mobile), '') AS bill_mobile,
           sb.id,
           sb.grand_total
         FROM sales_bills sb
         WHERE sb.status IN ('paid', 'completed')${topStoreScope}
           AND (
             NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL
             OR NULLIF(TRIM(sb.customer_name), '') IS NOT NULL
           )
       ),
       rolled AS (
         SELECT
           customer_key,
           MAX(bill_name) AS bill_name,
           MAX(bill_mobile) AS bill_mobile,
           COUNT(id)::int AS orders,
           COALESCE(SUM(grand_total), 0) AS sales
         FROM billed
         GROUP BY customer_key
       )
       SELECT
         COALESCE(c.id::text, r.customer_key) AS id,
         COALESCE(NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), r.bill_name, 'Walk-in Customer') AS name,
         COALESCE(c.mobile_number, r.bill_mobile, '') AS mobile_number,
         COALESCE(c.status, 'Billed') AS status,
         r.orders,
         r.sales
       FROM rolled r
       LEFT JOIN customers c
         ON (
           NULLIF(c.mobile_number, '') IS NOT NULL
           AND r.customer_key = 'm:' || LOWER(TRIM(c.mobile_number))
         )
         OR (
           NULLIF(c.customer_code, '') IS NOT NULL
           AND r.customer_key = 'c:' || LOWER(TRIM(c.customer_code))
         )
       ORDER BY r.sales DESC, r.orders DESC, name ASC
       LIMIT 5`,
      topParams
    );

    const stats = statsResult.rows[0] || {};
    const totalSales = toNumber(salesResult.rows[0]?.total_sales);

    return successResponse({
      stats: {
        totalCustomers: Number(stats.total_customers || 0),
        totalSales,
        totalSalesLabel: `\u20b9 ${money(totalSales)}`,
        activeCustomers: Number(stats.active_customers || 0),
        inactiveCustomers: Number(stats.inactive_customers || 0),
      },
      charts: {
        newCustomers: newCustomersResult.rows.map((row) => ({
          date: row.date,
          time: row.label,
          value: Number(row.value || 0),
        })),
        activeCustomers: activeCustomersResult.rows.map((row) => ({
          date: row.date,
          time: row.label,
          value: Number(row.value || 0),
        })),
      },
      topCustomers: topCustomersResult.rows.map((row) => ({
        id: row.id,
        name: row.name || 'Unnamed Customer',
        mobileNumber: row.mobile_number || '',
        status: row.status || '',
        orders: Number(row.orders || 0),
        sales: toNumber(row.sales),
        salesLabel: `\u20b9 ${money(row.sales)}`,
      })),
    });
  } catch (err) {
    console.error('[customer dashboard GET]', err);
    return errorResponse('Unable to load customer dashboard');
  }
}
