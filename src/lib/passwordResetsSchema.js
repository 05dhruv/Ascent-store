import { query } from '@/lib/db';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

/**
 * Ensure password_resets table exists
 * Stores password reset tokens for users
 */
export const ensurePasswordResetsSchema = makeSchemaEnsurer('password_resets', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_password_resets_user_id
    ON password_resets(user_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at
    ON password_resets(expires_at);
  `);
});

export default { ensurePasswordResetsSchema };
