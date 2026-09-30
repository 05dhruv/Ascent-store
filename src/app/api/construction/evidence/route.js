import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";
import {
  MAX_UPLOAD_BYTES,
  UploadError,
  isSafeFileUrl,
  saveDataUrl,
  saveUploadBuffer,
} from "@/lib/uploadStorage";

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

    const contentType = request.headers.get("content-type") || "";
    let entityType = "";
    let entityId = 0;
    let fileUrl = "";
    let fileName = null;
    let mimeType = null;
    let signatureData = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      entityType = String(
        form.get("entityType") || form.get("entity_type") || "",
      ).trim();
      entityId = Number(form.get("entityId") || form.get("entity_id"));
      signatureData =
        form.get("signatureData") || form.get("signature_data") || null;
      const file = form.get("file");
      if (
        file &&
        typeof file === "object" &&
        typeof file.arrayBuffer === "function"
      ) {
        if (Number(file.size || 0) > MAX_UPLOAD_BYTES) {
          throw new UploadError(
            `File too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`,
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const saved = await saveUploadBuffer(buffer, {
          originalName: file.name || "upload",
          prefix: "evidence",
        });
        fileUrl = saved.fileUrl;
        fileName = saved.fileName;
        mimeType = saved.mimeType;
      }
      if (signatureData && String(signatureData).startsWith("data:")) {
        const sig = await saveDataUrl(String(signatureData), {
          prefix: "signature",
        });
        if (!fileUrl) {
          fileUrl = sig.fileUrl;
          fileName = fileName || sig.fileName;
          mimeType = mimeType || sig.mimeType;
        }
        signatureData = sig.fileUrl;
      }
      const urlField = String(
        form.get("fileUrl") || form.get("file_url") || "",
      ).trim();
      if (!fileUrl && urlField) fileUrl = urlField;
    } else {
      const body = await request.json().catch(() => ({}));
      entityType = String(body.entityType || body.entity_type || "").trim();
      entityId = Number(body.entityId || body.entity_id);
      fileUrl = String(body.fileUrl || body.file_url || "").trim();
      fileName = body.fileName || body.file_name || null;
      mimeType = body.mimeType || body.mime_type || null;
      signatureData = body.signatureData || body.signature_data || null;

      if (signatureData && String(signatureData).startsWith("data:")) {
        const sig = await saveDataUrl(String(signatureData), {
          prefix: "signature",
        });
        signatureData = sig.fileUrl;
        if (!fileUrl) {
          fileUrl = sig.fileUrl;
          fileName = fileName || sig.fileName;
          mimeType = mimeType || sig.mimeType;
        }
      }
      if (fileUrl && fileUrl.startsWith("data:")) {
        const saved = await saveDataUrl(fileUrl, { prefix: "evidence" });
        fileUrl = saved.fileUrl;
        fileName = fileName || saved.fileName;
        mimeType = mimeType || saved.mimeType;
      }
    }

    if (!entityType || !Number.isFinite(entityId) || entityId <= 0) {
      return validationError([
        { field: "entity", message: "entityType and entityId are required" },
      ]);
    }
    if (!fileUrl) {
      return validationError([
        {
          field: "fileUrl",
          message: "file upload, file_url, or signature is required",
        },
      ]);
    }
    if (!fileUrl.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(fileUrl)) {
      fileUrl = `/uploads/${fileUrl.replace(/^public\/uploads\//, "")}`;
    }
    if (!isSafeFileUrl(fileUrl)) {
      return validationError([
        { field: "fileUrl", message: "fileUrl must be an /uploads/ path or http(s) link" },
      ]);
    }
    if (signatureData && !isSafeFileUrl(signatureData)) {
      signatureData = null;
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
    return successResponse(
      { record: result.rows[0] },
      "Evidence recorded",
      201,
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[construction evidence POST]", error);
    return errorResponse(error.message || "Evidence could not be saved");
  }
}
