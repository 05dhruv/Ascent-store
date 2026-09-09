import { query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-response';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureVendorsSchema } from '@/lib/vendorsSchema';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensureVendorInvoicesSchema } from '@/lib/vendorInvoicesSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { ensureStockTransferSchema } from '@/lib/stockTransferSchema';
import { getAssignedStoreIds, requireAuth, requireStore } from '@/lib/api-protection';

export async function GET(req) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;
    await ensureCustomersSchema();
    await ensureSalesBillingSchema();
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensureVendorInvoicesSchema();
    await ensureStockInSchema();
    await ensureInventoryBatchSchema();
    await ensureStockTransferSchema();

    const { searchParams } = new URL(req.url);
    const rawStoreId = searchParams.get('store_id');
    const requestedStoreId = rawStoreId && rawStoreId !== 'all' ? Number(rawStoreId) : null;
    if (requestedStoreId) {
      const storeCheck = requireStore(user, requestedStoreId);
      if (storeCheck.error) return storeCheck.error;
    }

    const accessibleStoreIds = requestedStoreId
      ? [requestedStoreId]
      : user.role === 'super_admin'
        ? null
        : getAssignedStoreIds(user);
    const hasStoreFilter = Array.isArray(accessibleStoreIds);
    const storeIdList = hasStoreFilter && accessibleStoreIds.length
      ? accessibleStoreIds.join(',')
      : '';
    const date_from = searchParams.get('date_from') || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
    const date_to = searchParams.get('date_to') || new Date().toISOString().split('T')[0];


    // Base query filter
    const storeFilter = hasStoreFilter ? (storeIdList ? `AND sb.store_id = ANY(ARRAY[${storeIdList}]::int[])` : 'AND 1 = 0') : '';
    const storeWhere = hasStoreFilter ? (storeIdList ? `WHERE s.id = ANY(ARRAY[${storeIdList}]::int[])` : 'WHERE 1 = 0') : '';
    const psStoreWhere = hasStoreFilter ? (storeIdList ? `WHERE ps.store_id = ANY(ARRAY[${storeIdList}]::int[])` : 'WHERE 1 = 0') : '';
    const psStoreAnd = hasStoreFilter ? (storeIdList ? `AND ps.store_id = ANY(ARRAY[${storeIdList}]::int[])` : 'AND 1 = 0') : '';
    const productSaleabilityStoreAnd = hasStoreFilter ? (storeIdList ? `AND store_id = ANY(ARRAY[${storeIdList}]::int[])` : 'AND 1 = 0') : '';
    const stockInStoreAnd = hasStoreFilter ? (storeIdList ? `AND si.destination_id = ANY(ARRAY[${storeIdList}]::int[])` : 'AND 1 = 0') : '';
    const stockOutStoreAnd = hasStoreFilter ? (storeIdList ? `AND so.destination_id = ANY(ARRAY[${storeIdList}]::int[])` : 'AND 1 = 0') : '';
    const salesBillStoreAnd = storeFilter;
    const salesBillStoreWhere = hasStoreFilter ? (storeIdList ? `WHERE sb.store_id = ANY(ARRAY[${storeIdList}]::int[])` : 'WHERE 1 = 0') : '';
    const purchaseOrderStoreAnd = hasStoreFilter ? (storeIdList ? `AND po.destination_id = ANY(ARRAY[${storeIdList}]::int[])` : 'AND 1 = 0') : '';
    const payableStoreAnd = hasStoreFilter ? (storeIdList ? `AND (po.destination_id = ANY(ARRAY[${storeIdList}]::int[]) OR vi.purchase_order_id IS NULL)` : 'AND 1 = 0') : '';
    const batchStoreAnd = hasStoreFilter ? (storeIdList ? `AND ib.store_id = ANY(ARRAY[${storeIdList}]::int[])` : 'AND 1 = 0') : '';

    // 1. Total Sales & Revenue
    const salesRes = await query(`
      SELECT 
        COALESCE(SUM(sb.grand_total), 0) as total_sales,
        COALESCE(SUM(sb.tax_total), 0) as total_tax,
        COALESCE(SUM(sb.round_off), 0) as total_roundoff,
        COUNT(DISTINCT sb.id) as total_transactions,
        COUNT(DISTINCT NULLIF(sb.customer_mobile, '')) as unique_customers,
        COALESCE(AVG(sb.grand_total), 0) as avg_transaction_value
      FROM sales_bills sb
      WHERE DATE(sb.created_at) >= '${date_from}' 
        AND DATE(sb.created_at) <= '${date_to}'
        AND sb.status != 'cancelled'
        ${storeFilter}
    `).catch(() => ({ rows: [{ total_sales: 0, total_tax: 0, total_roundoff: 0, total_transactions: 0, unique_customers: 0, avg_transaction_value: 0 }] }));

    // 2. Store/POS gross profit. Revenue is aggregated once per bill so a
    // multi-line bill cannot multiply the denominator. Tax and round-off are
    // excluded because neither represents trading revenue.
    const profitRes = await query(`
      WITH eligible_bills AS (
        SELECT sb.id, sb.store_id,
               GREATEST(COALESCE(sb.grand_total, 0) - COALESCE(sb.tax_total, 0) - COALESCE(sb.round_off, 0), 0) AS net_revenue
        FROM sales_bills sb
        WHERE DATE(sb.created_at) >= '${date_from}'
          AND DATE(sb.created_at) <= '${date_to}'
          AND sb.status != 'cancelled'
          ${storeFilter}
      ), item_costs AS (
        SELECT eb.id AS bill_id,
               CASE
                 -- A bill allocation is authoritative only when it accounts
                 -- for exactly the quantity that was sold. Older corrupt
                 -- allocations sometimes contained an entire batch quantity.
                 WHEN sold_cost.allocated_qty BETWEEN sbi.qty - 0.001 AND sbi.qty + 0.001
                   AND COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) > 0
                   AND sold_cost.cost_amount <= sbi.qty * COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) + 0.01
                   THEN sold_cost.cost_amount
                 -- Stock-out is an immutable transaction-time fallback; do
                 -- not use current master price when historical evidence exists.
                 WHEN stock_out_cost.issued_qty BETWEEN sbi.qty - 0.001 AND sbi.qty + 0.001
                   AND COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) > 0
                   AND stock_out_cost.cost_amount <= sbi.qty * COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) + 0.01
                   THEN stock_out_cost.cost_amount
                 ELSE sbi.qty * COALESCE(store_cost.avg_cost, p.cost_price, 0)
               END AS cost_amount
        FROM eligible_bills eb
        JOIN sales_bill_items sbi ON sbi.sales_bill_id = eb.id
        LEFT JOIN products p ON p.id = sbi.product_id
        LEFT JOIN LATERAL (
          SELECT
            SUM(CASE WHEN COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$' AND COALESCE(entry->>'costPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (entry->>'qty')::numeric * (entry->>'costPrice')::numeric ELSE 0 END) AS cost_amount,
            SUM(CASE WHEN COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$' THEN (entry->>'qty')::numeric ELSE 0 END) AS allocated_qty
          FROM jsonb_array_elements(COALESCE(sbi.batch_allocations, '[]'::jsonb)) entry
        ) sold_cost ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(soi.qty * soi.cost_price) AS cost_amount, SUM(soi.qty) AS issued_qty
          FROM stock_out so
          JOIN stock_out_items soi ON soi.stock_out_id = so.id
          WHERE so.reference_type = 'sales_bill'
            AND so.reference_id = eb.id::text
            AND soi.product_id = sbi.product_id
        ) stock_out_cost ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(ib.available_qty * ib.cost_price) / NULLIF(SUM(ib.available_qty), 0) AS avg_cost
          FROM inventory_batches ib
          WHERE ib.product_id = sbi.product_id AND ib.store_id = eb.store_id AND ib.available_qty > 0
        ) store_cost ON TRUE
      )
      SELECT COALESCE((SELECT SUM(net_revenue) FROM eligible_bills), 0) AS gross_revenue,
             COALESCE((SELECT SUM(net_revenue) FROM eligible_bills), 0)
               - COALESCE((SELECT SUM(cost_amount) FROM item_costs), 0) AS gross_profit
    `).catch(() => ({ rows: [{ gross_revenue: 0, gross_profit: 0 }] }));

    // Warehouse/HO distribution margin. New transfers carry an immutable
    // sourceCostPrice snapshot per batch allocation. Older transfers fall
    // back to the referenced source batch and finally the product cost.
    const warehouseProfitRes = await query(`
      WITH transfer_lines AS (
        SELECT st.id, sti.product_id, sti.qty AS line_qty,
               COALESCE(sti.cost_price, 0) AS transfer_price,
               allocation.entry
        FROM stock_transfer st
        JOIN stores source_store ON source_store.id = st.source_id
        JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
        LEFT JOIN LATERAL jsonb_array_elements(COALESCE(sti.meta->'batchAllocations', '[]'::jsonb)) allocation(entry) ON TRUE
        WHERE st.status = 'confirmed'
          AND st.confirmed_at >= '${date_from}'::date
          AND st.confirmed_at < ('${date_to}'::date + INTERVAL '1 day')
          AND (
            LOWER(COALESCE(source_store.meta->>'locationType', '')) = 'warehouse'
            OR LOWER(COALESCE(source_store.name, '')) LIKE '%warehouse%'
          )
          ${hasStoreFilter ? (storeIdList ? `AND st.destination_id = ANY(ARRAY[${storeIdList}]::int[])` : 'AND 1 = 0') : ''}
      ), valued_lines AS (
        SELECT COALESCE(
                 CASE WHEN COALESCE(tl.entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$' THEN (tl.entry->>'qty')::numeric END,
                 tl.line_qty
               ) AS qty,
               tl.transfer_price,
               COALESCE(
                 CASE WHEN COALESCE(tl.entry->>'sourceCostPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (tl.entry->>'sourceCostPrice')::numeric END,
                 ib.cost_price,
                 p.cost_price,
                 tl.transfer_price,
                 0
               ) AS source_cost
        FROM transfer_lines tl
        LEFT JOIN inventory_batches ib
          ON ib.id = CASE
            WHEN COALESCE(tl.entry->>'batchId', '') ~ '^[0-9]+$'
              THEN (tl.entry->>'batchId')::bigint
            ELSE NULL
          END
        LEFT JOIN products p ON p.id = tl.product_id
      )
      SELECT COALESCE(SUM(qty * transfer_price), 0) AS transfer_revenue,
             COALESCE(SUM(qty * source_cost), 0) AS warehouse_cogs,
             COALESCE(SUM(qty * (transfer_price - source_cost)), 0) AS warehouse_profit
      FROM valued_lines
    `).catch(() => ({ rows: [{ transfer_revenue: 0, warehouse_cogs: 0, warehouse_profit: 0 }] }));

    // 3. Store-wise Performance
    const storePerformanceRes = await query(`
      WITH bill_metrics AS (
        SELECT sb.store_id, COUNT(*) AS transactions,
               SUM(sb.grand_total) AS sales,
               SUM(sb.tax_total) AS tax_collected,
               SUM(GREATEST(COALESCE(sb.grand_total, 0) - COALESCE(sb.tax_total, 0) - COALESCE(sb.round_off, 0), 0)) AS net_revenue
        FROM sales_bills sb
        WHERE DATE(sb.created_at) >= '${date_from}'
          AND DATE(sb.created_at) <= '${date_to}'
          AND sb.status != 'cancelled'
          ${storeFilter}
        GROUP BY sb.store_id
      ), cost_metrics AS (
        SELECT sb.store_id,
               SUM(CASE
                 WHEN sold_cost.allocated_qty BETWEEN sbi.qty - 0.001 AND sbi.qty + 0.001
                   AND COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) > 0
                   AND sold_cost.cost_amount <= sbi.qty * COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) + 0.01 THEN sold_cost.cost_amount
                 WHEN stock_out_cost.issued_qty BETWEEN sbi.qty - 0.001 AND sbi.qty + 0.001
                   AND COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) > 0
                   AND stock_out_cost.cost_amount <= sbi.qty * COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) + 0.01 THEN stock_out_cost.cost_amount
                 ELSE sbi.qty * COALESCE(store_cost.avg_cost, p.cost_price, 0)
               END) AS cogs
        FROM sales_bills sb
        JOIN sales_bill_items sbi ON sb.id = sbi.sales_bill_id
        LEFT JOIN products p ON p.id = sbi.product_id
        LEFT JOIN LATERAL (
          SELECT
            SUM(CASE WHEN COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$' AND COALESCE(entry->>'costPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (entry->>'qty')::numeric * (entry->>'costPrice')::numeric ELSE 0 END) AS cost_amount,
            SUM(CASE WHEN COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$' THEN (entry->>'qty')::numeric ELSE 0 END) AS allocated_qty
          FROM jsonb_array_elements(COALESCE(sbi.batch_allocations, '[]'::jsonb)) entry
        ) sold_cost ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(soi.qty * soi.cost_price) AS cost_amount, SUM(soi.qty) AS issued_qty
          FROM stock_out so
          JOIN stock_out_items soi ON soi.stock_out_id = so.id
          WHERE so.reference_type = 'sales_bill'
            AND so.reference_id = sb.id::text
            AND soi.product_id = sbi.product_id
        ) stock_out_cost ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(ib.available_qty * ib.cost_price) / NULLIF(SUM(ib.available_qty), 0) AS avg_cost
          FROM inventory_batches ib
          WHERE ib.product_id = sbi.product_id AND ib.store_id = sb.store_id AND ib.available_qty > 0
        ) store_cost ON TRUE
        WHERE DATE(sb.created_at) >= '${date_from}'
          AND DATE(sb.created_at) <= '${date_to}'
          AND sb.status != 'cancelled'
          ${storeFilter}
        GROUP BY sb.store_id
      )
      SELECT s.id, s.name AS store_name,
             COALESCE(bm.transactions, 0) AS transactions,
             COALESCE(bm.sales, 0) AS sales,
             COALESCE(bm.tax_collected, 0) AS tax_collected,
             COALESCE(bm.net_revenue, 0) - COALESCE(cm.cogs, 0) AS profit
      FROM stores s
      LEFT JOIN bill_metrics bm ON bm.store_id = s.id
      LEFT JOIN cost_metrics cm ON cm.store_id = s.id
      ${storeWhere}
      ORDER BY sales DESC
    `).catch(() => ({ rows: [] }));

    // 4. Daily/Monthly Sales Trend
    const trendsRes = await query(`
      WITH bill_metrics AS (
        SELECT DATE(sb.created_at) AS sale_date, COUNT(*) AS transactions,
               SUM(sb.grand_total) AS sales, SUM(sb.tax_total) AS tax,
               SUM(GREATEST(COALESCE(sb.grand_total, 0) - COALESCE(sb.tax_total, 0) - COALESCE(sb.round_off, 0), 0)) AS net_revenue
        FROM sales_bills sb
        WHERE DATE(sb.created_at) >= '${date_from}'
          AND DATE(sb.created_at) <= '${date_to}'
          AND sb.status != 'cancelled'
          ${storeFilter}
        GROUP BY DATE(sb.created_at)
      ), cost_metrics AS (
        SELECT DATE(sb.created_at) AS sale_date,
               SUM(CASE
                 WHEN sold_cost.allocated_qty BETWEEN sbi.qty - 0.001 AND sbi.qty + 0.001
                   AND COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) > 0
                   AND sold_cost.cost_amount <= sbi.qty * COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) + 0.01 THEN sold_cost.cost_amount
                 WHEN stock_out_cost.issued_qty BETWEEN sbi.qty - 0.001 AND sbi.qty + 0.001
                   AND COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) > 0
                   AND stock_out_cost.cost_amount <= sbi.qty * COALESCE(NULLIF(sbi.mrp, 0), NULLIF(p.mrp, 0), 0) + 0.01 THEN stock_out_cost.cost_amount
                 ELSE sbi.qty * COALESCE(store_cost.avg_cost, p.cost_price, 0)
               END) AS cogs
        FROM sales_bills sb
        JOIN sales_bill_items sbi ON sb.id = sbi.sales_bill_id
        LEFT JOIN products p ON p.id = sbi.product_id
        LEFT JOIN LATERAL (
          SELECT
            SUM(CASE WHEN COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$' AND COALESCE(entry->>'costPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (entry->>'qty')::numeric * (entry->>'costPrice')::numeric ELSE 0 END) AS cost_amount,
            SUM(CASE WHEN COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$' THEN (entry->>'qty')::numeric ELSE 0 END) AS allocated_qty
          FROM jsonb_array_elements(COALESCE(sbi.batch_allocations, '[]'::jsonb)) entry
        ) sold_cost ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(soi.qty * soi.cost_price) AS cost_amount, SUM(soi.qty) AS issued_qty
          FROM stock_out so
          JOIN stock_out_items soi ON soi.stock_out_id = so.id
          WHERE so.reference_type = 'sales_bill'
            AND so.reference_id = sb.id::text
            AND soi.product_id = sbi.product_id
        ) stock_out_cost ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(ib.available_qty * ib.cost_price) / NULLIF(SUM(ib.available_qty), 0) AS avg_cost
          FROM inventory_batches ib
          WHERE ib.product_id = sbi.product_id AND ib.store_id = sb.store_id AND ib.available_qty > 0
        ) store_cost ON TRUE
        WHERE DATE(sb.created_at) >= '${date_from}'
          AND DATE(sb.created_at) <= '${date_to}'
          AND sb.status != 'cancelled'
          ${storeFilter}
        GROUP BY DATE(sb.created_at)
      )
      SELECT bm.sale_date::text AS date, bm.transactions, bm.sales, bm.tax,
             bm.net_revenue - COALESCE(cm.cogs, 0) AS profit
      FROM bill_metrics bm
      LEFT JOIN cost_metrics cm ON cm.sale_date = bm.sale_date
      ORDER BY bm.sale_date ASC
    `).catch(() => ({ rows: [] }));

    // 5. Inventory Valuation
    // Batches are the stock source of truth used by product and inventory pages.
    const inventoryRes = await query(`
      SELECT
        COUNT(DISTINCT p.id)::int AS total_products,
        COALESCE(SUM(COALESCE(batch_agg.qty, 0)), 0) AS total_stock_units,
        COALESCE(SUM(COALESCE(batch_agg.cost_value, 0)), 0) AS inventory_value_cost,
        COALESCE(SUM(COALESCE(batch_agg.qty, 0) * COALESCE(NULLIF(p.selling_price, 0), 0)), 0) AS inventory_value_retail
      FROM (
        SELECT DISTINCT product_id
        FROM product_saleability
        WHERE is_active = TRUE
        ${productSaleabilityStoreAnd}
      ) active_ps
      INNER JOIN products p ON p.id = active_ps.product_id
      LEFT JOIN (
        SELECT ib.product_id, SUM(ib.available_qty) AS qty, SUM(ib.available_qty * ib.cost_price) AS cost_value
        FROM inventory_batches ib
        WHERE ib.status = 'active'
          ${batchStoreAnd}
        GROUP BY ib.product_id
      ) batch_agg ON batch_agg.product_id = p.id
    `).catch(() => ({ rows: [{ total_products: 0, total_stock_units: 0, inventory_value_cost: 0, inventory_value_retail: 0 }] }));

    // 6. Fast-moving vs Slow-moving Items
    const movingItemsRes = await query(`
      SELECT 
        p.id,
        p.name,
        p.sku,
        COALESCE(SUM(sbi.qty), 0) as quantity_sold,
        COALESCE(SUM(sbi.qty * sbi.selling_price), 0) as revenue,
        COALESCE(AVG(sbi.selling_price), 0) as avg_price,
        CASE 
          WHEN COALESCE(SUM(sbi.qty), 0) > 50 THEN 'Fast-Moving'
          WHEN COALESCE(SUM(sbi.qty), 0) > 10 THEN 'Medium-Moving'
          ELSE 'Slow-Moving'
        END as movement_category
      FROM products p
      INNER JOIN product_saleability ps ON ps.product_id = p.id AND ps.is_active = TRUE
      LEFT JOIN sales_bill_items sbi ON p.id = sbi.product_id
      LEFT JOIN sales_bills sb ON sbi.sales_bill_id = sb.id
        AND DATE(sb.created_at) >= '${date_from}'
        AND DATE(sb.created_at) <= '${date_to}'
        AND sb.store_id = ps.store_id
      ${psStoreWhere}
      GROUP BY p.id, p.name, p.sku
      ORDER BY quantity_sold DESC
      LIMIT 50
    `).catch(() => ({ rows: [] }));

    // 7. Live Stock Alerts
    const stockAlertsRes = await query(`
      WITH active_products AS (
        SELECT
          product_id,
          COALESCE(NULLIF(MAX(COALESCE(low_stock_value, 0)), 0), 10) AS reorder_level
        FROM product_saleability
        WHERE is_active = TRUE
          ${productSaleabilityStoreAnd}
        GROUP BY product_id
      ),
      stock AS (
        SELECT
          ib.product_id,
          COALESCE(SUM(ib.available_qty), 0) AS available_stock
        FROM inventory_batches ib
        WHERE ib.status = 'active'
          ${batchStoreAnd}
        GROUP BY ib.product_id
      ),
      recent_sales AS (
        SELECT
          sbi.product_id,
          COALESCE(SUM(sbi.qty), 0) AS last_30days_sales
        FROM sales_bill_items sbi
        INNER JOIN sales_bills sb ON sbi.sales_bill_id = sb.id
        WHERE DATE(sb.created_at) >= DATE(CURRENT_DATE - INTERVAL '30 days')
          AND sb.status != 'cancelled'
          ${storeFilter}
        GROUP BY sbi.product_id
      )
      SELECT 
        p.id,
        p.name,
        p.sku,
        COALESCE(stock.available_stock, 0) AS current_stock,
        active_products.reorder_level,
        CASE 
          WHEN COALESCE(stock.available_stock, 0) <= 0 THEN 'Out of Stock'
          WHEN COALESCE(stock.available_stock, 0) <= active_products.reorder_level THEN 'Low Stock'
          ELSE 'In Stock'
        END AS stock_status,
        COALESCE(recent_sales.last_30days_sales, 0) AS last_30days_sales
      FROM active_products
      INNER JOIN products p ON p.id = active_products.product_id
      LEFT JOIN stock ON stock.product_id = p.id
      LEFT JOIN recent_sales ON recent_sales.product_id = p.id
      WHERE COALESCE(stock.available_stock, 0) <= active_products.reorder_level
      ORDER BY current_stock ASC
      LIMIT 50
    `).catch(() => ({ rows: [] }));

    // 8. Stockout forecast across all active products
    const stockForecastRes = await query(`
      WITH active_products AS (
        SELECT
          product_id,
          COALESCE(NULLIF(MAX(COALESCE(low_stock_value, 0)), 0), 10) AS reorder_level
        FROM product_saleability
        WHERE is_active = TRUE
          ${productSaleabilityStoreAnd}
        GROUP BY product_id
      ),
      stock AS (
        SELECT
          ib.product_id,
          COALESCE(SUM(ib.available_qty), 0) AS available_stock
        FROM inventory_batches ib
        WHERE ib.status = 'active'
          ${batchStoreAnd}
        GROUP BY ib.product_id
      ),
      recent_sales AS (
        SELECT
          sbi.product_id,
          COALESCE(SUM(sbi.qty), 0) AS last_30days_sales
        FROM sales_bill_items sbi
        INNER JOIN sales_bills sb ON sbi.sales_bill_id = sb.id
        WHERE DATE(sb.created_at) >= DATE(CURRENT_DATE - INTERVAL '30 days')
          AND sb.status != 'cancelled'
          ${storeFilter}
        GROUP BY sbi.product_id
      )
      SELECT 
        p.id,
        p.name,
        p.sku,
        COALESCE(stock.available_stock, 0) AS current_stock,
        active_products.reorder_level,
        COALESCE(recent_sales.last_30days_sales, 0) AS last_30days_sales,
        CASE
          WHEN COALESCE(recent_sales.last_30days_sales, 0) > 0
            THEN ROUND(COALESCE(stock.available_stock, 0)::numeric / NULLIF((recent_sales.last_30days_sales::numeric / 30), 0), 1)
          ELSE NULL
        END AS days_of_cover
      FROM active_products
      INNER JOIN products p ON p.id = active_products.product_id
      LEFT JOIN stock ON stock.product_id = p.id
      LEFT JOIN recent_sales ON recent_sales.product_id = p.id
      ORDER BY days_of_cover ASC NULLS LAST, current_stock ASC, last_30days_sales DESC
      LIMIT 8
    `).catch(() => ({ rows: [] }));

    // 8. Top Customers
    const topCustomersRes = await query(`
      WITH billed_customers AS (
        SELECT
          COALESCE(NULLIF(TRIM(sb.customer_mobile), ''), 'walkin-' || COALESCE(NULLIF(TRIM(sb.customer_name), ''), sb.id::text)) AS customer_key,
          NULLIF(MAX(TRIM(sb.customer_name)), '') AS bill_customer_name,
          NULLIF(MAX(TRIM(sb.customer_mobile)), '') AS bill_mobile,
          COUNT(DISTINCT sb.id)::int AS transactions,
          COALESCE(SUM(sb.grand_total), 0) AS total_spent,
          COALESCE(MAX(sb.created_at), NULL)::text AS last_purchase_date
        FROM sales_bills sb
        WHERE DATE(sb.created_at) >= '${date_from}'
          AND DATE(sb.created_at) <= '${date_to}'
          AND COALESCE(sb.status, 'paid') NOT IN ('cancelled', 'void')
          AND (
            NULLIF(TRIM(COALESCE(sb.customer_name, '')), '') IS NOT NULL
            OR NULLIF(TRIM(COALESCE(sb.customer_mobile, '')), '') IS NOT NULL
          )
          ${salesBillStoreWhere ? salesBillStoreWhere.replace(/^WHERE\s+/i, 'AND ') : ''}
        GROUP BY customer_key
      )
      SELECT
        c.id,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
          bc.bill_customer_name,
          bc.bill_mobile,
          'Walk-in Customer'
        ) AS name,
        COALESCE(c.mobile_number, bc.bill_mobile, '') AS phone,
        bc.transactions,
        bc.total_spent,
        bc.last_purchase_date
      FROM billed_customers bc
      LEFT JOIN customers c ON c.mobile_number = bc.bill_mobile
      ORDER BY bc.total_spent DESC
      LIMIT 20
    `).catch(() => ({ rows: [] }));

    // 9. Staff Productivity
    const staffProductivityRes = await query(`
      SELECT 
        e.id,
        CONCAT_WS(' ', e.first_name, e.last_name) as name,
        COUNT(DISTINCT sb.id) as bills_created,
        COALESCE(SUM(sb.grand_total), 0) as sales_value,
        COALESCE(AVG(sb.grand_total), 0) as avg_bill_value,
        COALESCE(SUM(sb.tax_total), 0) as tax_collected,
        COUNT(DISTINCT CASE WHEN sb.created_at >= NOW() - INTERVAL '1 hour' THEN sb.id END) as bills_last_hour,
        COALESCE(SUM(CASE WHEN sb.created_at >= NOW() - INTERVAL '1 hour' THEN sb.grand_total ELSE 0 END), 0) as sales_last_hour,
        MAX(sb.created_at) as last_bill_at,
        CASE WHEN MAX(sb.created_at) >= NOW() - INTERVAL '15 minutes' THEN TRUE ELSE FALSE END as is_active_now
      FROM employees e
      LEFT JOIN sales_bills sb ON e.user_id = sb.user_id
        AND DATE(sb.created_at) >= '${date_from}'
        AND DATE(sb.created_at) <= '${date_to}'
        AND sb.status != 'cancelled'
      ${salesBillStoreWhere}
      GROUP BY e.id, e.first_name, e.last_name
      ORDER BY sales_value DESC, last_bill_at DESC NULLS LAST
      LIMIT 1000
    `).catch(() => ({ rows: [] }));

    // 10. Payment Mode Analysis
    const paymentModesRes = await query(`
      WITH bill_payments AS (
        SELECT
          sb.id,
          COALESCE(NULLIF(TRIM(sbp.method), ''), NULLIF(TRIM(sb.payment_mode), ''), 'cash') AS payment_mode,
          COALESCE(sbp.amount, NULLIF(sb.paid_amount, 0), sb.grand_total, 0) AS amount
        FROM sales_bills sb
        LEFT JOIN sales_bill_payments sbp ON sbp.sales_bill_id = sb.id
        WHERE DATE(sb.created_at) >= '${date_from}'
          AND DATE(sb.created_at) <= '${date_to}'
          AND sb.status != 'cancelled'
          ${storeFilter}
      )
      SELECT
        INITCAP(payment_mode) AS payment_mode,
        COALESCE(COUNT(DISTINCT id), 0) as transactions,
        COALESCE(SUM(amount), 0) as amount
      FROM bill_payments
      GROUP BY INITCAP(payment_mode)
      ORDER BY amount DESC
    `).catch(() => ({ rows: [] }));

    // 11. Vendor / Purchase Health
    const vendorSummaryRes = await query(`
      WITH purchases AS (
        SELECT
          po.vendor_id,
          COALESCE(po.total_cost, 0) + COALESCE(po.total_tax, 0) AS amount
        FROM purchase_orders po
        WHERE DATE(COALESCE(po.confirmed_at, po.created_at)) >= '${date_from}'
          AND DATE(COALESCE(po.confirmed_at, po.created_at)) <= '${date_to}'
          ${purchaseOrderStoreAnd}
        UNION ALL
        SELECT
          si.vendor_id,
          COALESCE(si.total_cost, 0) + COALESCE(si.total_tax, 0) AS amount
        FROM stock_in si
        WHERE DATE(COALESCE(si.confirmed_at, si.created_at)) >= '${date_from}'
          AND DATE(COALESCE(si.confirmed_at, si.created_at)) <= '${date_to}'
          AND COALESCE(si.reference_type, '') <> 'purchase_order'
          ${stockInStoreAnd}
      ),
      payable AS (
        SELECT
          vi.id,
          vi.total_amount,
          vi.amount_paid
        FROM vendor_invoices vi
        LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
        WHERE LOWER(COALESCE(vi.status, 'pending')) IN ('pending', 'partial')
          ${payableStoreAnd}
      )
      SELECT
        (SELECT COUNT(*)::int FROM vendors) AS total_vendors,
        (SELECT COUNT(*)::int FROM vendors WHERE COALESCE(is_active, TRUE) = TRUE) AS active_vendors,
        (SELECT COUNT(*)::int FROM payable) AS pending_vendor_invoices,
        (SELECT COALESCE(SUM(GREATEST(total_amount - amount_paid, 0)), 0) FROM payable) AS total_payable,
        (SELECT COALESCE(SUM(amount), 0) FROM purchases) AS purchase_value,
        (SELECT COUNT(DISTINCT vendor_id)::int FROM purchases WHERE vendor_id IS NOT NULL) AS purchasing_vendors
    `).catch(() => ({ rows: [{ total_vendors: 0, active_vendors: 0, pending_vendor_invoices: 0, total_payable: 0, purchase_value: 0, purchasing_vendors: 0 }] }));

    const topVendorsRes = await query(`
      WITH purchases AS (
        SELECT
          po.vendor_id,
          COALESCE(po.total_cost, 0) + COALESCE(po.total_tax, 0) AS amount,
          COALESCE(po.total_items, 0) AS items
        FROM purchase_orders po
        WHERE DATE(COALESCE(po.confirmed_at, po.created_at)) >= '${date_from}'
          AND DATE(COALESCE(po.confirmed_at, po.created_at)) <= '${date_to}'
          ${purchaseOrderStoreAnd}
        UNION ALL
        SELECT
          si.vendor_id,
          COALESCE(si.total_cost, 0) + COALESCE(si.total_tax, 0) AS amount,
          COALESCE(si.total_items, 0) AS items
        FROM stock_in si
        WHERE DATE(COALESCE(si.confirmed_at, si.created_at)) >= '${date_from}'
          AND DATE(COALESCE(si.confirmed_at, si.created_at)) <= '${date_to}'
          AND COALESCE(si.reference_type, '') <> 'purchase_order'
          ${stockInStoreAnd}
      )
      SELECT
        COALESCE(v.id, 0) AS id,
        COALESCE(v.name, 'Unmapped Vendor') AS vendor_name,
        COUNT(*)::int AS purchase_count,
        COALESCE(SUM(p.items), 0) AS items,
        COALESCE(SUM(p.amount), 0) AS amount
      FROM purchases p
      LEFT JOIN vendors v ON v.id = p.vendor_id
      GROUP BY v.id, v.name
      ORDER BY amount DESC
      LIMIT 8
    `).catch(() => ({ rows: [] }));

    const salesData = salesRes.rows[0] || {};
    const profitData = profitRes.rows[0] || {};
    const warehouseProfitData = warehouseProfitRes.rows[0] || {};

    return successResponse({
      summary: {
        total_sales: parseFloat(salesData.total_sales || 0),
        total_tax: parseFloat(salesData.total_tax || 0),
        total_transactions: parseInt(salesData.total_transactions || 0),
        unique_customers: parseInt(salesData.unique_customers || 0),
        avg_transaction_value: parseFloat(salesData.avg_transaction_value || 0),
      },
      profitability: {
        gross_revenue: parseFloat(profitData.gross_revenue || 0),
        gross_profit: parseFloat(profitData.gross_profit || 0),
        gross_margin_percent: profitData.gross_revenue ? ((profitData.gross_profit / profitData.gross_revenue) * 100).toFixed(2) : 0,
        store_gross_revenue: parseFloat(profitData.gross_revenue || 0),
        store_gross_profit: parseFloat(profitData.gross_profit || 0),
        store_margin_percent: profitData.gross_revenue ? ((profitData.gross_profit / profitData.gross_revenue) * 100).toFixed(2) : 0,
        warehouse_transfer_revenue: parseFloat(warehouseProfitData.transfer_revenue || 0),
        warehouse_cogs: parseFloat(warehouseProfitData.warehouse_cogs || 0),
        warehouse_profit: parseFloat(warehouseProfitData.warehouse_profit || 0),
        warehouse_margin_percent: warehouseProfitData.transfer_revenue
          ? ((warehouseProfitData.warehouse_profit / warehouseProfitData.transfer_revenue) * 100).toFixed(2)
          : 0,
      },
      store_performance: storePerformanceRes.rows || [],
      sales_trends: trendsRes.rows || [],
      inventory: inventoryRes.rows[0] || {},
      moving_items: movingItemsRes.rows || [],
      stock_alerts: stockAlertsRes.rows || [],
      stock_forecast: stockForecastRes.rows || [],
      top_customers: topCustomersRes.rows || [],
      staff_productivity: staffProductivityRes.rows || [],
      payment_modes: paymentModesRes.rows || [],
      vendor_summary: {
        total_vendors: parseInt(vendorSummaryRes.rows[0]?.total_vendors || 0),
        active_vendors: parseInt(vendorSummaryRes.rows[0]?.active_vendors || 0),
        pending_vendor_invoices: parseInt(vendorSummaryRes.rows[0]?.pending_vendor_invoices || 0),
        total_payable: parseFloat(vendorSummaryRes.rows[0]?.total_payable || 0),
        purchase_value: parseFloat(vendorSummaryRes.rows[0]?.purchase_value || 0),
        purchasing_vendors: parseInt(vendorSummaryRes.rows[0]?.purchasing_vendors || 0),
      },
      top_vendors: topVendorsRes.rows || [],
    });
  } catch (err) {
    console.error('Dashboard analytics error:', err);
    return errorResponse(err.message);
  }
}
