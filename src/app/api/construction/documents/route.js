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
    const pagination = getPagination(sp);
    const params = [projectId];
    const result = await query(
      `SELECT d.*, p.name AS project_name, s.name AS site_name, u.name AS uploaded_by_name,
              COUNT(*) OVER() AS __total
       FROM construction_documents d
       LEFT JOIN construction_projects p ON p.id = d.project_id
       LEFT JOIN construction_sites s ON s.id = d.site_id
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE ($1::bigint IS NULL OR d.project_id = $1)
       ORDER BY d.created_at DESC
       ${limitOffsetSql(pagination, params)}`,
      params,
    );
    if (pagination.isExport) {
      return spreadsheetResponse(result.rows, {
        filename: "project_documents",
        format: pagination.format,
        columns: [
          { key: "title", label: "Title" },
          { key: "doc_type", label: "Type" },
          { key: "revision", label: "Revision" },
          { key: "status", label: "Status" },
          { key: "project_name", label: "Project", value: (r) => r.project_name || r.project_id || "" },
          { key: "site_name", label: "Site" },
          { key: "file_url", label: "File URL" },
          { key: "uploaded_by_name", label: "Uploaded by" },
          { key: "created_at", label: "Created" },
        ],
      });
    }
    return successResponse(pagedPayload(result.rows, pagination));
  } catch (error) {
    console.error("[construction documents GET]", error);
    return errorResponse("Documents could not be loaded");
  }
}

export async function POST(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    if (!title) {
      return validationError([{ field: "title", message: "title is required" }]);
    }
    let fileUrl = body.fileUrl || body.file_url || null;
    if (fileUrl && !String(fileUrl).startsWith("/") && !String(fileUrl).startsWith("http")) {
      fileUrl = `/uploads/${String(fileUrl).replace(/^public\/uploads\//, "")}`;
    }
    const result = await query(
      `INSERT INTO construction_documents
        (project_id, site_id, doc_type, title, file_url, revision, status, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        Number(body.projectId || body.project_id) || null,
        Number(body.siteId || body.site_id) || null,
        body.docType || body.doc_type || "general",
        title,
        fileUrl,
        body.revision || null,
        body.status || "active",
        auth.user.id,
      ],
    );
    return successResponse({ record: result.rows[0] }, "Document created", 201);
  } catch (error) {
    console.error("[construction documents POST]", error);
    return errorResponse("Document could not be saved");
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
      `UPDATE construction_documents SET
         title = COALESCE($2, title),
         doc_type = COALESCE($3, doc_type),
         file_url = COALESCE($4, file_url),
         revision = COALESCE($5, revision),
         status = COALESCE($6, status)
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.title != null ? String(body.title).trim() : null,
        body.docType || body.doc_type || null,
        body.fileUrl || body.file_url || null,
        body.revision !== undefined ? body.revision : null,
        body.status || null,
      ],
    );
    if (!result.rows.length) return errorResponse("Document not found", 404);
    return successResponse({ record: result.rows[0] }, "Document updated");
  } catch (error) {
    console.error("[construction documents PATCH]", error);
    return errorResponse("Document could not be updated");
  }
}
