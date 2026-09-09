import { query } from "@/lib/db";
import { ensureVendorInvoicesSchema } from "@/lib/vendorInvoicesSchema";

let schemaPromise;

export function ensureGoogleCalendarSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await ensureVendorInvoicesSchema();
      return query(`
      CREATE TABLE IF NOT EXISTS google_calendar_connections (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        google_email TEXT,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        token_expires_at TIMESTAMPTZ,
        scope TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vendor_payable_calendar_events (
        id BIGSERIAL PRIMARY KEY,
        vendor_invoice_id BIGINT NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        google_event_id TEXT NOT NULL,
        google_event_link TEXT,
        calendar_id TEXT NOT NULL DEFAULT 'primary',
        attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
        due_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (vendor_invoice_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_vendor_payable_calendar_events_invoice
        ON vendor_payable_calendar_events(vendor_invoice_id);
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
