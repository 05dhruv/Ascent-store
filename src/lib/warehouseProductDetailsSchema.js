import { query } from "@/lib/db";

let ensured = false;

export async function ensureWarehouseProductDetailsSchema() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS warehouse_product_details (
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      warehouse_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
      rate NUMERIC(18, 3) NOT NULL DEFAULT 0,
      value NUMERIC(18, 3) NOT NULL DEFAULT 0,
      unit VARCHAR(12) NOT NULL DEFAULT 'PCS',
      size VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (product_id, warehouse_id)
    )
  `);
  ensured = true;
}
