import { query } from "@/lib/db";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";

const STOCK_TRANSFER_SCHEMA_VERSION = 3;

export const ensureStockTransferSchema = makeSchemaEnsurer(
  "stock_transfer",
  STOCK_TRANSFER_SCHEMA_VERSION,
  async () => {
    await query(`
    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_transfer (
      id SERIAL PRIMARY KEY,
      transaction_id VARCHAR(50) UNIQUE,
      request_key VARCHAR(120),
      source_id INTEGER REFERENCES stores(id),
      destination_id INTEGER REFERENCES stores(id),
      apply_taxes BOOLEAN DEFAULT true,
      status VARCHAR(20) DEFAULT 'draft',
      invoice_number VARCHAR(100),
      invoice_date DATE,
      other_charges NUMERIC(14, 2) DEFAULT 0,
      remarks TEXT,
      total_items NUMERIC(14, 3) DEFAULT 0,
      total_cost NUMERIC(14, 2) DEFAULT 0,
      total_tax NUMERIC(14, 2) DEFAULT 0,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      reverted_at TIMESTAMPTZ,
      reverted_by INTEGER
    );

    ALTER TABLE stock_transfer
      ADD COLUMN IF NOT EXISTS request_key VARCHAR(120),
      ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reverted_by INTEGER;

    -- Transfer CP can be fractional (for example 0.0635).  Two decimal
    -- storage rounded the line value while totals/batches retained the
    -- original value, which made preview and list totals disagree.
    ALTER TABLE stock_transfer
      ALTER COLUMN total_cost TYPE NUMERIC(18, 9) USING total_cost::NUMERIC;

    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id SERIAL PRIMARY KEY,
      stock_transfer_id INTEGER NOT NULL REFERENCES stock_transfer(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      product_name VARCHAR(255),
      sku VARCHAR(120),
      barcode VARCHAR(120),
      qty NUMERIC(14, 3) NOT NULL DEFAULT 1,
      cost_price NUMERIC(14, 2) DEFAULT 0,
      mrp NUMERIC(18, 9) DEFAULT 0,
      selling_price NUMERIC(18, 9) DEFAULT 0,
      destination_mrp NUMERIC(18, 9) DEFAULT 0,
      tax_value NUMERIC(14, 2) DEFAULT 0,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE stock_transfer_items
      ADD COLUMN IF NOT EXISTS sku VARCHAR(120),
      ADD COLUMN IF NOT EXISTS barcode VARCHAR(120),
      ADD COLUMN IF NOT EXISTS mrp NUMERIC(18, 9) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS selling_price NUMERIC(18, 9) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS destination_mrp NUMERIC(18, 9) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;

    ALTER TABLE stock_transfer_items
      ALTER COLUMN cost_price TYPE NUMERIC(18, 9) USING cost_price::NUMERIC;

    -- Repair historical rows where the exact source-batch CP was captured
    -- in meta.batchAllocations but cost_price was saved at two decimals.
    -- Only transfers that have recoverable allocation data are touched.
    WITH recovered AS (
      SELECT
        sti.id,
        sti.stock_transfer_id,
        (
          SELECT
            SUM((entry->>'qty')::NUMERIC * (entry->>'sourceCostPrice')::NUMERIC)
            / NULLIF(SUM((entry->>'qty')::NUMERIC), 0)
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(sti.meta->'batchAllocations') = 'array'
                THEN sti.meta->'batchAllocations'
              ELSE '[]'::jsonb
            END
          ) AS entry
          WHERE COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$'
            AND COALESCE(entry->>'sourceCostPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        ) AS exact_cost_price
      FROM stock_transfer_items sti
    ),
    updated_items AS (
      UPDATE stock_transfer_items sti
      SET cost_price = recovered.exact_cost_price
      FROM recovered
      WHERE sti.id = recovered.id
        AND recovered.exact_cost_price IS NOT NULL
        AND ABS(COALESCE(sti.cost_price, 0) - recovered.exact_cost_price) > 0.000000001
      RETURNING sti.stock_transfer_id
    ),
    affected_transfers AS (
      SELECT DISTINCT stock_transfer_id FROM updated_items
    ),
    recalculated_totals AS (
      SELECT
        affected_transfers.stock_transfer_id,
        COALESCE(SUM(sti.qty * sti.cost_price), 0) AS item_cost
      FROM affected_transfers
      JOIN stock_transfer_items sti ON sti.stock_transfer_id = affected_transfers.stock_transfer_id
      GROUP BY affected_transfers.stock_transfer_id
    )
    UPDATE stock_transfer st
    SET total_cost = recalculated_totals.item_cost + COALESCE(st.other_charges, 0)
    FROM recalculated_totals
    WHERE st.id = recalculated_totals.stock_transfer_id;

    CREATE INDEX IF NOT EXISTS idx_stock_transfer_status ON stock_transfer(status);
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_confirmed_status
      ON stock_transfer(status, confirmed_at DESC, destination_id);
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_source_status
      ON stock_transfer(source_id, status, confirmed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_destination_status
      ON stock_transfer(destination_id, status, confirmed_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_request_key
      ON stock_transfer(request_key) WHERE request_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer_id ON stock_transfer_items(stock_transfer_id);
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product_id ON stock_transfer_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_barcode ON stock_transfer_items(barcode);
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_sku ON stock_transfer_items(sku);
  `);
  },
);
