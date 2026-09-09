import { query } from "@/lib/db";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { ensureStockTransferSchema } from "@/lib/stockTransferSchema";
import {
  failure,
  mapPublicProduct,
  optionsResponse,
  PRODUCT_STOCK_CTE_SQL,
  STORE_PRICE_LATERAL_SQL,
  success,
  toPositiveInt,
} from "../../_utils";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request, { params }) {
  try {
    await ensureCatalogExtrasSchema();
    await ensureInventoryBatchSchema();
    await ensureStockTransferSchema();

    const { id } = await params;
    const productId = toPositiveInt(id);
    const { searchParams } = new URL(request.url);
    const storeId = toPositiveInt(searchParams.get("store_id"));
    if (!productId) return failure("Valid product id is required", 400);
    if (!storeId) return failure("store_id is required", 400);

    const result = await query(
      `WITH ${PRODUCT_STOCK_CTE_SQL}
       SELECT
         p.id, p.product_id, p.name, p.sku, p.barcode, p.image_url, p.unit,
         p.description,
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
       WHERE ps.store_id = $1
         AND p.id = $2
         AND ps.is_active = TRUE
         AND COALESCE(p.is_active, TRUE) = TRUE
         AND COALESCE(stock.stock, 0) > 0
       LIMIT 1`,
      [storeId, productId],
    );

    if (!result.rows.length) return failure("Product not found", 404);

    return success(
      {
        product: {
          ...mapPublicProduct(result.rows[0]),
          description: result.rows[0].description || "",
        },
      },
      "Product fetched",
    );
  } catch (err) {
    console.error("[public product detail]", err);
    return failure("Failed to fetch product");
  }
}
