import { query } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { repairStockTransferSaleabilityPrices } from "@/lib/stockTransferSaleabilityRepair";

/**
 * POST /api/admin/repair-saleability
 * Run saleability price repair as an admin job (not on every catalog GET).
 */
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_INVENTORY",
      "*",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const storeId = Number(body.store_id || body.storeId || 0) || null;

    // Bypass TTL for intentional admin runs
    const g = globalThis;
    if (g._stockTransferSaleabilityRepair) {
      g._stockTransferSaleabilityRepair.delete(storeId ? `store:${storeId}` : "all");
    }

    const result = await repairStockTransferSaleabilityPrices(storeId, query);
    return successResponse(result || { ok: true });
  } catch (err) {
    return errorResponse(err.message || "Repair failed");
  }
}
