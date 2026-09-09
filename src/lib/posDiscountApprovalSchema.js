import crypto from "node:crypto";
import { query } from "@/lib/db";

export async function ensurePosDiscountApprovalSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS pos_discount_requests (
      id BIGSERIAL PRIMARY KEY,
      request_code VARCHAR(40) NOT NULL UNIQUE,
      store_id BIGINT NOT NULL REFERENCES stores(id),
      session_id VARCHAR(120),
      requested_by_user_id BIGINT NOT NULL REFERENCES users(id),
      requested_by_name VARCHAR(255),
      discount_scope VARCHAR(20) NOT NULL,
      target_product_id BIGINT REFERENCES products(id),
      target_cart_key VARCHAR(255),
      target_product_name VARCHAR(255),
      requested_amount NUMERIC(14,2) NOT NULL,
      approved_amount NUMERIC(14,2),
      reason TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      cart_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
      cart_fingerprint VARCHAR(64) NOT NULL,
      reviewed_by_user_id BIGINT REFERENCES users(id),
      reviewed_by_name VARCHAR(255),
      review_notes TEXT,
      reviewed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
      used_bill_id BIGINT REFERENCES sales_bills(id),
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS pos_discount_requests_status_idx
      ON pos_discount_requests(status, created_at DESC);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS pos_discount_requests_requester_idx
      ON pos_discount_requests(requested_by_user_id, store_id, created_at DESC);
  `);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function normalizeDiscountCartItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      cartKey: String(
        item.cartKey ||
          item.cart_key ||
          item.variantKey ||
          item.productId ||
          item.product_id ||
          "",
      ),
      productId: Number(item.productId || item.product_id || item.id || 0),
      qty: round(item.qty, 3),
      sellingPrice: round(item.sellingPrice ?? item.selling_price, 2),
      selectedBatchId:
        Number(
          item.selectedBatchId ||
            item.selected_batch_id ||
            item.batchId ||
            item.batch_id ||
            0,
        ) || null,
      promotionId: Number(item.promotionId || item.promotion_id || 0) || null,
      promotionFreeItem: Boolean(
        item.promotionFreeItem || item.promotion_free_item,
      ),
    }))
    .filter((item) => item.productId > 0 && item.qty > 0)
    .sort((left, right) =>
      [
        left.productId,
        left.cartKey,
        left.sellingPrice,
        left.selectedBatchId || 0,
      ]
        .join(":")
        .localeCompare(
          [
            right.productId,
            right.cartKey,
            right.sellingPrice,
            right.selectedBatchId || 0,
          ].join(":"),
        ),
    );
}

export function createDiscountCartFingerprint(items = []) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizeDiscountCartItems(items)))
    .digest("hex");
}
