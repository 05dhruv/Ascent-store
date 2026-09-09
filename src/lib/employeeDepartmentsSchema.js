import { query } from '@/lib/db';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

const EMPLOYEE_DEPARTMENTS_SCHEMA_VERSION = 1;

export const ensureEmployeeDepartmentsSchema = makeSchemaEnsurer('employee_departments', EMPLOYEE_DEPARTMENTS_SCHEMA_VERSION, async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS employee_departments (
      id SERIAL PRIMARY KEY,
      department_name VARCHAR(255) NOT NULL UNIQUE,
      user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      description TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

});

export default null;
