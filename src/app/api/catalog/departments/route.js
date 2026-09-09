import { query } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  notFoundError,
  validationError,
} from "@/lib/api-response";

// ─── GET /api/catalog/departments ───────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");
    const offset = (page - 1) * pageSize;

    const params = [];
    let whereClause = "";

    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      whereClause = `WHERE (
        t.name ILIKE $${params.length}
        OR COALESCE(t.code, '') ILIKE $${params.length}
      )`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM departments t ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(pageSize, offset);

    const result = await query(
      `SELECT id, name, code, is_active, created_at
       FROM departments t
       ${whereClause}
       ORDER BY t.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
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

// ─── POST /api/catalog/departments ──────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return validationError({ name: "Name is required" });
    }

    const result = await query(
      `INSERT INTO departments (name, code, is_active)
       VALUES ($1, $2, COALESCE($3, true))
       RETURNING *`,
      [body.name?.trim(), body.code || null, body.is_active ?? true],
    );

    const dept = result.rows[0];

    // If category_ids provided, assign those categories to this department
    if (Array.isArray(body.category_ids) && body.category_ids.length) {
      await query(
        `UPDATE categories SET department_id = $1 WHERE id = ANY($2::bigint[])`,
        [dept.id, body.category_ids],
      );
    }

    return successResponse(dept, "Department created successfully", 201);
  } catch (err) {
    if (err.code === "23505") {
      return errorResponse("Department already exists", 409);
    }
    return errorResponse(err.message);
  }
}
