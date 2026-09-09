import { query } from '@/lib/db';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

export const ensureConstructionSchema = makeSchemaEnsurer('construction', 1, async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS construction_projects (
      id BIGSERIAL PRIMARY KEY,
      project_code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(180) NOT NULL,
      client_name VARCHAR(180),
      address TEXT,
      start_date DATE,
      expected_end_date DATE,
      budget NUMERIC(18,2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
      project_manager_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_sites (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
      site_code VARCHAR(50) NOT NULL,
      name VARCHAR(180) NOT NULL,
      address TEXT,
      store_id INTEGER UNIQUE REFERENCES stores(id) ON DELETE SET NULL,
      site_engineer_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','inactive','completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, site_code)
    );

    CREATE TABLE IF NOT EXISTS construction_cost_codes (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT REFERENCES construction_projects(id) ON DELETE CASCADE,
      code VARCHAR(60) NOT NULL,
      name VARCHAR(180) NOT NULL,
      category VARCHAR(80),
      budget NUMERIC(18,2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, code)
    );

    CREATE TABLE IF NOT EXISTS construction_work_activities (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE CASCADE,
      cost_code_id BIGINT REFERENCES construction_cost_codes(id) ON DELETE SET NULL,
      name VARCHAR(180) NOT NULL,
      block_name VARCHAR(100),
      floor_name VARCHAR(100),
      contractor_name VARCHAR(180),
      status VARCHAR(30) NOT NULL DEFAULT 'planned',
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_inventory_movements (
      id BIGSERIAL PRIMARY KEY,
      movement_number VARCHAR(60) NOT NULL UNIQUE,
      movement_type VARCHAR(30) NOT NULL
        CHECK (movement_type IN ('stock_in','reserve','dispatch','receipt','material_issue','material_return','vendor_return','adjustment','reversal')),
      product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
      project_id BIGINT REFERENCES construction_projects(id) ON DELETE RESTRICT,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE RESTRICT,
      source_store_id INTEGER REFERENCES stores(id) ON DELETE RESTRICT,
      destination_store_id INTEGER REFERENCES stores(id) ON DELETE RESTRICT,
      activity_id BIGINT REFERENCES construction_work_activities(id) ON DELETE SET NULL,
      cost_code_id BIGINT REFERENCES construction_cost_codes(id) ON DELETE SET NULL,
      reference_type VARCHAR(40),
      reference_id BIGINT,
      quantity NUMERIC(16,3) NOT NULL CHECK (quantity > 0),
      stock_bucket VARCHAR(30) NOT NULL DEFAULT 'available'
        CHECK (stock_bucket IN ('available','reserved','picked','in_transit','quarantine','damaged','rejected','scrap','consumed')),
      condition VARCHAR(30) NOT NULL DEFAULT 'usable',
      unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
      remarks TEXT,
      evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_discrepancies (
      id BIGSERIAL PRIMARY KEY,
      discrepancy_number VARCHAR(60) NOT NULL UNIQUE,
      transfer_id BIGINT REFERENCES stock_transfer(id) ON DELETE RESTRICT,
      product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
      discrepancy_type VARCHAR(30) NOT NULL
        CHECK (discrepancy_type IN ('short','excess','damaged','rejected','wrong_item','quality_failure')),
      quantity NUMERIC(16,3) NOT NULL CHECK (quantity > 0),
      status VARCHAR(30) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','under_review','approved','resolved','rejected')),
      owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      resolution TEXT,
      evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );

    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS location_type VARCHAR(30) NOT NULL DEFAULT 'store',
      ADD COLUMN IF NOT EXISTS construction_site_id BIGINT REFERENCES construction_sites(id) ON DELETE SET NULL;

    ALTER TABLE stock_transfer
      ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(30) NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS dispatched_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS expected_arrival_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS received_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS transporter_name VARCHAR(180),
      ADD COLUMN IF NOT EXISTS driver_name VARCHAR(180),
      ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(80),
      ADD COLUMN IF NOT EXISTS challan_number VARCHAR(100);

    ALTER TABLE stock_transfer_items
      ADD COLUMN IF NOT EXISTS dispatched_qty NUMERIC(16,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS received_qty NUMERIC(16,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS accepted_qty NUMERIC(16,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS damaged_qty NUMERIC(16,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rejected_qty NUMERIC(16,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS short_qty NUMERIC(16,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS excess_qty NUMERIC(16,3) NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS idx_construction_sites_project ON construction_sites(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_construction_cost_codes_project ON construction_cost_codes(project_id);
    CREATE INDEX IF NOT EXISTS idx_construction_movements_project_site ON construction_inventory_movements(project_id, site_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_construction_movements_product ON construction_inventory_movements(product_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_construction_discrepancies_status ON construction_discrepancies(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_workflow ON stock_transfer(workflow_status, created_at DESC);
  `);
});
