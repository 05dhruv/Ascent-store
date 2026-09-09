import { query, getClient } from '@/lib/db';
import { successResponse, errorResponse, validationError } from '@/lib/apiResponse';
import { ensureCombosSchema } from '@/lib/catalogExtrasSchema';

function toNum(v, fallback = 0) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ─── GET /api/catalog/combos ─────────────────────────────────
export async function GET(request) {
  try {
    await ensureCombosSchema();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const offset = (page - 1) * pageSize;

    const params = [];
    let where = '';
    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      where = `WHERE (
        c.name ILIKE $1
        OR COALESCE(c.sku, '') ILIKE $1
        OR COALESCE(c.barcode, '') ILIKE $1
        OR COALESCE(c.combo_code, '') ILIKE $1
        OR COALESCE(c.description, '') ILIKE $1
      )`;
    }

    const count = await query(
      `SELECT COUNT(*)::int AS n FROM combos c ${where}`,
      params
    );
    const total = count.rows[0].n;

    const limIdx = params.length + 1;
    const offIdx = params.length + 2;
    const listParams = [...params, pageSize, offset];

    const result = await query(
      `SELECT
         c.id,
         c.name,
         c.combo_code,
         c.description,
         c.combo_type,
         c.category_id,
         c.sub_category_id,
         c.food_type,
         c.image_url,
         c.price,
         c.tax_inclusive,
         c.discount,
         c.tax_id,
         c.hsn,
         c.effective_date,
         c.store_wise_pricing,
         c.sku,
         c.barcode,
         c.sort_sequence,
         c.is_active,
         c.status,
         c.items,
         c.created_at,
         c.updated_at,
         cat.name AS category_name,
         sc.name AS sub_category_name,
         tx.name AS tax_name,
         (SELECT COUNT(*)::int FROM combo_products cp WHERE cp.combo_id = c.id) AS product_count
       FROM combos c
       LEFT JOIN categories cat ON cat.id = c.category_id
       LEFT JOIN sub_categories sc ON sc.id = c.sub_category_id
       LEFT JOIN taxes tx ON tx.id = c.tax_id
       ${where}
       ORDER BY c.sort_sequence ASC NULLS LAST, c.id DESC
       LIMIT $${limIdx} OFFSET $${offIdx}`,
      listParams
    );

    return successResponse({
      records: result.rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

// ─── POST /api/catalog/combos ────────────────────────────────
export async function POST(request) {
  let client;
  try {
    await ensureCombosSchema();

    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return validationError({ name: 'Combo name is required' });
    }

    const products = Array.isArray(body.products) ? body.products : [];
    if (!products.length) {
      return validationError({ products: 'Add at least one product to the combo' });
    }

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p?.product_id) {
        return validationError({ products: `Line ${i + 1}: product is required` });
      }
    }

    client = await getClient();

    const price = toNum(body.price, 0);
    const discount = toNum(body.discount, 0);
    const sortSequence = Math.floor(toNum(body.sort_sequence ?? body.sortSequence, 0));
    const taxInclusive = Boolean(body.tax_inclusive ?? body.taxInclusive);
    const storeWise = Boolean(body.store_wise_pricing ?? body.storeWisePricing);
    const isActive = body.is_active !== false && body.isActive !== false;
    const status = isActive ? 'Active' : 'Inactive';

    const effectiveDate =
      body.effective_date || body.effectiveDate
        ? String(body.effective_date || body.effectiveDate).slice(0, 10)
        : null;

    const itemsSummary =
      products.length === 1 ? '1 product' : `${products.length} products`;

    await client.query('BEGIN');

    const insert = await client.query(
      `INSERT INTO combos (
        name,
        combo_code,
        description,
        combo_type,
        category_id,
        sub_category_id,
        food_type,
        image_url,
        price,
        tax_inclusive,
        discount,
        tax_id,
        hsn,
        effective_date,
        store_wise_pricing,
        sku,
        barcode,
        sort_sequence,
        is_active,
        status,
        items,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21,
        NOW(), NOW()
      ) RETURNING id`,
      [
        name,
        body.combo_code?.trim() || null,
        body.description?.trim() || null,
        body.combo_type?.trim() || body.comboType?.trim() || null,
        body.category_id || body.categoryId ? Number(body.category_id || body.categoryId) : null,
        body.sub_category_id || body.subCategoryId ? Number(body.sub_category_id || body.subCategoryId) : null,
        body.food_type?.trim() || body.foodType?.trim() || null,
        body.image_url || body.imageUrl || null,
        price,
        taxInclusive,
        discount,
        body.tax_id || body.taxId ? Number(body.tax_id || body.taxId) : null,
        body.hsn?.trim() || null,
        effectiveDate,
        storeWise,
        body.sku?.trim() || null,
        body.barcode?.trim() || null,
        sortSequence,
        isActive,
        status,
        itemsSummary,
      ]
    );

    const comboId = insert.rows[0].id;

    for (let idx = 0; idx < products.length; idx++) {
      const line = products[idx];
      const qty = Math.max(0.001, toNum(line.quantity, 1));
      await client.query(
        `INSERT INTO combo_products (combo_id, product_id, quantity, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (combo_id, product_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, sort_order = EXCLUDED.sort_order`,
        [comboId, line.product_id, qty, idx]
      );
    }

    await client.query('COMMIT');

    const row = await query(
      `SELECT c.*,
              cat.name AS category_name,
              sc.name AS sub_category_name,
              tx.name AS tax_name,
              (SELECT COUNT(*)::int FROM combo_products cp WHERE cp.combo_id = c.id) AS product_count
       FROM combos c
       LEFT JOIN categories cat ON cat.id = c.category_id
       LEFT JOIN sub_categories sc ON sc.id = c.sub_category_id
       LEFT JOIN taxes tx ON tx.id = c.tax_id
       WHERE c.id = $1`,
      [comboId]
    );

    return successResponse(row.rows[0], 'Combo created successfully', 201);
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    if (err.code === '23505') {
      return errorResponse('Duplicate SKU, barcode, or combo code', 409);
    }
    return errorResponse(err.message);
  } finally {
    if (client) client.release();
  }
}
