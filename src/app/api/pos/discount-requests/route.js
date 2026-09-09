import { query } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import {
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import {
  createDiscountCartFingerprint,
  ensurePosDiscountApprovalSchema,
  normalizeDiscountCartItems,
} from "@/lib/posDiscountApprovalSchema";
import { ensureSalesBillingSchema } from "@/lib/salesBillingSchema";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapRequest(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    requestCode: row.request_code,
    storeId: Number(row.store_id),
    storeName: row.store_name || "",
    sessionId: row.session_id || "",
    requestedByUserId: Number(row.requested_by_user_id),
    requestedByName: row.requested_by_name || "",
    scope: row.discount_scope,
    targetProductId: row.target_product_id
      ? Number(row.target_product_id)
      : null,
    targetCartKey: row.target_cart_key || "",
    targetProductName: row.target_product_name || "",
    requestedAmount: toNumber(row.requested_amount),
    approvedAmount:
      row.approved_amount == null ? null : toNumber(row.approved_amount),
    reason: row.reason || "",
    status: row.status,
    cartSnapshot: row.cart_snapshot || [],
    cartFingerprint: row.cart_fingerprint,
    reviewedByName: row.reviewed_by_name || "",
    reviewNotes: row.review_notes || "",
    reviewedAt: row.reviewed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

async function expireOldRequests() {
  await query(`
    UPDATE pos_discount_requests
    SET status = 'expired', updated_at = NOW()
    WHERE status IN ('pending', 'approved')
      AND expires_at <= NOW()
  `);
}

const SELECT_REQUESTS = `
  SELECT pdr.*, s.name AS store_name
  FROM pos_discount_requests pdr
  LEFT JOIN stores s ON s.id = pdr.store_id
`;

export async function GET(request) {
  try {
    await ensureSalesBillingSchema();
    await ensurePosDiscountApprovalSchema();
    await expireOldRequests();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "CREATE_POS_BILL",
      "MANAGE_BILLING",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id") || 0) || null;
    const storeId = Number(searchParams.get("store_id") || 0) || null;
    const activeOnly = searchParams.get("active") === "true";
    const status = String(searchParams.get("status") || "").trim();
    const params = [];
    const where = [];

    if (id) {
      params.push(id);
      where.push(`pdr.id = $${params.length}`);
    }
    if (storeId) {
      if (auth.user.role !== "super_admin") {
        const storeCheck = requireStore(auth.user, storeId);
        if (storeCheck.error) return storeCheck.error;
      }
      params.push(storeId);
      where.push(`pdr.store_id = $${params.length}`);
    }
    if (auth.user.role !== "super_admin") {
      params.push(auth.user.id);
      where.push(`pdr.requested_by_user_id = $${params.length}`);
    }
    if (activeOnly) {
      where.push(`pdr.status IN ('pending', 'approved')`);
    } else if (status) {
      params.push(status);
      where.push(`pdr.status = $${params.length}`);
    } else if (auth.user.role === "super_admin") {
      where.push(`pdr.status = 'pending'`);
    }

    const result = await query(
      `${SELECT_REQUESTS}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY pdr.created_at DESC
       LIMIT 100`,
      params,
    );
    return successResponse({
      records: result.rows.map(mapRequest),
      total: result.rows.length,
    });
  } catch (error) {
    return errorResponse(
      error.message || "Failed to load discount requests",
      500,
    );
  }
}

export async function POST(request) {
  try {
    await ensureSalesBillingSchema();
    await ensurePosDiscountApprovalSchema();
    await expireOldRequests();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "CREATE_POS_BILL",
      "MANAGE_BILLING",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const storeId = Number(body.storeId || body.store_id || 0);
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const scope = String(body.scope || "order").toLowerCase();
    const requestedAmount = Math.round(toNumber(body.amount) * 100) / 100;
    const reason = String(body.reason || "").trim();
    const cartSnapshot = normalizeDiscountCartItems(body.items);
    const cartFingerprint = createDiscountCartFingerprint(body.items);
    const targetCartKey = String(body.targetCartKey || "").trim();
    const targetItem = cartSnapshot.find(
      (item) => item.cartKey === targetCartKey,
    );
    const subtotal = cartSnapshot
      .filter((item) => !item.promotionFreeItem)
      .reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);
    const maxAmount =
      scope === "item"
        ? toNumber(targetItem?.qty) * toNumber(targetItem?.sellingPrice)
        : subtotal;

    if (!["order", "item"].includes(scope)) {
      return errorResponse("Select a valid discount scope", 400);
    }
    if (!cartSnapshot.length) return errorResponse("Cart is empty", 400);
    if (scope === "item" && !targetItem) {
      return errorResponse("Select a valid cart product", 400);
    }
    if (requestedAmount <= 0 || requestedAmount > maxAmount) {
      return errorResponse(
        `Discount must be between 0 and ${maxAmount.toFixed(2)}`,
        400,
      );
    }
    if (!reason) return errorResponse("Discount reason is required", 400);

    const requestCode = `DISC-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;
    const result = await query(
      `INSERT INTO pos_discount_requests (
         request_code, store_id, session_id, requested_by_user_id,
         requested_by_name, discount_scope, target_product_id,
         target_cart_key, target_product_name, requested_amount, reason,
         cart_snapshot, cart_fingerprint, status, expires_at,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11,
         $12::jsonb, $13, 'pending', NOW() + INTERVAL '15 minutes',
         NOW(), NOW()
       )
       RETURNING *`,
      [
        requestCode,
        storeId,
        body.sessionId || null,
        auth.user.id,
        auth.user.name || auth.user.email || "Billing User",
        scope,
        targetItem?.productId || null,
        targetItem?.cartKey || null,
        String(body.targetProductName || "").trim() || null,
        requestedAmount,
        reason,
        JSON.stringify(cartSnapshot),
        cartFingerprint,
      ],
    );
    return successResponse(mapRequest(result.rows[0]), "Discount request sent");
  } catch (error) {
    return errorResponse(
      error.message || "Failed to create discount request",
      500,
    );
  }
}

export async function PATCH(request) {
  try {
    await ensureSalesBillingSchema();
    await ensurePosDiscountApprovalSchema();
    await expireOldRequests();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    if (auth.user.role !== "super_admin") {
      return errorResponse(
        "Only Super Admin can review discount requests",
        403,
      );
    }

    const body = await request.json().catch(() => ({}));
    const id = Number(body.id || 0);
    const action = String(body.action || "").toLowerCase();
    if (!id || !["approve", "reject"].includes(action)) {
      return errorResponse("Invalid review request", 400);
    }

    const current = await query(
      `${SELECT_REQUESTS}
       WHERE pdr.id = $1
       LIMIT 1`,
      [id],
    );
    const row = current.rows[0];
    if (!row) return errorResponse("Discount request not found", 404);
    if (row.status !== "pending") {
      return errorResponse(`Request is already ${row.status}`, 409);
    }

    const requestedAmount = toNumber(row.requested_amount);
    const approvedAmount =
      action === "approve"
        ? Math.round(toNumber(body.approvedAmount, requestedAmount) * 100) / 100
        : null;
    if (
      action === "approve" &&
      (approvedAmount <= 0 || approvedAmount > requestedAmount)
    ) {
      return errorResponse(
        "Approved amount cannot exceed the requested amount",
        400,
      );
    }

    const result = await query(
      `UPDATE pos_discount_requests
       SET status = $1,
           approved_amount = $2,
           reviewed_by_user_id = $3,
           reviewed_by_name = $4,
           review_notes = $5,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        action === "approve" ? "approved" : "rejected",
        approvedAmount,
        auth.user.id,
        auth.user.name || auth.user.email || "Super Admin",
        String(body.notes || "").trim() || null,
        id,
      ],
    );
    return successResponse(
      mapRequest(result.rows[0]),
      action === "approve" ? "Discount approved" : "Discount rejected",
    );
  } catch (error) {
    return errorResponse(
      error.message || "Failed to review discount request",
      500,
    );
  }
}

export async function DELETE(request) {
  try {
    await ensureSalesBillingSchema();
    await ensurePosDiscountApprovalSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id") || 0);
    if (!id) return errorResponse("Discount request ID is required", 400);

    const params = [id];
    let ownerClause = "";
    if (auth.user.role !== "super_admin") {
      params.push(auth.user.id);
      ownerClause = `AND requested_by_user_id = $2`;
    }
    const result = await query(
      `UPDATE pos_discount_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
         ${ownerClause}
         AND status IN ('pending', 'approved')
       RETURNING id`,
      params,
    );
    if (!result.rows.length) {
      return errorResponse("Active discount request not found", 404);
    }
    return successResponse(null, "Discount request cancelled");
  } catch (error) {
    return errorResponse(
      error.message || "Failed to cancel discount request",
      500,
    );
  }
}
