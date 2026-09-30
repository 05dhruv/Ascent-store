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
    const pagination = getPagination(sp, { legacyLimit: 500 });
    const params = [projectId];
    const result = await query(
      `SELECT sch.*,
              a.name AS activity_name,
              a.project_id,
              a.status AS activity_status,
              dep.name AS depends_on_name,
              p.name AS project_name,
              COUNT(*) OVER() AS __total
       FROM construction_activity_schedule sch
       JOIN construction_work_activities a ON a.id = sch.activity_id
       JOIN construction_projects p ON p.id = a.project_id
       LEFT JOIN construction_work_activities dep ON dep.id = sch.depends_on_activity_id
       WHERE ($1::bigint IS NULL OR a.project_id = $1)
       ORDER BY sch.planned_start NULLS LAST, a.name, sch.id
       ${limitOffsetSql(pagination, params)}`,
      params,
    );
    if (pagination.isExport) {
      return spreadsheetResponse(result.rows, {
        filename: "activity_schedule",
        format: pagination.format,
        columns: [
          { key: "project_name", label: "Project" },
          { key: "activity_name", label: "Activity" },
          { key: "activity_status", label: "Activity status" },
          { key: "planned_start", label: "Planned start" },
          { key: "planned_end", label: "Planned end" },
          { key: "depends_on_name", label: "Depends on" },
          { key: "baseline_progress", label: "Baseline %" },
        ],
      });
    }
    const activities = await query(
      `SELECT a.id, a.name, a.project_id, p.name AS project_name
       FROM construction_work_activities a
       JOIN construction_projects p ON p.id = a.project_id
       WHERE ($1::bigint IS NULL OR a.project_id = $1)
       ORDER BY a.name`,
      [projectId],
    );
    return successResponse(
      pagedPayload(result.rows, pagination, { activities: activities.rows }),
    );
  } catch (error) {
    console.error("[construction schedule GET]", error);
    return errorResponse("Schedule could not be loaded");
  }
}

export async function POST(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const activityId = Number(body.activityId || body.activity_id);
    if (!Number.isFinite(activityId) || activityId <= 0) {
      return validationError([
        { field: "activityId", message: "activity_id is required" },
      ]);
    }
    const result = await query(
      `INSERT INTO construction_activity_schedule
        (activity_id, planned_start, planned_end, depends_on_activity_id, baseline_progress)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (activity_id) DO UPDATE SET
         planned_start = EXCLUDED.planned_start,
         planned_end = EXCLUDED.planned_end,
         depends_on_activity_id = EXCLUDED.depends_on_activity_id,
         baseline_progress = EXCLUDED.baseline_progress,
         updated_at = NOW()
       RETURNING *`,
      [
        activityId,
        body.plannedStart || body.planned_start || null,
        body.plannedEnd || body.planned_end || null,
        Number(body.dependsOnActivityId || body.depends_on_activity_id) || null,
        Number(body.baselineProgress ?? body.baseline_progress ?? 0),
      ],
    );
    return successResponse({ record: result.rows[0] }, "Schedule saved", 201);
  } catch (error) {
    console.error("[construction schedule POST]", error);
    return errorResponse("Schedule could not be saved");
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
      `UPDATE construction_activity_schedule SET
         planned_start = COALESCE($2, planned_start),
         planned_end = COALESCE($3, planned_end),
         depends_on_activity_id = COALESCE($4, depends_on_activity_id),
         baseline_progress = COALESCE($5, baseline_progress),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.plannedStart || body.planned_start || null,
        body.plannedEnd || body.planned_end || null,
        body.dependsOnActivityId !== undefined ||
        body.depends_on_activity_id !== undefined
          ? Number(body.dependsOnActivityId || body.depends_on_activity_id) ||
            null
          : null,
        body.baselineProgress !== undefined ||
        body.baseline_progress !== undefined
          ? Number(body.baselineProgress ?? body.baseline_progress)
          : null,
      ],
    );
    if (!result.rows.length) return errorResponse("Schedule row not found", 404);
    return successResponse({ record: result.rows[0] }, "Schedule updated");
  } catch (error) {
    console.error("[construction schedule PATCH]", error);
    return errorResponse("Schedule could not be updated");
  }
}
