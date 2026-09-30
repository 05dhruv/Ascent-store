import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";
import { ensureConstructionSchema } from "@/lib/constructionSchema";
import { getPagination, limitOffsetSql, pagedPayload, spreadsheetResponse } from "@/lib/pagination";

async function guard(request, write = false) {
  const auth = await requireAuth(request);
  if (auth.error) return auth;
  const access = requirePermission(
    auth.user,
    ...(write
      ? ["PROJECT_EDIT", "PROJECT_CREATE", "MANAGE_INVENTORY"]
      : ["PROJECT_VIEW", "PROJECT_EDIT", "VIEW_INVENTORY", "MANAGE_INVENTORY"]),
  );
  if (access.error) return access;
  return auth;
}

export async function GET(request) {
  const auth = await guard(request, false);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionSchema();
    await ensureConstructionOpsSchema();
    const sp = new URL(request.url).searchParams;
    const activeOnly = sp.get("active") === "1";
    const pagination = getPagination(sp, { legacyLimit: 500 });
    const params = [activeOnly];
    const result = await query(
      `SELECT *, COUNT(*) OVER() AS __total
       FROM construction_contractors
       WHERE ($1::boolean IS FALSE OR is_active = TRUE)
       ORDER BY name
       ${limitOffsetSql(pagination, params)}`,
      params,
    );
    if (pagination.isExport) {
      return spreadsheetResponse(result.rows, {
        filename: "contractors",
        format: pagination.format,
        columns: [
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "gstin", label: "GSTIN" },
          { key: "is_active", label: "Active", value: (r) => (r.is_active ? "Yes" : "No") },
          { key: "created_at", label: "Created" },
        ],
      });
    }
    return successResponse(pagedPayload(result.rows, pagination));
  } catch (error) {
    console.error("[construction contractors GET]", error);
    return errorResponse("Contractors could not be loaded");
  }
}

export async function POST(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) {
      return validationError([{ field: "name", message: "name is required" }]);
    }
    const result = await query(
      `INSERT INTO construction_contractors (name, phone, email, gstin, is_active)
       VALUES ($1,$2,$3,$4,COALESCE($5, TRUE)) RETURNING *`,
      [
        name,
        body.phone || null,
        body.email || null,
        body.gstin || null,
        body.isActive !== undefined ? Boolean(body.isActive) : true,
      ],
    );
    return successResponse({ record: result.rows[0] }, "Contractor created", 201);
  } catch (error) {
    console.error("[construction contractors POST]", error);
    return errorResponse("Contractor could not be created");
  }
}

export async function PUT(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return validationError([{ field: "id", message: "id is required" }]);
    }
    const result = await query(
      `UPDATE construction_contractors SET
         name = COALESCE($2, name),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         gstin = COALESCE($5, gstin),
         is_active = COALESCE($6, is_active),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.name != null ? String(body.name).trim() : null,
        body.phone !== undefined ? body.phone : null,
        body.email !== undefined ? body.email : null,
        body.gstin !== undefined ? body.gstin : null,
        body.isActive !== undefined ? Boolean(body.isActive) : null,
      ],
    );
    if (!result.rows.length) return errorResponse("Contractor not found", 404);
    return successResponse({ record: result.rows[0] }, "Contractor updated");
  } catch (error) {
    console.error("[construction contractors PUT]", error);
    return errorResponse("Contractor could not be updated");
  }
}

export async function DELETE(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return validationError([{ field: "id", message: "id is required" }]);
    }
    const result = await query(
      `UPDATE construction_contractors SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!result.rows.length) return errorResponse("Contractor not found", 404);
    return successResponse({ record: result.rows[0] }, "Contractor deactivated");
  } catch (error) {
    console.error("[construction contractors DELETE]", error);
    return errorResponse("Contractor could not be deactivated");
  }
}
