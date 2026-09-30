import { query } from '@/lib/db';
import { clampPageSize, LOOKUP_MAX_PAGE_SIZE } from "@/lib/pagination";
import { requireAccess } from "@/lib/api-protection";
import { successResponse, errorResponse, validationError } from '@/lib/api-response';

// ─── GET /api/catalog/manufacturers ───────────────────────────────
export async function GET(request) {
  try {
    const auth = await requireAccess(request);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const search   = searchParams.get('search')   || '';
    const page     = parseInt(searchParams.get('page')     || '1');
    const pageSize = clampPageSize(searchParams.get("pageSize"), { fallback: 10, max: LOOKUP_MAX_PAGE_SIZE });
    const offset   = (page - 1) * pageSize;

    const params = [];
    let whereClause = '';

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE t.name ILIKE $1 OR COALESCE(t.contact, '') ILIKE $1 OR COALESCE(t.email, '') ILIKE $1 OR COALESCE(t.phone, '') ILIKE $1 OR COALESCE(t.address, '') ILIKE $1`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM manufacturers t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(pageSize, offset);

    const result = await query(
      `SELECT id, name, contact, email, phone, address, is_active, created_at
       FROM manufacturers t
       ${whereClause}
       ORDER BY t.id DESC
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

// ─── POST /api/catalog/manufacturers ──────────────────────────────
export async function POST(request) {
  try {
    const auth = await requireAccess(request, "MANAGE_CATALOG", "MATERIAL_CREATE", "MATERIAL_EDIT");
    if (auth.error) return auth.error;
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return validationError({ name: 'Name is required' });
    }

    const result = await query(
      `INSERT INTO manufacturers (name, contact, email, phone, address, is_active)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, true))
       RETURNING *`,
      [body.name?.trim(), body.contact || null, body.email || null, body.phone || null, body.address || null, body.is_active ?? true]
    );

    return successResponse(result.rows[0], 'Manufacturer created successfully', 201);
  } catch (err) {
    if (err.code === '23505') {
      return errorResponse('Manufacturer already exists', 409);
    }
    return errorResponse(err.message);
  }
}
