import { query } from "@/lib/db";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { failure, optionsResponse, PRODUCT_STOCK_CTE_SQL, success, toPositiveInt } from "../_utils";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    await ensureInventoryBatchSchema();

    const { searchParams } = new URL(request.url);
    const storeId = toPositiveInt(searchParams.get("store_id"));
    if (!storeId) return failure("store_id is required", 400);

    const result = await query(
      `WITH ${PRODUCT_STOCK_CTE_SQL}
       SELECT
         c.id,
         c.name,
         COUNT(DISTINCT p.id)::int AS product_count
       FROM product_saleability ps
       INNER JOIN products p ON p.id = ps.product_id
       INNER JOIN stock ON stock.product_id = p.id AND stock.store_id = ps.store_id
       INNER JOIN categories c ON c.id = p.category_id
       WHERE ps.store_id = $1
         AND ps.is_active = TRUE
         AND COALESCE(p.is_active, TRUE) = TRUE
         AND COALESCE(c.is_active, TRUE) = TRUE
         AND COALESCE(stock.stock, 0) > 0
       GROUP BY c.id, c.name
       ORDER BY c.name ASC`,
      [storeId],
    );

    return success({ records: result.rows }, "Categories fetched");
  } catch (err) {
    console.error("[public categories]", err);
    return failure("Failed to fetch categories");
  }
}
