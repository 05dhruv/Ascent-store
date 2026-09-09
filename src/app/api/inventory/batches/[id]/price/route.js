import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import {
  appendStoreScope,
  auditLog,
  requireAuth,
  requirePermission,
} from "@/lib/api-protection";

export async function PATCH(request, context) {
  try {
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, "MANAGE_INVENTORY");
    if (permissionCheck.error) return permissionCheck.error;

    const { id } = await context.params;
    const batchId = Number(id);
    const body = await request.json();
    const costPrice = Number(body.costPrice);
    const mrp = Number(body.mrp);
    const sellingPrice = Number(body.sellingPrice);
    if (
      !Number.isInteger(batchId) ||
      batchId <= 0 ||
      !Number.isFinite(costPrice) ||
      costPrice < 0 ||
      !(mrp > 0) ||
      !(sellingPrice > 0) ||
      sellingPrice > mrp
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Enter valid cost price, MRP and selling price.",
        },
        { status: 400 },
      );
    }

    const params = [batchId];
    const conditions = [
      "ib.id = $1",
      "ib.status = 'active'",
      "ib.available_qty > 0",
    ];
    const scope = appendStoreScope(
      conditions,
      params,
      "ib.store_id",
      auth.user,
    );
    if (scope.error) return scope.error;
    const existing = await query(
      `SELECT ib.id, ib.product_id, ib.store_id, ib.batch_no, ib.available_qty, ib.meta, p.name AS product_name FROM inventory_batches ib LEFT JOIN products p ON p.id = ib.product_id WHERE ${conditions.join(" AND ")}`,
      params,
    );
    if (!existing.rows[0])
      return NextResponse.json(
        {
          success: false,
          message: "Active batch not found or you do not have access.",
        },
        { status: 404 },
      );

    const row = existing.rows[0];
    const previous = {
      costPrice: Number(row.meta?.costPrice || 0),
      mrp: Number(row.meta?.mrp || 0),
      sellingPrice: Number(row.meta?.sellingPrice || 0),
    };
    await query(
      `UPDATE inventory_batches SET cost_price = $2::numeric, meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('costPrice', $2::numeric, 'mrp', $3::numeric, 'sellingPrice', $4::numeric, 'priceCorrectedAt', NOW()::text, 'priceCorrectedBy', $5::text), updated_at = NOW() WHERE id = $1`,
      [batchId, costPrice, mrp, sellingPrice, String(auth.user.id || "")],
    );
    await auditLog(
      auth.user.id,
      "inventory_batch.prices_updated",
      "inventory_batch",
      batchId,
      {
        productId: row.product_id,
        productName: row.product_name,
        storeId: row.store_id,
        batchNo: row.batch_no,
        availableQty: Number(row.available_qty),
        previous,
        next: { costPrice, mrp, sellingPrice },
      },
    );
    return NextResponse.json({
      success: true,
      data: { id: batchId, costPrice, mrp, sellingPrice },
    });
  } catch (error) {
    console.error("[inventory batch price PATCH]", error);
    return NextResponse.json(
      { success: false, message: "Unable to update batch price." },
      { status: 500 },
    );
  }
}
