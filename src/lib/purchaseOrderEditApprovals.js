import { query } from '@/lib/db';

const CREATE_PURCHASE_ORDER_EDIT_REQUESTS_SQL = `
  CREATE TABLE IF NOT EXISTS purchase_order_edit_requests (
    id BIGSERIAL PRIMARY KEY,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reason TEXT,
    request_payload JSONB DEFAULT '{}'::jsonb,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE purchase_order_edit_requests
    DROP CONSTRAINT IF EXISTS purchase_order_edit_requests_status_check;

  ALTER TABLE purchase_order_edit_requests
    ADD CONSTRAINT purchase_order_edit_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'used', 'cancelled'));

  CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_edit_requests_one_pending_user_idx
    ON purchase_order_edit_requests (purchase_order_id, requested_by)
    WHERE status = 'pending';

  CREATE INDEX IF NOT EXISTS purchase_order_edit_requests_po_status_idx
    ON purchase_order_edit_requests (purchase_order_id, status, requested_at DESC);
`;

const globalForPurchaseOrderEditRequests = globalThis;

export async function ensurePurchaseOrderEditRequestsTable() {
  if (!globalForPurchaseOrderEditRequests._purchaseOrderEditRequestsReadyPromise) {
    globalForPurchaseOrderEditRequests._purchaseOrderEditRequestsReadyPromise = query(
      CREATE_PURCHASE_ORDER_EDIT_REQUESTS_SQL
    ).catch((err) => {
      globalForPurchaseOrderEditRequests._purchaseOrderEditRequestsReadyPromise = null;
      throw err;
    });
  }

  await globalForPurchaseOrderEditRequests._purchaseOrderEditRequestsReadyPromise;
}

export function isSuperAdminUser(user) {
  return user?.role === 'super_admin' || user?.system_role === 'super_admin' || user?.permissions?.includes('*');
}
