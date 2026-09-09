import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';

const CREATE_CUSTOMER_MESSAGE_HISTORY_SQL = `
  CREATE TABLE IF NOT EXISTS customer_message_history (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
    customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    order_id VARCHAR(80),
    mobile_number VARCHAR(50),
    message_type VARCHAR(30) NOT NULL DEFAULT 'SMS',
    message_text TEXT NOT NULL,
    credits_used NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'Sent',
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_message_history_store_id ON customer_message_history(store_id);
  CREATE INDEX IF NOT EXISTS idx_customer_message_history_customer_id ON customer_message_history(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_message_history_sent_at ON customer_message_history(sent_at);
  CREATE INDEX IF NOT EXISTS idx_customer_message_history_message_type ON customer_message_history(message_type);
`;

const globalForCustomerMessageHistory = globalThis;

export async function ensureCustomerMessageHistorySchema() {
  if (!globalForCustomerMessageHistory._customerMessageHistorySchemaReadyPromise) {
    globalForCustomerMessageHistory._customerMessageHistorySchemaReadyPromise = (async () => {
      await ensureCustomersSchema();
      await ensureStockInSchema();
      await query(CREATE_CUSTOMER_MESSAGE_HISTORY_SQL);
    })().catch((err) => {
      globalForCustomerMessageHistory._customerMessageHistorySchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForCustomerMessageHistory._customerMessageHistorySchemaReadyPromise;
}

export default null;