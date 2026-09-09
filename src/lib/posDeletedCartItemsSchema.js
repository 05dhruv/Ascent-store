import { query } from "@/lib/db";

const CREATE_POS_DELETED_CART_ITEMS_SQL = `
  CREATE TABLE IF NOT EXISTS pos_deleted_cart_items (
    id BIGSERIAL PRIMARY KEY,
    cart_session_id VARCHAR(120) NOT NULL,
    store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
    pos_session_id BIGINT,
    counter_id BIGINT,
    bill_id BIGINT REFERENCES sales_bills(id) ON DELETE SET NULL,
    bill_number VARCHAR(120),
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255),
    barcode VARCHAR(160),
    sku VARCHAR(160),
    qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
    mrp NUMERIC(14, 2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    line_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    reason VARCHAR(255),
    event_type VARCHAR(40) NOT NULL DEFAULT 'item_removed',
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    billed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_pos_deleted_cart_items_created_at
     ON pos_deleted_cart_items (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_pos_deleted_cart_items_store_created
     ON pos_deleted_cart_items (store_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_pos_deleted_cart_items_user_created
     ON pos_deleted_cart_items (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_pos_deleted_cart_items_bill
     ON pos_deleted_cart_items (bill_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pos_deleted_cart_items_cart_session
     ON pos_deleted_cart_items (cart_session_id)`,
];

export async function ensurePosDeletedCartItemsSchema() {
  await query(CREATE_POS_DELETED_CART_ITEMS_SQL);
  for (const sql of INDEX_SQL) {
    await query(sql);
  }
}
