import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";

function authInventory(request, write = false) {
  return requireAuth(request).then(async (auth) => {
    if (auth.error) return auth;
    const access = requirePermission(
      auth.user,
      ...(write
        ? ["MANAGE_INVENTORY"]
        : ["VIEW_INVENTORY", "MANAGE_INVENTORY"]),
    );
    if (access.error) return access;
    return auth;
  });
}

export async function GET(request) {
  const auth = await authInventory(request, false);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const sp = new URL(request.url).searchParams;
    const entityType = sp.get("entityType");
    const entityId = Number(sp.get("entityId")) || null;
    const result = await query(
      `SELECT e.*, u.name AS uploaded_by_name
       FROM construction_evidence_files e
       LEFT JOIN users u ON u.id = e.uploaded_by
       WHERE ($1::text IS NULL OR e.entity_type = $1)
         AND ($2::bigint IS NULL OR e.entity_id = $2)
       ORDER BY e.created_at DESC
       LIMIT 200`,
      [entityType || null, entityId],
    );
    return successResponse({ records: result.rows });
  } catch (error) {
    console.error("[construction evidence GET]", error);
    return errorResponse("Evidence could not be loaded");
  }
}

export async function POST(request) {
  const auth = await authInventory(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const entityType = String(body.entityType || body.entity_type || "").trim();
    const entityId = Number(body.entityId || body.entity_id);
    let fileUrl = String(body.fileUrl || body.file_url || "").trim();
    const fileName = body.fileName || body.file_name || null;
    const mimeType = body.mimeType || body.mime_type || null;
    const signatureData = body.signatureData || body.signature_data || null;

    if (!entityType || !Number.isFinite(entityId) || entityId <= 0) {
      return validationError([
        { field: "entity", message: "entityType and entityId are required" },
      ]);
    }
    if (!fileUrl) {
      return validationError([
        { field: "fileUrl", message: "file_url is required" },
      ]);
    }
    // Normalize to public/uploads path reference when a bare filename is given
    if (!fileUrl.startsWith("/") && !fileUrl.startsWith("http")) {
      fileUrl = `/uploads/${fileUrl.replace(/^public\/uploads\//, "")}`;
    }

    const result = await query(
      `INSERT INTO construction_evidence_files
        (entity_type, entity_id, file_url, file_name, mime_type, uploaded_by, signature_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        entityType,
        entityId,
        fileUrl,
        fileName,
        mimeType,
        auth.user.id,
        signatureData,
      ],
    );
    return successResponse({ record: result.rows[0] }, "Evidence recorded", 201);
  } catch (error) {
    console.error("[construction evidence POST]", error);
    return errorResponse("Evidence could not be saved");
  }
}
