import { query } from "@/lib/db";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";

const PURCHASE_ORDER_SCHEMA_VERSION = 1;

export const ensurePurchaseOrderSchema = makeSchemaEnsurer("purchase_order", PURCHASE_ORDER_SCHEMA_VERSION, async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      transaction_id VARCHAR(50) UNIQUE,
      destination_id INTEGER REFERENCES stores(id),
      vendor_id INTEGER REFERENCES vendors(id),
      invoice_date DATE,
      expected_delivery_date DATE,
      payment_due_date DATE,
      vendor_credit_days INTEGER,
      shipment_mode VARCHAR(100),
      invoice_number VARCHAR(100),
      cc_emails TEXT,
      status VARCHAR(20) DEFAULT 'draft',
      total_items NUMERIC(14, 3) DEFAULT 0,
      total_cost NUMERIC(14, 2) DEFAULT 0,
      total_tax NUMERIC(14, 2) DEFAULT 0,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      product_name VARCHAR(255),
      qty NUMERIC(14, 3) NOT NULL DEFAULT 1,
      cost_price NUMERIC(14, 2) DEFAULT 0,
      mrp NUMERIC(18, 9) DEFAULT 0,
      selling_price NUMERIC(18, 9) DEFAULT 0,
      expiry_date DATE,
      meta JSONB DEFAULT '{}'::jsonb,
      tax_value NUMERIC(14, 2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE purchase_orders
      ADD COLUMN IF NOT EXISTS payment_due_date DATE,
      ADD COLUMN IF NOT EXISTS vendor_credit_days INTEGER;

    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_due ON purchase_orders(payment_due_date, status);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_purchase_order_id ON purchase_order_items(purchase_order_id);

    ALTER TABLE purchase_order_items
      ADD COLUMN IF NOT EXISTS mrp NUMERIC(18, 9) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS selling_price NUMERIC(18, 9) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS expiry_date DATE,
      ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;
  `);
});
