import { query } from '@/lib/db';
import { successResponse, errorResponse, notFoundError, validationError } from '@/lib/api-response';

// ─── GET /api/catalog/categories ─────────────────────────────
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
      whereClause = `WHERE c.name ILIKE $${params.length}`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM categories c ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(pageSize, offset);

    const result = await query(
      `SELECT
        c.id, c.name, c.description, c.image_url,
        c.sort_sequence, c.category_type, c.is_active,
        c.department_id, d.name AS department_name,
        c.created_at, c.updated_at
       FROM categories c
       LEFT JOIN departments d ON c.department_id = d.id
       ${whereClause}
       ORDER BY c.sort_sequence ASC, c.id DESC
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

// ─── POST /api/catalog/categories ────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return validationError({ name: 'Category name is required' });
    }

    const result = await query(
      `INSERT INTO categories
        (name, description, image_url, sort_sequence, department_id, category_type, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name.trim(),
        body.description   || null,
        body.image_url     || null,
        body.sort_sequence ?? 0,
        body.department_id || null,
        body.category_type || 'OTHER',
        body.is_active     ?? true,
      ]
    );

    return successResponse(result.rows[0], 'Category created successfully', 201);
  } catch (err) {
    if (err.code === '23505') return errorResponse('Category already exists', 409);
    return errorResponse(err.message);
  }
}
