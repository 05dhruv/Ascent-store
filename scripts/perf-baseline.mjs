#!/usr/bin/env node
/**
 * Read-only performance baseline.
 *
 * Usage:
 *   node scripts/perf-baseline.mjs --label=before [--base=http://localhost:3000] [--runs=5] [--db-only] [--only=auth/me,public/products]
 *
 * Requires the app to be running (prefer `npm run build && npm start`).
 * Mints a short-lived access token for the first active super_admin using the
 * JWT_SECRET from .env, so no credentials are needed. Never writes to the DB:
 * EXPLAIN ANALYZE runs inside a transaction that is always rolled back.
 * Results are written to scratch/perf-<label>.json.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import jwt from "jsonwebtoken";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  }),
);
const LABEL = String(args.label || "run");
const BASE = String(args.base || "http://localhost:3000").replace(/\/$/, "");
const RUNS = Number(args.runs || 5);

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const useSsl =
  String(process.env.DB_SSL || "").toLowerCase() === "true" ||
  /sslmode=require/i.test(databaseUrl);
const pool = new pg.Pool({
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
  max: 2,
});

async function tableCounts() {
  const tables = [
    "products", "sales_bills", "sales_bill_items", "sales_bill_payments",
    "customers", "employees", "users", "user_stores", "inventory_batches",
    "stock_out", "stock_transfer", "purchase_orders", "stores",
  ];
  const out = {};
  for (const t of tables) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::bigint AS n FROM ${t}`);
      out[t] = Number(r.rows[0].n);
    } catch {
      out[t] = null;
    }
  }
  return out;
}

function summarizePlan(node, acc = new Set()) {
  if (!node) return acc;
  const type = node["Node Type"];
  const rel = node["Relation Name"] ? ` on ${node["Relation Name"]}` : "";
  const idx = node["Index Name"] ? ` using ${node["Index Name"]}` : "";
  acc.add(`${type}${rel}${idx}`);
  for (const child of node.Plans || []) summarizePlan(child, acc);
  return acc;
}

async function explain(label, sql, params) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
      params,
    );
    const plan = r.rows[0]["QUERY PLAN"][0];
    return {
      label,
      executionMs: Number(plan["Execution Time"].toFixed(2)),
      planningMs: Number(plan["Planning Time"].toFixed(2)),
      nodes: [...summarizePlan(plan.Plan)],
    };
  } catch (err) {
    return { label, error: err.message };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

async function timeEndpoint(label, url, token) {
  const headers = { cookie: `access_token=${token}` };
  const samples = [];
  let bytes = 0;
  let status = 0;
  for (let i = 0; i <= RUNS; i++) {
    const start = performance.now();
    const res = await fetch(`${BASE}${url}`, { headers, cache: "no-store" });
    const buf = await res.arrayBuffer();
    const ms = performance.now() - start;
    status = res.status;
    bytes = buf.byteLength;
    if (i > 0) samples.push(ms); // first request is warm-up
  }
  samples.sort((a, b) => a - b);
  return {
    label,
    url,
    status,
    bytes,
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(1)),
    minMs: Number(samples[0].toFixed(1)),
    maxMs: Number(samples[samples.length - 1].toFixed(1)),
  };
}

async function main() {
  const admin = (
    await pool.query(
      `SELECT id, email, name, role FROM users
        WHERE role = 'super_admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
    )
  ).rows[0];
  if (!admin) throw new Error("No active super_admin user found");

  const secret =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "change-me-in-production-please");
  const token = jwt.sign(
    { sub: admin.id, email: admin.email, name: admin.name, role: admin.role, type: "access" },
    secret,
    { expiresIn: "15m", issuer: "billing-software" },
  );

  const store = (
    await pool.query(
      `SELECT store_id, COUNT(*) AS n FROM sales_bills
        WHERE store_id IS NOT NULL GROUP BY store_id ORDER BY n DESC LIMIT 1`,
    )
  ).rows[0];
  const storeId = Number(store?.store_id || (await pool.query(`SELECT id FROM stores ORDER BY id LIMIT 1`)).rows[0]?.id || 1);
  const product = (
    await pool.query(
      `SELECT id, barcode FROM products WHERE barcode IS NOT NULL AND barcode <> '' ORDER BY id LIMIT 1`,
    )
  ).rows[0];
  const billId = (
    await pool.query(`SELECT id FROM sales_bills ORDER BY id DESC LIMIT 1`)
  ).rows[0]?.id || 0;

  const counts = await tableCounts();

  const prefix = `INV-${String(storeId).padStart(3, "0")}-`;
  const explains = [];
  explains.push(await explain(
    "auth: employee lookup",
    `SELECT role_name, permissions FROM employees
      WHERE user_id = $1 OR LOWER(email_address) = LOWER($2) OR LOWER(username) = LOWER($3)
      ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [admin.id, admin.email || "", admin.name || ""],
  ));
  explains.push(await explain(
    "invoice: seed scan",
    `SELECT COALESCE(MAX(SUBSTRING(bill_number FROM $2)::bigint), 0) AS last_number
       FROM sales_bills WHERE store_id = $1 AND bill_number ~ $3`,
    [storeId, `^${prefix}([0-9]+)$`, `^${prefix}[0-9]+$`],
  ));
  explains.push(await explain(
    "sales_bills: store + last 30 days",
    `SELECT id, grand_total, created_at FROM sales_bills
      WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC LIMIT 50`,
    [storeId],
  ));
  explains.push(await explain(
    "sales_bills: date range (analytics style)",
    `SELECT COUNT(*) FROM sales_bills sb
      WHERE DATE(sb.created_at) >= (CURRENT_DATE - 30) AND DATE(sb.created_at) <= CURRENT_DATE`,
    [],
  ));
  explains.push(await explain(
    "products: barcode equality",
    `SELECT id FROM products WHERE barcode = $1`,
    [product?.barcode || "none"],
  ));
  explains.push(await explain(
    "sales_bill_items by bill",
    `SELECT * FROM sales_bill_items WHERE sales_bill_id = $1`,
    [billId],
  ));
  explains.push(await explain(
    "sales_bill_payments by bill",
    `SELECT * FROM sales_bill_payments WHERE sales_bill_id = $1`,
    [billId],
  ));
  explains.push(await explain(
    "stock_out by reference",
    `SELECT id FROM stock_out WHERE reference_type = 'sales_bill' AND reference_id = $1`,
    [String(billId)],
  ));

  const endpoints = [
    ["auth/me", `/api/auth/me`],
    ["catalog/products page 1", `/api/catalog/products?page=1&pageSize=50`],
    ["pos/barcode-lookup", `/api/pos/barcode-lookup?barcode=${encodeURIComponent(product?.barcode || "")}&store_id=${storeId}`],
    ["notifications/summary", `/api/notifications/summary`],
    ["dashboard/analytics", `/api/dashboard/analytics`],
    ["customer/dashboard", `/api/customer/dashboard`],
    ["catalog/dashboard", `/api/catalog/dashboard`],
    ["public/products", `/api/public/products?store_id=${storeId}`],
    ["inventory/products store", `/api/inventory/products?store_id=${storeId}`],
    ["inventory/products batches", `/api/inventory/products?store_id=${storeId}&batch_variants=1&include_master=1`],
    ["inventory/products warehouse", `/api/inventory/products?warehouse_stock=true`],
  ];
  const only = args.only ? String(args.only).split(",") : null;
  const http = [];
  for (const [label, url] of args["db-only"]
    ? []
    : endpoints.filter(([label]) => !only || only.includes(label))) {
    try {
      http.push(await timeEndpoint(label, url, token));
    } catch (err) {
      http.push({ label, url, error: err.message });
    }
  }

  const result = { label: LABEL, at: new Date().toISOString(), base: BASE, runs: RUNS, storeId, counts, explains, http };
  const outDir = path.resolve("scratch");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `perf-${LABEL}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log(`\nRow counts:`, counts);
  console.log(`\nEXPLAIN ANALYZE:`);
  for (const e of explains) {
    console.log(`  ${e.label}: ${e.error ? "ERROR " + e.error : `${e.executionMs}ms  [${e.nodes.join(" | ")}]`}`);
  }
  console.log(`\nHTTP (median of ${RUNS}):`);
  for (const h of http) {
    console.log(`  ${h.label}: ${h.error ? "ERROR " + h.error : `${h.status} ${h.medianMs}ms (min ${h.minMs}, max ${h.maxMs}) ${(h.bytes / 1024).toFixed(1)} KB`}`);
  }
  console.log(`\nSaved ${outFile}`);
}

main()
  .catch((err) => {
    console.error("Baseline failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
