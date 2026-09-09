import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import {
  auditLog,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";

export async function PATCH(request, { params }) {
  let client;
  try {
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permission = requirePermission(auth.user, "MANAGE_CATALOG");
    if (permission.error) return permission.error;

    const { status } = await request.json();
    if (!["active", "inactive"].includes(String(status))) {
      return NextResponse.json(
        { success: false, message: "Status must be active or inactive" },
        { status: 400 },
      );
    }
    const resolvedParams = await params;
    const batchId = Number(resolvedParams?.id);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid batch" },
        { status: 400 },
      );
    }

    client = await getClient();
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT ib.id, ib.store_id, ib.product_id, ib.batch_no, ib.available_qty, ib.reserved_qty, ib.status, p.name AS product_name
       FROM inventory_batches ib
       LEFT JOIN products p ON p.id = ib.product_id
       WHERE ib.id = $1
       FOR UPDATE OF ib`,
      [batchId],
    );
    const batch = existing.rows[0];
    if (!batch) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Batch not found" },
        { status: 404 },
      );
    }
    const storeAccess = requireStore(auth.user, Number(batch.store_id));
    if (storeAccess.error) {
      await client.query("ROLLBACK");
      return storeAccess.error;
    }
    if (Number(batch.reserved_qty) > 0 || ['damaged','rejected','quarantine'].includes(batch.status)) {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'Reserved or isolated material cannot change status through catalog settings. Cancel its reservation or use a documented QC disposition.'},{status:409});
    }
    const updated = await client.query(
      `UPDATE inventory_batches SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, batchId],
    );
    await client.query("COMMIT");
    // The inventory change is already committed. An audit infrastructure issue
    // must not report the successful status update as a failed PATCH request.
    await auditLog(
      auth.user.id,
      "batch.status_updated",
      "inventory_batch",
      batchId,
      {
        productId: batch.product_id,
        productName: batch.product_name,
        batchNo: batch.batch_no,
        storeId: batch.store_id,
        availableQty: Number(batch.available_qty || 0),
        previousStatus: batch.status,
        nextStatus: status,
      },
    ).catch((auditError) => {
      console.error("Batch status audit log failed:", auditError);
    });
    return NextResponse.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Batch status update failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Unable to update batch status",
      },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
