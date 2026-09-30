import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";

// Expressions must match the WHERE clause below exactly for the planner to use them.
const ensureLookupIndexes = makeSchemaEnsurer("products_lookup_expr_indexes", async () => {
  const indexes = [
    ["idx_products_lookup_product_id", `LOWER(TRIM(REGEXP_REPLACE(COALESCE(product_id::text, ''), '^''+', '')))`],
    ["idx_products_lookup_sku", `LOWER(TRIM(REGEXP_REPLACE(COALESCE(sku, ''), '^''+', '')))`],
    ["idx_products_lookup_barcode", `LOWER(TRIM(REGEXP_REPLACE(COALESCE(barcode, ''), '^''+', '')))`],
    ["idx_products_lookup_name_compact", `LOWER(REGEXP_REPLACE(COALESCE(name, ''), '[^a-zA-Z0-9]+', '', 'g'))`],
  ];
  for (const [name, expr] of indexes) {
    await query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON products ((${expr}))`).catch(
      (err) => console.warn(`[stock-in product lookup] index ${name} skipped:`, err.message),
    );
  }
});

function uniqueText(values, { compact = false } = {}) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          String(value ?? "")
            .trim()
            .replace(/^'+/, "")
            .toLowerCase(),
        )
        .map((value) => (compact ? value.replace(/[^a-z0-9]/g, "") : value))
        .filter(Boolean),
    ),
  ).slice(0, 10000);
}

export async function POST(request) {
  try {
    await ensureStockInSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "VIEW_INVENTORY",
      "MANAGE_INVENTORY",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const ids = uniqueText(body.product_ids)
      .map(Number)
      .filter((value) => Number.isSafeInteger(value) && value > 0);
    const catalogIds = uniqueText(body.catalog_product_ids);
    const skus = uniqueText(body.skus);
    const barcodes = uniqueText(body.barcodes);
    const names = uniqueText(body.product_names, { compact: true });
    if (
      !ids.length &&
      !catalogIds.length &&
      !skus.length &&
      !barcodes.length &&
      !names.length
    ) {
      return NextResponse.json({ records: [] });
    }

    await ensureLookupIndexes();
    const result = await query(
      `SELECT p.id, p.product_id AS "productId", p.name AS "productName",
              COALESCE(p.barcode, '') AS barcode, COALESCE(p.sku, '') AS sku,
              COALESCE(p.cost_price, 0) AS "costPerUnit",
              COALESCE(p.mrp, 0) AS mrp,
              COALESCE(p.selling_price, 0) AS "sellingPrice",
              COALESCE(p.is_active, TRUE) AS "isActive"
       FROM products p
       WHERE p.id = ANY($1::bigint[])
          OR LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.product_id::text, ''), '^''+', ''))) = ANY($2::text[])
          OR LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.sku, ''), '^''+', ''))) = ANY($3::text[])
          OR LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.barcode, ''), '^''+', ''))) = ANY($4::text[])
          OR LOWER(REGEXP_REPLACE(COALESCE(p.name, ''), '[^a-zA-Z0-9]+', '', 'g')) = ANY($5::text[])
       ORDER BY p.id ASC
       LIMIT 10000`,
      [ids, catalogIds, skus, barcodes, names],
    );

    return NextResponse.json({ records: result.rows });
  } catch (error) {
    console.error("[stock-in product lookup]", error);
    return NextResponse.json(
      { error: error.message || "Unable to verify stock-in products" },
      { status: 500 },
    );
  }
}
