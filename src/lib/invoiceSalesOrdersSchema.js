import { query } from '@/lib/db';
import { ensureUsersTable } from '@/lib/userAuth';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';

const CREATE_INVOICE_SALES_ORDERS_SQL = `
  CREATE TABLE IF NOT EXISTS invoice_sales_orders (
    id BIGSERIAL PRIMARY KEY,
    transaction_id VARCHAR(50) UNIQUE,
    sales_order_id VARCHAR(50) NOT NULL,
    sales_order_type VARCHAR(50),
    booking_id VARCHAR(50) NOT NULL,
    booking_date DATE,
    billing_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    billing_username VARCHAR(255),
    sales_bill_id BIGINT REFERENCES sales_bills(id) ON DELETE SET NULL,
    customer_name VARCHAR(190),
    customer_mobile VARCHAR(40),
    payment_mode VARCHAR(40),
    created_by VARCHAR(255),
    submitted_date DATE,
    approver VARCHAR(255),
    gross_bill NUMERIC(14, 2) NOT NULL DEFAULT 0,
    additional_charge_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    tds_rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
    tds_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    tcs_rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
    tcs_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    quotation_id VARCHAR(50),
    invoice_id VARCHAR(50) UNIQUE,
    invoice_date DATE,
    auto_invoice_id VARCHAR(50),
    auto_invoice_date DATE,
    write_off_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    write_off_reason TEXT,
    written_off_by VARCHAR(255),
    written_off_date DATE,
    converted_by VARCHAR(255),
    converted_at TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending',
    channel VARCHAR(50),
    store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS sales_order_type VARCHAR(50);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS sales_bill_id BIGINT REFERENCES sales_bills(id) ON DELETE SET NULL;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(190);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS customer_mobile VARCHAR(40);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(40);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS submitted_date DATE;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS approver VARCHAR(255);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS additional_charge_value NUMERIC(14, 2) NOT NULL DEFAULT 0;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS tds_rate NUMERIC(10, 2) NOT NULL DEFAULT 0;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS tds_value NUMERIC(14, 2) NOT NULL DEFAULT 0;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS tcs_rate NUMERIC(10, 2) NOT NULL DEFAULT 0;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS tcs_value NUMERIC(14, 2) NOT NULL DEFAULT 0;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS quotation_id VARCHAR(50);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS auto_invoice_id VARCHAR(50);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS auto_invoice_date DATE;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS write_off_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS write_off_reason TEXT;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS written_off_by VARCHAR(255);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS written_off_date DATE;
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS converted_by VARCHAR(255);
  ALTER TABLE invoice_sales_orders ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
  ALTER TABLE invoice_sales_orders ALTER COLUMN invoice_id DROP NOT NULL;
  ALTER TABLE invoice_sales_orders ALTER COLUMN invoice_date DROP NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_invoice_sales_orders_invoice_date ON invoice_sales_orders(invoice_date);
  CREATE INDEX IF NOT EXISTS idx_invoice_sales_orders_booking_date ON invoice_sales_orders(booking_date);
  CREATE INDEX IF NOT EXISTS idx_invoice_sales_orders_sales_order_id ON invoice_sales_orders(sales_order_id);
  CREATE INDEX IF NOT EXISTS idx_invoice_sales_orders_invoice_id ON invoice_sales_orders(invoice_id);
  CREATE INDEX IF NOT EXISTS idx_invoice_sales_orders_status ON invoice_sales_orders(status);
  CREATE INDEX IF NOT EXISTS idx_invoice_sales_orders_sales_bill_id ON invoice_sales_orders(sales_bill_id);
`;

const globalForInvoiceSalesOrders = globalThis;

export async function ensureInvoiceSalesOrdersSchema() {
  if (!globalForInvoiceSalesOrders._invoiceSalesOrdersSchemaReadyPromise) {
    globalForInvoiceSalesOrders._invoiceSalesOrdersSchemaReadyPromise = (async () => {
      await ensureUsersTable();
      await ensureStockInSchema();
      await ensureSalesBillingSchema();
      await query(CREATE_INVOICE_SALES_ORDERS_SQL);
    })().catch((err) => {
      globalForInvoiceSalesOrders._invoiceSalesOrdersSchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForInvoiceSalesOrders._invoiceSalesOrdersSchemaReadyPromise;
}
