import { getAssignedStoreIds, requireAuth } from '@/lib/api-protection';
import { successResponse, errorResponse } from '@/lib/api-response';
import { query } from '@/lib/db';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { ensureVendorInvoicesSchema } from '@/lib/vendorInvoicesSchema';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { ensureVendorsSchema } from '@/lib/vendorsSchema';
import { formatIndianDate } from '@/lib/dateUtils';
import { ensureHotPathSchemas, schemasReady } from '@/lib/schemaGuard';

const DASHBOARD_CACHE_TTL_MS = 45_000;
const g = globalThis;
if (!g._dashboardStatsCache) g._dashboardStatsCache = new Map();

/**
 * GET /api/dashboard/stats
 */
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const warm = await ensureHotPathSchemas([
      ensureCustomersSchema,
      ensureSalesBillingSchema,
      ensureInventoryBatchSchema,
      ensureVendorsSchema,
      ensurePurchaseOrderSchema,
      ensureStockInSchema,
      ensureVendorInvoicesSchema,
    ]);
    if (!warm.ready && !schemasReady()) {
      return errorResponse(warm.message || 'Schema warming', warm.status || 503);
    }

    const { user } = auth;
    const assignedStores = user.role === 'super_admin' ? null : getAssignedStoreIds(user);
    const hasStoreScope = Array.isArray(assignedStores);
    const storeIds = hasStoreScope ? assignedStores : [];
    const cacheKey = `${user.role}:${hasStoreScope ? storeIds.join(',') : 'all'}`;
    const cached = g._dashboardStatsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return successResponse(cached.payload);
    }

    const scopedCondition = (alias, params) => {
      if (!hasStoreScope) return '';
      if (!storeIds.length) return ' AND 1 = 0';
      params.push(storeIds);
      return ` AND ${alias}.store_id = ANY($${params.length}::int[])`;
    };

    const scopedWhere = (alias, params, column = 'store_id') => {
      if (!hasStoreScope) return '';
      if (!storeIds.length) return ' WHERE 1 = 0';
      params.push(storeIds);
      return ` WHERE ${alias}.${column} = ANY($${params.length}::int[])`;
    };

    const safeQuery = async (label, fn) => {
      try {
        return await fn();
      } catch (err) {
        console.error(`[DASHBOARD] ${label}:`, err.message);
        return null;
      }
    };

    const [
      productCount,
      customerCount,
      firstSale,
      store,
      lowStockCount,
      vendorPayable,
      purchaseTotal,
      salesMetrics,
    ] = await Promise.all([
      safeQuery('products', async () => {
        const params = [];
        const storeScope = scopedWhere('ps', params);
        const productsResult = await query(
          `SELECT COUNT(DISTINCT p.id)::int as count
           FROM products p
           ${hasStoreScope ? 'JOIN product_saleability ps ON ps.product_id = p.id AND ps.is_active = TRUE' : ''}
           ${storeScope || 'WHERE COALESCE(p.is_active, TRUE) = TRUE'}
           ${storeScope ? 'AND COALESCE(p.is_active, TRUE) = TRUE' : ''}`,
          params,
        );
        return productsResult.rows[0]?.count || 0;
      }),
      safeQuery('customers', async () => {
        const params = [];
        const customerScope = scopedCondition('c', params);
        const billScope = scopedCondition('sb', params);
        const customersResult = await query(
          `WITH registered_customers AS (
             SELECT
               CASE
                 WHEN NULLIF(TRIM(mobile_number), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(mobile_number))
                 WHEN NULLIF(TRIM(customer_code), '') IS NOT NULL THEN 'c:' || LOWER(TRIM(customer_code))
                 ELSE 'id:' || id::text
               END AS customer_key
             FROM customers c
             WHERE 1 = 1${customerScope}
           ),
           billed_customers AS (
             SELECT DISTINCT
               CASE
                 WHEN NULLIF(TRIM(customer_mobile), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(customer_mobile))
                 WHEN NULLIF(TRIM(customer_name), '') IS NOT NULL THEN 'n:' || LOWER(TRIM(customer_name))
                 ELSE 'bill:' || id::text
               END AS customer_key
             FROM sales_bills sb
             WHERE sb.status IN ('paid', 'completed')${billScope}
               AND (
                 NULLIF(TRIM(customer_mobile), '') IS NOT NULL
                 OR NULLIF(TRIM(customer_name), '') IS NOT NULL
               )
           )
           SELECT COUNT(*)::int as count
           FROM (
             SELECT customer_key FROM registered_customers
             UNION
             SELECT customer_key FROM billed_customers
           ) all_customers`,
          params,
        );
        return customersResult.rows[0]?.count || 0;
      }),
      safeQuery('firstSale', async () => {
        const params = [];
        const storeScope = scopedCondition('sb', params);
        const firstSaleResult = await query(
          `SELECT id, bill_number as sale_number, grand_total as total_amount, created_at
           FROM sales_bills sb
           WHERE sb.status IN ('paid', 'completed')${storeScope}
           ORDER BY created_at ASC
           LIMIT 1`,
          params,
        );
        return firstSaleResult.rows[0] || null;
      }),
      safeQuery('store', async () => {
        const params = [];
        const storeScope = scopedWhere('s', params, 'id');
        const storesResult = await query(
          `SELECT id, name FROM stores s${storeScope} ORDER BY id ASC LIMIT 1`,
          params,
        );
        return storesResult.rows[0] || null;
      }),
      safeQuery('lowStock', async () => {
        const params = [];
        const storeScope = scopedCondition('ps', params);
        const lowStockResult = await query(
          `SELECT COUNT(*)::int as count
           FROM product_saleability ps
           JOIN products p ON p.id = ps.product_id AND COALESCE(p.is_active, TRUE) = TRUE
           LEFT JOIN (
             SELECT product_id, store_id, SUM(available_qty) AS qty
             FROM inventory_batches
             WHERE status = 'active'
             GROUP BY product_id, store_id
           ) ib ON ib.product_id = ps.product_id AND ib.store_id = ps.store_id
           WHERE ps.is_active = TRUE${storeScope}
             AND COALESCE(ib.qty, 0) <= COALESCE(NULLIF(ps.low_stock_value, 0), 10)`,
          params,
        );
        return lowStockResult.rows[0]?.count || 0;
      }),
      safeQuery('vendorPayable', async () => {
        const payableParams = [];
        let payableScope = '';
        if (hasStoreScope) {
          if (!storeIds.length) {
            payableScope = ' AND 1 = 0';
          } else {
            payableParams.push(storeIds);
            payableScope = ` AND (po.destination_id = ANY($1::int[]) OR si.destination_id = ANY($1::int[]))`;
          }
        }
        const payableResult = await query(
          `SELECT COUNT(*)::int AS bills,
                  COALESCE(SUM(GREATEST(COALESCE(vi.total_amount, 0) - COALESCE(vi.amount_paid, 0), 0)), 0)::numeric AS amount
           FROM vendor_invoices vi
           LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
           LEFT JOIN stock_in si ON si.id = vi.stock_in_id
           WHERE LOWER(COALESCE(vi.status, 'pending')) IN ('pending', 'partial')${payableScope}`,
          payableParams,
        );
        return {
          amount: Number(payableResult.rows[0]?.amount || 0),
          bills: Number(payableResult.rows[0]?.bills || 0),
        };
      }),
      safeQuery('purchaseTotal', async () => {
        const purchaseParams = [];
        let purchaseScope = '';
        if (hasStoreScope) {
          if (!storeIds.length) {
            purchaseScope = ' AND 1 = 0';
          } else {
            purchaseParams.push(storeIds);
            purchaseScope = ` AND si.destination_id = ANY($1::int[])`;
          }
        }
        const purchaseResult = await query(
          `SELECT COUNT(*)::int AS grns,
                  COALESCE(SUM(
                    COALESCE(si.total_cost, 0)
                    + COALESCE(si.total_tax, 0)
                    + COALESCE(si.other_charges, 0)
                  ), 0)::numeric AS amount
           FROM stock_in si
           WHERE LOWER(COALESCE(si.status, '')) = 'confirmed'${purchaseScope}`,
          purchaseParams,
        );
        return {
          amount: Number(purchaseResult.rows[0]?.amount || 0),
          grns: Number(purchaseResult.rows[0]?.grns || 0),
        };
      }),
      safeQuery('salesMetrics', async () => {
        const metrics = {
          totalSales: 0,
          todaySales: 0,
          totalRevenue: 0,
          totalTax: 0,
          todayRevenue: 0,
          weekRevenue: 0,
          avgOrderValue: 0,
          dailyData: [],
          topProducts: [],
          recentOrders: [],
        };

        const salesParams = [];
        const salesScope = scopedCondition('sb', salesParams);
        const todayParams = [];
        const todayScope = scopedCondition('sb', todayParams);
        const weekParams = [];
        const weekScope = scopedCondition('sb', weekParams);
        const dailyParams = [];
        const dailyScope = scopedCondition('sb', dailyParams);
        const topParams = [];
        const topScope = scopedCondition('sb', topParams);
        const recentParams = [];
        const recentScope = scopedCondition('sb', recentParams);

        const [
          salesCountResult,
          todaySalesResult,
          weekSalesResult,
          dailyDataResult,
          topProductsResult,
          recentOrdersResult,
        ] = await Promise.all([
          query(
            `SELECT COUNT(*)::int as count,
                    COALESCE(SUM(grand_total), 0)::numeric as total_revenue,
                    COALESCE(SUM(tax_total), 0)::numeric as total_tax
             FROM sales_bills sb
             WHERE sb.status IN ('paid', 'completed')${salesScope}`,
            salesParams,
          ),
          query(
            `SELECT COUNT(*)::int as count,
                    COALESCE(SUM(grand_total), 0)::numeric as today_revenue
             FROM sales_bills sb
             WHERE DATE(sb.created_at) = CURRENT_DATE
             AND sb.status IN ('paid', 'completed')${todayScope}`,
            todayParams,
          ),
          query(
            `SELECT COALESCE(SUM(grand_total), 0)::numeric as week_revenue
             FROM sales_bills sb
             WHERE sb.created_at >= NOW() - INTERVAL '7 days'
             AND sb.status IN ('paid', 'completed')${weekScope}`,
            weekParams,
          ),
          query(
            `SELECT DATE(sb.created_at) AS date,
                    COUNT(*)::int AS orders,
                    COALESCE(SUM(sb.grand_total), 0)::numeric AS revenue
             FROM sales_bills sb
             WHERE sb.created_at >= CURRENT_DATE - INTERVAL '6 days'
             AND sb.status IN ('paid', 'completed')${dailyScope}
             GROUP BY DATE(sb.created_at)
             ORDER BY DATE(sb.created_at) ASC`,
            dailyParams,
          ),
          query(
            `SELECT COALESCE(p.name, sbi.product_name, 'Product') AS name,
                    COALESCE(SUM(sbi.qty), 0)::numeric AS qty,
                    COALESCE(SUM(sbi.line_total), 0)::numeric AS revenue
             FROM sales_bill_items sbi
             INNER JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
             LEFT JOIN products p ON p.id = sbi.product_id
             WHERE sb.status IN ('paid', 'completed')${topScope}
             GROUP BY COALESCE(p.name, sbi.product_name, 'Product')
             ORDER BY qty DESC, revenue DESC
             LIMIT 5`,
            topParams,
          ),
          query(
            `SELECT
              id,
              bill_number as invoice_id,
              grand_total as amount,
              created_at as date,
              status
             FROM sales_bills sb
             WHERE sb.status IN ('paid', 'completed')${recentScope}
             ORDER BY created_at DESC
             LIMIT 5`,
            recentParams,
          ),
        ]);

        metrics.totalSales = salesCountResult.rows[0]?.count || 0;
        metrics.totalRevenue = parseFloat(salesCountResult.rows[0]?.total_revenue || 0);
        metrics.totalTax = parseFloat(salesCountResult.rows[0]?.total_tax || 0);
        metrics.avgOrderValue =
          metrics.totalSales > 0 ? metrics.totalRevenue / metrics.totalSales : 0;
        metrics.todaySales = todaySalesResult.rows[0]?.count || 0;
        metrics.todayRevenue = parseFloat(todaySalesResult.rows[0]?.today_revenue || 0);
        metrics.weekRevenue = parseFloat(weekSalesResult.rows[0]?.week_revenue || 0);
        metrics.dailyData = (dailyDataResult.rows || []).map((row) => ({
          date: row.date,
          label: formatIndianDate(row.date, '-'),
          orders: row.orders || 0,
          revenue: parseFloat(row.revenue || 0),
        }));
        metrics.topProducts = (topProductsResult.rows || []).map((row) => ({
          name: row.name,
          qty: parseFloat(row.qty || 0),
          revenue: parseFloat(row.revenue || 0),
        }));
        metrics.recentOrders = recentOrdersResult.rows || [];
        return metrics;
      }),
    ]);

    const payload = {
      products: productCount || 0,
      customers: customerCount || 0,
      lowStock: lowStockCount || 0,
      vendorPayable: vendorPayable || { amount: 0, bills: 0 },
      purchaseTotal: purchaseTotal || { amount: 0, grns: 0 },
      dataScopeLabel: hasStoreScope ? 'Assigned stores' : 'All stores',
      firstSale: firstSale
        ? {
            id: firstSale.id,
            number: firstSale.sale_number,
            amount: firstSale.total_amount,
            date: firstSale.created_at,
          }
        : null,
      store: store
        ? {
            id: store.id,
            name: store.name,
          }
        : null,
      sales:
        salesMetrics || {
          totalSales: 0,
          todaySales: 0,
          totalRevenue: 0,
          totalTax: 0,
          todayRevenue: 0,
          weekRevenue: 0,
          avgOrderValue: 0,
          dailyData: [],
          topProducts: [],
          recentOrders: [],
        },
    };

    g._dashboardStatsCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    });

    return successResponse(payload);
  } catch (err) {
    console.error('[DASHBOARD] Error:', err.message);
    return errorResponse('Unable to fetch dashboard stats');
  }
}
