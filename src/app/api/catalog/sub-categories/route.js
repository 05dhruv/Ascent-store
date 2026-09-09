import { query } from '@/lib/db';
import { successResponse, errorResponse, validationError } from '@/lib/api-response';

// ─── GET /api/catalog/sub-categories ─────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search   = searchParams.get('search')   || '';
    const page     = parseInt(searchParams.get('page')     || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const offset   = (page - 1) * pageSize;

    const params = [];
    let whereClause = '';

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE sc.name ILIKE $${params.length}`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM sub_categories sc ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(pageSize, offset);

    const result = await query(
      `SELECT
        sc.id, sc.name, sc.description, sc.is_active,
        sc.sort_sequence, sc.category_id,
        c.name AS category_name,
        sc.created_at, sc.updated_at
       FROM sub_categories sc
       LEFT JOIN categories c ON sc.category_id = c.id
       ${whereClause}
       ORDER BY sc.sort_sequence ASC, sc.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return successResponse({
      records: result.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

// ─── POST /api/catalog/sub-categories ────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, category_id, product_ids = [] } = body;

    if (!name?.trim()) {
      return validationError({ name: 'Sub Category name is required' });
    }

    // Insert sub category
    const result = await query(
      `INSERT INTO sub_categories
        (name, description, category_id, sort_sequence, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        name.trim(),
        body.description   || null,
        category_id        || null,
        body.sort_sequence ?? 0,
        body.is_active     ?? true,
      ]
    );

    const subCategory = result.rows[0];

    // Assign products if any
    if (product_ids.length > 0) {
      const values = product_ids.map((pid, i) => `($1, $${i + 2})`).join(', ');
      await query(
        `INSERT INTO sub_category_products (sub_category_id, product_id) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [subCategory.id, ...product_ids]
      );
    }

    return successResponse(subCategory, 'Sub Category created successfully', 201);
  } catch (err) {
    if (err.code === '23505') return errorResponse('Sub Category already exists', 409);
    return errorResponse(err.message);
  }
}
