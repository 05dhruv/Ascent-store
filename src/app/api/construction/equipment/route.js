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
      ? ["PROJECT_EDIT", "MANAGE_INVENTORY"]
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
    const projectId = Number(sp.get("projectId")) || null;
    const pagination = getPagination(sp, { legacyLimit: 100 });
    const logParams = [projectId];
    const logsSql = `SELECT l.*, e.name AS equipment_name, e.asset_code, s.name AS site_name,
              COUNT(*) OVER() AS __total
       FROM construction_equipment_logs l
       JOIN construction_equipment e ON e.id = l.equipment_id
       LEFT JOIN construction_sites s ON s.id = l.site_id
       WHERE ($1::bigint IS NULL OR e.project_id = $1)
       ORDER BY l.log_date DESC, l.id DESC
       ${limitOffsetSql(pagination, logParams)}`;

    if (pagination.isExport) {
      const logs = await query(logsSql, logParams);
      return spreadsheetResponse(logs.rows, {
        filename: "equipment_usage_logs",
        format: pagination.format,
        columns: [
          { key: "log_date", label: "Date" },
          { key: "asset_code", label: "Asset code" },
          { key: "equipment_name", label: "Equipment" },
          { key: "site_name", label: "Site" },
          { key: "hours_used", label: "Hours used" },
          { key: "operator_name", label: "Operator" },
          { key: "notes", label: "Notes" },
          { key: "created_at", label: "Logged" },
        ],
      });
    }

    const [equipment, logs] = await Promise.all([
      query(
        `SELECT e.*, p.name AS project_name, s.name AS site_name
         FROM construction_equipment e
         LEFT JOIN construction_projects p ON p.id = e.project_id
         LEFT JOIN construction_sites s ON s.id = e.site_id
         WHERE ($1::bigint IS NULL OR e.project_id = $1)
         ORDER BY e.name`,
        [projectId],
      ),
      query(logsSql, logParams),
    ]);
    const payload = pagedPayload(logs.rows, pagination);
    return successResponse({
      ...payload,
      equipment: equipment.rows,
      logs: payload.records,
    });
  } catch (error) {
    console.error("[construction equipment GET]", error);
    return errorResponse("Equipment could not be loaded");
  }
}

export async function POST(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const type = String(body.type || "equipment");

    if (type === "log") {
      const equipmentId = Number(body.equipmentId || body.equipment_id);
      if (!Number.isFinite(equipmentId) || equipmentId <= 0) {
        return validationError([
          { field: "equipmentId", message: "equipment_id is required" },
        ]);
      }
      const result = await query(
        `INSERT INTO construction_equipment_logs
          (equipment_id, site_id, log_date, hours_used, operator_name, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          equipmentId,
          Number(body.siteId || body.site_id) || null,
          body.logDate || body.log_date || new Date().toISOString().slice(0, 10),
          Number(body.hoursUsed ?? body.hours_used ?? 0),
          body.operatorName || body.operator_name || null,
          body.notes || null,
          auth.user.id,
        ],
      );
      return successResponse({ record: result.rows[0] }, "Equipment log saved", 201);
    }

    const assetCode = String(body.assetCode || body.asset_code || "")
      .trim()
      .toUpperCase();
    const name = String(body.name || "").trim();
    if (!assetCode || !name) {
      return validationError([
        { field: "equipment", message: "asset_code and name are required" },
      ]);
    }
    const result = await query(
      `INSERT INTO construction_equipment
        (asset_code, name, category, project_id, site_id, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        assetCode,
        name,
        body.category || null,
        Number(body.projectId || body.project_id) || null,
        Number(body.siteId || body.site_id) || null,
        body.status || "available",
      ],
    );
    return successResponse({ record: result.rows[0] }, "Equipment created", 201);
  } catch (error) {
    console.error("[construction equipment POST]", error);
    return errorResponse(
      error.code === "23505"
        ? "Asset code already exists"
        : "Equipment could not be saved",
      error.code === "23505" ? 409 : 500,
    );
  }
}

export async function PATCH(request) {
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
      `UPDATE construction_equipment SET
         name = COALESCE($2, name),
         category = COALESCE($3, category),
         project_id = COALESCE($4, project_id),
         site_id = COALESCE($5, site_id),
         status = COALESCE($6, status)
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.name != null ? String(body.name).trim() : null,
        body.category !== undefined ? body.category : null,
        Number(body.projectId || body.project_id) || null,
        Number(body.siteId || body.site_id) || null,
        body.status || null,
      ],
    );
    if (!result.rows.length) return errorResponse("Equipment not found", 404);
    return successResponse({ record: result.rows[0] }, "Equipment updated");
  } catch (error) {
    console.error("[construction equipment PATCH]", error);
    return errorResponse("Equipment could not be updated");
  }
}
