import { query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-response';
import { appendStoreScope, requireAuth } from '@/lib/api-protection';
import { ensureCatalogExtrasSchema } from '@/lib/catalogExtrasSchema';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { ensureStoresSchema } from '@/lib/storesSchema';

export async function GET(request) {
  try {
    await Promise.all([
      ensureCatalogExtrasSchema(),
      ensureInventoryBatchSchema(),
      ensureStoresSchema(),
    ]);

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const where = ['ps.is_active = TRUE', 'COALESCE(p.is_active, TRUE) = TRUE', 'COALESCE(s.is_active, TRUE) = TRUE'];
    const params = [];
    const scope = appendStoreScope(where, params, 'ps.store_id', auth.user);
    if (scope.error) return scope.error;

    const result = await query(
      `WITH stock AS (
         SELECT product_id, store_id, COALESCE(SUM(available_qty), 0) AS qty
         FROM inventory_batches
         WHERE status = 'active'
           AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         GROUP BY product_id, store_id
       )
       SELECT
         p.id AS product_id,
         p.name AS product_name,
         p.sku,
         p.barcode,
         s.id AS store_id,
         s.name AS store_name,
         COALESCE(stock.qty, 0)::numeric AS available_qty,
         COALESCE(NULLIF(ps.low_stock_value, 0), 10)::numeric AS threshold
       FROM product_saleability ps
       JOIN products p ON p.id = ps.product_id
       JOIN stores s ON s.id = ps.store_id
       LEFT JOIN stock ON stock.product_id = ps.product_id AND stock.store_id = ps.store_id
       WHERE ${where.join(' AND ')}
         AND COALESCE(stock.qty, 0) <= COALESCE(NULLIF(ps.low_stock_value, 0), 10)
       ORDER BY COALESCE(stock.qty, 0) ASC, p.name ASC
       LIMIT 25`,
      params
    );

    const alerts = result.rows.map((row) => {
      const availableQty = Number(row.available_qty || 0);
      const threshold = Number(row.threshold || 10);
      return {
        id: `${row.store_id}-${row.product_id}`,
        productId: Number(row.product_id),
        productName: row.product_name,
        sku: row.sku || row.barcode || '',
        storeId: Number(row.store_id),
        storeName: row.store_name,
        availableQty,
        threshold,
        severity: availableQty <= 0 ? 'out_of_stock' : 'low_stock',
      };
    });

    return successResponse({ alerts }, 'Low stock alerts fetched');
  } catch (err) {
    console.error('[notifications/low-stock GET]', err);
    return errorResponse('Failed to fetch low stock alerts');
  }
}
