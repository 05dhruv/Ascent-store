import { query } from '@/lib/db';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

/**
 * Ensure audit_logs table exists and FK references users(id) correctly.
 * Must be called AFTER ensureUsersTable().
 */
export const ensureAuditLogsSchema = makeSchemaEnsurer('audit_logs', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT,
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(100),
      resource_id BIGINT,
      ip_address VARCHAR(45),
      user_agent VARCHAR(500),
      status VARCHAR(50),
      error_message TEXT,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Drop any existing (possibly broken) FK and re-add pointing to users(id)
  try {
    await query(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;`);
    await query(`
      ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
    `);
  } catch (fkErr) {
    console.warn('[AUDIT_LOGS_SCHEMA] Could not fix FK constraint:', fkErr.message);
  }

  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);`);

  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;`);
  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;`);
});

export default { ensureAuditLogsSchema };
