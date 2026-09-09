import { query } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/apiResponse";

export async function POST(req) {
  try {
    const body = await req.json();
    const rows = body.rows || [];

    const matched = [];
    for (const r of rows) {
      const productId =
        r.product_id !== undefined &&
        r.product_id !== null &&
        String(r.product_id).trim() !== ""
          ? String(r.product_id).trim()
          : null;
      const productName =
        r.product_name !== undefined &&
        r.product_name !== null &&
        String(r.product_name).trim() !== ""
          ? String(r.product_name).trim()
          : null;
      const barcode =
        r.barcode !== undefined &&
        r.barcode !== null &&
        String(r.barcode).trim() !== ""
          ? String(r.barcode).trim()
          : null;
      const sku =
        r.sku !== undefined && r.sku !== null && String(r.sku).trim() !== ""
          ? String(r.sku).trim()
          : null;
      const storeId =
        r.store_id !== undefined &&
        r.store_id !== null &&
        String(r.store_id).trim() !== ""
          ? String(r.store_id).trim()
          : null;

      const res = await query(
        `SELECT id, name, sku, barcode
         FROM products
         WHERE ($1::text IS NOT NULL AND id::text = $1::text)
            OR ($2::text IS NOT NULL AND name::text = $2::text)
            OR ($3::text IS NOT NULL AND barcode::text = $3::text)
            OR ($4::text IS NOT NULL AND sku::text = $4::text)
         LIMIT 1`,
        [productId, productName, barcode, sku],
      );
      if (res.rows.length) {
        matched.push({ ...res.rows[0], store_id: storeId });
      }
    }

    return successResponse({ records: matched }, "Preview generated");
  } catch (err) {
    console.error(err);
    return errorResponse("Preview failed");
  }
}
