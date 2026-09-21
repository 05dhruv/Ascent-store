import { query } from "@/lib/db";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";
import { ensureConstructionSchema } from "@/lib/constructionSchema";

/**
 * Phase 2 construction ops tables: evidence, quarantine, labour,
 * schedule, docs/RFI, equipment, RA bills, contractors, approval limits.
 *
 * Documented permission keys for approval-limits (not enforced yet as
 * first-class RBAC entries): SITE_RECEIVER, DISPATCHER, QC_APPROVE.
 * Runtime APIs reuse VIEW_INVENTORY / MANAGE_INVENTORY (and project
 * permissions where noted).
 */
export const ensureConstructionOpsSchema = makeSchemaEnsurer(
  "construction_ops",
  1,
  async () => {
    await ensureConstructionSchema();
    await query(`
    CREATE TABLE IF NOT EXISTS construction_evidence_files (
      id BIGSERIAL PRIMARY KEY,
      entity_type VARCHAR(60) NOT NULL,
      entity_id BIGINT NOT NULL,
      file_url TEXT NOT NULL,
      file_name VARCHAR(255),
      mime_type VARCHAR(120),
      uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      signature_data TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_quarantine_releases (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT,
      store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
      product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
      qty NUMERIC(16,3) NOT NULL CHECK (qty > 0),
      reason TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected')),
      requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS construction_activity_issues (
      id BIGSERIAL PRIMARY KEY,
      stock_out_id BIGINT,
      activity_id BIGINT REFERENCES construction_work_activities(id) ON DELETE SET NULL,
      cost_code_id BIGINT REFERENCES construction_cost_codes(id) ON DELETE SET NULL,
      project_id BIGINT REFERENCES construction_projects(id) ON DELETE SET NULL,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE SET NULL,
      qty NUMERIC(16,3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_approval_limits (
      id BIGSERIAL PRIMARY KEY,
      role_name VARCHAR(80) NOT NULL,
      permission_key VARCHAR(80) NOT NULL,
      max_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (max_amount >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(role_name, permission_key)
    );

    CREATE TABLE IF NOT EXISTS construction_contractors (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      phone VARCHAR(40),
      email VARCHAR(180),
      gstin VARCHAR(30),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_crews (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      project_id BIGINT REFERENCES construction_projects(id) ON DELETE SET NULL,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE SET NULL,
      contractor_id BIGINT REFERENCES construction_contractors(id) ON DELETE SET NULL,
      trade VARCHAR(80),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_attendance (
      id BIGSERIAL PRIMARY KEY,
      crew_id BIGINT NOT NULL REFERENCES construction_crews(id) ON DELETE CASCADE,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE SET NULL,
      work_date DATE NOT NULL DEFAULT CURRENT_DATE,
      headcount INTEGER NOT NULL DEFAULT 0 CHECK (headcount >= 0),
      hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hours >= 0),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(crew_id, work_date)
    );

    CREATE TABLE IF NOT EXISTS construction_activity_schedule (
      id BIGSERIAL PRIMARY KEY,
      activity_id BIGINT NOT NULL REFERENCES construction_work_activities(id) ON DELETE CASCADE,
      planned_start DATE,
      planned_end DATE,
      depends_on_activity_id BIGINT REFERENCES construction_work_activities(id) ON DELETE SET NULL,
      baseline_progress NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (baseline_progress BETWEEN 0 AND 100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(activity_id)
    );

    CREATE TABLE IF NOT EXISTS construction_documents (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT REFERENCES construction_projects(id) ON DELETE CASCADE,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE SET NULL,
      doc_type VARCHAR(60) NOT NULL DEFAULT 'general',
      title VARCHAR(255) NOT NULL,
      file_url TEXT,
      revision VARCHAR(40),
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_rfis (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT REFERENCES construction_projects(id) ON DELETE CASCADE,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE SET NULL,
      rfi_number VARCHAR(60),
      subject VARCHAR(255) NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','answered','closed','cancelled')),
      raised_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      answered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      due_at TIMESTAMPTZ,
      answered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_equipment (
      id BIGSERIAL PRIMARY KEY,
      asset_code VARCHAR(60) NOT NULL UNIQUE,
      name VARCHAR(180) NOT NULL,
      category VARCHAR(80),
      project_id BIGINT REFERENCES construction_projects(id) ON DELETE SET NULL,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE SET NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available','in_use','maintenance','retired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_equipment_logs (
      id BIGSERIAL PRIMARY KEY,
      equipment_id BIGINT NOT NULL REFERENCES construction_equipment(id) ON DELETE CASCADE,
      site_id BIGINT REFERENCES construction_sites(id) ON DELETE SET NULL,
      log_date DATE NOT NULL DEFAULT CURRENT_DATE,
      hours_used NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hours_used >= 0),
      operator_name VARCHAR(180),
      notes TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS construction_ra_bills (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
      bill_number VARCHAR(60) NOT NULL,
      bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
      contractor_id BIGINT REFERENCES construction_contractors(id) ON DELETE SET NULL,
      period_from DATE,
      period_to DATE,
      status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','submitted','approved','paid','rejected')),
      line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      retention_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, bill_number)
    );

    ALTER TABLE construction_work_activities
      ADD COLUMN IF NOT EXISTS contractor_id BIGINT REFERENCES construction_contractors(id) ON DELETE SET NULL;

    ALTER TABLE construction_discrepancies
      ADD COLUMN IF NOT EXISTS assignee_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'medium';

    CREATE INDEX IF NOT EXISTS idx_construction_evidence_entity
      ON construction_evidence_files(entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_construction_quarantine_status
      ON construction_quarantine_releases(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_construction_activity_issues_activity
      ON construction_activity_issues(activity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_construction_attendance_date
      ON construction_attendance(work_date DESC, crew_id);
    CREATE INDEX IF NOT EXISTS idx_construction_schedule_activity
      ON construction_activity_schedule(activity_id);
    CREATE INDEX IF NOT EXISTS idx_construction_documents_project
      ON construction_documents(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_construction_rfis_project
      ON construction_rfis(project_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_construction_equipment_status
      ON construction_equipment(status, project_id);
    CREATE INDEX IF NOT EXISTS idx_construction_ra_bills_project
      ON construction_ra_bills(project_id, status, created_at DESC);
    `);
  },
);
