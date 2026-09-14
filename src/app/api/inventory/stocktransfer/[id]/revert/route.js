import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { ensureStockTransferSchema } from "@/lib/stockTransferSchema";
import { ensureMarginApprovalSchema } from "@/lib/marginApprovalSchema";
import {
  allocateBatchStock,
  ensureInventoryBatchSchema,
  restoreBatchStock,
} from "@/lib/inventoryBatching";
import {
  requireAuth,
  requirePermission,
  requireStore,
  auditLog,
} from "@/lib/api-protection";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request, { params }) {
  const { id } = await params;
  let client;

  try {
    await ensureStockTransferSchema();
    await ensureInventoryBatchSchema();
    await ensureMarginApprovalSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "TRANSFER_CREATE");
    if (permissionCheck.error) return permissionCheck.error;

    client = await getClient();
    await client.query("BEGIN");

    const transferRes = await client.query(
      `SELECT id, status, source_id, destination_id, transaction_id, reverted_at
       FROM stock_transfer
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );
    const transfer = transferRes.rows[0];
    if (!transfer) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Stock transfer not found" },
        { status: 404 },
      );
    }
    if (!['draft','margin_hold','confirmed','reverted'].includes(transfer.status)) {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'Use the movement tracker to cancel undispatched requests. Dispatched stock requires a return transfer.'},{status:409});
    }
    if (transfer.status === "reverted" || transfer.reverted_at) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "This stock transfer is already reverted" },
        { status: 409 },
      );
    }

    for (const storeId of [transfer.source_id, transfer.destination_id].filter(
      Boolean,
    )) {
      const storeCheck = requireStore(auth.user, storeId);
      if (storeCheck.error) {
        await client.query("ROLLBACK");
        return storeCheck.error;
      }
    }

    if (
      ["draft", "margin_hold"].includes(
        String(transfer.status || "").toLowerCase(),
      )
    ) {
      await client.query(
        `UPDATE margin_approval_requests
         SET status = 'cancelled', updated_at = NOW()
         WHERE stock_transfer_id = $1
           AND LOWER(COALESCE(status, '')) = 'pending'`,
        [id],
      );
      await client.query(
        `UPDATE stock_transfer
         SET status = 'reverted', reverted_at = NOW(), reverted_by = $1,
             meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb
         WHERE id = $3`,
        [
          auth.user.id || null,
          JSON.stringify({
            reverted: true,
            cancelledBeforeConfirmation: true,
            previousStatus: transfer.status,
            revertedAt: new Date().toISOString(),
            revertedBy: auth.user.id || null,
          }),
          id,
        ],
      );
      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        id: Number(id),
        totalQty: 0,
        revertedQty: 0,
        partial: false,
        shortages: [],
        message: "Unconfirmed stock transfer cancelled successfully.",
      });
    }

    if (transfer.status !== "confirmed") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: `Stock transfer with status ${transfer.status || "unknown"} cannot be reverted`,
        },
        { status: 400 },
      );
    }

    const itemsRes = await client.query(
      `SELECT id, product_id, product_name, sku, qty, cost_price, mrp, selling_price, destination_mrp, meta
       FROM stock_transfer_items
       WHERE stock_transfer_id = $1
       ORDER BY id ASC`,
      [id],
    );
    if (!itemsRes.rows.length) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "No items found for this transfer" },
        { status: 400 },
      );
    }

    let totalQty = 0;
    let revertedQty = 0;
    const unavailable = [];
    const revertPlan = [];

    // Build the revert plan from exact batches created by this transfer only;
    // another receipt of the same product in the destination is never used.
    for (const item of itemsRes.rows) {
      const qty = toNumber(item.qty);
      if (qty <= 0) continue;
      totalQty += qty;

      const destinationBatches = await client.query(
        `SELECT id, available_qty, status, meta,
                NULLIF(meta->>'sourceBatchId', '')::bigint AS source_batch_id
         FROM inventory_batches
         WHERE product_id = $1
           AND store_id = $2
           AND source_type = 'stock_transfer'
           AND source_id = $3
         FOR UPDATE`,
        [item.product_id, transfer.destination_id, String(item.id)],
      );
      const availableQty = destinationBatches.rows.reduce(
        (sum, batch) => sum + toNumber(batch.available_qty),
        0,
      );
      const shortQty = Math.max(0, Math.round((qty - availableQty) * 1000) / 1000);
      const sourceBatchMissing = destinationBatches.rows.some((batch) => !batch.source_batch_id);
      const qtyToRevert = sourceBatchMissing
        ? 0
        : Math.min(qty, availableQty);
      if (shortQty > 0 || sourceBatchMissing) {
        unavailable.push({
          productId: Number(item.product_id),
          productName: item.product_name || `Product ${item.product_id}`,
          sku: item.sku || null,
          transferredQty: qty,
          availableForRevert: availableQty,
          soldOrIssuedQty: shortQty,
          reason: sourceBatchMissing
            ? "Original source-batch link is missing"
            : "Some quantity has already been sold, issued, or adjusted",
        });
      }
      revertPlan.push({ item, qtyToRevert, destinationBatches: destinationBatches.rows });
    }

    for (const { item, qtyToRevert, destinationBatches } of revertPlan) {
      if (qtyToRevert <= 0) continue;
      const allocations = await allocateBatchStock(client, {
        productId: item.product_id,
        storeId: transfer.destination_id,
        qty: qtyToRevert,
        allowedBatchIds: destinationBatches.map((batch) => Number(batch.id)),
        referenceType: "stock_transfer_revert",
        referenceId: id,
        sourceItemId: item.id,
        meta: {
          direction: "destination_reversal",
          originalTransferId: transfer.id,
          transactionId: transfer.transaction_id || null,
        },
      });

      for (const allocation of allocations) {
        revertedQty += toNumber(allocation.qty);
        const destinationBatch = destinationBatches.find(
          (batch) => Number(batch.id) === Number(allocation.batchId),
        );
        const restored = await restoreBatchStock(client, {
          batchId: destinationBatch?.source_batch_id,
          productId: item.product_id,
          storeId: transfer.source_id,
          qty: allocation.qty,
          referenceType: "stock_transfer_revert",
          referenceId: id,
          sourceItemId: item.id,
          meta: {
            source: "stock_transfer_revert",
            originalTransferId: transfer.id,
            originalTransferItemId: item.id,
            destinationBatchId: allocation.batchId,
            productName: item.product_name || "",
            costPrice: allocation.costPrice || item.cost_price || 0,
            mrp: allocation.mrp || item.mrp || item.destination_mrp || 0,
            sellingPrice: allocation.sellingPrice || item.selling_price || 0,
          },
        });
        if (!restored) throw new Error(`Original source batch is unavailable for ${item.product_name || item.product_id}`);
      }
    }

    await client.query(
      `UPDATE stock_transfer
       SET status = 'reverted',
           reverted_at = NOW(),
           reverted_by = $1,
           meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb
       WHERE id = $3`,
      [
        auth.user.id || null,
        JSON.stringify({
          reverted: true,
          partialRevert: unavailable.length > 0,
          requestedQty: totalQty,
          revertedQty,
          shortages: [],
          revertedAt: new Date().toISOString(),
          revertedBy: auth.user.id || null,
        }),
        id,
      ],
    );

    await client.query("COMMIT");
    await auditLog(auth.user.id, "stock_transfer.reverted", "stock_transfer", transfer.id, {
      sourceStoreId: transfer.source_id,
      destinationStoreId: transfer.destination_id,
      totalQty,
      revertedQty,
      mode: "strict_original_batch_restore",
      shortages: unavailable,
    });
    const message = unavailable.length
      ? `Transfer partially reverted. Unsold quantity was restored to original batches. ${unavailable.map((row) => `${row.productName}${row.sku ? ` (SKU: ${row.sku})` : ""}: ${row.soldOrIssuedQty > 0 ? `${row.soldOrIssuedQty} unit(s) already sold/issued` : row.reason}`).join("; ")}.`
      : "Stock transfer reverted successfully. Original source batches were restored.";

    return NextResponse.json({
      success: true,
      id: Number(id),
      totalQty,
      revertedQty,
      partial: unavailable.length > 0,
      shortages: unavailable,
      message,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[stocktransfer revert]", err.stack || err.message);
    return NextResponse.json(
      { error: err.message || "Failed to revert stock transfer" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
