import { query } from "@/lib/db";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";

const PRODUCT_DISCOUNT_SCHEMA_VERSION = 1;

export const ensureProductDiscountSchema = makeSchemaEnsurer(
  "product_discount",
  PRODUCT_DISCOUNT_SCHEMA_VERSION,
  async () => {
    await query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS allow_discount_on_pos BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS include_tax BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS stock_item_type VARCHAR(30) NOT NULL DEFAULT 'unbatched',
        ADD COLUMN IF NOT EXISTS inventory_method VARCHAR(30) NOT NULL DEFAULT 'direct',
        ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(80),
        ADD COLUMN IF NOT EXISTS charge_id BIGINT;
    `);
  },
);
