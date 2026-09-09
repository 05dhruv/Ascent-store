import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';

let ensured = false;

export async function ensureCustomerGroupsSchema() {
  if (ensured) return;

  await ensureCustomersSchema();

  await query(`
    CREATE TABLE IF NOT EXISTS customer_groups (
      id BIGSERIAL PRIMARY KEY,
      group_name VARCHAR(190) NOT NULL,
      group_code VARCHAR(80) NOT NULL UNIQUE,
      description TEXT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      template_filename VARCHAR(255),
      template_uploaded_at TIMESTAMPTZ,
      total_customers INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'Active',
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_customer_groups_group_name ON customer_groups(group_name);
    CREATE INDEX IF NOT EXISTS idx_customer_groups_group_code ON customer_groups(group_code);

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_group_id BIGINT REFERENCES customer_groups(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_customers_customer_group_id ON customers(customer_group_id);
  `);

  await query(`
    INSERT INTO customer_groups (group_name, group_code, description, is_default, status)
    SELECT 'Default Customers', 'DEFAULT', 'Default customer group', TRUE, 'Active'
    WHERE NOT EXISTS (SELECT 1 FROM customer_groups)
  `);

  ensured = true;
}

export default null;
