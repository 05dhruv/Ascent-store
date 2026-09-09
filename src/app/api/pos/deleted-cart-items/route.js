import { successResponse, errorResponse } from "@/lib/api-response";
import {
  appendStoreScope,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { query } from "@/lib/db";
import { ensurePosDeletedCartItemsSchema } from "@/lib/posDeletedCartItemsSchema";
import { ensureSalesBillingSchema } from "@/lib/salesBillingSchema";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function mapDeletedItem(item = {}) {
  const qty = toNumber(item.qty, 0);
  const sellingPrice = toNumber(item.sellingPrice ?? item.selling_price, 0);
  const discountAmount = toNumber(
    item.discountAmount ?? item.discount_amount,
    0,
  );
  return {
    productId: Number(item.id ?? item.productId ?? item.product_id) || null,
    productName: normalizeText(item.name ?? item.productName, "Product"),
    barcode: normalizeText(item.barcode, ""),
    sku: normalizeText(item.sku, ""),
    qty,
    mrp: toNumber(item.mrp, 0),
    sellingPrice,
    discountAmount,
    lineAmount: Math.max(0, qty * sellingPrice - discountAmount),
    meta: {
      cartKey: item.cartKey || item.variantKey || item.id || null,
      unit: item.unit || item.unit_name || null,
      selectedBatchId: item.selectedBatchId || item.selected_batch_id || null,
      selectedBatchIds: Array.isArray(item.selectedBatchIds)
        ? item.selectedBatchIds
        : [],
    },
  };
}

export async function POST(request) {
  try {
    await ensureSalesBillingSchema();
    await ensurePosDeletedCartItemsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "CREATE_POS_BILL",
      "MANAGE_BILLING",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const storeId = Number(body.storeId || 0);
    const cartSessionId = normalizeText(body.cartSessionId, "");
    const eventType = ["cart_cleared", "item_removed"].includes(
      String(body.eventType || ""),
    )
      ? String(body.eventType)
      : "item_removed";
    const reason = normalizeText(body.reason, "Removed before billing");
    const items = Array.isArray(body.items) ? body.items : [];

    if (!storeId) return errorResponse("Store is required", 400);
    if (!cartSessionId) return errorResponse("Cart session is required", 400);
    if (!items.length) return successResponse({ ids: [] }, "No items logged");

    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const insertedIds = [];
    for (const sourceItem of items) {
      if (sourceItem?.promotionFreeItem) continue;
      const item = mapDeletedItem(sourceItem);
      if (!item.productId || item.qty <= 0) continue;

      const res = await query(
        `INSERT INTO pos_deleted_cart_items (
           cart_session_id, store_id, pos_session_id, counter_id,
           user_id, user_name, product_id, product_name, barcode, sku,
           qty, mrp, selling_price, discount_amount, line_amount,
           reason, event_type, meta, created_at
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15,
           $16, $17, $18::jsonb, NOW()
         )
         RETURNING id`,
        [
          cartSessionId,
          storeId,
          Number(body.posSessionId || 0) || null,
          Number(body.counterId || 0) || null,
          auth.user.id,
          auth.user.name || auth.user.email || "",
          item.productId,
          item.productName,
          item.barcode || null,
          item.sku || null,
          item.qty,
          item.mrp,
          item.sellingPrice,
          item.discountAmount,
          item.lineAmount,
          reason,
          eventType,
          JSON.stringify(item.meta),
        ],
      );
      if (res.rows[0]?.id) insertedIds.push(Number(res.rows[0].id));
    }

    return successResponse({ ids: insertedIds }, "Deleted cart items logged");
  } catch (err) {
    console.error("[pos deleted cart items] POST failed", err);
    return errorResponse(err.message || "Unable to log deleted cart items");
  }
}

export async function GET(request) {
  try {
    await ensureSalesBillingSchema();
    await ensurePosDeletedCartItemsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "VIEW_STORE_SALES",
      "VIEW_STORE_REPORTS",
      "MANAGE_BILLING",
      "MANAGE_ORDERS",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const params = [];
    const where = ["1 = 1"];

    const storeId = Number(searchParams.get("storeId") || 0) || null;
    const scope = appendStoreScope(
      where,
      params,
      "d.store_id",
      auth.user,
      storeId,
    );
    if (scope.error) return scope.error;

    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom) {
      params.push(dateFrom);
      where.push(
        `DATE(d.created_at AT TIME ZONE 'Asia/Kolkata') >= $${params.length}::date`,
      );
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(
        `DATE(d.created_at AT TIME ZONE 'Asia/Kolkata') <= $${params.length}::date`,
      );
    }

    const search = normalizeText(searchParams.get("search"), "");
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(
        LOWER(d.product_name) LIKE $${params.length}
        OR LOWER(COALESCE(d.barcode, '')) LIKE $${params.length}
        OR LOWER(COALESCE(d.sku, '')) LIKE $${params.length}
        OR LOWER(COALESCE(d.bill_number, '')) LIKE $${params.length}
      )`);
    }

    const res = await query(
      `SELECT d.*, s.name AS store_name
       FROM pos_deleted_cart_items d
       LEFT JOIN stores s ON s.id = d.store_id
       WHERE ${where.join(" AND ")}
       ORDER BY d.created_at DESC
       LIMIT 1000`,
      params,
    );

    return successResponse({ records: res.rows }, "Deleted cart items fetched");
  } catch (err) {
    console.error("[pos deleted cart items] GET failed", err);
    return errorResponse(err.message || "Unable to fetch deleted cart items");
  }
}
