import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import {
  auditLog,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { validatePriceSet } from "@/lib/priceIntegrity";

const asPrice = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export async function POST(request) {
  let client;
  try {
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permission = requirePermission(auth.user, "MANAGE_CATALOG");
    if (permission.error) return permission.error;

    const body = await request.json().catch(() => ({}));
    const productId = Number(body.productId);
    const storeId = Number(body.storeId);
    const oldMrp = asPrice(body.oldMrp);
    const oldSellingPrice = asPrice(body.oldSellingPrice);
    const newMrp = asPrice(body.newMrp);
    const newSellingPrice = asPrice(body.newSellingPrice);
    if (
      !Number.isInteger(productId) ||
      !Number.isInteger(storeId) ||
      [oldMrp, oldSellingPrice, newMrp, newSellingPrice].some(
        (value) => value === null,
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Valid product, store, old and new MRP/SP are required" },
        { status: 400 },
      );
    }
    if (newSellingPrice > newMrp) {
      return NextResponse.json(
        { success: false, message: "Selling Price cannot exceed MRP" },
        { status: 400 },
      );
    }
    const storeAccess = requireStore(auth.user, storeId);
    if (storeAccess.error) return storeAccess.error;

    client = await getClient();
    await client.query("BEGIN");
    const matched = await client.query(
      `SELECT id, batch_no, expiry_date, available_qty, cost_price,
              CASE WHEN COALESCE(meta->>'mrp', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                   THEN (meta->>'mrp')::numeric ELSE 0 END AS mrp,
              CASE WHEN COALESCE(meta->>'sellingPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                   THEN (meta->>'sellingPrice')::numeric ELSE 0 END AS selling_price
       FROM inventory_batches
       WHERE product_id = $1
         AND store_id = $2
         AND status = 'active'
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         AND CASE WHEN COALESCE(meta->>'mrp', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                  THEN (meta->>'mrp')::numeric ELSE 0 END = $3
         AND CASE WHEN COALESCE(meta->>'sellingPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                  THEN (meta->>'sellingPrice')::numeric ELSE 0 END = $4
       FOR UPDATE`,
      [productId, storeId, oldMrp, oldSellingPrice],
    );

    if (!matched.rows.length) {
      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        data: { updatedCount: 0, skipped: [], batches: [] },
        message:
          "No active, unexpired batch matched this store's previous MRP/SP. Store default was saved; no batch was created or changed.",
      });
    }

    const eligibleIds = [];
    const skipped = [];
    for (const batch of matched.rows) {
      const validation = validatePriceSet({
        mrp: newMrp,
        sellingPrice: newSellingPrice,
        costPrice: Number(batch.cost_price || 0),
      });
      if (!validation.valid) {
        skipped.push({ batchId: batch.id, batchNo: batch.batch_no, reason: validation.error });
      } else {
        eligibleIds.push(batch.id);
      }
    }

    let updatedRows = [];
    if (eligibleIds.length) {
      const updated = await client.query(
        `UPDATE inventory_batches
         SET meta = jsonb_set(
               jsonb_set(COALESCE(meta, '{}'::jsonb), '{mrp}', to_jsonb($2::numeric), true),
               '{sellingPrice}', to_jsonb($3::numeric), true
             ),
             updated_at = NOW()
         WHERE id = ANY($1::bigint[])
         RETURNING id, batch_no, expiry_date, available_qty, cost_price, status,
                   (meta->>'mrp')::numeric AS mrp,
                   (meta->>'sellingPrice')::numeric AS selling_price`,
        [eligibleIds, newMrp, newSellingPrice],
      );
      updatedRows = updated.rows;
    }
    await client.query("COMMIT");

    await auditLog(auth.user.id, "batch.store_price_synced", "product", productId, {
      storeId,
      previous: { mrp: oldMrp, sellingPrice: oldSellingPrice },
      next: { mrp: newMrp, sellingPrice: newSellingPrice },
      updatedBatchIds: updatedRows.map((batch) => batch.id),
      skipped,
    });
    const updatedCount = updatedRows.length;
    const message = updatedCount
      ? `${updatedCount} matching active batch(es) updated for this store.${skipped.length ? ` ${skipped.length} batch(es) were not changed because their CP would exceed the new MRP.` : ""}`
      : "Matching active batch(es) were found, but none could be changed because their CP would exceed the new MRP.";
    return NextResponse.json({
      success: true,
      data: { updatedCount, skipped, batches: updatedRows },
      message,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      { success: false, message: error.message || "Unable to update matching batches" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
