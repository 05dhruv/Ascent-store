import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';

const CREATE_CUSTOMER_ADVANCE_PAYMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS customer_advance_payments (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    used_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    balance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    payment_mode VARCHAR(50) NOT NULL DEFAULT 'Cash',
    reference_id VARCHAR(120),
    remarks TEXT,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_advance_payments_customer_id
    ON customer_advance_payments(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_advance_payments_store_id
    ON customer_advance_payments(store_id);
  CREATE INDEX IF NOT EXISTS idx_customer_advance_payments_payment_date
    ON customer_advance_payments(payment_date);
`;

const globalForCustomerAdvancePayments = globalThis;

export async function ensureCustomerAdvancePaymentsSchema() {
  if (!globalForCustomerAdvancePayments._customerAdvancePaymentsSchemaReadyPromise) {
    globalForCustomerAdvancePayments._customerAdvancePaymentsSchemaReadyPromise = (async () => {
      await ensureCustomersSchema();
      await ensureStockInSchema();
      await query(CREATE_CUSTOMER_ADVANCE_PAYMENTS_SQL);
    })().catch((err) => {
      globalForCustomerAdvancePayments._customerAdvancePaymentsSchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForCustomerAdvancePayments._customerAdvancePaymentsSchemaReadyPromise;
}

export default null;