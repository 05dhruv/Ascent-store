import { query } from '@/lib/db';
import { successResponse, errorResponse, validationError } from '@/lib/api-response';
import { ensureCatalogExtrasSchema } from '@/lib/catalogExtrasSchema';

export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const offset = (page - 1) * pageSize;

    const params = [];
    const where = search ? `WHERE name ILIKE $1 OR COALESCE(code, '') ILIKE $1` : '';
    if (search) params.push(`%${search}%`);

    const count = await query(`SELECT COUNT(*) FROM service_groups ${where}`, params);
    params.push(pageSize, offset);
    const result = await query(
      `SELECT id, name, code, sort_sequence, is_active, created_at
       FROM service_groups
       ${where}
       ORDER BY sort_sequence ASC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return successResponse({
      records: result.rows,
      total: parseInt(count.rows[0].count),
      page,
      pageSize,
      totalPages: Math.ceil(parseInt(count.rows[0].count) / pageSize),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

export async function POST(request) {
  try {
    await ensureCatalogExtrasSchema();
    const body = await request.json();
    if (!body.name?.trim()) return validationError({ name: 'Name is required' });

    const result = await query(
      `INSERT INTO service_groups (name, code, sort_sequence, is_active)
       VALUES ($1, $2, $3, COALESCE($4, true)) RETURNING *`,
      [body.name.trim(), body.code || null, body.sort_sequence ?? 0, body.is_active ?? true]
    );

    return successResponse(result.rows[0], 'Service Group created successfully', 201);
  } catch (err) {
    if (err.code === '23505') return errorResponse('Service Group already exists', 409);
    return errorResponse(err.message);
  }
}
