import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });

const expectedDatabase = process.env.CONSTRUCTION_DB_NAME || 'Ascent-synnc';
if (process.env.DB_NAME !== expectedDatabase) {
  throw new Error(`Refusing construction migration: DB_NAME must be ${expectedDatabase}`);
}

const source = readFileSync(new URL('../src/lib/constructionSchema.js', import.meta.url), 'utf8');
const match = source.match(/await query\(`([\s\S]*?)`\);/);
if (!match) throw new Error('Construction schema SQL could not be found');

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
});

try {
  const identity = await pool.query('SELECT current_database() AS database');
  if (identity.rows[0]?.database !== expectedDatabase) throw new Error('Connected database identity mismatch');
  await pool.query('BEGIN');
  await pool.query(match[1]);
  await pool.query('COMMIT');
  console.log(`Construction schema applied to ${expectedDatabase}.`);
} catch (error) {
  await pool.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await pool.end();
}
