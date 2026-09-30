#!/usr/bin/env node
/**
 * POS checkout lab: runs the exact per-item locked product query from
 * src/app/api/sales-order/pos/route.js against synthetic volumes.
 *
 * TEMP tables shadow the real table names (pg_temp is searched first), everything
 * runs in ONE transaction and is always rolled back. The script aborts unless every
 * name resolves to the TEMP copy, so real tables are never read or locked.
 *
 * Usage: node scripts/perf-pos-lab.mjs [--label=before] [--scale=1]
 * Output: console + scratch/perf-pos-lab-<label>.json
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const arg = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split("=")[1];
const LABEL = arg("label", "run");
const scale = Number(arg("scale", "1"));
const N_BILLS = Math.round(200000 * scale);
const N_PRODUCTS = Math.round(50000 * scale);
const N_STORES = 10;

const source = fs.readFileSync(path.resolve("src/app/api/sales-order/pos/route.js"), "utf8");
const match = source.match(/const stockRes = await client\.query\(\s*`([\s\S]*?)`,\s*\[productId/);
if (!match) throw new Error("POS lock query not found in route");
const TEMPLATE_RE = /\$\{hasBatchGroup \|\| requestedBatchId \? "([^"]*)" : getAvailableStockSql\("\$2"\)\}/;
if (!TEMPLATE_RE.test(match[1])) throw new Error("available_stock template not found");
const querySql = (withBatch) =>
  match[1].replace(TEMPLATE_RE, (_, batchExpr) => (withBatch ? batchExpr : "COALESCE(batch_totals.qty, 0)"));

const TABLES = [
  "products", "product_saleability", "taxes", "inventory_batches", "stock_transfer_items",
  "stock_in_items", "stock_in", "sales_bill_items", "sales_bills", "stock_out_items", "stock_out",
];

const SETUP = [
  `CREATE TEMP TABLE taxes (id BIGINT PRIMARY KEY, name TEXT, rate NUMERIC, tax_type TEXT)`,
  `INSERT INTO taxes VALUES (1, 'GST 5', 5, 'gst'), (2, 'GST 18', 18, 'gst')`,
  `CREATE TEMP TABLE products (
     id BIGINT PRIMARY KEY, name TEXT, sku TEXT, barcode TEXT, mrp NUMERIC, cost_price NUMERIC,
     selling_price NUMERIC, allow_discount_on_pos BOOLEAN, include_tax BOOLEAN, tax_id BIGINT, is_active BOOLEAN)`,
  `INSERT INTO products SELECT g, 'Product ' || g, 'SKU-' || g, '890' || LPAD(g::text, 10, '0'),
     120, 80, 100, TRUE, g % 2 = 0, (g % 2) + 1, TRUE FROM generate_series(1, ${N_PRODUCTS}) g`,
  `CREATE TEMP TABLE product_saleability (product_id BIGINT, store_id BIGINT, is_active BOOLEAN, mrp NUMERIC, selling_price NUMERIC)`,
  `INSERT INTO product_saleability SELECT p, s, TRUE, 120, 100
     FROM generate_series(1, ${N_PRODUCTS}) p, generate_series(1, ${N_STORES}) s`,
  `CREATE INDEX ON product_saleability (product_id, store_id)`,
  `CREATE TEMP TABLE inventory_batches (
     id BIGSERIAL PRIMARY KEY, product_id BIGINT, store_id BIGINT, status TEXT, available_qty NUMERIC,
     expiry_date DATE, created_at TIMESTAMPTZ, meta JSONB, source_type TEXT, source_id TEXT)`,
  `INSERT INTO inventory_batches (product_id, store_id, status, available_qty, expiry_date, created_at, meta, source_type, source_id)
     SELECT p, s, CASE WHEN b = 3 THEN 'depleted' ELSE 'active' END, CASE WHEN b = 3 THEN 0 ELSE 50 END,
            CURRENT_DATE + (b * 30), NOW() - (b || ' days')::interval,
            jsonb_build_object('mrp', 120, 'sellingPrice', 100), 'stock_in', (p * 10 + b)::text
       FROM generate_series(1, ${N_PRODUCTS}) p, generate_series(1, 2) s, generate_series(1, 3) b`,
  `CREATE INDEX ON inventory_batches (product_id, store_id)`,
  `CREATE INDEX ON inventory_batches (store_id, status, available_qty)`,
  `CREATE TEMP TABLE stock_transfer_items (id BIGINT PRIMARY KEY, destination_mrp NUMERIC, mrp NUMERIC, selling_price NUMERIC)`,
  `CREATE TEMP TABLE stock_in (id BIGINT PRIMARY KEY, status TEXT, destination_id BIGINT)`,
  `INSERT INTO stock_in SELECT g, 'confirmed', (g % ${N_STORES}) + 1 FROM generate_series(1, 5000) g`,
  `CREATE INDEX ON stock_in (destination_id)`,
  `CREATE TEMP TABLE stock_in_items (id BIGSERIAL PRIMARY KEY, stock_in_id BIGINT, product_id BIGINT, qty NUMERIC, mrp NUMERIC, selling_price NUMERIC)`,
  `INSERT INTO stock_in_items (stock_in_id, product_id, qty, mrp, selling_price)
     SELECT si, (random() * ${N_PRODUCTS - 1})::bigint + 1, 100, 120, 100 FROM generate_series(1, 5000) si, generate_series(1, 20)`,
  `CREATE INDEX ON stock_in_items (product_id)`,
  `CREATE INDEX ON stock_in_items (stock_in_id)`,
  `CREATE TEMP TABLE sales_bills (id BIGINT PRIMARY KEY, store_id BIGINT, status TEXT, created_at TIMESTAMPTZ)`,
  `INSERT INTO sales_bills SELECT g, (g % ${N_STORES}) + 1, 'completed', NOW() - (random() * INTERVAL '365 days')
     FROM generate_series(1, ${N_BILLS}) g`,
  `CREATE INDEX ON sales_bills (store_id, created_at, id) WHERE status IN ('paid', 'completed')`,
  `CREATE TEMP TABLE sales_bill_items (id BIGSERIAL PRIMARY KEY, sales_bill_id BIGINT, product_id BIGINT, qty NUMERIC)`,
  `INSERT INTO sales_bill_items (sales_bill_id, product_id, qty)
     SELECT b, (random() * ${N_PRODUCTS - 1})::bigint + 1, 1 FROM generate_series(1, ${N_BILLS}) b, generate_series(1, 3)`,
  `CREATE INDEX ON sales_bill_items (sales_bill_id, product_id)`,
  `CREATE TEMP TABLE stock_out (id BIGSERIAL PRIMARY KEY, status TEXT, destination_id BIGINT, reference_type TEXT, created_at TIMESTAMPTZ)`,
  `INSERT INTO stock_out (status, destination_id, reference_type, created_at)
     SELECT 'confirmed', (g % ${N_STORES}) + 1, CASE WHEN g % 5 = 0 THEN 'manual' ELSE 'sales_bill' END, NOW()
       FROM generate_series(1, ${N_BILLS / 2}) g`,
  `CREATE INDEX ON stock_out (created_at, id)`,
  `CREATE TEMP TABLE stock_out_items (id BIGSERIAL PRIMARY KEY, stock_out_id BIGINT, product_id BIGINT, qty NUMERIC)`,
  `INSERT INTO stock_out_items (stock_out_id, product_id, qty)
     SELECT so, (random() * ${N_PRODUCTS - 1})::bigint + 1, 1 FROM generate_series(1, ${N_BILLS / 2}) so, generate_series(1, 3)`,
  `CREATE INDEX ON stock_out_items (stock_out_id, product_id)`,
  TABLES.map((t) => `ANALYZE ${t}`).join("; "),
];

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const useSsl =
  String(process.env.DB_SSL || "").toLowerCase() === "true" || /sslmode=require/i.test(databaseUrl);
const client = new pg.Client({ connectionString: databaseUrl, ssl: useSsl ? { rejectUnauthorized: false } : false });

async function explain(sql, params) {
  const r = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params);
  const p = r.rows[0]["QUERY PLAN"][0];
  return { planningMs: Number(p["Planning Time"].toFixed(2)), executionMs: Number(p["Execution Time"].toFixed(2)) };
}

async function median(sql, params, runs = 5) {
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(await explain(sql, params));
  const mid = (key) => samples.map((s) => s[key]).sort((a, b) => a - b)[Math.floor(runs / 2)];
  return { planningMs: mid("planningMs"), executionMs: mid("executionMs") };
}

async function main() {
  await client.connect();
  const results = {};
  try {
    await client.query("BEGIN");
    const t0 = performance.now();
    for (const sql of SETUP) await client.query(sql);
    const shadow = await client.query(
      `SELECT t, to_regclass(t)::oid = to_regclass('pg_temp.' || t)::oid AS is_temp FROM unnest($1::text[]) t`,
      [TABLES],
    );
    const leaked = shadow.rows.filter((r) => !r.is_temp).map((r) => r.t);
    if (leaked.length) throw new Error(`Refusing to run: not shadowed by TEMP tables: ${leaked.join(", ")}`);
    console.log(`Setup (${LABEL}): ${N_BILLS} bills, ${N_BILLS * 3} items, ${N_PRODUCTS} products (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

    const batchId = (await client.query(
      `SELECT id FROM inventory_batches WHERE product_id = 4242 AND store_id = 1 AND status = 'active' ORDER BY id LIMIT 1`,
    )).rows[0].id;
    results.noBatch = await median(querySql(false), [4242, 1, null, []]);
    results.selectedBatch = await median(querySql(true), [4242, 1, batchId, []]);
    const row = (await client.query(querySql(false), [4242, 1, null, []])).rows[0];
    results.sampleRow = { id: Number(row.id), available_stock: Number(row.available_stock), selling_price: Number(row.selling_price), mrp: Number(row.mrp) };
    for (const [name, r] of Object.entries(results)) console.log(`  ${name}: ${JSON.stringify(r)}`);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
  fs.mkdirSync(path.resolve("scratch"), { recursive: true });
  fs.writeFileSync(
    path.resolve("scratch", `perf-pos-lab-${LABEL}.json`),
    JSON.stringify({ at: new Date().toISOString(), N_BILLS, N_PRODUCTS, results }, null, 2),
  );
  console.log(`Rolled back. Saved scratch/perf-pos-lab-${LABEL}.json`);
}

main().catch((err) => {
  console.error("POS lab failed:", err.message);
  process.exitCode = 1;
});
