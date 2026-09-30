#!/usr/bin/env node
/**
 * catalog/products lab: compares the old list query shape (store-wide batch
 * GROUP BY before LIMIT) with the new one (page ids first, per-row LATERAL
 * aggregates) on synthetic volumes, and checks both return identical rows.
 *
 * TEMP tables shadow the real names inside ONE transaction that is always
 * rolled back; the script refuses to run unless every name resolves to pg_temp.
 *
 * Usage: node scripts/perf-catalog-lab.mjs [--scale=1]
 */
import "dotenv/config";
import pg from "pg";

const scale = Number((process.argv.find((a) => a.startsWith("--scale=")) || "--scale=1").split("=")[1]);
const N_PRODUCTS = Math.round(50000 * scale);

const TABLES = [
  "products", "categories", "sub_categories", "brands", "manufacturers", "departments",
  "income_heads", "taxes", "product_saleability", "inventory_batches", "stores",
];

const SETUP = [
  ...["categories", "sub_categories", "manufacturers", "departments", "income_heads"].map(
    (t) => `CREATE TEMP TABLE ${t} AS SELECT g AS id, '${t} ' || g AS name FROM generate_series(1, 50) g`,
  ),
  `CREATE TEMP TABLE brands AS SELECT g AS id, 'brand ' || g AS name, (g % 50) + 1 AS category_id FROM generate_series(1, 200) g`,
  `CREATE TEMP TABLE taxes AS SELECT g AS id, 'GST ' || g AS name, g * 5 AS rate FROM generate_series(1, 4) g`,
  `CREATE TEMP TABLE stores AS SELECT g AS id, jsonb_build_object('locationType', CASE WHEN g = 1 THEN 'Warehouse' ELSE 'Store' END) AS meta FROM generate_series(1, 10) g`,
  `CREATE TEMP TABLE products AS SELECT g AS id, 'P' || g AS product_id, 'Product ' || g AS name, '890' || g AS barcode, 'SKU' || g AS sku,
     (g % 50) + 1 AS category_id, (g % 50) + 1 AS sub_category_id, (g % 200) + 1 AS brand_id, (g % 50) + 1 AS manufacturer_id,
     (g % 50) + 1 AS department_id, (g % 50) + 1 AS income_head_id, (g % 4) + 1 AS tax_id,
     120::numeric AS mrp, 100::numeric AS selling_price, 80::numeric AS cost_price, 'PCS' AS unit,
     TRUE AS is_active, NOW() AS created_at, NOW() AS updated_at
     FROM generate_series(1, ${N_PRODUCTS}) g`,
  `ALTER TABLE products ADD PRIMARY KEY (id)`,
  `CREATE TEMP TABLE product_saleability AS SELECT p AS product_id, s AS store_id, TRUE AS is_active,
     110::numeric AS mrp, 95::numeric AS selling_price, 70::numeric AS franchise_cost
     FROM generate_series(1, ${N_PRODUCTS}) p, generate_series(2, 4) s`,
  `CREATE INDEX ON product_saleability (product_id, store_id)`,
  `CREATE TEMP TABLE inventory_batches AS SELECT row_number() OVER () AS id, p AS product_id, s AS store_id,
     CASE WHEN b = 3 THEN 'depleted' ELSE 'active' END AS status, (10 * b)::numeric AS available_qty,
     (70 + b)::numeric AS cost_price, CURRENT_DATE + b * 30 AS expiry_date, NOW() - (b || ' days')::interval AS created_at,
     jsonb_build_object('sellingPrice', (100 + b)::text, 'mrp', (120 + b)::text) AS meta
     FROM generate_series(1, ${N_PRODUCTS}) p, generate_series(1, 4) s, generate_series(1, 3) b`,
  `CREATE INDEX ON inventory_batches (product_id, store_id)`,
  TABLES.map((t) => `ANALYZE ${t}`).join("; "),
];

const COLUMNS = (latest, agg) => `
  p.id, p.product_id, p.name, p.barcode, p.sku,
  COALESCE(p.category_id, b.category_id) AS category_id,
  COALESCE(NULLIF(${latest}.mrp, 0), NULLIF(${agg}.min_mrp, 0), NULLIF(ps_store.mrp, 0), p.mrp, 0) AS mrp,
  COALESCE(NULLIF(${latest}.selling_price, 0), NULLIF(${agg}.min_selling_price, 0), NULLIF(ps_store.selling_price, 0), p.selling_price, 0) AS selling_price,
  COALESCE(NULLIF(${latest}.cost_price, 0), NULLIF(${agg}.min_cost_price, 0), NULLIF(${agg}.stock_cost / NULLIF(${agg}.qty, 0), 0), NULLIF(ps_store.franchise_cost, 0), p.cost_price, 0) AS cost_price,
  COALESCE(c.name, bc.name) AS category_name, sc.name AS sub_category_name, b.name AS brand_name,
  m.name AS manufacturer_name, d.name AS department_name, ih.name AS income_head_name, t.name AS tax_name, t.rate AS tax_rate,
  COALESCE(${agg}.qty, 0) AS actual_stock, COALESCE(${agg}.active_batch_count, 0) AS active_batch_count,
  ${agg}.min_cost_price, ${agg}.max_cost_price, ${agg}.min_selling_price, ${agg}.max_selling_price,
  ${agg}.min_mrp, ${agg}.max_mrp, ${agg}.batch_unit`;

const JOINS = (storeParam) => `
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN sub_categories sc ON p.sub_category_id = sc.id
  LEFT JOIN brands b ON p.brand_id = b.id
  LEFT JOIN categories bc ON b.category_id = bc.id
  LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
  LEFT JOIN departments d ON p.department_id = d.id
  LEFT JOIN income_heads ih ON p.income_head_id = ih.id
  LEFT JOIN taxes t ON p.tax_id = t.id
  LEFT JOIN product_saleability ps_store ON ps_store.product_id = p.id AND ps_store.store_id = ${storeParam ? "$1" : 0} AND ps_store.is_active = TRUE
  LEFT JOIN LATERAL (
    SELECT ib.id AS batch_id, ib.status, ib.cost_price,
           NULLIF(ib.meta->>'sellingPrice', '')::numeric AS selling_price, NULLIF(ib.meta->>'mrp', '')::numeric AS mrp
    FROM inventory_batches ib WHERE ib.product_id = p.id ${storeParam ? "AND store_id = $1" : ""}
    ORDER BY CASE WHEN ib.status = 'active' THEN 0 ELSE 1 END, ib.created_at DESC NULLS LAST, ib.id DESC LIMIT 1
  ) latest_store_batch ON TRUE`;

const AGG_COLUMNS = `SUM(available_qty) AS qty, SUM(available_qty * cost_price) AS stock_cost, COUNT(*)::INT AS active_batch_count,
  MIN(cost_price) AS min_cost_price, MAX(cost_price) AS max_cost_price,
  MIN(NULLIF(meta->>'sellingPrice', '')::numeric) AS min_selling_price, MAX(NULLIF(meta->>'sellingPrice', '')::numeric) AS max_selling_price,
  MIN(NULLIF(meta->>'mrp', '')::numeric) AS min_mrp, MAX(NULLIF(meta->>'mrp', '')::numeric) AS max_mrp,
  MAX(NULLIF(meta->>'unit', '')) AS batch_unit`;

function oldSql(storeParam, where, limitParams) {
  return `SELECT ${COLUMNS("latest_store_batch", "batch_agg")}
    FROM products p ${JOINS(storeParam)}
    LEFT JOIN (
      SELECT product_id, ${AGG_COLUMNS} FROM inventory_batches
      WHERE status = 'active' ${storeParam ? "AND store_id = $1" : ""} AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
      GROUP BY product_id
    ) batch_agg ON batch_agg.product_id = p.id
    ${where} ORDER BY p.id DESC LIMIT ${limitParams[0]} OFFSET ${limitParams[1]}`;
}

function newSql(storeParam, where, limitParams) {
  return `WITH page_products AS MATERIALIZED (
      SELECT p.id FROM products p ${where} ORDER BY p.id DESC LIMIT ${limitParams[0]} OFFSET ${limitParams[1]}
    )
    SELECT ${COLUMNS("latest_store_batch", "batch_agg")}
    FROM page_products pp JOIN products p ON p.id = pp.id ${JOINS(storeParam)}
    LEFT JOIN LATERAL (
      SELECT ${AGG_COLUMNS} FROM inventory_batches
      WHERE product_id = p.id AND status = 'active' ${storeParam ? "AND store_id = $1" : ""} AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    ) batch_agg ON TRUE
    ORDER BY p.id DESC`;
}

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const useSsl = String(process.env.DB_SSL || "").toLowerCase() === "true" || /sslmode=require/i.test(databaseUrl);
const client = new pg.Client({ connectionString: databaseUrl, ssl: useSsl ? { rejectUnauthorized: false } : false });

async function execMs(sql, params) {
  const samples = [];
  for (let run = 0; run < 5; run++) {
    const r = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params);
    samples.push(r.rows[0]["QUERY PLAN"][0]["Execution Time"]);
  }
  return Number(samples.sort((a, b) => a - b)[2].toFixed(2));
}

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const sql of SETUP) await client.query(sql);
    const shadow = await client.query(
      `SELECT t FROM unnest($1::text[]) t WHERE to_regclass(t)::oid IS DISTINCT FROM to_regclass('pg_temp.' || t)::oid`,
      [TABLES],
    );
    if (shadow.rows.length) throw new Error(`Refusing to run: not shadowed: ${shadow.rows.map((r) => r.t).join(", ")}`);
    console.log(`Setup: ${N_PRODUCTS} products, ${N_PRODUCTS * 12} batches`);

    const storeWhere = `WHERE EXISTS (SELECT 1 FROM product_saleability ps_scope WHERE ps_scope.product_id = p.id AND ps_scope.store_id = $1 AND ps_scope.is_active = TRUE)`;
    const cases = [
      { name: "super admin, page 1", store: false, where: "", params: [], limit: ["$1", "$2"], extra: [50, 0] },
      { name: "super admin, page 200", store: false, where: "", params: [], limit: ["$1", "$2"], extra: [50, 9950] },
      { name: "store 2, page 1", store: true, where: storeWhere, params: [2], limit: ["$2", "$3"], extra: [50, 0] },
    ];
    for (const c of cases) {
      const params = [...c.params, ...c.extra];
      const before = await execMs(oldSql(c.store, c.where, c.limit), params);
      const after = await execMs(newSql(c.store, c.where, c.limit), params);
      const a = (await client.query(oldSql(c.store, c.where, c.limit), params)).rows;
      const b = (await client.query(newSql(c.store, c.where, c.limit), params)).rows;
      console.log(`  ${c.name}: before ${before}ms, after ${after}ms, rows ${a.length}/${b.length}, identical=${JSON.stringify(a) === JSON.stringify(b)}`);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
  console.log("Rolled back.");
}

main().catch((err) => {
  console.error("Catalog lab failed:", err.message);
  process.exitCode = 1;
});
