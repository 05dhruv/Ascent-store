import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const newEmail = (process.env.SUPER_ADMIN_EMAIL || 'owner@Ascentstore.com').trim().toLowerCase();
const newPassword = process.env.SUPER_ADMIN_PASSWORD || 'Ascent@12345';

async function updateDb(pool, name) {
  try {
    console.log(`\n--- Updating ${name} ---`);
    const hash = await bcrypt.hash(newPassword, 10);

    const updateRes = await pool.query(
      `UPDATE users 
       SET email = $1, password_hash = $2, updated_at = NOW() 
       WHERE role = 'super_admin' OR id = 1 
       RETURNING id, name, email, phone, role`,
      [newEmail, hash]
    );

    console.log(`[${name}] Updated user:`, updateRes.rows);

    if (updateRes.rows.length > 0) {
      const userId = updateRes.rows[0].id;
      const sessionRes = await pool.query(
        `DELETE FROM sessions WHERE user_id = $1`,
        [userId]
      );
      console.log(`[${name}] Cleared ${sessionRes.rowCount} old sessions for user ${userId}`);
    }

    const verifyUser = await pool.query(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [newEmail]
    );

    if (verifyUser.rows.length > 0) {
      const isMatch = await bcrypt.compare(newPassword, verifyUser.rows[0].password_hash);
      console.log(`[${name}] Password check passed: ${isMatch}`);
    } else {
      console.error(`[${name}] User not found after update!`);
    }
  } catch (err) {
    console.error(`[${name}] Error:`, err.message);
  } finally {
    await pool.end();
  }
}

async function run() {
  // 1. Neon DB
  if (process.env.DATABASE_URL) {
    const neonPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    await updateDb(neonPool, 'Neon Database');
  }

  // 2. Local DB
  const localPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'Ascent-synnc',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Dhruvv@9886',
  });
  await updateDb(localPool, 'Local PostgreSQL (Ascent-synnc)');
}

run();
