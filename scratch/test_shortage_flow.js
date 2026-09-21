import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ascent_store'
});

async function run() {
  console.log("Running migrations...");
  await pool.query(`
    ALTER TABLE stock_requisitions
      ADD COLUMN IF NOT EXISTS requested_by_user_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER REFERENCES purchase_orders(id),
      ADD COLUMN IF NOT EXISTS stock_transfer_id INTEGER,
      ADD COLUMN IF NOT EXISTS vendor_id INTEGER,
      ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS po_emailed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS email_message_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS shortage_status VARCHAR(50) DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS total_shortage_qty NUMERIC(14, 3) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS approved_by_user_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

    ALTER TABLE stock_requisition_items
      ADD COLUMN IF NOT EXISTS available_qty NUMERIC(14, 3) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shortage_qty NUMERIC(14, 3) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
      ADD COLUMN IF NOT EXISTS dimensions VARCHAR(255);

    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
      ADD COLUMN IF NOT EXISTS dimensions VARCHAR(255);
  `);
  console.log("Migrations applied successfully.");

  console.log("\nTesting report SQL query...");
  const sql = `
    SELECT 
      sr.id AS requisition_id,
      COALESCE(sr.created_at) AS date,
      sr.created_at,
      sr.source_id,
      s_src.name AS source_name,
      sr.destination_id,
      s_dest.name AS destination_name,
      sr.status AS fulfillment_status,
      sr.approval_status,
      sr.approved_at,
      COALESCE(u_req.name, sr.requested_by) AS requester_name,
      COALESCE(u_req.email, sr.mail_to) AS requester_email,
      u_app.name AS approver_name,
      sr.stock_transfer_id,
      sr.purchase_order_id,
      po.transaction_id AS po_transaction_id,
      sr.vendor_id,
      COALESCE(sr.vendor_email, v.email) AS vendor_email,
      COALESCE(v.name, sr.remarks) AS vendor_name,
      sr.po_emailed_at,
      sr.shortage_status,
      sr.total_shortage_qty,
      sri.id AS item_id,
      sri.product_id,
      COALESCE(sri.product_name, p.name) AS product_name,
      p.sku AS product_sku,
      p.barcode AS product_barcode,
      COALESCE(sri.unit, p.unit, 'PCS') AS unit,
      COALESCE(sri.dimensions, p.dimensions, '-') AS dimensions,
      sri.qty AS requested_qty,
      sri.qty AS approved_qty,
      COALESCE(sri.fulfilled_qty, 0) AS fulfilled_qty,
      COALESCE(sri.available_qty, 0) AS available_qty,
      COALESCE(sri.shortage_qty, 0) AS shortage_qty
    FROM stock_requisitions sr
    JOIN stock_requisition_items sri ON sri.requisition_id = sr.id
    LEFT JOIN stores s_src ON s_src.id = sr.source_id
    LEFT JOIN stores s_dest ON s_dest.id = sr.destination_id
    LEFT JOIN users u_req ON u_req.id = sr.requested_by_user_id
    LEFT JOIN users u_app ON u_app.id = sr.approved_by_user_id
    LEFT JOIN products p ON p.id = sri.product_id
    LEFT JOIN purchase_orders po ON po.id = sr.purchase_order_id
    LEFT JOIN vendors v ON v.id = sr.vendor_id
    ORDER BY sr.id DESC, sri.id ASC
    LIMIT 5
  `;
  const res = await pool.query(sql);
  console.log(`Query succeeded! Returned ${res.rowCount} rows.`);
  if (res.rows.length > 0) {
    console.log("Sample row:", res.rows[0]);
  }

  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
