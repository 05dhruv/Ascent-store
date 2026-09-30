import { query } from '../../../../../lib/db';
import { requireAccess } from "@/lib/api-protection";
import { successResponse, errorResponse, validationError } from '../../../../../lib/apiResponse';

export async function GET(req) {
  try {
    const auth = await requireAccess(req);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    const taxId = searchParams.get('tax_id');
    if (!taxId) return validationError({ tax_id: 'tax_id is required' });

    const result = await query(
      `SELECT id, tax_id FROM products WHERE tax_id = $1 ORDER BY id DESC`,
      [taxId]
    );

    return successResponse({ records: result.rows, total: result.rowCount });
  } catch (err) {
    return errorResponse(err.message);
  }
}

export async function POST(req) {
  try {
    const auth = await requireAccess(req, "MANAGE_TAXES", "MANAGE_PRODUCTS");
    if (auth.error) return auth.error;
    const body = await req.json();
    const { tax_id, product_ids } = body;
    if (!tax_id) return validationError({ tax_id: 'tax_id is required' });
    if (!Array.isArray(product_ids) || product_ids.length === 0) return validationError({ product_ids: 'product_ids is required' });

    const res = await query(
      `UPDATE products
       SET tax_id = $1
       WHERE id = ANY($2::bigint[])
       RETURNING id`,
      [tax_id, product_ids]
    );

    return successResponse({ updated: res.rowCount }, 'Products updated');
  } catch (err) {
    return errorResponse(err.message);
  }
}
