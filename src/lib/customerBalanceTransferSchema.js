import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureCustomerAdvancePaymentsSchema } from '@/lib/customerAdvancePaymentsSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';

const CREATE_CUSTOMER_BALANCE_TRANSFERS_SQL = `
  CREATE TABLE IF NOT EXISTS customer_balance_transfers (
    id BIGSERIAL PRIMARY KEY,
    from_customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    to_customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_id VARCHAR(120),
    remarks TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_customer_id <> to_customer_id)
  );

  ALTER TABLE customer_balance_transfers ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_customer_balance_transfers_from_customer_id
    ON customer_balance_transfers(from_customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_balance_transfers_to_customer_id
    ON customer_balance_transfers(to_customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_balance_transfers_transfer_date
    ON customer_balance_transfers(transfer_date);
`;

const globalForCustomerBalanceTransfers = globalThis;

export async function ensureCustomerBalanceTransferSchema() {
  if (!globalForCustomerBalanceTransfers._customerBalanceTransferSchemaReadyPromise) {
    globalForCustomerBalanceTransfers._customerBalanceTransferSchemaReadyPromise = (async () => {
      await ensureCustomersSchema();
      await ensureCustomerAdvancePaymentsSchema();
      await ensureStockInSchema();
      await query(CREATE_CUSTOMER_BALANCE_TRANSFERS_SQL);
    })().catch((err) => {
      globalForCustomerBalanceTransfers._customerBalanceTransferSchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForCustomerBalanceTransfers._customerBalanceTransferSchemaReadyPromise;
}

export default null;