import { query } from "@/lib/db";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";
import { ensureSalesBillingSchema } from "@/lib/salesBillingSchema";
import { ensureEmployeesSchema } from "@/lib/employeesSchema";

// Each index backs a measured hot query (see scripts/perf-index-lab.mjs).
const INDEXES = [
  // Bill detail/receipt, analytics COGS joins. Same definition reportsService
  // creates lazily, so this never duplicates it.
  ["idx_stock_level_sales_items_product", "sales_bill_items (sales_bill_id, product_id)"],
  // Bill detail, store cash, closing, payment-mode analytics.
  ["idx_sales_bill_payments_bill", "sales_bill_payments (sales_bill_id)"],
  // POS bill tracker and store-scoped date ranges (no status filter, so the
  // partial idx_stock_level_sales_date cannot serve them).
  ["idx_sales_bills_store_created", "sales_bills (store_id, created_at DESC)"],
  // All-store date ranges (dashboards, analytics).
  ["idx_sales_bills_created", "sales_bills (created_at)"],
  // Counter closing / counter session totals.
  ["idx_sales_bills_session", "sales_bills (session_id)"],
  // Analytics COGS LATERAL lookup per bill line.
  ["idx_stock_out_reference", "stock_out (reference_type, reference_id)"],
  // POS scan: plain `barcode = $1` cannot use the normalized expression index.
  ["idx_products_barcode", "products (barcode)"],
  // Auth employee lookup: `user_id = $1 OR LOWER(email) = .. OR LOWER(username) = ..`
  // needs every OR branch indexed to avoid a sequential scan.
  ["idx_employees_lower_email", "employees (LOWER(email_address))"],
  ["idx_employees_lower_username", "employees (LOWER(username))"],
];

async function dropInvalidIndexes() {
  const res = await query(
    `SELECT c.relname AS name
       FROM pg_index x
       JOIN pg_class c ON c.oid = x.indexrelid
      WHERE NOT x.indisvalid AND c.relname = ANY($1)`,
    [INDEXES.map(([name]) => name)],
  );
  for (const { name } of res.rows) {
    await query(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`, [], { maxRetries: 0 });
  }
  return res.rows.map((row) => row.name);
}

export const ensurePerformanceIndexes = makeSchemaEnsurer(
  "performance_indexes",
  1,
  async () => {
    await ensureSalesBillingSchema();
    await ensureEmployeesSchema();

    const failed = [];
    for (const [name, definition] of INDEXES) {
      try {
        // CONCURRENTLY avoids blocking writes while building on large tables.
        await query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${definition}`, [], {
          maxRetries: 0,
        });
      } catch (err) {
        failed.push(`${name}: ${err.message}`);
      }
    }

    // An interrupted concurrent build leaves an INVALID index that
    // IF NOT EXISTS would skip forever; drop it so the next boot retries.
    const invalid = await dropInvalidIndexes();
    if (failed.length || invalid.length) {
      throw new Error(
        `Performance indexes incomplete: ${[...failed, ...invalid.map((n) => `${n}: invalid`)].join("; ")}`,
      );
    }
  },
);
