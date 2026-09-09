const SALES_BILL_SEQUENCE_KEY = "sales_bill";

function getDb(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("Database client is required for invoice sequencing");
  }
  return db;
}

function normalizeStoreId(storeId) {
  const value = Number.parseInt(storeId, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Store is required for invoice number generation");
  }
  return value;
}

function getSalesBillPrefix(storeId) {
  return `INV-${String(storeId).padStart(3, "0")}-`;
}

export async function ensureInvoiceSequenceSchema(db) {
  const client = getDb(db);
  await client.query(`
    CREATE TABLE IF NOT EXISTS invoice_sequences (
      id BIGSERIAL PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      sequence_key VARCHAR(80) NOT NULL DEFAULT '${SALES_BILL_SEQUENCE_KEY}',
      last_number BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (store_id, sequence_key)
    )
  `);
}

export async function generateSequentialSalesBillNumber(db, storeId) {
  const client = getDb(db);
  const normalizedStoreId = normalizeStoreId(storeId);
  const prefix = getSalesBillPrefix(normalizedStoreId);

  await ensureInvoiceSequenceSchema(client);

  const seedRes = await client.query(
    `SELECT COALESCE(MAX(SUBSTRING(bill_number FROM $2)::bigint), 0) AS last_number
       FROM sales_bills
      WHERE store_id = $1
        AND bill_number ~ $3`,
    [normalizedStoreId, `^${prefix}([0-9]+)$`, `^${prefix}[0-9]+$`],
  );
  const seed = Number(seedRes.rows?.[0]?.last_number || 0);

  await client.query(
    `INSERT INTO invoice_sequences (store_id, sequence_key, last_number)
     VALUES ($1, $2, $3)
     ON CONFLICT (store_id, sequence_key) DO NOTHING`,
    [normalizedStoreId, SALES_BILL_SEQUENCE_KEY, seed],
  );

  const nextRes = await client.query(
    `UPDATE invoice_sequences
        SET last_number = last_number + 1,
            updated_at = NOW()
      WHERE store_id = $1
        AND sequence_key = $2
      RETURNING last_number`,
    [normalizedStoreId, SALES_BILL_SEQUENCE_KEY],
  );
  const next = Number(nextRes.rows?.[0]?.last_number || 0);
  if (!next) throw new Error("Could not generate invoice number");

  return `${prefix}${String(next).padStart(6, "0")}`;
}
