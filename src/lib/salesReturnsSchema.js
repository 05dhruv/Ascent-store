import { query } from '@/lib/db';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';

const globalForSalesReturns = globalThis;

export async function ensureSalesReturnsSchema() {
  if (!globalForSalesReturns._salesReturnsSchemaReadyPromise) {
    globalForSalesReturns._salesReturnsSchemaReadyPromise = (async () => {
      await ensureSalesBillingSchema();
      await ensureStockInSchema();

      await query(`
        CREATE TABLE IF NOT EXISTS sales_returns (
          id BIGSERIAL PRIMARY KEY,
          original_bill_id BIGINT REFERENCES sales_bills(id) ON DELETE SET NULL,
          return_type VARCHAR(30) NOT NULL DEFAULT 'return',
          reason TEXT,
          refund_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
          created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          rejected_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'pending',
          store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
          approved_at TIMESTAMPTZ,
          rejected_at TIMESTAMPTZ,
          rejection_reason TEXT,
          completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          completed_at TIMESTAMPTZ,
          refund_payment_mode VARCHAR(40),
          refund_reference VARCHAR(120),
          return_number VARCHAR(80),
          meta JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sales_return_items (
          id BIGSERIAL PRIMARY KEY,
          sales_return_id BIGINT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
          product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
          qty NUMERIC(14, 3) NOT NULL DEFAULT 1,
          original_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE sales_returns
          ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS rejected_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
          ADD COLUMN IF NOT EXISTS completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS refund_payment_mode VARCHAR(40),
          ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(120),
          ADD COLUMN IF NOT EXISTS return_number VARCHAR(80),
          ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        CREATE INDEX IF NOT EXISTS idx_sales_returns_status ON sales_returns(status);
        CREATE INDEX IF NOT EXISTS idx_sales_returns_store_status ON sales_returns(store_id, status);
        CREATE INDEX IF NOT EXISTS idx_sales_returns_created_at ON sales_returns(created_at DESC);
      `);
    })().catch((err) => {
      globalForSalesReturns._salesReturnsSchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForSalesReturns._salesReturnsSchemaReadyPromise;
}
