#!/usr/bin/env node
import bcrypt from 'bcryptjs';
import { query } from '../src/lib/db.js';

function usage() {
  console.log('Usage: node scripts/create-temp-staff.mjs [username] [password] [firstName] [role]');
  console.log('Defaults: username=cashier1 password=Secret123! firstName=Cashier role=user');
}

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) {
  usage();
  process.exit(0);
}

const username = argv[0] || 'cashier1';
const password = argv[1] || 'Secret123!';
const firstName = argv[2] || 'Cashier';
const roleName = argv[3] || 'user';

(async () => {
  try {
    if (!username || !password) {
      usage();
      process.exit(1);
    }

    const email = `${username}@local.test`;
    const phone = `emp-${Date.now().toString().slice(-6)}`;
    const passwordHash = await bcrypt.hash(password, 10);

    const insert = await query(
      `INSERT INTO users (name, email, phone, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
       RETURNING id, name, email, phone, role`,
      [firstName, email, phone, passwordHash, roleName]
    );

    const user = insert.rows[0];
    console.log('Temporary staff created:');
    console.log(`  id: ${user.id}`);
    console.log(`  username (email): ${user.email}`);
    console.log(`  password: ${password}`);
    console.log(`  role: ${user.role}`);
    console.log('\nUse these credentials to sign in at /login or the POS login gate.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create temp staff:', err.message || err);
    process.exit(2);
  }
})();
