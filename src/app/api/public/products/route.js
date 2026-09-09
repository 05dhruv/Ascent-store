import { query } from "@/lib/db";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { ensureStockTransferSchema } from "@/lib/stockTransferSchema";
import {
  failure,
  getPagination,
  mapPublicProduct,
  optionsResponse,
  PRODUCT_STOCK_CTE_SQL,
  STORE_PRICE_LATERAL_SQL,
  success,
  toPositiveInt,
} from "../_utils";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    await ensureInventoryBatchSchema();
    await ensureStockTransferSchema();

    const { searchParams } = new URL(request.url);
    const storeId = toPositiveInt(searchParams.get("store_id"));
    if (!storeId) return failure("store_id is required", 400);

    const { page, pageSize, offset } = getPagination(searchParams);
    const search = String(searchParams.get("search") || "").trim();
    const categoryId = toPositiveInt(searchParams.get("category_id"));
    const subCategoryId = toPositiveInt(searchParams.get("sub_category_id"));
    const brandId = toPositiveInt(searchParams.get("brand_id"));
    const departmentId = toPositiveInt(searchParams.get("department_id"));

    const params = [storeId];
    const filters = [
      "ps.store_id = $1",
      "ps.is_active = TRUE",
      "COALESCE(p.is_active, TRUE) = TRUE",
      "COALESCE(stock.stock, 0) > 0",
    ];

    if (search) {
      params.push(`%${search}%`);
      filters.push(`(
        p.name ILIKE $${params.length}
        OR COALESCE(p.sku, '') ILIKE $${params.length}
        OR COALESCE(p.barcode, '') ILIKE $${params.length}
        OR COALESCE(p.product_id, '') ILIKE $${params.length}
      )`);
    }
    if (categoryId) {
      params.push(categoryId);
      filters.push(`p.category_id = $${params.length}`);
    }
    if (subCategoryId) {
      params.push(subCategoryId);
      filters.push(`p.sub_category_id = $${params.length}`);
    }
    if (brandId) {
      params.push(brandId);
      filters.push(`p.brand_id = $${params.length}`);
    }
    if (departmentId) {
      params.push(departmentId);
      filters.push(`p.department_id = $${params.length}`);
    }

    const whereSql = `WHERE ${filters.join(" AND ")}`;
    const baseSql = `
      WITH ${PRODUCT_STOCK_CTE_SQL}
      SELECT
        p.id, p.product_id, p.name, p.sku, p.barcode, p.image_url, p.unit,
        p.category_id, p.sub_category_id, p.brand_id, p.department_id,
        c.name AS category_name,
        sc.name AS sub_category_name,
        b.name AS brand_name,
        d.name AS department_name,
        COALESCE(t.rate, 0) AS tax_rate,
        COALESCE(stock.stock, 0) AS stock,
        COALESCE(
          NULLIF(ps.mrp, 0),
          NULLIF(transfer_price.mrp, 0),
          p.mrp,
          0
        ) AS mrp,
        COALESCE(
          NULLIF(ps.selling_price, 0),
          NULLIF(transfer_price.selling_price, 0),
          p.selling_price,
          0
        ) AS selling_price,
        CASE
          WHEN ps.updated_at >= COALESCE(transfer_price.confirmed_at, '-infinity'::timestamp)
               AND COALESCE(NULLIF(ps.selling_price, 0), NULLIF(ps.mrp, 0), 0) > 0 THEN 'store_saleability'
          WHEN COALESCE(NULLIF(transfer_price.selling_price, 0), NULLIF(transfer_price.mrp, 0), 0) > 0 THEN 'stock_transfer'
          WHEN COALESCE(NULLIF(ps.selling_price, 0), NULLIF(ps.mrp, 0), 0) > 0 THEN 'store_saleability'
          ELSE 'product'
        END AS pricing_source
      FROM product_saleability ps
      INNER JOIN products p ON p.id = ps.product_id
      INNER JOIN stock ON stock.product_id = p.id AND stock.store_id = ps.store_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN sub_categories sc ON sc.id = p.sub_category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN taxes t ON t.id = p.tax_id
      ${STORE_PRICE_LATERAL_SQL}
      ${whereSql}
    `;

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM (${baseSql}) products_public`,
      params,
    );

    const listParams = [...params, pageSize, offset];
    const result = await query(
      `SELECT * FROM (${baseSql}) products_public
       ORDER BY name ASC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    const total = Number(countResult.rows[0]?.total || 0);
    return success(
      {
        records: result.rows.map(mapPublicProduct),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      "Products fetched",
    );
  } catch (err) {
    console.error("[public products]", err);
    return failure("Failed to fetch products");
  }
}
