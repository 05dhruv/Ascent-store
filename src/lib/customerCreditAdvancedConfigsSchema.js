import { query } from '@/lib/db';

let ensured = false;

export async function ensureCustomerCreditAdvancedConfigsSchema() {
  if (ensured) return;

  await query(`
    CREATE TABLE IF NOT EXISTS customer_credit_advanced_configs (
      id BIGSERIAL PRIMARY KEY,
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
      region_name VARCHAR(190),
      customer_group VARCHAR(190),
      start_date DATE,
      end_date DATE,
      credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'Active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(customer_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ccac_customer_id ON customer_credit_advanced_configs(customer_id);
    CREATE INDEX IF NOT EXISTS idx_ccac_store_id ON customer_credit_advanced_configs(store_id);
    CREATE INDEX IF NOT EXISTS idx_ccac_status ON customer_credit_advanced_configs(status);
  `);

  ensured = true;
}

export default null;
