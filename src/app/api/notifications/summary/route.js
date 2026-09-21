import { query } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-protection";

const PREVIEW_LIMIT = 10;

function hasAnyPermission(user, permissions) {
  if (!user) return false;
  if (user.role === "super_admin" || user.role === "admin") return true;
  const list = Array.isArray(user.permissions) ? user.permissions : [];
  if (list.includes("*")) return true;
  return permissions.some((p) => list.includes(p));
}

async function safeJson(url, cookieHeader) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    return await response.json().catch(() => ({}));
  } catch {
    return {};
  }
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const user = auth.user;
    const origin = new URL(request.url).origin;
    const cookie = request.headers.get("cookie") || "";

    const canReviewReturns = hasAnyPermission(user, [
      "APPROVE_STORE_BILL_EXCHANGE",
      "PROCESS_STORE_BILL_EXCHANGE",
    ]);
    const canReviewRequisitions = hasAnyPermission(user, [
      "MANAGE_INVENTORY",
      "MANAGE_STOCK_REQUISITION",
    ]);
    const canReviewProcurement = hasAnyPermission(user, [
      "MANAGE_PURCHASE_ORDERS",
      "MANAGE_VENDORS",
      "ACCESS_ACCOUNTS",
      "VIEW_ACCOUNTS",
      "MANAGE_ACCOUNTS",
      "MANAGE_VENDOR_PAYMENTS",
      "APPROVE_FINANCE",
    ]);
    const canReviewPasswordRequests = user.role === "super_admin";
    const canReviewPurchaseOrderEditRequests = user.role === "super_admin";

    const returnsUrl = canReviewReturns
      ? `${origin}/api/pos/returns?status=pending&pageSize=${PREVIEW_LIMIT}`
      : `${origin}/api/pos/returns?scope=mine&status=reviewed&pageSize=${PREVIEW_LIMIT}`;

    const [
      returnsJson,
      lowStockJson,
      procurementJson,
      passwordJson,
      poEditJson,
      promotionsJson,
      requisitionsResult,
    ] = await Promise.all([
      safeJson(returnsUrl, cookie),
      safeJson(`${origin}/api/notifications/low-stock`, cookie),
      canReviewProcurement
        ? safeJson(`${origin}/api/notifications/procurement`, cookie)
        : Promise.resolve({}),
      canReviewPasswordRequests
        ? safeJson(
            `${origin}/api/auth/password-change-requests?status=pending`,
            cookie,
          )
        : Promise.resolve({}),
      canReviewPurchaseOrderEditRequests
        ? safeJson(
            `${origin}/api/purchase-orders/edit-requests?status=pending`,
            cookie,
          )
        : Promise.resolve({}),
      safeJson(`${origin}/api/catalog/promotions?pageSize=50`, cookie),
      canReviewRequisitions
        ? query(
            `SELECT sr.id, sr.transaction_id, sr.destination_id, sr.source_id,
                    sr.requested_by, sr.approval_status, sr.created_at,
                    (SELECT COUNT(*)::int FROM stock_requisition_items sri WHERE sri.requisition_id = sr.id) AS total_items
             FROM stock_requisitions sr
             WHERE LOWER(COALESCE(sr.approval_status, 'pending')) = 'pending'
             ORDER BY sr.created_at DESC
             LIMIT $1`,
            [PREVIEW_LIMIT],
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
    ]);

    const returnRequests =
      returnsJson.success && Array.isArray(returnsJson.data)
        ? returnsJson.data.slice(0, PREVIEW_LIMIT)
        : [];
    const lowStockAlerts =
      lowStockJson.success && Array.isArray(lowStockJson.data?.alerts)
        ? lowStockJson.data.alerts.slice(0, PREVIEW_LIMIT)
        : [];
    const procurementAlerts = Array.isArray(procurementJson.alerts)
      ? procurementJson.alerts.slice(0, PREVIEW_LIMIT)
      : [];
    const passwordRequests =
      passwordJson.success && Array.isArray(passwordJson.data?.requests)
        ? passwordJson.data.requests.slice(0, PREVIEW_LIMIT)
        : [];
    const purchaseOrderEditRequests =
      poEditJson.success && Array.isArray(poEditJson.data?.requests)
        ? poEditJson.data.requests.slice(0, PREVIEW_LIMIT)
        : [];

    const requisitionRequests = (requisitionsResult.rows || []).map((row) => ({
      id: row.id,
      transactionId: row.transaction_id || `REQ-${String(row.id).padStart(4, "0")}`,
      destinationId: row.destination_id,
      sourceId: row.source_id,
      requestedBy: row.requested_by,
      approvalStatus: row.approval_status || "pending",
      totalItems: Number(row.total_items || 0),
      createdAt: row.created_at,
    }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const promotionRecords =
      promotionsJson.success && Array.isArray(promotionsJson.data?.records)
        ? promotionsJson.data.records
        : [];
    const promotionAlerts = promotionRecords
      .flatMap((promotion) => {
        const status = String(promotion.status || "").toLowerCase();
        const end = promotion.end_date
          ? new Date(`${String(promotion.end_date).slice(0, 10)}T23:59:59`)
          : null;
        const daysLeft = end ? Math.ceil((end - today) / 86400000) : null;
        if (status === "pending")
          return [{ ...promotion, alertType: "pending" }];
        if (
          status === "active" &&
          daysLeft !== null &&
          daysLeft >= 0 &&
          daysLeft <= 7
        ) {
          return [{ ...promotion, alertType: "expiring", daysLeft }];
        }
        if (status === "active" && end && end < today)
          return [{ ...promotion, alertType: "expired" }];
        return [];
      })
      .slice(0, PREVIEW_LIMIT);

    return successResponse({
      returnRequests,
      lowStockAlerts,
      requisitionRequests,
      procurementAlerts,
      passwordRequests,
      purchaseOrderEditRequests,
      promotionAlerts,
      counts: {
        returns: returnRequests.length,
        lowStock: lowStockAlerts.length,
        requisitions: requisitionRequests.length,
        procurement: procurementAlerts.length,
        passwordRequests: passwordRequests.length,
        purchaseOrderEdits: purchaseOrderEditRequests.length,
        promotions: promotionAlerts.length,
      },
    });
  } catch (err) {
    return errorResponse(err.message || "Failed to load notifications");
  }
}
