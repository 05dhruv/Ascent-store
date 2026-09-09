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
    const where = search ? `WHERE sd.name ILIKE $1 OR COALESCE(sg.name, '') ILIKE $1` : '';
    if (search) params.push(`%${search}%`);

    const count = await query(
      `SELECT COUNT(*) FROM service_departments sd LEFT JOIN service_groups sg ON sd.service_group_id = sg.id ${where}`,
      params
    );
    params.push(pageSize, offset);
    const result = await query(
      `SELECT sd.id, sd.name, sd.sort_sequence, sd.is_active, sd.created_at,
              sg.name AS service_group_name
       FROM service_departments sd
       LEFT JOIN service_groups sg ON sd.service_group_id = sg.id
       ${where}
       ORDER BY sd.sort_sequence ASC, sd.id DESC
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
      `INSERT INTO service_departments (name, service_group_id, sort_sequence, is_active)
       VALUES ($1, $2, $3, COALESCE($4, true)) RETURNING *`,
      [body.name.trim(), body.service_group_id || null, body.sort_sequence ?? 0, body.is_active ?? true]
    );

    return successResponse(result.rows[0], 'Service Department created successfully', 201);
  } catch (err) {
    if (err.code === '23505') return errorResponse('Service Department already exists', 409);
    return errorResponse(err.message);
  }
}
