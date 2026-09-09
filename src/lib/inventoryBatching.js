import { query } from "@/lib/db";
import { toDateInputValue } from "@/lib/dateUtils";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";
import { assertValidPrices } from "@/lib/priceIntegrity";

const BATCH_SCHEMA_VERSION = 8;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value) {
  return toDateInputValue(value) || null;
}

function normalizeBatchMeta(meta = {}, costPrice = 0) {
  const normalized = { ...(meta || {}) };
  const cost = toNumber(normalized.costPrice, toNumber(costPrice));
  const mrp = toNumber(normalized.mrp);
  const sellingPrice = toNumber(normalized.sellingPrice);

  normalized.costPrice = cost;
  if (mrp > 0) normalized.mrp = mrp;
  if (sellingPrice > 0) normalized.sellingPrice = sellingPrice;

  return normalized;
}

async function addProductUnitSnapshot(client, productId, meta = {}) {
  if (meta?.unit) return meta;

  const productRes = await client.query(
    `SELECT unit FROM products WHERE id = $1 LIMIT 1`,
    [Number(productId)],
  );
  const unit = String(productRes.rows[0]?.unit || "")
    .trim()
    .toUpperCase();

  return unit ? { ...meta, unit } : meta;
}

function buildBatchNumber({
  stockInId,
  stockInItemId = null,
  productId,
  batchNo,
}) {
  const clean = String(batchNo || "").trim();
  const sourceId = stockInItemId || stockInId;
  return clean || `AUTO-${stockInId}-${productId}-${sourceId}`;
}

export const ensureInventoryBatchSchema = makeSchemaEnsurer(
  "inventory_batching",
  BATCH_SCHEMA_VERSION,
  async () => {
    await query(`
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      batch_no VARCHAR(120) NOT NULL,
      mfg_date DATE,
      expiry_date DATE,
      received_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
      available_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
      cost_price NUMERIC(18, 9) NOT NULL DEFAULT 0,
      source_type VARCHAR(60),
      source_id VARCHAR(120),
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC(14,3) NOT NULL DEFAULT 0;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reserved_within_available') THEN
        ALTER TABLE inventory_batches ADD CONSTRAINT inventory_reserved_within_available
          CHECK (reserved_qty >= 0 AND available_qty >= reserved_qty) NOT VALID;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS inventory_batch_movements (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT REFERENCES inventory_batches(id) ON DELETE SET NULL,
      product_id BIGINT NOT NULL,
      store_id BIGINT NOT NULL,
      direction VARCHAR(20) NOT NULL,
      qty NUMERIC(14, 3) NOT NULL,
      reference_type VARCHAR(60),
      reference_id VARCHAR(120),
      source_item_id BIGINT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$
    BEGIN
      IF to_regclass('stock_in_items') IS NOT NULL THEN
        ALTER TABLE stock_in_items
          ADD COLUMN IF NOT EXISTS batch_no VARCHAR(120),
          ADD COLUMN IF NOT EXISTS mfg_date DATE,
          ADD COLUMN IF NOT EXISTS expiry_date DATE;
      END IF;

      IF to_regclass('stock_out_items') IS NOT NULL THEN
        ALTER TABLE stock_out_items
          ADD COLUMN IF NOT EXISTS batch_id BIGINT REFERENCES inventory_batches(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS batch_no VARCHAR(120),
          ADD COLUMN IF NOT EXISTS expiry_date DATE;
      END IF;
    END
    $$;

    DO $$
    BEGIN
      IF to_regclass('sales_bill_items') IS NOT NULL THEN
        ALTER TABLE sales_bill_items
          ADD COLUMN IF NOT EXISTS batch_allocations JSONB NOT NULL DEFAULT '[]'::jsonb;
      END IF;
    END
    $$;

    CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_store
      ON inventory_batches(product_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_batches_store_status_available
      ON inventory_batches(store_id, status, available_qty);
    CREATE INDEX IF NOT EXISTS idx_inventory_batches_source
      ON inventory_batches(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_batches_active_store_product_expiry
      ON inventory_batches(store_id, product_id, expiry_date, created_at)
      WHERE status = 'active' AND available_qty > 0;
    CREATE INDEX IF NOT EXISTS idx_inventory_batches_fefo
      ON inventory_batches(product_id, store_id, expiry_date, created_at)
      WHERE status = 'active' AND available_qty > 0;
    CREATE INDEX IF NOT EXISTS idx_inventory_batch_movements_ref
      ON inventory_batch_movements(reference_type, reference_id);

    ALTER TABLE inventory_batches
      ALTER COLUMN cost_price TYPE NUMERIC(18, 9) USING cost_price::numeric;

    DO $$
    BEGIN
      IF to_regclass('sales_bill_items') IS NOT NULL AND to_regclass('sales_bills') IS NOT NULL THEN
        INSERT INTO inventory_batches (
          product_id, store_id, batch_no, received_qty, available_qty,
          cost_price, source_type, source_id, meta, created_at, updated_at
        )
        SELECT
          legacy.product_id,
          legacy.store_id,
          'LEGACY-' || legacy.product_id || '-' || legacy.store_id,
          legacy.available_qty,
          legacy.available_qty,
          COALESCE(p.cost_price, 0),
          'legacy_migration',
          legacy.product_id || ':' || legacy.store_id,
          '{"migrated": true}'::jsonb,
          NOW(),
          NOW()
        FROM (
          SELECT
            base.product_id,
            base.store_id,
            GREATEST(
              COALESCE(base.stock_in_qty, 0)
              - COALESCE(sales.qty, 0)
              - COALESCE(stock_out.qty, 0),
              0
            ) AS available_qty
          FROM (
            SELECT sii.product_id, si.destination_id AS store_id, SUM(sii.qty) AS stock_in_qty
            FROM stock_in_items sii
            INNER JOIN stock_in si ON si.id = sii.stock_in_id
            WHERE si.status = 'confirmed' AND si.destination_id IS NOT NULL
            GROUP BY sii.product_id, si.destination_id
          ) base
          LEFT JOIN (
            SELECT sbi.product_id, sb.store_id, SUM(sbi.qty) AS qty
            FROM sales_bill_items sbi
            INNER JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
            WHERE sb.status IN ('paid', 'completed') AND sb.store_id IS NOT NULL
            GROUP BY sbi.product_id, sb.store_id
          ) sales ON sales.product_id = base.product_id AND sales.store_id = base.store_id
          LEFT JOIN (
            SELECT soi.product_id, so.destination_id AS store_id, SUM(soi.qty) AS qty
            FROM stock_out_items soi
            INNER JOIN stock_out so ON so.id = soi.stock_out_id
            WHERE so.status = 'confirmed'
              AND so.destination_id IS NOT NULL
              AND COALESCE(so.reference_type, '') <> 'sales_bill'
            GROUP BY soi.product_id, so.destination_id
          ) stock_out ON stock_out.product_id = base.product_id AND stock_out.store_id = base.store_id
        ) legacy
        LEFT JOIN products p ON p.id = legacy.product_id
        WHERE legacy.available_qty > 0
          AND NOT EXISTS (
            SELECT 1 FROM inventory_batches ib
            WHERE ib.product_id = legacy.product_id AND ib.store_id = legacy.store_id
          );
      END IF;
    END
    $$;

    UPDATE inventory_batches destination
    SET mfg_date = source.mfg_date,
        expiry_date = source.expiry_date,
        updated_at = NOW()
    FROM inventory_batches source
    WHERE destination.meta ? 'sourceBatchId'
      AND source.id = CASE
        WHEN NULLIF(destination.meta->>'sourceBatchId', '') ~ '^[0-9]+$'
          THEN NULLIF(destination.meta->>'sourceBatchId', '')::BIGINT
        ELSE NULL
      END
      AND (
        destination.mfg_date IS DISTINCT FROM source.mfg_date
        OR destination.expiry_date IS DISTINCT FROM source.expiry_date
      );

    UPDATE inventory_batches ib
    SET meta = COALESCE(ib.meta, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'costPrice', CASE WHEN COALESCE(sii.cost_price, 0) > 0 THEN sii.cost_price ELSE NULL END,
          'mrp', CASE WHEN COALESCE(sii.mrp, 0) > 0 THEN sii.mrp ELSE NULL END,
          'sellingPrice', CASE WHEN COALESCE(sii.selling_price, 0) > 0 THEN sii.selling_price ELSE NULL END
        )),
        cost_price = CASE
          WHEN COALESCE(sii.cost_price, 0) > 0 THEN sii.cost_price
          ELSE ib.cost_price
        END,
        updated_at = NOW()
    FROM stock_in_items sii
    WHERE ib.source_type = 'stock_in'
      AND sii.id = CASE
        WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
          THEN NULLIF(ib.source_id, '')::BIGINT
        ELSE NULL
      END
      AND (
        COALESCE(sii.cost_price, 0) > 0
        OR COALESCE(sii.mrp, 0) > 0
        OR COALESCE(sii.selling_price, 0) > 0
      );

    -- Older transfer receipts were incorrectly marked as stock_in. Their
    -- source_id could therefore collide with an unrelated stock_in_items.id,
    -- causing the stock-in repair above to copy the wrong unit cost.
    DO $$
    BEGIN
      IF to_regclass('stock_transfer_items') IS NOT NULL THEN
        UPDATE inventory_batches ib
        SET source_type = 'stock_transfer',
        cost_price = COALESCE(
          NULLIF(sti.cost_price, 0),
          CASE WHEN COALESCE(ib.meta->>'costPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (ib.meta->>'costPrice')::numeric ELSE NULL END,
          ib.cost_price,
          0
        ),
        meta = COALESCE(ib.meta, '{}'::jsonb) || jsonb_build_object(
          'costPrice', COALESCE(
            NULLIF(sti.cost_price, 0),
            CASE WHEN COALESCE(ib.meta->>'costPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
              THEN (ib.meta->>'costPrice')::numeric ELSE NULL END,
            ib.cost_price,
            0
          )
        ),
        updated_at = NOW()
        FROM stock_transfer_items sti
        WHERE ib.meta->>'source' IN ('stock_transfer', 'stock_requisition_transfer', 'stock_transfer_revert')
          AND sti.id = CASE
            WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
              THEN NULLIF(ib.source_id, '')::BIGINT
            ELSE NULL
          END;
      END IF;
    END
    $$;

    WITH legacy_expiry AS (
      SELECT
        ib.id,
        COALESCE(
          MIN(sii.expiry_date) FILTER (WHERE sii.expiry_date >= CURRENT_DATE),
          MIN(sii.expiry_date)
        ) AS expiry_date
      FROM inventory_batches ib
      INNER JOIN stock_in si
        ON si.destination_id = ib.store_id
       AND si.status = 'confirmed'
      INNER JOIN stock_in_items sii
        ON sii.stock_in_id = si.id
       AND sii.product_id = ib.product_id
       AND sii.expiry_date IS NOT NULL
      WHERE ib.source_type = 'legacy_migration'
        AND ib.expiry_date IS NULL
        AND ib.available_qty > 0
      GROUP BY ib.id
    )
    UPDATE inventory_batches ib
    SET expiry_date = legacy_expiry.expiry_date,
        updated_at = NOW()
    FROM legacy_expiry
    WHERE ib.id = legacy_expiry.id
      AND ib.expiry_date IS NULL;

    -- Transfer-created batches must retain the exact price assigned on the
    -- transfer item. Repair active destination batches whose metadata was
    -- copied from a stale product/store price.
    DO $$
    BEGIN
      IF to_regclass('stock_transfer_items') IS NOT NULL
         AND to_regclass('stock_transfer') IS NOT NULL THEN
        UPDATE inventory_batches ib
        SET cost_price = CASE
              WHEN COALESCE(sti.cost_price, 0) > 0 THEN sti.cost_price
              ELSE ib.cost_price
            END,
            meta = COALESCE(ib.meta, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
              'costPrice', CASE WHEN COALESCE(sti.cost_price, 0) > 0 THEN sti.cost_price ELSE NULL END,
              'mrp', CASE WHEN COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
                          THEN COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp) ELSE NULL END,
              'sellingPrice', CASE WHEN COALESCE(sti.selling_price, 0) > 0 THEN sti.selling_price ELSE NULL END
            )),
            updated_at = NOW()
        FROM stock_transfer_items sti
        INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
        WHERE ib.source_type = 'stock_transfer'
          AND sti.id = CASE
            WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
              THEN NULLIF(ib.source_id, '')::BIGINT
            ELSE NULL
          END
          AND st.status = 'confirmed'
          AND ib.status = 'active'
          AND ib.available_qty > 0
          AND (
            COALESCE(sti.cost_price, 0) > 0
            OR COALESCE(sti.selling_price, 0) > 0
            OR COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
          );
      END IF;
    END
    $$;
  `);
  },
);

export async function receiveBatchStock(
  client,
  {
    stockInId,
    stockInItemId = null,
    productId,
    storeId,
    qty,
    costPrice = 0,
    batchNo = "",
    mfgDate = null,
    expiryDate = null,
    sourceType = "stock_in",
    movementReferenceType = null,
    meta = {},
  },
) {
  await ensureInventoryBatchSchema();

  const quantity = toNumber(qty);
  if (!productId || !storeId || quantity <= 0) return null;

  const normalizedBatchNo = buildBatchNumber({
    stockInId,
    stockInItemId,
    productId,
    batchNo,
  });
  const normalizedMfgDate = normalizeDate(mfgDate);
  const normalizedExpiryDate = normalizeDate(expiryDate);
  const metaWithUnit = await addProductUnitSnapshot(client, productId, meta);
  const normalizedMeta = normalizeBatchMeta(metaWithUnit, costPrice);
  assertValidPrices(
    {
      mrp: normalizedMeta.mrp,
      sellingPrice: normalizedMeta.sellingPrice,
      costPrice: normalizedMeta.costPrice,
    },
    "Batch price",
  );

  const batchRes = await client.query(
    `INSERT INTO inventory_batches (
       product_id, store_id, batch_no, mfg_date, expiry_date,
       received_qty, available_qty, cost_price, source_type, source_id, meta,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $6, $7, $10, $8, $9::jsonb,
       NOW(), NOW()
     )
     RETURNING *`,
    [
      Number(productId),
      Number(storeId),
      normalizedBatchNo,
      normalizedMfgDate,
      normalizedExpiryDate,
      quantity,
      toNumber(costPrice),
      String(stockInItemId || stockInId),
      JSON.stringify(normalizedMeta),
      String(sourceType || "stock_in"),
    ],
  );

  const batch = batchRes.rows[0];
  await client.query(
    `INSERT INTO inventory_batch_movements (
       batch_id, product_id, store_id, direction, qty, reference_type, reference_id, source_item_id, meta
     ) VALUES ($1, $2, $3, 'in', $4, $8, $5, $6, $7::jsonb)`,
    [
      batch.id,
      Number(productId),
      Number(storeId),
      quantity,
      String(stockInId),
      stockInItemId,
      JSON.stringify(normalizedMeta),
      String(movementReferenceType || sourceType || "stock_in"),
    ],
  );

  return batch;
}

export async function restoreBatchStock(
  client,
  {
    batchId,
    productId,
    storeId,
    qty,
    referenceType = "sales_return",
    referenceId = null,
    sourceItemId = null,
    meta = {},
  },
) {
  await ensureInventoryBatchSchema();

  const quantity = toNumber(qty);
  const normalizedBatchId = Number(batchId);
  if (!normalizedBatchId || !productId || !storeId || quantity <= 0)
    return null;
  const normalizedMeta = normalizeBatchMeta(meta);

  const batchRes = await client.query(
    `UPDATE inventory_batches
     SET available_qty = available_qty + $1,
         updated_at = NOW()
     WHERE id = $2
       AND product_id = $3
       AND store_id = $4
     RETURNING *`,
    [quantity, normalizedBatchId, Number(productId), Number(storeId)],
  );

  const batch = batchRes.rows[0];
  if (!batch) return null;

  await client.query(
    `INSERT INTO inventory_batch_movements (
       batch_id, product_id, store_id, direction, qty, reference_type, reference_id, source_item_id, meta
     ) VALUES ($1, $2, $3, 'in', $4, $5, $6, $7, $8::jsonb)`,
    [
      batch.id,
      Number(productId),
      Number(storeId),
      quantity,
      referenceType,
      referenceId ? String(referenceId) : null,
      sourceItemId,
      JSON.stringify(normalizedMeta),
    ],
  );

  return batch;
}

export async function allocateBatchStock(
  client,
  {
    productId,
    storeId,
    qty,
    preferredBatchId = null,
    allowedBatchIds = [],
    strategy = "FEFO",
    referenceType = "stock_out",
    referenceId = null,
    sourceItemId = null,
    allowExpired = false,
    meta = {},
  },
) {
  await ensureInventoryBatchSchema();

  const requiredQty = toNumber(qty);
  if (!productId || !storeId || requiredQty <= 0) return [];

  const mode =
    String(strategy || "FEFO").toUpperCase() === "FIFO" ? "FIFO" : "FEFO";
  const expiryGuard = allowExpired
    ? ""
    : "AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)";
  const preferredId = Number(preferredBatchId);
  const hasPreferredBatch = Number.isFinite(preferredId) && preferredId > 0;
  const allowedIds = (Array.isArray(allowedBatchIds) ? allowedBatchIds : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0);
  const hasAllowedBatches = !hasPreferredBatch && allowedIds.length > 0;
  const batchGuard = hasPreferredBatch
    ? "AND ib.id = $3"
    : hasAllowedBatches
      ? "AND ib.id = ANY($3::bigint[])"
      : "";
  const orderBy =
    mode === "FIFO"
      ? "ib.created_at ASC, ib.id ASC"
      : "CASE WHEN ib.expiry_date IS NULL THEN 1 ELSE 0 END ASC, ib.expiry_date ASC, ib.created_at ASC, ib.id ASC";

  const params = hasPreferredBatch
    ? [Number(productId), Number(storeId), preferredId]
    : hasAllowedBatches
      ? [Number(productId), Number(storeId), allowedIds]
      : [Number(productId), Number(storeId)];

  const batchRes = await client.query(
    `SELECT ib.id, ib.product_id, ib.store_id, ib.batch_no, ib.mfg_date, ib.expiry_date,
            (ib.available_qty - ib.reserved_qty) AS available_qty, ib.cost_price, ib.meta,
            sii.mrp AS source_mrp,
            sii.selling_price AS source_selling_price,
            sii.cost_price AS source_cost_price,
            sti.destination_mrp AS transfer_destination_mrp,
            sti.mrp AS transfer_mrp,
            sti.selling_price AS transfer_selling_price,
            sti.cost_price AS transfer_cost_price
     FROM inventory_batches ib
     LEFT JOIN stock_in_items sii
       ON ib.source_type = 'stock_in'
      AND sii.id = CASE
        WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
          THEN NULLIF(ib.source_id, '')::BIGINT
        ELSE NULL
      END
     LEFT JOIN stock_transfer_items sti
       ON ib.source_type = 'stock_transfer'
      AND sti.id = CASE
        WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
          THEN NULLIF(ib.source_id, '')::BIGINT
        ELSE NULL
      END
     WHERE ib.product_id = $1
       AND ib.store_id = $2
       AND ib.status = 'active'
       AND ib.available_qty > 0
       ${expiryGuard}
       ${batchGuard}
     ORDER BY ${orderBy}
     FOR UPDATE OF ib`,
    params,
  );

  let remaining = requiredQty;
  const allocations = [];

  for (const batch of batchRes.rows) {
    if (remaining <= 0) break;
    const available = toNumber(batch.available_qty);
    const usedQty = Math.min(available, remaining);
    if (usedQty <= 0) continue;

    await client.query(
    `UPDATE inventory_batches
     SET available_qty = available_qty - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [usedQty, batch.id],
    );

    await client.query(
      `INSERT INTO inventory_batch_movements (
         batch_id, product_id, store_id, direction, qty, reference_type, reference_id, source_item_id, meta
       ) VALUES ($1, $2, $3, 'out', $4, $5, $6, $7, $8::jsonb)`,
      [
        batch.id,
        Number(productId),
        Number(storeId),
        usedQty,
        referenceType,
        referenceId ? String(referenceId) : null,
        sourceItemId,
        JSON.stringify({ ...meta, strategy: mode }),
      ],
    );

    allocations.push({
      batchId: Number(batch.id),
      batchNo: batch.batch_no,
      mfgDate: normalizeDate(batch.mfg_date),
      expiryDate: normalizeDate(batch.expiry_date),
      qty: usedQty,
      costPrice: toNumber(
        batch.meta?.costPrice,
        toNumber(batch.transfer_cost_price, toNumber(batch.source_cost_price, toNumber(batch.cost_price))),
      ),
      mrp: toNumber(batch.meta?.mrp, toNumber(batch.transfer_destination_mrp, toNumber(batch.transfer_mrp, toNumber(batch.source_mrp)))),
      sellingPrice: toNumber(
        batch.meta?.sellingPrice,
        toNumber(batch.transfer_selling_price, toNumber(batch.source_selling_price)),
      ),
      strategy: mode,
    });
    remaining = Math.round((remaining - usedQty) * 1000) / 1000;
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient batch stock for product ${productId}. Short by ${remaining}`,
    );
  }

  return allocations;
}

export function getInventoryIssueStrategy(value) {
  const normalized = String(
    value || process.env.INVENTORY_ISSUE_STRATEGY || "FEFO",
  ).toUpperCase();
  return normalized === "FIFO" ? "FIFO" : "FEFO";
}
