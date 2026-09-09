import { query } from '@/lib/db';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

const VENDOR_INVOICES_SCHEMA_VERSION = 4;

export const ensureVendorInvoicesSchema = makeSchemaEnsurer('vendor_invoices', VENDOR_INVOICES_SCHEMA_VERSION, async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS vendor_invoices (
      id SERIAL PRIMARY KEY,
      transaction_id VARCHAR(50) UNIQUE,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      purchase_order_id INTEGER REFERENCES purchase_orders(id),
      stock_in_id INTEGER,
      invoice_number VARCHAR(100) NOT NULL,
      total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
      due_date DATE,
      invoice_date DATE DEFAULT NOW(),
      created_by VARCHAR(255),
      remarks TEXT,
      status VARCHAR(20) DEFAULT 'Pending',
      bill_verified_submitted BOOLEAN NOT NULL DEFAULT FALSE,
      bill_verified_submitted_by VARCHAR(255),
      bill_verified_submitted_at TIMESTAMPTZ,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE vendor_invoices
      ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(50),
      ADD COLUMN IF NOT EXISTS vendor_id INTEGER,
      ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER,
      ADD COLUMN IF NOT EXISTS stock_in_id INTEGER,
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS due_date DATE,
      ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
      ADD COLUMN IF NOT EXISTS remarks TEXT,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Pending',
      ADD COLUMN IF NOT EXISTS bill_verified_submitted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS bill_verified_submitted_by VARCHAR(255),
      ADD COLUMN IF NOT EXISTS bill_verified_submitted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    UPDATE vendor_invoices
    SET transaction_id = COALESCE(transaction_id, 'INV-' || LPAD(id::text, 4, '0'))
    WHERE transaction_id IS NULL;

    UPDATE vendor_invoices
    SET status = CASE
      WHEN COALESCE(amount_paid, 0) >= COALESCE(total_amount, 0) AND COALESCE(total_amount, 0) > 0 THEN 'Paid'
      WHEN COALESCE(amount_paid, 0) > 0 THEN 'Partial'
      ELSE COALESCE(NULLIF(status, ''), 'Pending')
    END;

    CREATE TABLE IF NOT EXISTS vendor_invoice_settlements (
      id SERIAL PRIMARY KEY,
      vendor_invoice_id INTEGER NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      payment_mode VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
      reference_no VARCHAR(120),
      settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
      settled_by VARCHAR(255),
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE vendor_invoice_settlements
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE vendor_invoice_settlements
      ALTER COLUMN payment_mode SET DEFAULT 'Bank Transfer';

    UPDATE vendor_invoice_settlements
    SET updated_at = COALESCE(updated_at, created_at, NOW())
    WHERE updated_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_vendor_invoices_vendor_id ON vendor_invoices(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_invoices_stock_in_id ON vendor_invoices(stock_in_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_invoices_status ON vendor_invoices(status);
    CREATE INDEX IF NOT EXISTS idx_vendor_invoices_invoice_number ON vendor_invoices(invoice_number);
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_invoices_stock_in_unique_idx
      ON vendor_invoices(stock_in_id)
      WHERE stock_in_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_vendor_invoice_settlements_invoice_id ON vendor_invoice_settlements(vendor_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_invoice_settlements_date ON vendor_invoice_settlements(settlement_date);

    -- Repair historical confirmed vendor GRNs that never received a payable.
    -- stock_in_id is unique, so re-running this migration cannot duplicate bills.
    INSERT INTO vendor_invoices (
      transaction_id, vendor_id, purchase_order_id, stock_in_id,
      invoice_number, total_amount, amount_paid, due_date, invoice_date,
      created_by, remarks, status, meta, created_at, updated_at
    )
    SELECT
      'VINV-SI-' || si.id,
      resolved_vendor.id,
      po.id,
      si.id,
      COALESCE(NULLIF(TRIM(si.invoice_number), ''), 'GRN-' || COALESCE(si.transaction_id, si.id::text)),
      GREATEST(COALESCE(si.total_cost, 0) + COALESCE(si.total_tax, 0), 0),
      0,
      COALESCE(
        po.payment_due_date,
        CASE
          WHEN COALESCE(po.vendor_credit_days, resolved_vendor.credit_days, 0) > 0 THEN
            (COALESCE(si.invoice_date, si.confirmed_at::date, si.created_at::date)
              + (COALESCE(po.vendor_credit_days, resolved_vendor.credit_days)::text || ' days')::interval)::date
          ELSE NULL
        END
      ),
      COALESCE(si.invoice_date, si.confirmed_at::date, si.created_at::date),
      COALESCE(si.created_by::text, 'System'),
      COALESCE(NULLIF(si.remarks, ''), 'Reconciled from confirmed GRN'),
      'Pending',
      jsonb_build_object('source', 'confirmed_grn_reconciliation'),
      COALESCE(si.confirmed_at, si.created_at, NOW()),
      NOW()
    FROM stock_in si
    JOIN LATERAL (
      SELECT v.id, v.credit_days
      FROM vendors v
      WHERE v.id = si.vendor_id
         OR (si.vendor_id IS NULL
           AND LOWER(TRIM(v.name)) = LOWER(TRIM(COALESCE(si.vendor_name, ''))))
      ORDER BY CASE WHEN v.id = si.vendor_id THEN 0 ELSE 1 END, v.id
      LIMIT 1
    ) resolved_vendor ON TRUE
    LEFT JOIN purchase_orders po
      ON LOWER(COALESCE(si.reference_type, '')) = 'purchase_order'
     AND COALESCE(si.reference_id, '') ~ '^[0-9]+$'
     AND po.id = si.reference_id::int
    WHERE LOWER(COALESCE(si.status, '')) = 'confirmed'
      AND (si.vendor_id IS NOT NULL OR NULLIF(TRIM(si.vendor_name), '') IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM vendor_invoices existing
        WHERE existing.stock_in_id = si.id
      )
    ON CONFLICT DO NOTHING;
  `);
});
