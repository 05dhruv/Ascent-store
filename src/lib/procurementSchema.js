import { query } from '@/lib/db';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensureVendorsSchema } from '@/lib/vendorsSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

const PROCUREMENT_SCHEMA_VERSION = 1;

export const ensureProcurementSchema = makeSchemaEnsurer('procurement', PROCUREMENT_SCHEMA_VERSION, async () => {
  await Promise.all([
    ensureVendorsSchema(),
    ensurePurchaseOrderSchema(),
    ensureStockInSchema(),
    ensureInventoryBatchSchema(),
  ]);

  await query(`
    CREATE TABLE IF NOT EXISTS vendor_quotations (
      id BIGSERIAL PRIMARY KEY,
      transaction_id VARCHAR(60) UNIQUE,
      vendor_id BIGINT REFERENCES vendors(id) ON DELETE SET NULL,
      store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
      quotation_no VARCHAR(120),
      quotation_date DATE DEFAULT CURRENT_DATE,
      valid_until DATE,
      delivery_days INTEGER DEFAULT 0,
      freight_amount NUMERIC(14, 2) DEFAULT 0,
      payment_terms TEXT,
      status VARCHAR(30) DEFAULT 'Draft',
      remarks TEXT,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vendor_quotation_items (
      id BIGSERIAL PRIMARY KEY,
      quotation_id BIGINT NOT NULL REFERENCES vendor_quotations(id) ON DELETE CASCADE,
      product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(255),
      qty NUMERIC(14, 3) DEFAULT 1,
      quoted_price NUMERIC(14, 2) DEFAULT 0,
      tax_value NUMERIC(14, 2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id BIGSERIAL PRIMARY KEY,
      transaction_id VARCHAR(60) UNIQUE,
      vendor_id BIGINT REFERENCES vendors(id) ON DELETE SET NULL,
      store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
      stock_in_id BIGINT,
      purchase_order_id BIGINT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      return_date DATE DEFAULT CURRENT_DATE,
      reason TEXT,
      status VARCHAR(30) DEFAULT 'Draft',
      total_qty NUMERIC(14, 3) DEFAULT 0,
      total_amount NUMERIC(14, 2) DEFAULT 0,
      created_by VARCHAR(255),
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id BIGSERIAL PRIMARY KEY,
      purchase_return_id BIGINT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
      product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(255),
      qty NUMERIC(14, 3) DEFAULT 0,
      cost_price NUMERIC(14, 2) DEFAULT 0,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customer_demands (
      id BIGSERIAL PRIMARY KEY,
      transaction_id VARCHAR(60) UNIQUE,
      store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(255) NOT NULL,
      sku VARCHAR(120),
      barcode VARCHAR(120),
      requested_qty NUMERIC(14, 3) NOT NULL DEFAULT 1,
      customer_name VARCHAR(255),
      customer_mobile VARCHAR(30),
      remarks TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_vendor_quotations_vendor ON vendor_quotations(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_quotations_store ON vendor_quotations(store_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_quotation_items_quote ON vendor_quotation_items(quotation_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_returns_vendor ON purchase_returns(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_returns_store ON purchase_returns(store_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(purchase_return_id);
    CREATE INDEX IF NOT EXISTS idx_customer_demands_store_status ON customer_demands(store_id, status);
    CREATE INDEX IF NOT EXISTS idx_customer_demands_product ON customer_demands(product_id);
  `);

});
