import { query } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  validationError,
} from "@/lib/api-response";

async function ensureBrandExtras() {
  await query(
    `ALTER TABLE brands ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL`,
  );
  await query(
    `ALTER TABLE brands ADD COLUMN IF NOT EXISTS margin NUMERIC(7,2) NOT NULL DEFAULT 0`,
  );
}

export async function GET(request) {
  try {
    await ensureBrandExtras();
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
        OR COALESCE(m.name, '') ILIKE $${params.length}
        OR COALESCE(c.name, '') ILIKE $${params.length}
      )`;
    }

    const countResult = await query(
      `SELECT COUNT(*)
       FROM brands t
       LEFT JOIN manufacturers m ON t.manufacturer_id = m.id
       LEFT JOIN categories c ON t.category_id = c.id
       ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(pageSize, offset);

    const result = await query(
      `SELECT t.id, t.name, t.description, t.is_active, t.created_at,
              t.manufacturer_id, t.category_id, COALESCE(t.margin, 0) AS margin,
              COALESCE(m.name, '-') AS manufacturer_name,
              COALESCE(c.name, '-') AS category_name
       FROM brands t
       LEFT JOIN manufacturers m ON t.manufacturer_id = m.id
       LEFT JOIN categories c ON t.category_id = c.id
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

export async function POST(request) {
  try {
    await ensureBrandExtras();
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return validationError({ name: "Name is required" });
    }

    const result = await query(
      `INSERT INTO brands (name, description, manufacturer_id, category_id, margin, is_active)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, true))
       RETURNING *`,
      [
        body.name?.trim(),
        body.description || null,
        body.manufacturer_id || null,
        body.category_id || null,
        Number(body.margin || 0),
        body.is_active ?? true,
      ],
    );

    return successResponse(result.rows[0], "Brand created successfully", 201);
  } catch (err) {
    if (err.code === "23505") {
      return errorResponse("Brand already exists", 409);
    }
    return errorResponse(err.message);
  }
}
