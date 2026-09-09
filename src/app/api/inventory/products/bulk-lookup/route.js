import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import {
  ensureInventoryBatchSchema,
  receiveBatchStock,
} from "@/lib/inventoryBatching";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureMarginApprovalSchema } from "@/lib/marginApprovalSchema";
import {
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toQty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 1000) / 1000;
}

function cleanValues(values, compact = false) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          String(value || "")
            .trim()
            .replace(/^'+/, "")
            .toLowerCase(),
        )
        .map((value) => (compact ? value.replace(/[^a-z0-9]+/g, "") : value))
        .filter(Boolean),
    ),
  ).slice(0, 10000);
}

async function reconcileMissingStockInBatches(storeId, barcodes, skus, names) {
  await query(
    `WITH matching_products AS (
       SELECT p.id
       FROM products p
       WHERE LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.barcode, ''), '^''+', ''))) = ANY($2::text[])
          OR LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.sku, ''), '^''+', ''))) = ANY($3::text[])
          OR LOWER(REGEXP_REPLACE(COALESCE(p.name, ''), '[^a-zA-Z0-9]+', '', 'g')) = ANY($4::text[])
     ), missing_items AS (
       SELECT sii.id AS stock_in_item_id, sii.stock_in_id, sii.product_id,
              si.destination_id AS store_id,
              COALESCE(NULLIF(TRIM(sii.batch_no), ''), 'RECOVERED-' || si.id || '-' || sii.id) AS batch_no,
              sii.mfg_date, sii.expiry_date, sii.qty, COALESCE(sii.cost_price, 0) AS cost_price,
              COALESCE(sii.mrp, 0) AS mrp, COALESCE(sii.selling_price, 0) AS selling_price
       FROM stock_in_items sii
       INNER JOIN stock_in si ON si.id = sii.stock_in_id
       INNER JOIN matching_products mp ON mp.id = sii.product_id
       WHERE si.status = 'confirmed'
         AND si.destination_id = $1
         AND sii.qty > 0
         AND NOT EXISTS (
           SELECT 1
           FROM inventory_batches ib
           WHERE ib.source_type = 'stock_in'
             AND ib.source_id = sii.id::text
         )
         AND NOT EXISTS (
           SELECT 1
           FROM inventory_batches legacy
           WHERE legacy.product_id = sii.product_id
             AND legacy.store_id = si.destination_id
             AND legacy.source_type = 'legacy_migration'
             AND legacy.created_at >= COALESCE(si.confirmed_at, si.created_at)
         )
     ), inserted AS (
       INSERT INTO inventory_batches (
         product_id, store_id, batch_no, mfg_date, expiry_date,
         received_qty, available_qty, cost_price, source_type, source_id, meta,
         created_at, updated_at
       )
       SELECT product_id, store_id, batch_no, mfg_date, expiry_date,
              qty, qty, cost_price, 'stock_in', stock_in_item_id::text,
              jsonb_strip_nulls(jsonb_build_object(
                'source', 'confirmed_stock_in_reconciliation',
                'stockInId', stock_in_id,
                'costPrice', cost_price,
                'mrp', NULLIF(mrp, 0),
                'sellingPrice', NULLIF(selling_price, 0)
              )),
              NOW(), NOW()
       FROM missing_items
       RETURNING id, product_id, store_id, available_qty, source_id,
                 meta->>'stockInId' AS stock_in_id
     )
     INSERT INTO inventory_batch_movements (
       batch_id, product_id, store_id, direction, qty,
       reference_type, reference_id, source_item_id, meta
     )
     SELECT id, product_id, store_id, 'in', available_qty,
            'stock_in_reconciliation', stock_in_id, source_id::bigint,
            jsonb_build_object('reconciled', true)
     FROM inserted`,
    [storeId, barcodes, skus, names],
  );
}

async function releaseResolvedMarginHoldStockIns(
  storeId,
  barcodes,
  skus,
  names,
) {
  const matchingProductsRes = await query(
    `SELECT p.id
     FROM products p
     WHERE LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.barcode, ''), '^''+', ''))) = ANY($1::text[])
        OR LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.sku, ''), '^''+', ''))) = ANY($2::text[])
        OR LOWER(REGEXP_REPLACE(COALESCE(p.name, ''), '[^a-zA-Z0-9]+', '', 'g')) = ANY($3::text[])`,
    [barcodes, skus, names],
  );
  const productIds = matchingProductsRes.rows
    .map((row) => Number(row.id))
    .filter(Boolean);
  if (!productIds.length) return;

  const heldRes = await query(
    `SELECT si.*
     FROM stock_in si
     WHERE si.destination_id = $1
       AND LOWER(COALESCE(si.status, '')) = 'margin_hold'
       AND si.meta ? 'pendingConfirmation'
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(si.meta->'pendingConfirmation'->'items', '[]'::jsonb)) item
         WHERE COALESCE(item->>'product_id', '') ~ '^[0-9]+$'
           AND (item->>'product_id')::bigint = ANY($2::bigint[])
       )
       AND NOT EXISTS (
         SELECT 1
         FROM margin_approval_requests mar
         WHERE mar.stock_in_id = si.id
           AND LOWER(COALESCE(mar.status, '')) = 'pending'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM margin_approval_requests mar
         WHERE mar.stock_in_id = si.id
           AND LOWER(COALESCE(mar.status, '')) = 'rejected'
       )
     ORDER BY si.id`,
    [storeId, productIds],
  );
  if (!heldRes.rows.length) return;

  const client = await getClient();
  try {
    await client.query("BEGIN");
    for (const stockIn of heldRes.rows) {
      const lockedRes = await client.query(
        `SELECT *
         FROM stock_in
         WHERE id = $1
         FOR UPDATE`,
        [stockIn.id],
      );
      const locked = lockedRes.rows[0];
      if (String(locked?.status || "").toLowerCase() !== "margin_hold") {
        continue;
      }

      const approvalStateRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'pending')::int AS pending_count,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'rejected')::int AS rejected_count
         FROM margin_approval_requests
         WHERE stock_in_id = $1`,
        [stockIn.id],
      );
      const approvalState = approvalStateRes.rows[0] || {};
      if (
        Number(approvalState.pending_count || 0) > 0 ||
        Number(approvalState.rejected_count || 0) > 0
      ) {
        continue;
      }

      const meta = typeof locked.meta === "object" ? locked.meta : {};
      const pending = meta.pendingConfirmation || {};
      const form = pending.form || {};
      const items = Array.isArray(pending.items) ? pending.items : [];
      if (!items.length) continue;

      await client.query("DELETE FROM stock_in_items WHERE stock_in_id = $1", [
        stockIn.id,
      ]);

      let totalItems = 0;
      let totalCost = toNumber(form.other_charges || locked.other_charges);
      let totalTax = 0;

      for (const item of items) {
        const productId = Number(item.product_id);
        const qty = toQty(item.qty || 0);
        if (!productId || qty <= 0) continue;
        const costPrice = toNumber(item.cost_price);
        const taxValue = toNumber(item.tax_value);
        const mrp = toNumber(item.mrp);
        const sellingPrice = toNumber(item.selling_price || item.sellingPrice);
        totalItems += qty;
        totalCost += qty * costPrice;
        totalTax += qty * taxValue;

        const inserted = await client.query(
          `INSERT INTO stock_in_items (
             stock_in_id, product_id, product_name, qty, cost_price, tax_value,
             batch_no, mfg_date, expiry_date, mrp, selling_price, serial_number, scan_code, meta, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW())
           RETURNING id`,
          [
            stockIn.id,
            productId,
            item.product_name || item.name || null,
            qty,
            costPrice,
            taxValue,
            item.batch_no || item.batchNo || null,
            item.mfg_date || item.mfgDate || null,
            item.expiry_date || item.expiryDate || null,
            mrp,
            sellingPrice,
            item.serial_number || item.serialNumber || null,
            item.scan_code || item.scanCode || null,
            JSON.stringify({
              ...(item.meta || {}),
              source: "resolved_margin_hold_auto_release",
            }),
          ],
        );

        await receiveBatchStock(client, {
          stockInId: stockIn.id,
          stockInItemId: inserted.rows[0]?.id,
          productId,
          storeId,
          qty,
          costPrice,
          batchNo: item.batch_no || item.batchNo || null,
          mfgDate: item.mfg_date || item.mfgDate || null,
          expiryDate: item.expiry_date || item.expiryDate || null,
          meta: {
            productName: item.product_name || item.name || null,
            invoiceNumber: form.invoice_number || locked.invoice_number || null,
            costPrice,
            mrp,
            sellingPrice,
            source: "resolved_margin_hold_auto_release",
          },
        });
      }

      await client.query(
        `UPDATE stock_in
         SET status = 'confirmed',
             vendor_name = COALESCE($2, vendor_name),
             invoice_date = COALESCE($3::date, invoice_date),
             invoice_number = COALESCE($4, invoice_number),
             other_charges = $5,
             remarks = COALESCE($6, remarks),
             total_items = $7,
             total_cost = $8,
             total_tax = $9,
             meta = COALESCE(meta, '{}'::jsonb) || $10::jsonb,
             confirmed_at = COALESCE(confirmed_at, NOW())
         WHERE id = $1`,
        [
          stockIn.id,
          form.vendor || null,
          form.invoice_date || null,
          form.invoice_number || null,
          toNumber(form.other_charges || locked.other_charges),
          form.remarks || null,
          totalItems,
          totalCost,
          totalTax,
          JSON.stringify({
            autoReleasedMarginHold: true,
            autoReleasedAt: new Date().toISOString(),
          }),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function POST(request) {
  try {
    await ensureStockInSchema();
    await ensureInventoryBatchSchema();
    await ensureMarginApprovalSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "MANAGE_INVENTORY");
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const storeId = Number(body.store_id || body.storeId || 0);
    if (!storeId) {
      return NextResponse.json(
        { error: "Source location is required" },
        { status: 400 },
      );
    }
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const barcodes = cleanValues(body.barcodes);
    const skus = cleanValues(body.skus);
    const names = cleanValues(body.product_names || body.productNames, true);
    if (!barcodes.length && !skus.length && !names.length) {
      return NextResponse.json({ records: [] });
    }

    // A margin hold is a business approval, not a data-repair condition.  Do
    // not release it simply because somebody opens the transfer import screen.
    // It must remain visible to the approver and be released only through the
    // margin-approval flow.
    await reconcileMissingStockInBatches(storeId, barcodes, skus, names);

    const result = await query(
      `WITH matching_products AS (
         SELECT p.*
         FROM products p
         WHERE LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.barcode, ''), '^''+', ''))) = ANY($2::text[])
            OR LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.sku, ''), '^''+', ''))) = ANY($3::text[])
            OR LOWER(REGEXP_REPLACE(COALESCE(p.name, ''), '[^a-zA-Z0-9]+', '', 'g')) = ANY($4::text[])
       ), stock AS (
         SELECT ib.product_id,
                SUM(ib.available_qty) AS available_qty,
                SUM(ib.available_qty * COALESCE(NULLIF(ib.cost_price, 0), mp.cost_price, 0)) AS stock_cost
         FROM inventory_batches ib
         INNER JOIN matching_products mp ON mp.id = ib.product_id
         WHERE ib.store_id = $1
           AND ib.status = 'active'
           AND ib.available_qty > 0
           AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
         GROUP BY ib.product_id
       )
       SELECT mp.id, mp.product_id::text AS product_id, mp.name,
              COALESCE(mp.sku, '') AS sku, COALESCE(mp.barcode, '') AS barcode,
              COALESCE(mp.mrp, 0) AS mrp,
              COALESCE(mp.selling_price, 0) AS selling_price,
              CASE WHEN stock.available_qty > 0
                THEN stock.stock_cost / stock.available_qty
                ELSE COALESCE(mp.cost_price, 0)
              END AS cost_price,
              COALESCE(stock.available_qty, 0) AS "availableStock",
              COALESCE(t.rate, 0) AS "taxRate"
       FROM matching_products mp
       INNER JOIN stock ON stock.product_id = mp.id
       LEFT JOIN taxes t ON t.id = mp.tax_id
       ORDER BY mp.name ASC`,
      [storeId, barcodes, skus, names],
    );

    const heldResult = await query(
      `WITH matching_products AS (
         SELECT p.id, p.name, COALESCE(p.sku, '') AS sku, COALESCE(p.barcode, '') AS barcode
         FROM products p
         WHERE LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.barcode, ''), '^''+', ''))) = ANY($2::text[])
            OR LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.sku, ''), '^''+', ''))) = ANY($3::text[])
            OR LOWER(REGEXP_REPLACE(COALESCE(p.name, ''), '[^a-zA-Z0-9]+', '', 'g')) = ANY($4::text[])
       )
       SELECT DISTINCT ON (mp.id)
              mp.id AS product_id, mp.name, mp.sku, mp.barcode,
              si.id AS stock_in_id, si.transaction_id, si.status,
              COALESCE(
                (SELECT COUNT(*)::int FROM margin_approval_requests mar
                 WHERE mar.stock_in_id = si.id AND LOWER(COALESCE(mar.status, '')) = 'pending'),
                0
              ) AS pending_approval_count,
              COALESCE(
                (SELECT COUNT(*)::int FROM margin_approval_requests mar
                 WHERE mar.stock_in_id = si.id AND LOWER(COALESCE(mar.status, '')) = 'rejected'),
                0
              ) AS rejected_approval_count
       FROM matching_products mp
       INNER JOIN stock_in si
         ON si.destination_id = $1
        AND LOWER(COALESCE(si.status, '')) = 'margin_hold'
        AND si.meta ? 'pendingConfirmation'
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(si.meta->'pendingConfirmation'->'items', '[]'::jsonb)) item
         WHERE COALESCE(item->>'product_id', item->>'productId', '') ~ '^[0-9]+$'
           AND COALESCE(item->>'product_id', item->>'productId')::bigint = mp.id
       )
       ORDER BY mp.id, si.created_at DESC`,
      [storeId, barcodes, skus, names],
    );

    return NextResponse.json({
      records: result.rows.map((row) => ({
        ...row,
        availableStock: Number(row.availableStock || 0),
        cost_price: Number(row.cost_price || 0),
        taxRate: Number(row.taxRate || 0),
      })),
      heldRecords: heldResult.rows.map((row) => ({
        product_id: Number(row.product_id),
        name: row.name || "",
        sku: row.sku || "",
        barcode: row.barcode || "",
        stockInId: Number(row.stock_in_id),
        transactionId: row.transaction_id || `STK-${row.stock_in_id}`,
        status: row.status || "margin_hold",
        pendingApprovalCount: Number(row.pending_approval_count || 0),
        rejectedApprovalCount: Number(row.rejected_approval_count || 0),
      })),
    });
  } catch (error) {
    console.error("[inventory products bulk lookup]", error);
    return NextResponse.json(
      { error: error.message || "Failed to look up source inventory" },
      { status: 500 },
    );
  }
}
