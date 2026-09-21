import QRCode from "qrcode";
import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access = requirePermission(
    auth.user,
    "VIEW_INVENTORY",
    "MANAGE_INVENTORY",
  );
  if (access.error) return access.error;
  try {
    await ensureConstructionOpsSchema();
    const transferId = Number(
      new URL(request.url).searchParams.get("transferId"),
    );
    if (!Number.isFinite(transferId) || transferId <= 0) {
      return validationError([
        { field: "transferId", message: "transferId is required" },
      ]);
    }

    let transfer = null;
    try {
      const result = await query(
        `SELECT id, transaction_id, workflow_status, status,
                source_id, destination_id, created_at
         FROM stock_transfer WHERE id = $1`,
        [transferId],
      );
      transfer = result.rows[0] || null;
    } catch {
      transfer = { id: transferId };
    }

    if (!transfer) {
      return errorResponse("Transfer not found", 404);
    }

    const payload = JSON.stringify({
      type: "ascent_transfer",
      transferId: transfer.id,
      transferNumber: transfer.transaction_id || null,
      status: transfer.workflow_status || transfer.status || null,
    });
    const qrDataUrl = await QRCode.toDataURL(payload, {
      margin: 1,
      width: 280,
    });

    return successResponse({
      transferId: transfer.id,
      transferNumber: transfer.transaction_id || null,
      payload,
      qrDataUrl,
    });
  } catch (error) {
    console.error("[construction transfer-qr GET]", error);
    return errorResponse("QR code could not be generated");
  }
}
