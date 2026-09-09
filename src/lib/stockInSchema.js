import { query } from "@/lib/db";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";

// Bump this version when schema migrations change so hot-reload re-runs them
const SCHEMA_VERSION = 8;

export const ensureStockInSchema = makeSchemaEnsurer(
  "stock_in",
  SCHEMA_VERSION,
  async () => {
    await query(`
    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_in (
      id SERIAL PRIMARY KEY,
      transaction_id VARCHAR(50) UNIQUE,
      method VARCHAR(50) DEFAULT 'new',
      destination_id INTEGER REFERENCES stores(id),
      apply_taxes BOOLEAN DEFAULT true,
      add_products_prefill BOOLEAN DEFAULT false,
      status VARCHAR(20) DEFAULT 'draft',
      vendor_id INTEGER,
      vendor_name VARCHAR(255),
      invoice_date DATE,
      invoice_number VARCHAR(100),
      other_charges NUMERIC(14, 2) DEFAULT 0,
      remarks TEXT,
      total_items NUMERIC(14, 3) DEFAULT 0,
      total_cost NUMERIC(14, 2) DEFAULT 0,
      total_tax NUMERIC(14, 2) DEFAULT 0,
      reference_type VARCHAR(50),
      reference_id VARCHAR(100),
      created_by BIGINT,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS stock_in_items (
      id SERIAL PRIMARY KEY,
      stock_in_id INTEGER NOT NULL REFERENCES stock_in(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      product_name VARCHAR(255),
      qty NUMERIC(14, 3) NOT NULL DEFAULT 1,
      cost_price NUMERIC(18, 9) DEFAULT 0,
      tax_value NUMERIC(14, 2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

    // Migration v2: add FK constraint linking stock_in_items → products catalog
    // Wrapped in DO block so it is idempotent — skipped if constraint already exists.
    // Any orphaned rows (product_id not in products) are logged and cleaned up first
    // so the constraint can always be applied cleanly.
    await query(`
    ALTER TABLE stock_in
      ADD COLUMN IF NOT EXISTS vendor_id INTEGER,
      ADD COLUMN IF NOT EXISTS created_by BIGINT;
    CREATE INDEX IF NOT EXISTS idx_stock_in_vendor_id ON stock_in(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_stock_in_created_by ON stock_in(created_by);
  `);

    await query(`
    ALTER TABLE stock_in_items
      ADD COLUMN IF NOT EXISTS mrp NUMERIC(18, 9) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS selling_price NUMERIC(18, 9) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS batch_no VARCHAR(120),
      ADD COLUMN IF NOT EXISTS mfg_date DATE,
      ADD COLUMN IF NOT EXISTS expiry_date DATE,
      ADD COLUMN IF NOT EXISTS serial_number VARCHAR(120),
      ADD COLUMN IF NOT EXISTS scan_code VARCHAR(255),
      ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

    await query(`
    ALTER TABLE stock_in_items
      ALTER COLUMN cost_price TYPE NUMERIC(18, 9) USING cost_price::numeric,
      ALTER COLUMN mrp TYPE NUMERIC(18, 9) USING mrp::numeric,
      ALTER COLUMN selling_price TYPE NUMERIC(18, 9) USING selling_price::numeric;

    DO $$
    BEGIN
      IF to_regclass('products') IS NOT NULL THEN
        ALTER TABLE products
          ALTER COLUMN cost_price TYPE NUMERIC(18, 9) USING cost_price::numeric,
          ALTER COLUMN mrp TYPE NUMERIC(18, 9) USING mrp::numeric,
          ALTER COLUMN selling_price TYPE NUMERIC(18, 9) USING selling_price::numeric;

        CREATE INDEX IF NOT EXISTS idx_products_barcode_lower
          ON products (LOWER(TRIM(REGEXP_REPLACE(COALESCE(barcode, ''), '^''+', ''))));
        CREATE INDEX IF NOT EXISTS idx_products_sku_lower
          ON products (LOWER(TRIM(REGEXP_REPLACE(COALESCE(sku, ''), '^''+', ''))));
        CREATE INDEX IF NOT EXISTS idx_products_product_id_text_lower
          ON products (LOWER(TRIM(REGEXP_REPLACE(COALESCE(product_id::text, ''), '^''+', ''))));
        CREATE INDEX IF NOT EXISTS idx_products_active_brand_category
          ON products (COALESCE(is_active, TRUE), brand_id, category_id);
      END IF;
    END
    $$;
  `);

    await query(`
    CREATE INDEX IF NOT EXISTS idx_stock_in_status_destination_created
      ON stock_in(status, destination_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stock_in_confirmed_destination
      ON stock_in(destination_id, confirmed_at DESC)
      WHERE status = 'confirmed';
    CREATE INDEX IF NOT EXISTS idx_stock_in_items_stock_in_id
      ON stock_in_items(stock_in_id);
    CREATE INDEX IF NOT EXISTS idx_stock_in_items_product_id
      ON stock_in_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_in_items_product_expiry
      ON stock_in_items(product_id, expiry_date)
      WHERE expiry_date IS NOT NULL;
  `);

    await query(`
    DO $$
    BEGIN
      -- Remove any orphaned items whose product_id no longer exists in the catalog
      DELETE FROM stock_in_items
      WHERE product_id NOT IN (SELECT id FROM products);

      -- Add FK only if it doesn't already exist
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_stock_in_items_product'
          AND conrelid = 'stock_in_items'::regclass
      ) THEN
        ALTER TABLE stock_in_items
          ADD CONSTRAINT fk_stock_in_items_product
          FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE RESTRICT;
      END IF;
    END
    $$;
  `);
  },
);
