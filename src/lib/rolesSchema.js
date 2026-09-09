import { query } from '@/lib/db';
import { ensurePermissionsSchema } from '@/lib/permissionsSchema';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

const ROLES_SCHEMA_VERSION = 2;

const ADMIN_PERMISSIONS = [
  'ACCESS_DASHBOARD',
  'VIEW_USERS',
  'MANAGE_INVENTORY',
  'VIEW_INVENTORY',
  'MANAGE_CATALOG',
  'VIEW_CATALOG',
  'MANAGE_ORDERS',
  'VIEW_ORDERS',
  'MANAGE_PURCHASE_ORDERS',
  'MANAGE_VENDORS',
  'MANAGE_CUSTOMERS',
  'VIEW_CUSTOMERS',
  'MANAGE_BILLING',
  'CREATE_POS_BILL',
  'MANAGE_PAYMENTS',
  'VIEW_FINANCIAL_REPORTS',
  'VIEW_TAX_WISE_REPORTS',
  'VIEW_STORE_REPORTS',
  'MANAGE_PROMOS',
  'MANAGE_TAXES',
  'VIEW_STORES',
  'OPEN_CLOSE_SESSION',
];

const MANAGER_PERMISSIONS = [
  'ACCESS_DASHBOARD',
  'VIEW_INVENTORY',
  'VIEW_CATALOG',
  'VIEW_ORDERS',
  'CREATE_POS_BILL',
  'VIEW_CUSTOMERS',
  'VIEW_STORE_REPORTS',
  'OPEN_CLOSE_SESSION',
];

export const ensureRolesSchema = makeSchemaEnsurer('roles', ROLES_SCHEMA_VERSION, async () => {
  await ensurePermissionsSchema();

  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      role_name VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255),
      permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
      description TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE roles ADD COLUMN IF NOT EXISTS role_name VARCHAR(255);
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS name VARCHAR(255);
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    UPDATE roles
    SET role_name = COALESCE(NULLIF(role_name, ''), NULLIF(name, ''))
    WHERE role_name IS NULL OR role_name = '';

    UPDATE roles
    SET role_name = 'role_' || id
    WHERE role_name IS NULL OR role_name = '';

    UPDATE roles
    SET name = COALESCE(NULLIF(name, ''), role_name)
    WHERE name IS NULL OR name = '';

    ALTER TABLE roles ALTER COLUMN name DROP NOT NULL;
    ALTER TABLE roles ALTER COLUMN role_name SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS roles_role_name_unique_idx
      ON roles (role_name);
  `);

  await query(
    `INSERT INTO roles (role_name, name, permissions, description, meta, created_at, updated_at)
     VALUES
      ('super_admin', 'super_admin', '["*"]'::jsonb, 'All access across all stores and settings', '{"system": true}'::jsonb, NOW(), NOW()),
      ('admin', 'admin', $1::jsonb, 'Access controlled by permissions assigned by Super Admin', '{"system": true, "delegated": true}'::jsonb, NOW(), NOW()),
      ('manager', 'manager', $2::jsonb, 'Assigned store access only', '{"system": true, "store_scoped": true}'::jsonb, NOW(), NOW())
     ON CONFLICT (role_name) DO UPDATE
     SET name = EXCLUDED.role_name,
         description = EXCLUDED.description,
         permissions = CASE
           WHEN COALESCE(jsonb_array_length(roles.permissions), 0) = 0 THEN EXCLUDED.permissions
           ELSE roles.permissions
         END,
         meta = roles.meta || EXCLUDED.meta,
         updated_at = NOW()`,
    [JSON.stringify(ADMIN_PERMISSIONS), JSON.stringify(MANAGER_PERMISSIONS)]
  );

});

export default null;
