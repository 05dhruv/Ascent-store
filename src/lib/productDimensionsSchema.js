import { query } from "@/lib/db";

let schemaEnsured = false;

export async function ensureProductDimensionsSchema() {
  if (schemaEnsured) return;

  await query(`
    DO $$
    BEGIN
      IF to_regclass('products') IS NOT NULL THEN
        ALTER TABLE products
          ADD COLUMN IF NOT EXISTS length NUMERIC(14, 4),
          ADD COLUMN IF NOT EXISTS width NUMERIC(14, 4),
          ADD COLUMN IF NOT EXISTS height NUMERIC(14, 4),
          ADD COLUMN IF NOT EXISTS dimension_unit VARCHAR(20) DEFAULT 'MM',
          ADD COLUMN IF NOT EXISTS dimensions VARCHAR(255),
          ADD COLUMN IF NOT EXISTS weight_per_unit NUMERIC(14, 4);

        CREATE INDEX IF NOT EXISTS idx_products_dimensions
          ON products (LOWER(COALESCE(dimensions, '')));
      END IF;
    END
    $$;
  `);

  schemaEnsured = true;
}
