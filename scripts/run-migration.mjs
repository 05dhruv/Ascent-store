import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from '../src/lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, 'migrations/001_stock_in.sql'), 'utf8');

try {
  await query(sql);
  console.log('Migration applied successfully.');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
}
process.exit(0);
