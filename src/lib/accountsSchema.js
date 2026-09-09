import { query } from "@/lib/db";
import { ensureStoreCashSchema } from "@/lib/storeCashSchema";
import { ensureVendorsSchema } from "@/lib/vendorsSchema";
import { ensurePurchaseOrderSchema } from "@/lib/purchaseOrderSchema";
import { ensureVendorInvoicesSchema } from "@/lib/vendorInvoicesSchema";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureEmployeesSchema } from "@/lib/employeesSchema";

let ensured = false;

export async function ensureAccountsSchema() {
  if (ensured) return;
  await ensureStoreCashSchema();
  await ensureVendorsSchema();
  await ensurePurchaseOrderSchema();
  await ensureStockInSchema();
  await ensureVendorInvoicesSchema();
  await ensureEmployeesSchema();

  await query(`
    CREATE TABLE IF NOT EXISTS account_bank_accounts (
      id BIGSERIAL PRIMARY KEY,
      store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
      bank_name VARCHAR(160) NOT NULL,
      account_number VARCHAR(80) NOT NULL,
      ifsc VARCHAR(40),
      branch VARCHAR(160),
      current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      remarks TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS account_cash_deposits (
      id BIGSERIAL PRIMARY KEY,
      store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      bank_account_id BIGINT REFERENCES account_bank_accounts(id) ON DELETE SET NULL,
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      deposit_date DATE NOT NULL DEFAULT CURRENT_DATE,
      reference_no VARCHAR(120),
      status VARCHAR(40) NOT NULL DEFAULT 'recorded',
      remarks TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS account_payment_proposals (
      id BIGSERIAL PRIMARY KEY,
      vendor_invoice_id BIGINT NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
      vendor_id BIGINT REFERENCES vendors(id) ON DELETE SET NULL,
      purchase_order_id BIGINT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      due_date DATE,
      status VARCHAR(40) NOT NULL DEFAULT 'proposed',
      approval_reason TEXT,
      approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      utr_number VARCHAR(120),
      paid_date DATE,
      closed_at TIMESTAMPTZ,
      remarks TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS account_vendor_notes (
      id BIGSERIAL PRIMARY KEY,
      vendor_invoice_id BIGINT NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
      vendor_id BIGINT REFERENCES vendors(id) ON DELETE SET NULL,
      note_type VARCHAR(20) NOT NULL CHECK (note_type IN ('credit', 'debit')),
      note_number VARCHAR(120) NOT NULL,
      amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
      note_date DATE NOT NULL DEFAULT CURRENT_DATE,
      reason TEXT NOT NULL,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS account_cheques (
      id BIGSERIAL PRIMARY KEY,
      store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
      direction VARCHAR(12) NOT NULL DEFAULT 'received',
      cheque_type VARCHAR(10) NOT NULL DEFAULT 'PDC',
      party_type VARCHAR(20) NOT NULL DEFAULT 'other',
      party_id BIGINT,
      party_name VARCHAR(180) NOT NULL,
      cheque_number VARCHAR(80) NOT NULL,
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      due_date DATE,
      status VARCHAR(50) NOT NULL DEFAULT 'safe_custody',
      bank_name VARCHAR(160),
      bank_account_id BIGINT REFERENCES account_bank_accounts(id) ON DELETE SET NULL,
      document_url TEXT,
      document_note TEXT,
      remarks TEXT,
      cleared_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    ALTER TABLE account_cheques
      ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS direction VARCHAR(12) NOT NULL DEFAULT 'received',
      ADD COLUMN IF NOT EXISTS party_type VARCHAR(20) NOT NULL DEFAULT 'other',
      ADD COLUMN IF NOT EXISTS party_id BIGINT,
      ADD COLUMN IF NOT EXISTS bank_account_id BIGINT REFERENCES account_bank_accounts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS document_url TEXT,
      ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS account_expenses (
      id BIGSERIAL PRIMARY KEY,
      store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
      expense_head VARCHAR(160) NOT NULL,
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(50) NOT NULL DEFAULT 'submitted',
      bill_note TEXT,
      remarks TEXT,
      verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      verified_at TIMESTAMPTZ,
      approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS account_imprest (
      id BIGSERIAL PRIMARY KEY,
      store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
      limit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
      low_balance_threshold NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      remarks TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE(store_id)
    );

    ALTER TABLE account_imprest
      ADD COLUMN IF NOT EXISTS employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS account_calendar_reminders (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(220) NOT NULL,
      category VARCHAR(80) NOT NULL DEFAULT 'finance',
      due_date DATE NOT NULL,
      owner VARCHAR(160),
      status VARCHAR(40) NOT NULL DEFAULT 'open',
      google_event_id VARCHAR(180),
      remarks TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS account_documents (
      id BIGSERIAL PRIMARY KEY,
      module VARCHAR(80) NOT NULL,
      linked_type VARCHAR(80),
      linked_id VARCHAR(120),
      document_name VARCHAR(220) NOT NULL,
      document_note TEXT,
      status VARCHAR(40) NOT NULL DEFAULT 'linked',
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS account_tally_sync_queue (
      id BIGSERIAL PRIMARY KEY,
      source_type VARCHAR(80) NOT NULL,
      source_id VARCHAR(120),
      voucher_number VARCHAR(120),
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'ready',
      pushed_at TIMESTAMPTZ,
      error_message TEXT,
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_account_bank_accounts_store ON account_bank_accounts(store_id);
    CREATE INDEX IF NOT EXISTS idx_account_cash_deposits_store ON account_cash_deposits(store_id, deposit_date DESC);
    CREATE INDEX IF NOT EXISTS idx_account_payment_proposals_invoice ON account_payment_proposals(vendor_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_account_payment_proposals_status ON account_payment_proposals(status);
    CREATE INDEX IF NOT EXISTS idx_account_vendor_notes_invoice ON account_vendor_notes(vendor_invoice_id, note_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_vendor_notes_number
      ON account_vendor_notes(vendor_id, note_type, note_number);
    CREATE INDEX IF NOT EXISTS idx_account_cheques_due ON account_cheques(due_date, status);
    CREATE INDEX IF NOT EXISTS idx_account_cheques_store ON account_cheques(store_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_account_cheques_party ON account_cheques(party_type, party_id);
    CREATE INDEX IF NOT EXISTS idx_account_expenses_store ON account_expenses(store_id, expense_date DESC);
    CREATE INDEX IF NOT EXISTS idx_account_imprest_employee ON account_imprest(employee_id);
    CREATE INDEX IF NOT EXISTS idx_account_calendar_due ON account_calendar_reminders(due_date, status);
    CREATE INDEX IF NOT EXISTS idx_account_documents_module ON account_documents(module);
    CREATE INDEX IF NOT EXISTS idx_account_tally_status ON account_tally_sync_queue(status);
  `);

  ensured = true;
}
