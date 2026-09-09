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

/**
 * GET /api/dashboard/stats
 * Fetch dashboard statistics for home page
 */
export async function GET(request) {
  try {
    await Promise.allSettled([
      ensureCustomersSchema(),
      ensureSalesBillingSchema(),
      ensureInventoryBatchSchema(),
    ]);

    // Verify authentication
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensureStockInSchema();
    await ensureVendorInvoicesSchema();

    const { user } = auth;
    const assignedStores = user.role === 'super_admin' ? null : getAssignedStoreIds(user);
    const hasStoreScope = Array.isArray(assignedStores);
    const storeIds = hasStoreScope ? assignedStores : [];

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

    // ============================================
    // FETCH PRODUCT COUNT
    // ============================================
    let productCount = 0;
    try {
      const params = [];
      const storeScope = scopedWhere('ps', params);
      const productsResult = await query(
        `SELECT COUNT(DISTINCT p.id)::int as count
         FROM products p
         ${hasStoreScope ? 'JOIN product_saleability ps ON ps.product_id = p.id AND ps.is_active = TRUE' : ''}
         ${storeScope || 'WHERE COALESCE(p.is_active, TRUE) = TRUE'}
         ${storeScope ? 'AND COALESCE(p.is_active, TRUE) = TRUE' : ''}`,
        params
      );
      productCount = productsResult.rows[0]?.count || 0;
    } catch (err) {
      console.error('[DASHBOARD] Products query error:', err.message);
      productCount = 0;
    }

    // ============================================
    // FETCH CUSTOMER COUNT
    // ============================================
    let customerCount = 0;
    try {
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
        params
      );
      customerCount = customersResult.rows[0]?.count || 0;
    } catch (err) {
      console.error('[DASHBOARD] Customers query error:', err.message);
      customerCount = 0;
    }

    // ============================================
    // FETCH FIRST SALE STATUS
    // ============================================
    let firstSale = null;
    try {
      const params = [];
      const storeScope = scopedCondition('sb', params);
      const firstSaleResult = await query(
        `SELECT id, bill_number as sale_number, grand_total as total_amount, created_at
         FROM sales_bills sb
         WHERE sb.status IN ('paid', 'completed')${storeScope}
         ORDER BY created_at ASC 
         LIMIT 1`,
        params
      );
      firstSale = firstSaleResult.rows[0];
    } catch (err) {
      console.error('[DASHBOARD] First sale query error:', err.message);
      firstSale = null;
    }

    // ============================================
    // FETCH STORE STATUS
    // ============================================
    let store = null;
    try {
      const params = [];
      const storeScope = scopedWhere('s', params, 'id');
      const storesResult = await query(
        `SELECT id, name FROM stores s${storeScope} ORDER BY id ASC LIMIT 1`,
        params
      );
      store = storesResult.rows[0];
    } catch (err) {
      console.error('[DASHBOARD] Stores query error:', err.message);
      store = null;
    }

    // ============================================
    // FETCH LOW STOCK PRODUCTS
    // ============================================
    let lowStockCount = 0;
    try {
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
        params
      );
      lowStockCount = lowStockResult.rows[0]?.count || 0;
    } catch (err) {
      console.error('[DASHBOARD] Low stock query error:', err.message);
      lowStockCount = 0;
    }

    let vendorPayable = { amount: 0, bills: 0 };
    try {
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
      vendorPayable = {
        amount: Number(payableResult.rows[0]?.amount || 0),
        bills: Number(payableResult.rows[0]?.bills || 0),
      };
    } catch (err) {
      console.error('[DASHBOARD] Vendor payable query error:', err.message);
    }

    // Confirmed GRNs are the source of truth for purchase value. Use the
    // same store scope as sales and payables for role-safe dashboard totals.
    let purchaseTotal = { amount: 0, grns: 0 };
    try {
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
      purchaseTotal = {
        amount: Number(purchaseResult.rows[0]?.amount || 0),
        grns: Number(purchaseResult.rows[0]?.grns || 0),
      };
    } catch (err) {
      console.error('[DASHBOARD] Purchase total query error:', err.message);
    }

    // ============================================
    // FETCH RECENT SALES & METRICS
    // ============================================
    let salesMetrics = {
      totalSales: 0,
      todaySales: 0,
      totalRevenue: 0,
      totalTax: 0,
      todayRevenue: 0,
      weekRevenue: 0,
      avgOrderValue: 0,
      dailyData: [],
      topProducts: [],
      recentOrders: []
    };
    try {
      // Get sales count
      const salesParams = [];
      const salesScope = scopedCondition('sb', salesParams);
      const salesCountResult = await query(
        `SELECT COUNT(*)::int as count, 
                COALESCE(SUM(grand_total), 0)::numeric as total_revenue,
                COALESCE(SUM(tax_total), 0)::numeric as total_tax
         FROM sales_bills sb
         WHERE sb.status IN ('paid', 'completed')${salesScope}`,
        salesParams
      );
      salesMetrics.totalSales = salesCountResult.rows[0]?.count || 0;
      salesMetrics.totalRevenue = parseFloat(salesCountResult.rows[0]?.total_revenue || 0);
      salesMetrics.totalTax = parseFloat(salesCountResult.rows[0]?.total_tax || 0);
      salesMetrics.avgOrderValue = salesMetrics.totalSales > 0 ? salesMetrics.totalRevenue / salesMetrics.totalSales : 0;

      // Get today's sales
      const todayParams = [];
      const todayScope = scopedCondition('sb', todayParams);
      const todaySalesResult = await query(
        `SELECT COUNT(*)::int as count,
                COALESCE(SUM(grand_total), 0)::numeric as today_revenue
         FROM sales_bills sb
         WHERE DATE(sb.created_at) = CURRENT_DATE
         AND sb.status IN ('paid', 'completed')${todayScope}`,
        todayParams
      );
      salesMetrics.todaySales = todaySalesResult.rows[0]?.count || 0;
      salesMetrics.todayRevenue = parseFloat(todaySalesResult.rows[0]?.today_revenue || 0);

      const weekParams = [];
      const weekScope = scopedCondition('sb', weekParams);
      const weekSalesResult = await query(
        `SELECT COALESCE(SUM(grand_total), 0)::numeric as week_revenue
         FROM sales_bills sb
         WHERE sb.created_at >= NOW() - INTERVAL '7 days'
         AND sb.status IN ('paid', 'completed')${weekScope}`,
        weekParams
      );
      salesMetrics.weekRevenue = parseFloat(weekSalesResult.rows[0]?.week_revenue || 0);

      const dailyParams = [];
      const dailyScope = scopedCondition('sb', dailyParams);
      const dailyDataResult = await query(
        `SELECT DATE(sb.created_at) AS date,
                COUNT(*)::int AS orders,
                COALESCE(SUM(sb.grand_total), 0)::numeric AS revenue
         FROM sales_bills sb
         WHERE sb.created_at >= CURRENT_DATE - INTERVAL '6 days'
         AND sb.status IN ('paid', 'completed')${dailyScope}
         GROUP BY DATE(sb.created_at)
         ORDER BY DATE(sb.created_at) ASC`,
        dailyParams
      );
      salesMetrics.dailyData = (dailyDataResult.rows || []).map((row) => ({
        date: row.date,
        label: formatIndianDate(row.date, '-'),
        orders: row.orders || 0,
        revenue: parseFloat(row.revenue || 0),
      }));

      const topParams = [];
      const topScope = scopedCondition('sb', topParams);
      const topProductsResult = await query(
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
        topParams
      );
      salesMetrics.topProducts = (topProductsResult.rows || []).map((row) => ({
        name: row.name,
        qty: parseFloat(row.qty || 0),
        revenue: parseFloat(row.revenue || 0),
      }));

      // Get recent orders
      const recentParams = [];
      const recentScope = scopedCondition('sb', recentParams);
      const recentOrdersResult = await query(
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
        recentParams
      );
      salesMetrics.recentOrders = recentOrdersResult.rows || [];
    } catch (err) {
      console.error('[DASHBOARD] Sales metrics query error:', err.message);
    }

    return successResponse({
      products: productCount,
      customers: customerCount,
      lowStock: lowStockCount,
      vendorPayable,
      purchaseTotal,
      dataScopeLabel: hasStoreScope ? 'Assigned stores' : 'All stores',
      firstSale: firstSale ? {
        id: firstSale.id,
        number: firstSale.sale_number,
        amount: firstSale.total_amount,
        date: firstSale.created_at,
      } : null,
      store: store ? {
        id: store.id,
        name: store.name,
      } : null,
      sales: salesMetrics,
    });

  } catch (err) {
    console.error('[DASHBOARD] Error:', err.message);
    return errorResponse('Unable to fetch dashboard stats');
  }
}
