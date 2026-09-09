import { getClient, query } from "@/lib/db";
import { successResponse, errorResponse, validationError } from "@/lib/api-response";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { auditLog, requireAuth, requirePermission, requireStore } from "@/lib/api-protection";
import { validatePriceSet } from "@/lib/priceIntegrity";

const priceOf = (row) => ({
  costPrice: Number(row?.cost_price ?? row?.costPrice ?? 0),
  mrp: Number(row?.mrp ?? 0),
  sellingPrice: Number(row?.selling_price ?? row?.sellingPrice ?? 0),
});

export async function GET(request) {
  try {
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permission = requirePermission(auth.user, "MANAGE_INVENTORY");
    if (permission.error) return permission.error;
    const { searchParams } = new URL(request.url);
    const storeId = Number(searchParams.get("storeId") || 0);
    const brandId = Number(searchParams.get("brandId") || 0) || null;
    if (!storeId) return validationError({ storeId: "Select a store" });
    const scope = requireStore(auth.user, storeId);
    if (scope.error) return scope.error;
    const params = [storeId];
    const brandWhere = brandId ? `AND p.brand_id = $${params.push(brandId)}` : "";
    const rows = await query(
      `SELECT ib.id AS batch_id, ib.store_id, s.name AS store_name, p.id AS product_id,
              p.name AS product_name, p.barcode, p.sku, b.name AS brand_name,
              ib.batch_no, ib.expiry_date, ib.available_qty, ib.cost_price,
              COALESCE(NULLIF(ib.meta->>'mrp','')::numeric, 0) AS mrp,
              COALESCE(NULLIF(ib.meta->>'sellingPrice','')::numeric, 0) AS selling_price
       FROM inventory_batches ib
       INNER JOIN products p ON p.id = ib.product_id
       LEFT JOIN stores s ON s.id = ib.store_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE ib.store_id = $1 AND ib.status = 'active' AND ib.available_qty > 0 ${brandWhere}
       ORDER BY b.name, p.name, ib.expiry_date NULLS LAST, ib.id`, params);
    return successResponse({ records: rows.rows.map((row) => ({ ...row, ...priceOf(row) })) });
  } catch (error) { return errorResponse(error.message); }
}

export async function POST(request) {
  let client;
  try {
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permission = requirePermission(auth.user, "MANAGE_INVENTORY");
    if (permission.error) return permission.error;
    const body = await request.json();
    const storeId = Number(body.storeId || 0);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!storeId || !rows.length) return validationError({ rows: "Store and batch rows are required" });
    const scope = requireStore(auth.user, storeId);
    if (scope.error) return scope.error;
    const preview = body.preview === true;
    const result = { updated: 0, unchanged: 0, skipped: 0, rows: [] };
    client = await getClient();
    if (!preview) await client.query("BEGIN");
    for (const source of rows) {
      const batchId = Number(source.batch_id || source.batchId || 0);
      const requested = priceOf(source);
      if (!batchId || ![requested.costPrice, requested.mrp, requested.sellingPrice].every(Number.isFinite)) {
        result.skipped++; result.rows.push({ batchId, status: "skipped", error: "Batch ID and all new prices are required" }); continue;
      }
      const validation = validatePriceSet(requested);
      if (!validation.valid) { result.skipped++; result.rows.push({ batchId, status: "skipped", error: validation.error }); continue; }
      const existing = await client.query(
        `SELECT ib.id, ib.product_id, ib.store_id, ib.batch_no, ib.available_qty, ib.cost_price, ib.meta,
                p.name AS product_name, p.barcode
         FROM inventory_batches ib INNER JOIN products p ON p.id = ib.product_id
         WHERE ib.id = $1 AND ib.store_id = $2 AND ib.status = 'active' AND ib.available_qty > 0 FOR UPDATE`, [batchId, storeId]);
      const batch = existing.rows[0];
      if (!batch || (source.barcode && String(source.barcode) !== String(batch.barcode || ""))) {
        result.skipped++; result.rows.push({ batchId, status: "skipped", error: "Active batch not found in this store or barcode does not match" }); continue;
      }
      const previous = { costPrice: Number(batch.meta?.costPrice ?? batch.cost_price ?? 0), mrp: Number(batch.meta?.mrp ?? 0), sellingPrice: Number(batch.meta?.sellingPrice ?? 0) };
      if (Object.values(requested).every((value, index) => Math.abs(value - Object.values(previous)[index]) < 0.0001)) { result.unchanged++; result.rows.push({ batchId, status: "unchanged" }); continue; }
      result.rows.push({ batchId, status: preview ? "changed" : "updated", previous, next: requested });
      if (!preview) {
        await client.query(`UPDATE inventory_batches SET cost_price=$2, meta=COALESCE(meta,'{}'::jsonb)||jsonb_build_object('costPrice',$2,'mrp',$3,'sellingPrice',$4,'priceCorrectedAt',NOW()::text,'priceCorrectedBy',$5), updated_at=NOW() WHERE id=$1`, [batchId, requested.costPrice, requested.mrp, requested.sellingPrice, auth.user.id]);
        await auditLog(auth.user.id, "inventory_batch.prices_updated_bulk", "inventory_batch", batchId, { storeId, productId: batch.product_id, productName: batch.product_name, batchNo: batch.batch_no, previous, next: requested, source: "bulk_batch_price_update" });
        result.updated++;
      }
    }
    if (!preview) await client.query("COMMIT");
    return successResponse(result, preview ? "Preview ready" : `${result.updated} batch price(s) updated`);
  } catch (error) { if (client) await client.query("ROLLBACK").catch(() => {}); return errorResponse(error.message); }
  finally { if (client) client.release(); }
}
