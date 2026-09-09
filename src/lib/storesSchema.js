import { query } from '@/lib/db';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

export const ensureStoresSchema = makeSchemaEnsurer('stores', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS stores (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address_line1 TEXT,
      address_line2 TEXT,
      city VARCHAR(120),
      state VARCHAR(120),
      pincode VARCHAR(20),
      country VARCHAR(80) DEFAULT 'India',
      manager_name VARCHAR(190),
      manager_mobile VARCHAR(40),
      manager_email VARCHAR(190),
      opening_time VARCHAR(40),
      closing_time VARCHAR(40),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS address_line1 TEXT,
      ADD COLUMN IF NOT EXISTS address_line2 TEXT,
      ADD COLUMN IF NOT EXISTS city VARCHAR(120),
      ADD COLUMN IF NOT EXISTS state VARCHAR(120),
      ADD COLUMN IF NOT EXISTS pincode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS country VARCHAR(80) DEFAULT 'India',
      ADD COLUMN IF NOT EXISTS manager_name VARCHAR(190),
      ADD COLUMN IF NOT EXISTS manager_mobile VARCHAR(40),
      ADD COLUMN IF NOT EXISTS manager_email VARCHAR(190),
      ADD COLUMN IF NOT EXISTS opening_time VARCHAR(40),
      ADD COLUMN IF NOT EXISTS closing_time VARCHAR(40),
      ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
});

export default null;
