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
    const where = search ? `WHERE promotion ILIKE $1 OR requested_by ILIKE $1 OR status ILIKE $1` : '';
    if (search) params.push(`%${search}%`);

    const count = await query(`SELECT COUNT(*) FROM promotion_approvals ${where}`, params);
    params.push(pageSize, offset);
    const result = await query(
      `SELECT id, promotion, requested_by, request_date, status, created_at
       FROM promotion_approvals
       ${where}
       ORDER BY id DESC
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
    if (!body.promotion?.trim()) return validationError({ promotion: 'Promotion is required' });

    const result = await query(
      `INSERT INTO promotion_approvals (promotion, requested_by, request_date, status)
       VALUES ($1, $2, $3, COALESCE($4, 'Pending')) RETURNING *`,
      [body.promotion.trim(), body.requested_by || 'System', body.request_date || null, body.status || 'Pending']
    );

    return successResponse(result.rows[0], 'Promotion approval created successfully', 201);
  } catch (err) {
    return errorResponse(err.message);
  }
}
