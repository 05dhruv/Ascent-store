import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import {
  ensureInventoryBatchSchema,
  receiveBatchStock,
} from "@/lib/inventoryBatching";
import {
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { setRecycleBinContext } from "@/lib/recycleBin";
import { isPastDateValue, toDateInputValue } from "@/lib/dateUtils";

function normalizeDate(value) {
  return toDateInputValue(value);
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

async function clearConfirmedStockInBatches(client, stockInId) {
  await ensureInventoryBatchSchema();

  const oldItemsRes = await client.query(
    `SELECT id FROM stock_in_items WHERE stock_in_id = $1`,
    [stockInId],
  );
  const oldItemIds = oldItemsRes.rows.map((row) => String(row.id));
  if (!oldItemIds.length) return;

  const batchRes = await client.query(
    `SELECT id, received_qty, available_qty
     FROM inventory_batches
     WHERE source_type = 'stock_in'
       AND source_id = ANY($1::text[])
     FOR UPDATE`,
    [oldItemIds],
  );

  const consumedBatch = batchRes.rows.find(
    (batch) =>
      Number(batch.available_qty || 0) < Number(batch.received_qty || 0),
  );
  if (consumedBatch) {
    throw new Error(
      "This stock in cannot be edited directly because some quantity has already been used. Use Stock Validation/Adjustment for correction.",
    );
  }

  const batchIds = batchRes.rows
    .map((batch) => Number(batch.id))
    .filter(Boolean);
  if (!batchIds.length) return;

  await client.query(
    `DELETE FROM inventory_batch_movements
     WHERE batch_id = ANY($1::bigint[])
       AND direction = 'in'
       AND reference_type = 'stock_in'
       AND reference_id = $2`,
    [batchIds, String(stockInId)],
  );
  await client.query(
    `DELETE FROM inventory_batches
     WHERE id = ANY($1::bigint[])`,
    [batchIds],
  );
}

async function reconcileConfirmedStockInItems(
  client,
  stockIn,
  items,
  catalogMap,
  { allowItemRemoval = false } = {},
) {
  await ensureInventoryBatchSchema();

  const existingItemsRes = await client.query(
    `SELECT * FROM stock_in_items WHERE stock_in_id = $1 ORDER BY id FOR UPDATE`,
    [stockIn.id],
  );
  const existingItems = new Map(
    existingItemsRes.rows.map((item) => [Number(item.id), item]),
  );
  const itemIds = [...existingItems.keys()].map(String);
  const batchesRes = itemIds.length
    ? await client.query(
        `SELECT * FROM inventory_batches
         WHERE source_type = 'stock_in' AND source_id = ANY($1::text[])
         ORDER BY id FOR UPDATE`,
        [itemIds],
      )
    : { rows: [] };
  const batchesByItem = new Map();
  for (const batch of batchesRes.rows) {
    const key = Number(batch.source_id);
    if (!batchesByItem.has(key)) batchesByItem.set(key, []);
    batchesByItem.get(key).push(batch);
  }

  const retainedItemIds = new Set();
  let inserted = 0;

  for (const item of items) {
    const productId = Number(item.product_id);
    const qty = Number(item.qty || 0);
    if (!productId || qty <= 0) continue;
    const catalog = catalogMap.get(productId);
    if (!catalog) continue;

    const costPrice = Number(item.cost_price ?? 0);
    const mrp = Number(item.mrp ?? 0);
    const sellingPrice = Number(item.selling_price ?? item.sellingPrice ?? 0);
    let itemId = Number(item.stock_in_item_id || item.stockInItemId || 0);
    let existing = itemId ? existingItems.get(itemId) : null;

    // Excel can occasionally coerce/clear the hidden line ID.  Match one
    // unclaimed original line by product + batch in that case, so an edited
    // quantity remains an update instead of attempting to remove a used line.
    if (!existing) {
      const batchNo = String(item.batch_no || item.batchNo || "").trim();
      const candidates = [...existingItems.values()].filter(
        (current) =>
          !retainedItemIds.has(Number(current.id)) &&
          Number(current.product_id) === productId &&
          String(current.batch_no || "").trim() === batchNo,
      );
      const productCandidates = [...existingItems.values()].filter(
        (current) =>
          !retainedItemIds.has(Number(current.id)) &&
          Number(current.product_id) === productId,
      );
      const matched =
        candidates.length === 1
          ? candidates[0]
          : productCandidates.length === 1
            ? productCandidates[0]
            : null;
      if (matched) {
        existing = matched;
        itemId = Number(existing.id);
      }
    }

    if (!existing) {
      const insertedItem = await client.query(
        `INSERT INTO stock_in_items (
           stock_in_id, product_id, product_name, qty, cost_price, tax_value,
           batch_no, mfg_date, expiry_date, mrp, selling_price, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING id`,
        [
          stockIn.id,
          productId,
          catalog.name,
          qty,
          costPrice,
          Number(item.tax_value || 0),
          item.batch_no || null,
          normalizeDate(item.mfg_date) || null,
          normalizeDate(item.expiry_date) || null,
          mrp,
          sellingPrice,
        ],
      );
      await receiveBatchStock(client, {
        stockInId: stockIn.id,
        stockInItemId: insertedItem.rows[0].id,
        productId,
        storeId: stockIn.destination_id,
        qty,
        costPrice,
        batchNo: item.batch_no || null,
        mfgDate: normalizeDate(item.mfg_date) || null,
        expiryDate: normalizeDate(item.expiry_date) || null,
        meta: {
          source: "stock_in_direct_edit",
          editedStockInId: Number(stockIn.id),
          mrp,
          sellingPrice,
          costPrice,
        },
      });
      inserted += 1;
      continue;
    }

    retainedItemIds.add(itemId);
    const batches = batchesByItem.get(itemId) || [];
    const receivedQty = batches.reduce(
      (sum, batch) => sum + Number(batch.received_qty || 0),
      0,
    );
    const availableQty = batches.reduce(
      (sum, batch) => sum + Number(batch.available_qty || 0),
      0,
    );
    const consumedQty = Math.max(receivedQty - availableQty, 0);

    if (Number(existing.product_id) !== productId && consumedQty > 0) {
      throw new Error(
        `${existing.product_name || "This product"} cannot be changed because ${consumedQty} quantity has already been used.`,
      );
    }
    if (qty < consumedQty) {
      throw new Error(
        `${existing.product_name || catalog.name} has ${consumedQty} quantity already used. Set quantity to at least ${consumedQty}.`,
      );
    }

    await client.query(
      `UPDATE stock_in_items SET
         product_id = $1, product_name = $2, qty = $3, cost_price = $4, tax_value = $5,
         batch_no = $6, mfg_date = $7, expiry_date = $8, mrp = $9, selling_price = $10
       WHERE id = $11 AND stock_in_id = $12`,
      [
        productId,
        catalog.name,
        qty,
        costPrice,
        Number(item.tax_value || 0),
        item.batch_no || null,
        normalizeDate(item.mfg_date) || null,
        normalizeDate(item.expiry_date) || null,
        mrp,
        sellingPrice,
        itemId,
        stockIn.id,
      ],
    );

    if (!batches.length) {
      await receiveBatchStock(client, {
        stockInId: stockIn.id,
        stockInItemId: itemId,
        productId,
        storeId: stockIn.destination_id,
        qty,
        costPrice,
        batchNo: item.batch_no || null,
        mfgDate: normalizeDate(item.mfg_date) || null,
        expiryDate: normalizeDate(item.expiry_date) || null,
        meta: {
          source: "stock_in_direct_edit_repair",
          editedStockInId: Number(stockIn.id),
          mrp,
          sellingPrice,
          costPrice,
        },
      });
      continue;
    }

    const primaryBatch = batches[0];
    // Keep every consumed batch intact.  Apply the requested total-quantity
    // difference to one source batch, which permits both increases and safe
    // decreases (never below the quantity already consumed).
    const qtyDifference = qty - receivedQty;
    const nextPrimaryReceivedQty =
      Number(primaryBatch.received_qty || 0) + qtyDifference;
    const nextPrimaryAvailableQty =
      Number(primaryBatch.available_qty || 0) + qtyDifference;
    if (nextPrimaryReceivedQty < 0 || nextPrimaryAvailableQty < 0) {
      throw new Error(
        `${existing.product_name || catalog.name} cannot be reduced below the quantity already used.`,
      );
    }
    await client.query(
      `UPDATE inventory_batches SET
         product_id = $1, batch_no = $2, mfg_date = $3, expiry_date = $4,
         received_qty = $5::numeric,
         available_qty = $6::numeric,
         cost_price = $7::numeric,
         status = CASE WHEN $6::numeric > 0 THEN 'active' ELSE 'depleted' END,
         meta = COALESCE(meta, '{}'::jsonb) || $8::jsonb, updated_at = NOW()
       WHERE id = $9`,
      [
        productId,
        item.batch_no || primaryBatch.batch_no,
        normalizeDate(item.mfg_date) || null,
        normalizeDate(item.expiry_date) || null,
        nextPrimaryReceivedQty,
        nextPrimaryAvailableQty,
        costPrice,
        JSON.stringify({
          mrp,
          sellingPrice,
          costPrice,
          editedStockInId: Number(stockIn.id),
        }),
        primaryBatch.id,
      ],
    );
    await client.query(
      `UPDATE inventory_batch_movements SET qty = $1
       WHERE batch_id = $2 AND direction = 'in'
         AND reference_type = 'stock_in' AND reference_id = $3`,
      [nextPrimaryReceivedQty, primaryBatch.id, String(stockIn.id)],
    );
  }

  // Editing quantity must never accidentally delete an existing line.  A line
  // can be removed only by an explicit, dedicated removal request.
  if (!allowItemRemoval) return inserted;

  for (const existing of existingItems.values()) {
    const itemId = Number(existing.id);
    if (retainedItemIds.has(itemId)) continue;
    const batches = batchesByItem.get(itemId) || [];
    const consumedQty = batches.reduce(
      (sum, batch) =>
        sum +
        Math.max(
          Number(batch.received_qty || 0) - Number(batch.available_qty || 0),
          0,
        ),
      0,
    );
    if (consumedQty > 0) {
      throw new Error(
        `${existing.product_name || "This product"} cannot be removed because ${consumedQty} quantity has already been used.`,
      );
    }
    const batchIds = batches.map((batch) => Number(batch.id)).filter(Boolean);
    if (batchIds.length) {
      await client.query(
        `DELETE FROM inventory_batch_movements WHERE batch_id = ANY($1::bigint[])`,
        [batchIds],
      );
      await client.query(
        `DELETE FROM inventory_batches WHERE id = ANY($1::bigint[])`,
        [batchIds],
      );
    }
    await client.query(`DELETE FROM stock_in_items WHERE id = $1`, [itemId]);
  }

  return inserted;
}

async function deleteConfirmedStockInBatches(client, stockInId) {
  await ensureInventoryBatchSchema();

  const oldItemsRes = await client.query(
    `SELECT id FROM stock_in_items WHERE stock_in_id = $1`,
    [stockInId],
  );
  const oldItemIds = oldItemsRes.rows.map((row) => String(row.id));
  if (!oldItemIds.length) return;

  const batchRes = await client.query(
    `SELECT id, product_id, store_id, received_qty, available_qty, meta
     FROM inventory_batches
     WHERE source_type = 'stock_in'
       AND source_id = ANY($1::text[])
     FOR UPDATE`,
    [oldItemIds],
  );

  const consumedBatch = batchRes.rows.find(
    (batch) =>
      Number(batch.available_qty || 0) < Number(batch.received_qty || 0),
  );
  if (consumedBatch) {
    throw new Error(
      "This stock in cannot be deleted because some quantity has already been used.",
    );
  }

  for (const batch of batchRes.rows) {
    const sourceBatchId = Number(batch.meta?.sourceBatchId || 0);
    const qty = Number(batch.received_qty || 0);
    if (sourceBatchId && qty > 0) {
      const restoredRes = await client.query(
        `UPDATE inventory_batches
         SET available_qty = available_qty + $1,
             status = 'active',
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, product_id, store_id`,
        [qty, sourceBatchId],
      );
      const restored = restoredRes.rows[0];
      if (restored) {
        await client.query(
          `INSERT INTO inventory_batch_movements (
             batch_id, product_id, store_id, direction, qty, reference_type, reference_id, source_item_id, meta
           ) VALUES ($1, $2, $3, 'in', $4, 'stock_in_delete_restore', $5, NULL, $6::jsonb)`,
          [
            restored.id,
            restored.product_id,
            restored.store_id,
            qty,
            String(stockInId),
            JSON.stringify({ deletedDestinationBatchId: Number(batch.id) }),
          ],
        );
      }
    }
  }

  const batchIds = batchRes.rows
    .map((batch) => Number(batch.id))
    .filter(Boolean);
  if (!batchIds.length) return;

  await client.query(
    `DELETE FROM inventory_batch_movements
     WHERE batch_id = ANY($1::bigint[])
       OR (reference_type IN ('stock_in', 'stock_in_to_store') AND reference_id = $2)`,
    [batchIds, String(stockInId)],
  );
  await client.query(
    `DELETE FROM inventory_batches WHERE id = ANY($1::bigint[])`,
    [batchIds],
  );
}

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockInSchema();
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "STOCK_VIEW",
      "GRN_CREATE",
      "GRN_APPROVE",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const res = await query(
      `SELECT s.id, s.method, s.destination_id, s.meta, s.status, s.created_at,
              s.transaction_id, s.reference_type, s.reference_id,
              s.vendor_name, s.invoice_date, s.invoice_number, s.other_charges, s.remarks,
              s.apply_taxes, st.name AS destination_name, st.meta AS destination_meta
       FROM stock_in s
       LEFT JOIN stores st ON st.id = s.destination_id
       WHERE s.id = $1`,
      [id],
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = res.rows[0];
    const storeCheck = requireStore(auth.user, row.destination_id);
    if (storeCheck.error) return storeCheck.error;

    const meta = typeof row.meta === "object" ? row.meta : {};
    const destinationMeta =
      typeof row.destination_meta === "object" ? row.destination_meta : {};
    const itemsRes = await query(
      `SELECT sii.id, sii.product_id, COALESCE(sii.product_name, p.name) AS product_name,
              p.sku, p.barcode, p.product_id AS catalog_product_id,
              b.name AS brand_name,
              sii.qty, sii.cost_price, sii.tax_value, sii.batch_no, sii.mfg_date, sii.expiry_date,
              COALESCE(NULLIF(sii.mrp, 0), p.mrp, 0) AS mrp,
              COALESCE(NULLIF(sii.selling_price, 0), p.selling_price, 0) AS selling_price,
              COALESCE(t.rate, 0) AS tax_rate
       FROM stock_in_items sii
       LEFT JOIN products p ON p.id = sii.product_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN taxes t ON t.id = p.tax_id
       WHERE sii.stock_in_id = $1
       ORDER BY sii.id`,
      [id],
    );
    const pendingItems =
      String(row.status || "").toLowerCase() === "margin_hold" &&
      !itemsRes.rows.length &&
      Array.isArray(meta.pendingConfirmation?.items)
        ? meta.pendingConfirmation.items
        : null;
    const responseItems = pendingItems
      ? pendingItems.map((item, index) => ({
          id: item.id || item.stock_in_item_id || `pending-${index}`,
          product_id: item.product_id,
          catalog_product_id: item.catalog_product_id || item.product_id || "",
          name: item.product_name || item.name || "",
          sku: item.sku || item.barcode || "",
          barcode: item.barcode || "",
          brand_name: item.brand_name || "",
          qty: Number(item.qty || 0),
          cost_price: Number(item.cost_price || 0),
          tax_value: Number(item.tax_value || 0),
          mrp: Number(item.mrp || 0),
          selling_price: Number(item.selling_price || item.sellingPrice || 0),
          batch_no: item.batch_no || item.batchNo || "",
          mfg_date: normalizeDate(item.mfg_date || item.mfgDate),
          expiry_date: normalizeDate(item.expiry_date || item.expiryDate),
          pending_margin_approval: true,
        }))
      : itemsRes.rows.map((item) => ({
          id: item.id,
          product_id: item.product_id,
          catalog_product_id: item.catalog_product_id || "",
          name: item.product_name,
          sku: item.sku || item.barcode || item.catalog_product_id || "",
          barcode: item.barcode || "",
          brand_name: item.brand_name || "",
          qty: Number(item.qty || 0),
          cost_price: Number(item.cost_price || 0),
          tax_value: Number(
            item.tax_value ||
              (row.apply_taxes
                ? (Number(item.cost_price || 0) * Number(item.tax_rate || 0)) /
                  100
                : 0),
          ),
          mrp: Number(item.mrp || 0),
          selling_price: Number(item.selling_price || 0),
          batch_no: item.batch_no || "",
          mfg_date: normalizeDate(item.mfg_date),
          expiry_date: normalizeDate(item.expiry_date),
        }));

    return NextResponse.json({
      id: row.id,
      method: row.method,
      transactionId:
        row.transaction_id || `STK-${String(row.id).padStart(4, "0")}`,
      referenceType: row.reference_type || "stock_in",
      referenceId:
        row.reference_id ||
        row.transaction_id ||
        `STK-${String(row.id).padStart(4, "0")}`,
      destination: row.destination_id,
      destinationName: row.destination_name,
      destinationLocationType: destinationMeta.locationType || "Warehouse",
      status: row.status || "draft",
      applyTaxes: row.apply_taxes,
      meta,
      vendor_name: row.vendor_name || meta.vendor || "",
      invoice_date:
        normalizeDate(row.invoice_date) || normalizeDate(meta.invoice_date),
      invoice_number: row.invoice_number || meta.invoice_number || "",
      other_charges: row.other_charges ?? meta.other_charges ?? "",
      remarks: row.remarks || meta.remarks || "",
      items: responseItems,
    });
  } catch (err) {
    console.error("[stockin GET id]", err.message);
    return NextResponse.json(
      { error: "Failed to load stock in" },
      { status: 500 },
    );
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const client = await getClient();
  try {
    await ensureStockInSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "GRN_CREATE");
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const missingExpiryItem = items.find((item) => {
      const qty = Number(item.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) return false;
      return !normalizeDate(item.expiry_date || item.expiryDate);
    });
    if (missingExpiryItem) {
      return NextResponse.json(
        { error: "Expiry date is mandatory for every stock-in item" },
        { status: 400 },
      );
    }
    const pastExpiryItem = items.find((item) => {
      const qty = Number(item.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) return false;
      const expiryDate = normalizeDate(item.expiry_date || item.expiryDate);
      return expiryDate && isPastDateValue(expiryDate);
    });
    if (pastExpiryItem) {
      return NextResponse.json(
        {
          error: `Expiry date cannot be in the past for ${pastExpiryItem.name || pastExpiryItem.product_name || "stock-in item"}`,
        },
        { status: 400 },
      );
    }

    await client.query("BEGIN");
    await setRecycleBinContext(client, auth.user.id, "Stock In deleted");
    const stockInRes = await client.query(
      `SELECT id, status, destination_id FROM stock_in WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const stockIn = stockInRes.rows[0];
    if (!stockIn) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isConfirmed =
      String(stockIn.status || "").toLowerCase() === "confirmed";

    if (String(stockIn.status).toLowerCase() === 'confirmed') {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'Posted GRNs are immutable. Use an approved stock adjustment or vendor return with the original reference.'},{status:409});
    }
    const storeCheck = requireStore(auth.user, stockIn.destination_id);
    if (storeCheck.error) {
      await client.query("ROLLBACK");
      return storeCheck.error;
    }

    const productIds = [
      ...new Set(items.map((item) => Number(item.product_id)).filter(Boolean)),
    ];
    const catalogRes = productIds.length
      ? await client.query(
          `SELECT id, name, cost_price, mrp, selling_price FROM products WHERE id = ANY($1::int[])`,
          [productIds],
        )
      : { rows: [] };
    const catalogMap = new Map(
      catalogRes.rows.map((row) => [Number(row.id), row]),
    );
    const effectiveTotals = items.reduce(
      (totals, item) => {
        const qty = Number(item.qty || 0);
        if (!Number.isFinite(qty) || qty <= 0) return totals;
        const catalog = catalogMap.get(Number(item.product_id));
        const costPrice = Number(item.cost_price ?? 0);
        const taxValue = Number(item.tax_value || 0);
        totals.items += qty;
        totals.cost = roundMoney(totals.cost + qty * costPrice);
        totals.tax = roundMoney(totals.tax + qty * taxValue);
        return totals;
      },
      {
        items: 0,
        cost: roundMoney(body.form?.other_charges || 0),
        tax: 0,
      },
    );

    let inserted = 0;
    if (isConfirmed) {
      inserted = await reconcileConfirmedStockInItems(
        client,
        stockIn,
        items,
        catalogMap,
        { allowItemRemoval: body.allowItemRemoval === true },
      );
    } else {
      await client.query("DELETE FROM stock_in_items WHERE stock_in_id = $1", [
        id,
      ]);
      for (const item of items) {
        const productId = Number(item.product_id);
        const qty = Number(item.qty || 0);
        if (!productId || qty <= 0) continue;
        const catalog = catalogMap.get(productId);
        if (!catalog) continue;
        const costPrice = Number(item.cost_price ?? 0);
        const mrp = Number(item.mrp ?? 0);
        const sellingPrice = Number(
          item.selling_price ?? item.sellingPrice ?? 0,
        );

        const stockInItemRes = await client.query(
          `INSERT INTO stock_in_items (
           stock_in_id, product_id, product_name, qty, cost_price, tax_value,
           batch_no, mfg_date, expiry_date, mrp, selling_price, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING id`,
          [
            id,
            productId,
            catalog.name,
            qty,
            costPrice,
            Number(item.tax_value || 0),
            item.batch_no || null,
            normalizeDate(item.mfg_date) || null,
            normalizeDate(item.expiry_date) || null,
            mrp,
            sellingPrice,
          ],
        );
        const stockInItemId = stockInItemRes.rows[0]?.id;
        inserted += 1;
      }
    }

    await client.query(
      `UPDATE stock_in
       SET vendor_name = $2,
           invoice_date = $3,
           invoice_number = $4,
           other_charges = $5,
           remarks = $6,
           total_items = $8,
           total_cost = $9,
           total_tax = $10,
           meta = COALESCE(meta, '{}'::jsonb) || $7::jsonb
       WHERE id = $1`,
      [
        id,
        body.form?.vendor || null,
        body.form?.invoice_date || null,
        body.form?.invoice_number || null,
        Number(body.form?.other_charges || 0),
        body.form?.remarks || null,
        JSON.stringify({ bulkTemplateUpload: true, ...(body.form || {}) }),
        effectiveTotals.items,
        effectiveTotals.cost,
        effectiveTotals.tax,
      ],
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true, id, inserted });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[stockin PUT id]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to update stock in" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const client = await getClient();
  try {
    await ensureStockInSchema();
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "GRN_CREATE");
    if (permissionCheck.error) return permissionCheck.error;

    await client.query("BEGIN");
    await setRecycleBinContext(client, auth.user.id, "Stock In deleted");
    const stockInRes = await client.query(
      `SELECT id, status, destination_id FROM stock_in WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const stockIn = stockInRes.rows[0];
    if (!stockIn) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (String(stockIn.status).toLowerCase() === 'confirmed') {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'Posted GRNs are immutable. Use an approved stock adjustment or vendor return with the original reference.'},{status:409});
    }
    const storeCheck = requireStore(auth.user, stockIn.destination_id);
    if (storeCheck.error) {
      await client.query("ROLLBACK");
      return storeCheck.error;
    }

    if (String(stockIn.status || "").toLowerCase() === "confirmed") {
      await deleteConfirmedStockInBatches(client, id);
    }

    await client
      .query(
        `UPDATE vendor_invoices SET stock_in_id = NULL WHERE stock_in_id = $1`,
        [id],
      )
      .catch(() => {});
    await client
      .query(
        `UPDATE margin_approval_requests SET stock_in_id = NULL, stock_in_item_id = NULL WHERE stock_in_id = $1`,
        [id],
      )
      .catch(() => {});
    await client.query(`DELETE FROM stock_in WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return NextResponse.json({ success: true, id });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[stockin DELETE id]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to delete stock in" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
