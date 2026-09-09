import { query } from '@/lib/db';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';
import { ensureStockTransferSchema } from '@/lib/stockTransferSchema';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { ensureConstructionSchema } from '@/lib/constructionSchema';

export const ensureMovementWorkflowSchema = makeSchemaEnsurer('movement_workflow', 2, async () => {
  await ensureStockTransferSchema();
  await ensureInventoryBatchSchema();
  await ensureConstructionSchema();
  await query(`
    ALTER TABLE stock_transfer ADD COLUMN IF NOT EXISTS workflow_version INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS inventory_transfer_events (
      id BIGSERIAL PRIMARY KEY,
      transfer_id INTEGER NOT NULL REFERENCES stock_transfer(id) ON DELETE RESTRICT,
      action TEXT NOT NULL,
      actor_id BIGINT NOT NULL,
      request_key TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(transfer_id, request_key)
    );
    CREATE TABLE IF NOT EXISTS inventory_transfer_receipts (
      id BIGSERIAL PRIMARY KEY,
      transfer_id INTEGER NOT NULL REFERENCES stock_transfer(id) ON DELETE RESTRICT,
      item_id INTEGER NOT NULL REFERENCES stock_transfer_items(id) ON DELETE RESTRICT,
      event_id BIGINT NOT NULL REFERENCES inventory_transfer_events(id),
      received NUMERIC(16,3) NOT NULL CHECK(received >= 0),
      accepted NUMERIC(16,3) NOT NULL CHECK(accepted >= 0),
      damaged NUMERIC(16,3) NOT NULL CHECK(damaged >= 0),
      rejected NUMERIC(16,3) NOT NULL CHECK(rejected >= 0),
      short NUMERIC(16,3) NOT NULL CHECK(short >= 0),
      excess NUMERIC(16,3) NOT NULL CHECK(excess >= 0),
      CHECK(accepted + damaged + rejected = received)
    );
    ALTER TABLE construction_discrepancies
      ADD COLUMN IF NOT EXISTS receipt_id BIGINT REFERENCES inventory_transfer_receipts(id),
      ADD COLUMN IF NOT EXISTS resolved_by BIGINT;
    CREATE TABLE IF NOT EXISTS inventory_transfer_reservations (
      transfer_id INTEGER NOT NULL REFERENCES stock_transfer(id) ON DELETE RESTRICT,
      item_id INTEGER NOT NULL REFERENCES stock_transfer_items(id) ON DELETE RESTRICT,
      batch_id BIGINT NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
      qty NUMERIC(16,3) NOT NULL CHECK(qty > 0),
      PRIMARY KEY(transfer_id,item_id,batch_id)
    );
    CREATE OR REPLACE FUNCTION preserve_inventory_event() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'Posted inventory history is immutable; use a linked reversal'; END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS immutable_transfer_event ON inventory_transfer_events;
    CREATE TRIGGER immutable_transfer_event BEFORE UPDATE OR DELETE ON inventory_transfer_events
      FOR EACH ROW EXECUTE FUNCTION preserve_inventory_event();
    DROP TRIGGER IF EXISTS immutable_transfer_receipt ON inventory_transfer_receipts;
    CREATE TRIGGER immutable_transfer_receipt BEFORE UPDATE OR DELETE ON inventory_transfer_receipts
      FOR EACH ROW EXECUTE FUNCTION preserve_inventory_event();
    CREATE OR REPLACE FUNCTION preserve_posted_batch_movement() RETURNS trigger AS $$
    BEGIN
      IF OLD.meta->>'workflowVersion' = '2' THEN
        RAISE EXCEPTION 'Posted movement is immutable; append a referenced reversal';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS immutable_posted_batch_movement ON inventory_batch_movements;
    CREATE TRIGGER immutable_posted_batch_movement BEFORE UPDATE OR DELETE ON inventory_batch_movements
      FOR EACH ROW EXECUTE FUNCTION preserve_posted_batch_movement();
    CREATE INDEX IF NOT EXISTS idx_transfer_receipts_transfer ON inventory_transfer_receipts(transfer_id);
  `);
});
