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
    const pagination = getPagination(new URL(request.url).searchParams);
    const params = [];
    const attendanceSql = `SELECT a.*, cr.name AS crew_name, s.name AS site_name,
              COUNT(*) OVER() AS __total
       FROM construction_attendance a
       JOIN construction_crews cr ON cr.id = a.crew_id
       LEFT JOIN construction_sites s ON s.id = a.site_id
       ORDER BY a.work_date DESC, a.id DESC
       ${limitOffsetSql(pagination, params)}`;

    if (pagination.isExport) {
      const attendance = await query(attendanceSql, params);
      return spreadsheetResponse(attendance.rows, {
        filename: "labour_attendance",
        format: pagination.format,
        columns: [
          { key: "work_date", label: "Date" },
          { key: "crew_id", label: "Crew ID" },
          { key: "crew_name", label: "Crew" },
          { key: "site_id", label: "Site ID" },
          { key: "site_name", label: "Site" },
          { key: "headcount", label: "Headcount" },
          { key: "hours", label: "Hours" },
          { key: "notes", label: "Notes" },
        ],
      });
    }

    const [crews, attendance] = await Promise.all([
      query(
        `SELECT c.*, p.name AS project_name, s.name AS site_name, ct.name AS contractor_name
         FROM construction_crews c
         LEFT JOIN construction_projects p ON p.id = c.project_id
         LEFT JOIN construction_sites s ON s.id = c.site_id
         LEFT JOIN construction_contractors ct ON ct.id = c.contractor_id
         ORDER BY c.name`,
      ),
      query(attendanceSql, params),
    ]);
    const payload = pagedPayload(attendance.rows, pagination);
    return successResponse({
      ...payload,
      crews: crews.rows,
      attendance: payload.records,
    });
  } catch (error) {
    console.error("[construction labour GET]", error);
    return errorResponse("Labour data could not be loaded");
  }
}

export async function POST(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const type = String(body.type || body.action || "crew");

    if (type === "crew") {
      const name = String(body.name || "").trim();
      if (!name) {
        return validationError([{ field: "name", message: "name is required" }]);
      }
      const result = await query(
        `INSERT INTO construction_crews (name, project_id, site_id, contractor_id, trade, is_active)
         VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING *`,
        [
          name,
          Number(body.projectId) || null,
          Number(body.siteId) || null,
          Number(body.contractorId) || null,
          body.trade || null,
        ],
      );
      return successResponse({ record: result.rows[0] }, "Crew created", 201);
    }

    if (type === "attendance") {
      const crewId = Number(body.crewId || body.crew_id);
      if (!Number.isFinite(crewId) || crewId <= 0) {
        return validationError([
          { field: "crewId", message: "crew_id is required" },
        ]);
      }
      const result = await query(
        `INSERT INTO construction_attendance (crew_id, site_id, work_date, headcount, hours, notes)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (crew_id, work_date)
         DO UPDATE SET
           site_id = COALESCE(EXCLUDED.site_id, construction_attendance.site_id),
           headcount = EXCLUDED.headcount,
           hours = EXCLUDED.hours,
           notes = EXCLUDED.notes
         RETURNING *`,
        [
          crewId,
          Number(body.siteId || body.site_id) || null,
          body.workDate || body.work_date || new Date().toISOString().slice(0, 10),
          Number(body.headcount || 0),
          Number(body.hours || 0),
          body.notes || null,
        ],
      );
      return successResponse(
        { record: result.rows[0] },
        "Attendance saved",
        201,
      );
    }

    return validationError([{ field: "type", message: "type must be crew or attendance" }]);
  } catch (error) {
    console.error("[construction labour POST]", error);
    return errorResponse("Labour record could not be saved");
  }
}
