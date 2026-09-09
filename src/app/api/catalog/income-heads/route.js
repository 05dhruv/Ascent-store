import { query } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  notFoundError,
  validationError,
} from "@/lib/api-response";

// ─── GET /api/catalog/income-heads ───────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");
    const offset = (page - 1) * pageSize;

    const params = [];
    let whereClause = "";
    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE (
        t.name ILIKE $${params.length}
        OR COALESCE(t.code, '') ILIKE $${params.length}
      )`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM income_heads t ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(pageSize, offset);
    const result = await query(
      `SELECT id, name, code, is_active, created_at
       FROM income_heads t
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

// ─── POST /api/catalog/income-heads ──────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return validationError({ name: "Name is required" });
    }

    const result = await query(
      `INSERT INTO income_heads (name, code, is_active)
       VALUES ($1, $2, COALESCE($3, true))
       RETURNING *`,
      [body.name?.trim(), body.code || null, body.is_active ?? true],
    );

    return successResponse(
      result.rows[0],
      "Income Head created successfully",
      201,
    );
  } catch (err) {
    if (err.code === "23505") {
      return errorResponse("Income Head already exists", 409);
    }
    return errorResponse(err.message);
  }
}
