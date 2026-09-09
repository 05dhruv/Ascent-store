import { query } from '@/lib/db';
import { ensureStoresSchema } from '@/lib/storesSchema';

let ensured = false;

export async function ensureRegionsSchema() {
  if (ensured) return;

  await ensureStoresSchema();

  await query(`
    CREATE TABLE IF NOT EXISTS regions (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(190) NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS region_store_mappings (
      region_id BIGINT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
      store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (region_id, store_id)
    );
  `);

  await query(`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS region_id BIGINT;
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'stores_region_id_fkey'
      ) THEN
        ALTER TABLE stores
          ADD CONSTRAINT stores_region_id_fkey
          FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_regions_name ON regions(name);');
  await query('CREATE INDEX IF NOT EXISTS idx_region_store_mappings_store_id ON region_store_mappings(store_id);');
  await query('CREATE INDEX IF NOT EXISTS idx_stores_region_id ON stores(region_id);');

  ensured = true;
}

export default null;
