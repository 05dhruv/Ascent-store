import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";
import { getPagination, limitOffsetSql, pagedPayload, spreadsheetResponse } from "@/lib/pagination";

async function guard(request, write = false) {
  const auth = await requireAuth(request);
  if (auth.error) return auth;
  const access = requirePermission(
    auth.user,
    ...(write
      ? ["MANAGE_INVENTORY"]
      : ["VIEW_INVENTORY", "MANAGE_INVENTORY"]),
  );
  if (access.error) return access;
  return auth;
}

export async function GET(request) {
  const auth = await guard(request, false);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status");
    const pagination = getPagination(sp);
    const params = [status || null];
    const result = await query(
      `SELECT q.*,
              p.name AS product_name,
              s.name AS store_name,
              ru.name AS requested_by_name,
              au.name AS approved_by_name,
              COUNT(*) OVER() AS __total
       FROM construction_quarantine_releases q
       LEFT JOIN products p ON p.id = q.product_id
       LEFT JOIN stores s ON s.id = q.store_id
       LEFT JOIN users ru ON ru.id = q.requested_by
       LEFT JOIN users au ON au.id = q.approved_by
       WHERE ($1::text IS NULL OR q.status = $1)
       ORDER BY q.created_at DESC
       ${limitOffsetSql(pagination, params)}`,
      params,
    );
    if (pagination.isExport) {
      return spreadsheetResponse(result.rows, {
        filename: "quarantine_releases",
        format: pagination.format,
        columns: [
          { key: "id", label: "ID" },
          { key: "batch_id", label: "Batch ID" },
          { key: "product_name", label: "Product", value: (r) => r.product_name || r.product_id || "" },
          { key: "store_name", label: "Store", value: (r) => r.store_name || r.store_id || "" },
          { key: "qty", label: "Qty" },
          { key: "reason", label: "Reason" },
          { key: "status", label: "Status" },
          { key: "requested_by_name", label: "Requested by" },
          { key: "approved_by_name", label: "Resolved by" },
          { key: "created_at", label: "Created" },
          { key: "resolved_at", label: "Resolved" },
        ],
      });
    }
    return successResponse(pagedPayload(result.rows, pagination));
  } catch (error) {
    console.error("[construction quarantine GET]", error);
    return errorResponse("Quarantine releases could not be loaded");
  }
}

export async function POST(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return validationError([{ field: "qty", message: "qty must be > 0" }]);
    }
    const result = await query(
      `INSERT INTO construction_quarantine_releases
        (batch_id, store_id, product_id, qty, reason, status, requested_by)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING *`,
      [
        Number(body.batchId || body.batch_id) || null,
        Number(body.storeId || body.store_id) || null,
        Number(body.productId || body.product_id) || null,
        qty,
        body.reason || null,
        auth.user.id,
      ],
    );
    return successResponse(
      { record: result.rows[0] },
      "Quarantine release requested",
      201,
    );
  } catch (error) {
    console.error("[construction quarantine POST]", error);
    return errorResponse("Quarantine release could not be created");
  }
}

export async function PATCH(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const status = String(body.status || "").toLowerCase();
    if (!Number.isFinite(id) || id <= 0) {
      return validationError([{ field: "id", message: "id is required" }]);
    }
    if (!["approved", "rejected"].includes(status)) {
      return validationError([
        { field: "status", message: "status must be approved or rejected" },
      ]);
    }
    const result = await query(
      `UPDATE construction_quarantine_releases
       SET status = $2, approved_by = $3, resolved_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, status, auth.user.id],
    );
    if (!result.rows.length) {
      return errorResponse("Pending quarantine release not found", 404);
    }
    return successResponse({ record: result.rows[0] }, `Release ${status}`);
  } catch (error) {
    console.error("[construction quarantine PATCH]", error);
    return errorResponse("Quarantine release could not be updated");
  }
}
