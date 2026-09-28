#!/usr/bin/env node
/**
 * Index lab: measures proposed indexes against realistic synthetic volumes
 * without touching real data.
 *
 * Everything runs inside ONE transaction on TEMP tables and is always rolled
 * back, so nothing persists and no real table is read or locked. Table shapes
 * mirror the columns/indexes the app actually uses (see src/lib/*Schema.js).
 *
 * Usage: node scripts/perf-index-lab.mjs [--scale=1]
 * Output: console + scratch/perf-index-lab.json
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const scale = Number(
  (process.argv.find((a) => a.startsWith("--scale=")) || "--scale=1").split("=")[1],
);
const N_BILLS = Math.round(200000 * scale);
const N_PRODUCTS = Math.round(50000 * scale);
const N_EMPLOYEES = 2000;

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const useSsl =
  String(process.env.DB_SSL || "").toLowerCase() === "true" ||
  /sslmode=require/i.test(databaseUrl);
const client = new pg.Client({
  ...(databaseUrl
    ? { connectionString: databaseUrl }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || "buyzaar_sync",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
      }),
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

function nodes(plan, acc = []) {
  const rel = plan["Relation Name"] ? ` on ${plan["Relation Name"]}` : "";
  const idx = plan["Index Name"] ? ` using ${plan["Index Name"]}` : "";
  acc.push(`${plan["Node Type"]}${rel}${idx}`);
  for (const c of plan.Plans || []) nodes(c, acc);
  return acc;
}

async function explain(sql, params = []) {
  const r = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
  const p = r.rows[0]["QUERY PLAN"][0];
  return {
    ms: Number(p["Execution Time"].toFixed(2)),
    plan: [...new Set(nodes(p.Plan))].join(" > "),
  };
}

const SETUP = [
  // sales_bills: 10 stores, 1 year, ~40 bills per counter session
  `CREATE TEMP TABLE lab_bills (
     id BIGINT PRIMARY KEY, bill_number VARCHAR(80) UNIQUE, store_id BIGINT,
     session_id VARCHAR(120), user_id BIGINT, status VARCHAR(30),
     grand_total NUMERIC(14,2), paid_amount NUMERIC(14,2), created_at TIMESTAMPTZ NOT NULL)`,
  `INSERT INTO lab_bills
     SELECT g, 'INV-' || LPAD(((g % 10) + 1)::text, 3, '0') || '-' || LPAD(g::text, 6, '0'),
            (g % 10) + 1, 'S' || (g / 40), (g % 50) + 1,
            CASE WHEN g % 60 = 0 THEN 'cancelled' ELSE 'paid' END,
            (random() * 2000)::numeric(14,2), (random() * 2000)::numeric(14,2),
            NOW() - (random() * INTERVAL '365 days')
       FROM generate_series(1, ${N_BILLS}) g`,
  // existing lazy report index (assume present = favourable "before")
  `CREATE INDEX lab_bills_report_partial ON lab_bills(store_id, created_at, id)
     WHERE status IN ('paid', 'completed')`,
  // sales_bill_items: 3 per bill
  `CREATE TEMP TABLE lab_items (id BIGSERIAL PRIMARY KEY, sales_bill_id BIGINT, product_id BIGINT, qty NUMERIC(14,3))`,
  `INSERT INTO lab_items (sales_bill_id, product_id, qty)
     SELECT b, (random() * ${N_PRODUCTS - 1})::bigint + 1, 1 + (random() * 4)::int
       FROM generate_series(1, ${N_BILLS}) b, generate_series(1, 3)`,
  // sales_bill_payments: ~1.1 per bill
  `CREATE TEMP TABLE lab_payments (id BIGSERIAL PRIMARY KEY, sales_bill_id BIGINT, method VARCHAR(40), amount NUMERIC(14,2))`,
  `INSERT INTO lab_payments (sales_bill_id, method, amount)
     SELECT g, 'cash', 100 FROM generate_series(1, ${N_BILLS}) g
     UNION ALL SELECT g, 'upi', 50 FROM generate_series(1, ${N_BILLS}, 10) g`,
  // products with the existing normalized-barcode expression index
  `CREATE TEMP TABLE lab_products (id BIGINT PRIMARY KEY, name TEXT, barcode VARCHAR(160), sku VARCHAR(160))`,
  `INSERT INTO lab_products
     SELECT g, 'Product ' || g, '890' || LPAD(g::text, 10, '0'), 'SKU-' || g
       FROM generate_series(1, ${N_PRODUCTS}) g`,
  `CREATE INDEX lab_products_barcode_norm ON lab_products (LOWER(TRIM(REGEXP_REPLACE(COALESCE(barcode, ''), '^''+', ''))))`,
  // employees with the existing UNIQUE constraints
  `CREATE TEMP TABLE lab_employees (
     id BIGSERIAL PRIMARY KEY, user_id BIGINT UNIQUE, username VARCHAR(120) NOT NULL UNIQUE,
     email_address VARCHAR(190) UNIQUE, role_name TEXT, permissions JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`,
  `INSERT INTO lab_employees (user_id, username, email_address, role_name, permissions)
     SELECT g, 'User' || g, 'user' || g || '@example.com', 'cashier', '[]'::jsonb
       FROM generate_series(1, ${N_EMPLOYEES}) g`,
  // stock_out for half the bills + items (existing index on items.stock_out_id)
  `CREATE TEMP TABLE lab_stock_out (id BIGSERIAL PRIMARY KEY, reference_type VARCHAR(40), reference_id VARCHAR(80))`,
  `INSERT INTO lab_stock_out (reference_type, reference_id)
     SELECT 'sales_bill', g::text FROM generate_series(1, ${N_BILLS}, 2) g`,
  `CREATE TEMP TABLE lab_stock_out_items (id BIGSERIAL PRIMARY KEY, stock_out_id BIGINT, product_id BIGINT, qty NUMERIC, cost_price NUMERIC)`,
  `INSERT INTO lab_stock_out_items (stock_out_id, product_id, qty, cost_price)
     SELECT so.id, (random() * ${N_PRODUCTS - 1})::bigint + 1, 1, 10 FROM lab_stock_out so, generate_series(1, 3)`,
  `CREATE INDEX lab_soi_stock_out ON lab_stock_out_items(stock_out_id)`,
  `ANALYZE lab_bills; ANALYZE lab_items; ANALYZE lab_payments; ANALYZE lab_products;
   ANALYZE lab_employees; ANALYZE lab_stock_out; ANALYZE lab_stock_out_items`,
];

const EXPERIMENTS = [
  {
    name: "auth: employees OR/LOWER lookup",
    sql: `SELECT role_name, permissions FROM lab_employees
           WHERE user_id = $1 OR LOWER(email_address) = LOWER($2) OR LOWER(username) = LOWER($3)
           ORDER BY updated_at DESC, id DESC LIMIT 1`,
    params: [1500, "user1500@example.com", "User1500"],
    indexes: [
      `CREATE INDEX lab_emp_lower_email ON lab_employees (LOWER(email_address))`,
      `CREATE INDEX lab_emp_lower_username ON lab_employees (LOWER(username))`,
    ],
  },
  {
    name: "invoice: seed MAX(bill_number) scan per store",
    sql: `SELECT COALESCE(MAX(SUBSTRING(bill_number FROM $2)::bigint), 0)
            FROM lab_bills WHERE store_id = $1 AND bill_number ~ $3`,
    params: [3, "^INV-003-([0-9]+)$", "^INV-003-[0-9]+$"],
    indexes: [], // removed from the hot path by the fast path instead
  },
  {
    name: "POS bill tracker: store + today, ORDER BY created_at DESC",
    beforeSql: `SELECT id, bill_number, grand_total, created_at FROM lab_bills
                 WHERE store_id = $1 AND created_at::date = CURRENT_DATE AND created_at <= NOW()
                 ORDER BY created_at DESC LIMIT 50 OFFSET 0`,
    sql: `SELECT id, bill_number, grand_total, created_at FROM lab_bills
           WHERE store_id = $1 AND created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + 1
             AND created_at <= NOW()
           ORDER BY created_at DESC LIMIT 50 OFFSET 0`,
    params: [3],
    indexes: [`CREATE INDEX lab_bills_store_created ON lab_bills (store_id, created_at DESC)`],
  },
  {
    name: "analytics: 30-day totals, all stores",
    beforeSql: `SELECT COALESCE(SUM(grand_total),0), COUNT(DISTINCT id) FROM lab_bills
                 WHERE DATE(created_at) >= (CURRENT_DATE - 30) AND DATE(created_at) <= CURRENT_DATE
                   AND status != 'cancelled'`,
    sql: `SELECT COALESCE(SUM(grand_total),0), COUNT(DISTINCT id) FROM lab_bills
           WHERE created_at >= (CURRENT_DATE - 30) AND created_at < (CURRENT_DATE + 1)
             AND status != 'cancelled'`,
    indexes: [`CREATE INDEX lab_bills_created ON lab_bills (created_at)`],
  },
  {
    name: "counter closing: bills by session_id",
    sql: `SELECT COUNT(*), COALESCE(SUM(grand_total),0) FROM lab_bills WHERE session_id = $1`,
    params: ["S2500"],
    indexes: [`CREATE INDEX lab_bills_session ON lab_bills (session_id)`],
  },
  {
    name: "POS scan: products.barcode = $1",
    sql: `SELECT id FROM lab_products WHERE barcode = $1`,
    params: ["8900000042424"],
    indexes: [`CREATE INDEX lab_products_barcode ON lab_products (barcode)`],
  },
  {
    name: "bill detail: sales_bill_items by sales_bill_id",
    sql: `SELECT * FROM lab_items WHERE sales_bill_id = $1`,
    params: [123456],
    indexes: [`CREATE INDEX lab_items_bill_product ON lab_items (sales_bill_id, product_id)`],
  },
  {
    name: "bill detail: sales_bill_payments by sales_bill_id",
    sql: `SELECT * FROM lab_payments WHERE sales_bill_id = $1`,
    params: [123456],
    indexes: [`CREATE INDEX lab_payments_bill ON lab_payments (sales_bill_id)`],
  },
  {
    name: "analytics COGS: LATERAL stock_out by reference, last 1 day",
    sql: `SELECT COALESCE(SUM(x.issued), 0)
            FROM lab_bills b
            JOIN lab_items i ON i.sales_bill_id = b.id
            LEFT JOIN LATERAL (
              SELECT SUM(soi.qty) AS issued FROM lab_stock_out so
                JOIN lab_stock_out_items soi ON soi.stock_out_id = so.id
               WHERE so.reference_type = 'sales_bill' AND so.reference_id = b.id::text
                 AND soi.product_id = i.product_id) x ON TRUE
           WHERE b.created_at >= NOW() - INTERVAL '1 day'`,
    // Runs after the created_at and items indexes above exist, so this isolates stock_out.
    indexes: [`CREATE INDEX lab_stock_out_ref ON lab_stock_out (reference_type, reference_id)`],
  },
];

async function main() {
  await client.connect();
  const results = [];
  try {
    await client.query("BEGIN");
    const t0 = performance.now();
    for (const sql of SETUP) await client.query(sql);
    console.log(
      `Setup: ${N_BILLS} bills, ${N_BILLS * 3} items, ${N_PRODUCTS} products, ${N_EMPLOYEES} employees ` +
        `(${((performance.now() - t0) / 1000).toFixed(1)}s)\n`,
    );

    for (const exp of EXPERIMENTS) {
      const before = await explain(exp.beforeSql || exp.sql, exp.params);
      for (const idx of exp.indexes) await client.query(idx);
      if (exp.indexes.length) await client.query("ANALYZE lab_bills; ANALYZE lab_items; ANALYZE lab_payments; ANALYZE lab_products; ANALYZE lab_employees; ANALYZE lab_stock_out");
      const after = exp.indexes.length || exp.beforeSql ? await explain(exp.sql, exp.params) : null;
      results.push({ name: exp.name, before, after, indexes: exp.indexes });
      console.log(`${exp.name}`);
      console.log(`  before: ${before.ms}ms  ${before.plan}`);
      if (after) console.log(`  after:  ${after.ms}ms  ${after.plan}`);
      console.log("");
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
  fs.mkdirSync(path.resolve("scratch"), { recursive: true });
  fs.writeFileSync(
    path.resolve("scratch", "perf-index-lab.json"),
    JSON.stringify({ at: new Date().toISOString(), N_BILLS, N_PRODUCTS, results }, null, 2),
  );
  console.log("Rolled back. Saved scratch/perf-index-lab.json");
}

main().catch((err) => {
  console.error("Index lab failed:", err.message);
  process.exitCode = 1;
});
