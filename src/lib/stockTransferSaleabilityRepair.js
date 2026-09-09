import { query } from '@/lib/db';

const globalForStockTransferSaleabilityRepair = globalThis;
const REPAIR_TTL_MS = 60 * 1000;

function getCacheKey(storeId) {
  return storeId ? `store:${Number(storeId)}` : 'all';
}

export async function repairStockTransferSaleabilityPrices(storeId = null, db = query) {
  const normalizedStoreId = Number(storeId || 0) || null;
  const cacheKey = getCacheKey(normalizedStoreId);
  const now = Date.now();
  const cache = globalForStockTransferSaleabilityRepair._stockTransferSaleabilityRepair || new Map();
  globalForStockTransferSaleabilityRepair._stockTransferSaleabilityRepair = cache;

  if ((cache.get(cacheKey) || 0) + REPAIR_TTL_MS > now) return { skipped: true };

  const runQuery = typeof db === 'function' ? db : db.query.bind(db);
  
  // 1. Update existing rows where the stock transfer is newer than updated_at
  await runQuery(
    `
      UPDATE product_saleability ps
      SET
        selling_price = CASE WHEN l.selling_price > 0 THEN l.selling_price ELSE ps.selling_price END,
        mrp = CASE WHEN l.mrp > 0 THEN l.mrp ELSE ps.mrp END,
        updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (sti.product_id, st.destination_id)
          sti.product_id,
          st.destination_id AS store_id,
          sti.selling_price,
          COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) AS mrp,
          COALESCE(st.confirmed_at, st.created_at) AS confirmed_at
        FROM stock_transfer st
        INNER JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
        WHERE st.status = 'confirmed'
          AND st.destination_id IS NOT NULL
          AND ($1::int IS NULL OR st.destination_id = $1::int)
          AND (
            COALESCE(sti.selling_price, 0) > 0
            OR COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
          )
        ORDER BY
          sti.product_id,
          st.destination_id,
          COALESCE(st.confirmed_at, st.created_at) DESC,
          sti.id DESC
      ) l
      WHERE ps.product_id = l.product_id
        and ps.store_id = l.store_id
        and l.confirmed_at >= ps.updated_at;
    `,
    [normalizedStoreId]
  );

  // 2. Insert new rows that do not exist yet
  const result = await runQuery(
    `
      INSERT INTO product_saleability (
        product_id, store_id, is_active, selling_price, mrp, low_stock_value, created_at, updated_at
      )
      SELECT
        l.product_id,
        l.store_id,
        true,
        COALESCE(l.selling_price, 0),
        COALESCE(l.mrp, 0),
        0,
        NOW(),
        NOW()
      FROM (
        SELECT DISTINCT ON (sti.product_id, st.destination_id)
          sti.product_id,
          st.destination_id AS store_id,
          sti.selling_price,
          COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) AS mrp
        FROM stock_transfer st
        INNER JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
        WHERE st.status = 'confirmed'
          AND st.destination_id IS NOT NULL
          AND ($1::int IS NULL OR st.destination_id = $1::int)
          AND (
            COALESCE(sti.selling_price, 0) > 0
            OR COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
          )
        ORDER BY
          sti.product_id,
          st.destination_id,
          COALESCE(st.confirmed_at, st.created_at) DESC,
          sti.id DESC
      ) l
      ON CONFLICT (product_id, store_id) DO NOTHING;
    `,
    [normalizedStoreId],
  );

  cache.set(cacheKey, now);
  return { repairedRows: result.rowCount };
}
