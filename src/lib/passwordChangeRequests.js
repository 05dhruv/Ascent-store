import { query } from '@/lib/db';

const CREATE_PASSWORD_CHANGE_REQUESTS_SQL = `
  CREATE TABLE IF NOT EXISTS password_change_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_password_hash TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    effective_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE password_change_requests
    DROP CONSTRAINT IF EXISTS password_change_requests_status_check;

  ALTER TABLE password_change_requests
    ADD CONSTRAINT password_change_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'cancelled'));

  CREATE UNIQUE INDEX IF NOT EXISTS password_change_requests_one_pending_user
    ON password_change_requests (user_id)
    WHERE status = 'pending';

  CREATE INDEX IF NOT EXISTS password_change_requests_user_status_idx
    ON password_change_requests (user_id, status, effective_at);
`;

const globalForPasswordChangeRequests = globalThis;

export async function ensurePasswordChangeRequestsTable() {
  if (!globalForPasswordChangeRequests._passwordChangeRequestsReadyPromise) {
    globalForPasswordChangeRequests._passwordChangeRequestsReadyPromise = query(
      CREATE_PASSWORD_CHANGE_REQUESTS_SQL
    ).catch((err) => {
      globalForPasswordChangeRequests._passwordChangeRequestsReadyPromise = null;
      throw err;
    });
  }

  await globalForPasswordChangeRequests._passwordChangeRequestsReadyPromise;
}

export async function applyEffectivePasswordChange(userId) {
  await ensurePasswordChangeRequestsTable();

  const result = await query(
    `WITH request_to_apply AS (
       SELECT id, requested_password_hash
       FROM password_change_requests
       WHERE user_id = $1
         AND status = 'approved'
         AND effective_at <= NOW()
         AND applied_at IS NULL
       ORDER BY approved_at DESC, id DESC
       LIMIT 1
     ),
     updated_user AS (
       UPDATE users u
       SET password_hash = r.requested_password_hash,
           updated_at = NOW()
       FROM request_to_apply r
       WHERE u.id = $1
       RETURNING r.id AS request_id
     )
     UPDATE password_change_requests p
     SET status = 'applied',
         applied_at = NOW(),
         updated_at = NOW()
     FROM updated_user u
     WHERE p.id = u.request_id
     RETURNING p.id`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function getLatestPasswordChangeRequest(userId) {
  await ensurePasswordChangeRequestsTable();

  const result = await query(
    `SELECT id,
            status,
            requested_at,
            approved_at,
            rejected_at,
            effective_at,
            applied_at,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (effective_at - NOW()))))::int AS seconds_remaining
     FROM password_change_requests
     WHERE user_id = $1
       AND status IN ('pending', 'approved')
     ORDER BY requested_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}
