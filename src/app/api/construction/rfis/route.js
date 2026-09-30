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
    const status = sp.get("status");
    const pagination = getPagination(sp);
    const params = [projectId, status || null];
    const result = await query(
      `SELECT r.*, p.name AS project_name, s.name AS site_name,
              ru.name AS raised_by_name, au.name AS answered_by_name,
              COUNT(*) OVER() AS __total
       FROM construction_rfis r
       LEFT JOIN construction_projects p ON p.id = r.project_id
       LEFT JOIN construction_sites s ON s.id = r.site_id
       LEFT JOIN users ru ON ru.id = r.raised_by
       LEFT JOIN users au ON au.id = r.answered_by
       WHERE ($1::bigint IS NULL OR r.project_id = $1)
         AND ($2::text IS NULL OR r.status = $2)
       ORDER BY r.created_at DESC
       ${limitOffsetSql(pagination, params)}`,
      params,
    );
    if (pagination.isExport) {
      return spreadsheetResponse(result.rows, {
        filename: "rfis",
        format: pagination.format,
        columns: [
          { key: "rfi_number", label: "RFI", value: (r) => r.rfi_number || `#${r.id}` },
          { key: "project_name", label: "Project" },
          { key: "site_name", label: "Site" },
          { key: "subject", label: "Subject" },
          { key: "status", label: "Status" },
          { key: "question", label: "Question" },
          { key: "answer", label: "Answer" },
          { key: "raised_by_name", label: "Raised by" },
          { key: "answered_by_name", label: "Answered by" },
          { key: "due_at", label: "Due" },
          { key: "created_at", label: "Created" },
        ],
      });
    }
    return successResponse(pagedPayload(result.rows, pagination));
  } catch (error) {
    console.error("[construction rfis GET]", error);
    return errorResponse("RFIs could not be loaded");
  }
}

export async function POST(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const subject = String(body.subject || "").trim();
    const question = String(body.question || "").trim();
    if (!subject || !question) {
      return validationError([
        { field: "rfi", message: "subject and question are required" },
      ]);
    }
    const result = await query(
      `INSERT INTO construction_rfis
        (project_id, site_id, rfi_number, subject, question, status, raised_by, due_at)
       VALUES ($1,$2,$3,$4,$5,'open',$6,$7) RETURNING *`,
      [
        Number(body.projectId || body.project_id) || null,
        Number(body.siteId || body.site_id) || null,
        body.rfiNumber || body.rfi_number || null,
        subject,
        question,
        auth.user.id,
        body.dueAt || body.due_at || null,
      ],
    );
    return successResponse({ record: result.rows[0] }, "RFI created", 201);
  } catch (error) {
    console.error("[construction rfis POST]", error);
    return errorResponse("RFI could not be created");
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
    const answer = body.answer !== undefined ? String(body.answer) : null;
    const status = body.status || (answer ? "answered" : null);
    const result = await query(
      `UPDATE construction_rfis SET
         answer = COALESCE($2, answer),
         status = COALESCE($3, status),
         answered_by = CASE WHEN $2 IS NOT NULL THEN $4 ELSE answered_by END,
         answered_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE answered_at END
       WHERE id = $1 RETURNING *`,
      [id, answer, status, auth.user.id],
    );
    if (!result.rows.length) return errorResponse("RFI not found", 404);
    return successResponse({ record: result.rows[0] }, "RFI updated");
  } catch (error) {
    console.error("[construction rfis PATCH]", error);
    return errorResponse("RFI could not be updated");
  }
}
