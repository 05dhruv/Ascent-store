import { query } from '@/lib/db';
import { ensureUsersTable } from '@/lib/userAuth';

const CREATE_EMPLOYEES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS employees (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(120) NOT NULL UNIQUE,
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120),
    gender VARCHAR(20),
    mobile_number VARCHAR(20),
    email_address VARCHAR(190) UNIQUE,
    role_id BIGINT,
    role_name VARCHAR(120),
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    region_store VARCHAR(190),
    warehouse VARCHAR(190),
    department_id BIGINT,
    department_name VARCHAR(120),
    customer_name VARCHAR(190),
    user_type VARCHAR(50),
    date_of_birth DATE,
    date_of_joining DATE,
    date_of_leaving DATE,
    employee_code VARCHAR(80),
    create_customer_same_details BOOLEAN NOT NULL DEFAULT FALSE,
    discount_limit_type VARCHAR(30),
    discount_limit_value NUMERIC(12,2),
    maximum_discount_amount NUMERIC(12,2),
    address TEXT,
    employment_type VARCHAR(50),
    employment_status VARCHAR(30) NOT NULL DEFAULT 'Active',
    contractor_name VARCHAR(190),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

const globalForEmployees = globalThis;

export async function ensureEmployeesSchema() {
  if (!globalForEmployees._employeesSchemaReadyPromise) {
    globalForEmployees._employeesSchemaReadyPromise = (async () => {
      await ensureUsersTable();
      await query(CREATE_EMPLOYEES_TABLE_SQL);

      // Backfill existing employee store and warehouse assignments to user_stores
      try {
        await query(`
          INSERT INTO user_stores (user_id, store_id, is_active, created_at, updated_at)
          SELECT 
            e.user_id, 
            w_id::int, 
            TRUE, 
            NOW(), 
            NOW()
          FROM employees e
          CROSS JOIN regexp_split_to_table(e.warehouse, ',') AS w_id
          WHERE e.user_id IS NOT NULL 
            AND e.warehouse IS NOT NULL 
            AND e.warehouse <> ''
            AND w_id ~ '^\\d+$'
          ON CONFLICT (user_id, store_id) DO NOTHING
        `);

        await query(`
          INSERT INTO user_stores (user_id, store_id, is_active, created_at, updated_at)
          SELECT 
            e.user_id, 
            s_id::int, 
            TRUE, 
            NOW(), 
            NOW()
          FROM employees e
          CROSS JOIN regexp_split_to_table(e.region_store, ',') AS s_id
          WHERE e.user_id IS NOT NULL 
            AND e.region_store IS NOT NULL 
            AND e.region_store <> ''
            AND s_id ~ '^\\d+$'
          ON CONFLICT (user_id, store_id) DO NOTHING
        `);
      } catch (err) {
        console.error('Error syncing employee stores/warehouses:', err.message);
      }
    })().catch((err) => {
      globalForEmployees._employeesSchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForEmployees._employeesSchemaReadyPromise;
}