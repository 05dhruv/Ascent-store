import { NextResponse } from "next/server";
import { query, getClient } from "@/lib/db";
import {
  allocateBatchStock,
  ensureInventoryBatchSchema,
  receiveBatchStock,
} from "@/lib/inventoryBatching";
import { ensureStockValidationSchema } from "@/lib/stockValidationSchema";
import {
  canAccessAllStores,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { setRecycleBinContext } from "@/lib/recycleBin";

function normalizeDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const isoTimestamp = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (isoTimestamp) {
    return `${isoTimestamp[1]}-${isoTimestamp[2]}-${isoTimestamp[3]}`;
  }
  const indian = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!indian) return null;
  const year = indian[3].length === 2 ? `20${indian[3]}` : indian[3];
  const month = indian[2].padStart(2, "0");
  const day = indian[1].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildItemSnapshot(item, fallback = {}) {
  return {
    variantKey:
      item.variantKey ||
      item.variant_key ||
      fallback.variantKey ||
      fallback.variant_key ||
      null,
    name: item.name || item.product_name || fallback.product_name || "",
    sku: item.sku || fallback.sku || "",
    barcode: item.barcode || fallback.barcode || "",
    batch_no: item.batch_no || item.batchNo || fallback.batch_no || "",
    existing_qty: Number(item.existing_qty ?? fallback.existing_qty ?? 0),
    selling_price: Number(
      item.selling_price ?? item.sellingPrice ?? fallback.selling_price ?? 0,
    ),
    mrp: Number(item.mrp ?? fallback.mrp ?? 0),
  };
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canAccessValidationRecord(user, row) {
  return canAccessAllStores(user) || Number(row.created_by) === Number(user.id);
}

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockValidationSchema();
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_STOCK_VALIDATION",
      "VIEW_INVENTORY",
      "MANAGE_INVENTORY",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const res = await query(
      `SELECT
        sv.id,
        sv.transaction_id,
        sv.destination_id,
        sv.apply_taxes,
        sv.status,
        sv.rack_no,
        sv.created_by,
        sv.invoice_number,
        TO_CHAR(sv.invoice_date, 'YYYY-MM-DD') AS invoice_date,
        sv.other_charges,
        sv.remarks,
        sv.meta,
        stores.name AS destination_name
      FROM stock_validation sv
      LEFT JOIN stores ON stores.id = sv.destination_id
      WHERE sv.id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = res.rows[0];
    if (!canAccessValidationRecord(auth.user, row)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const storeCheck = requireStore(auth.user, row.destination_id);
    if (storeCheck.error) return storeCheck.error;

    const itemsRes = await query(
      `SELECT
        svi.id,
        svi.product_id,
        svi.product_name,
        svi.qty,
        svi.cost_price,
        svi.tax_value,
        svi.meta AS item_meta,
        COALESCE(NULLIF(p.cost_price, 0), latest_transfer.cost_price, NULLIF(svi.cost_price, 0), 0) AS report_cost_price,
        COALESCE(ps.mrp, svi.mrp, NULLIF(svi.meta->>'mrp', '')::numeric, NULLIF(ib.meta->>'mrp', '')::numeric, p.mrp, 0) AS report_mrp,
        COALESCE(ps.selling_price, NULLIF(svi.meta->>'selling_price', '')::numeric, NULLIF(ib.meta->>'sellingPrice', '')::numeric, p.selling_price, 0) AS report_selling_price,
        COALESCE(
          svi.mrp,
          NULLIF(svi.meta->>'mrp', '')::numeric,
          NULLIF(ib.meta->>'mrp', '')::numeric,
          p.mrp,
          0
        ) AS mrp,
        svi.batch_id,
        COALESCE(p.sku, svi.meta->>'sku', '') AS sku,
        COALESCE(p.barcode, svi.meta->>'barcode', '') AS barcode,
        COALESCE(ib.batch_no, svi.meta->>'batch_no', '') AS batch_no,
        TO_CHAR(COALESCE(svi.expiry_date, ib.expiry_date), 'YYYY-MM-DD') AS expiry_date,
        COALESCE(ib.available_qty, 0) AS available_qty,
        COALESCE(
          NULLIF(svi.meta->>'selling_price', '')::numeric,
          NULLIF(ib.meta->>'sellingPrice', '')::numeric,
          p.selling_price,
          0
        ) AS selling_price
      FROM stock_validation_items svi
      LEFT JOIN products p ON p.id = svi.product_id
      LEFT JOIN product_saleability ps
        ON ps.product_id = svi.product_id
       AND ps.store_id = $2::int
      LEFT JOIN LATERAL (
        SELECT sti.cost_price
        FROM stock_transfer_items sti
        INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
        WHERE st.destination_id = $2::int
          AND st.status = 'confirmed'
          AND sti.product_id = svi.product_id
          AND COALESCE(sti.cost_price, 0) > 0
        ORDER BY COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
        LIMIT 1
      ) latest_transfer ON TRUE
      LEFT JOIN inventory_batches ib ON ib.id = svi.batch_id
      WHERE svi.stock_validation_id = $1
      ORDER BY svi.id ASC`,
      [id, row.destination_id || 0],
    );

    const meta = typeof row.meta === "object" ? row.meta : {};
    return NextResponse.json({
      id: row.id,
      transactionId:
        row.transaction_id || `AUD-${String(row.id).padStart(4, "0")}`,
      destination: row.destination_id || meta.destination || "none",
      destinationName: row.destination_name || "None",
      applyTaxes: row.apply_taxes,
      status: row.status || "draft",
      rack_no: row.rack_no || "",
      invoice_number: row.invoice_number || "",
      invoice_date: row.invoice_date || "",
      other_charges: row.other_charges ?? "",
      remarks: row.remarks || "",
      meta,
      items: itemsRes.rows.map((item) => {
        const itemMeta =
          item.item_meta && typeof item.item_meta === "object"
            ? item.item_meta
            : {};
        const productName =
          item.product_name || itemMeta.name || `Product ${item.product_id}`;
        const batchId = item.batch_id || null;
        return {
          id: item.id,
          variantKey:
            itemMeta.variantKey ||
            itemMeta.variant_key ||
            `${item.product_id}:batch:${batchId || "stock"}`,
          product_id: item.product_id,
          product_name: productName,
          name: productName,
          sku: item.sku || itemMeta.sku || "",
          barcode: item.barcode || itemMeta.barcode || "",
          qty: Number(item.qty || 0),
          existing_qty: Number(
            itemMeta.existing_qty ?? item.available_qty ?? 0,
          ),
          cost_price: Number(item.cost_price || 0),
          report_cost_price: Number(
            item.report_cost_price || item.cost_price || 0,
          ),
          tax_value: Number(item.tax_value || 0),
          batch_id: batchId,
          batch_no: item.batch_no || itemMeta.batch_no || "",
          expiry_date: item.expiry_date || "",
          mrp: Number(item.mrp ?? itemMeta.mrp ?? 0),
          report_mrp: Number(item.report_mrp ?? item.mrp ?? itemMeta.mrp ?? 0),
          selling_price: Number(
            item.selling_price ?? itemMeta.selling_price ?? 0,
          ),
          report_selling_price: Number(
            item.report_selling_price ??
              item.selling_price ??
              itemMeta.selling_price ??
              0,
          ),
        };
      }),
    });
  } catch (err) {
    console.error("[stockvalidation GET id]", err.message);
    return NextResponse.json(
      { error: "Failed to load stock validation" },
      { status: 500 },
    );
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockValidationSchema();
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_STOCK_VALIDATION",
      "MANAGE_INVENTORY",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const currentRes = await query(
      `SELECT id, destination_id, status, created_by FROM stock_validation WHERE id = $1`,
      [id],
    );
    if (!currentRes.rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const current = currentRes.rows[0];
    if (!canAccessValidationRecord(auth.user, current)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const storeCheck = requireStore(auth.user, current.destination_id);
    if (storeCheck.error) return storeCheck.error;

    const otherCharges = Number(body.other_charges || 0);
    if (!Number.isFinite(otherCharges) || otherCharges < 0) {
      return NextResponse.json(
        { error: "Other charges must be a valid amount" },
        { status: 400 },
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      await setRecycleBinContext(
        client,
        auth.user.id,
        "Stock validation updated",
      );

      if (Array.isArray(body.items)) {
        const oldItemsRes = await client.query(
          `SELECT product_id, qty, batch_id, product_name, cost_price, expiry_date
           FROM stock_validation_items
           WHERE stock_validation_id = $1`,
          [id],
        );
        const oldItems = new Map(
          oldItemsRes.rows.map((item) => [
            `${Number(item.product_id)}:${item.batch_id || ""}`,
            item,
          ]),
        );

        await client.query(
          "DELETE FROM stock_validation_items WHERE stock_validation_id = $1",
          [id],
        );
        for (const item of body.items) {
          const productId = Number(item.product_id);
          const batchId = item.batch_id || null;
          const itemKey = `${productId}:${batchId || ""}`;
          const oldItem = oldItems.get(itemKey);
          const nextQty = toNumber(item.qty);
          let currentStockQty = toNumber(oldItem?.qty);
          if (current.status === "confirmed") {
            const stockRes = await client.query(
              `SELECT COALESCE(SUM(available_qty), 0) AS qty
               FROM inventory_batches
               WHERE product_id = $1
                 AND store_id = $2
                 AND status = 'active'
                 AND available_qty > 0
                 AND ($3::bigint IS NULL OR id = $3::bigint)`,
              [productId, current.destination_id, Number(batchId || 0) || null],
            );
            currentStockQty = toNumber(stockRes.rows[0]?.qty);
          }
          const qtyDiff = nextQty - currentStockQty;
          const productName =
            item.name || item.product_name || oldItem?.product_name || "";
          const itemSnapshot = buildItemSnapshot(item, {
            ...oldItem,
            product_name: productName,
          });

          await client.query(
            `INSERT INTO stock_validation_items (
              stock_validation_id, product_id, product_name, qty, cost_price, tax_value, batch_id, expiry_date, mrp, meta
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
            [
              id,
              productId,
              productName,
              nextQty,
              Number(item.cost_price || 0),
              Number(item.tax_value || 0),
              batchId,
              normalizeDateValue(item.expiry_date),
              Number(item.mrp || 0),
              JSON.stringify(itemSnapshot),
            ],
          );
          if (current.status === "confirmed" && qtyDiff !== 0) {
            if (qtyDiff > 0) {
              await receiveBatchStock(client, {
                stockInId: id,
                productId,
                storeId: current.destination_id,
                qty: qtyDiff,
                costPrice: toNumber(item.cost_price),
                batchNo: item.batch_no || `AUD-${id}-${productId}`,
                expiryDate: normalizeDateValue(item.expiry_date),
                meta: {
                  source: "stock_validation_edit",
                  validationId: id,
                  productName,
                  previousQty: currentStockQty,
                  countedQty: nextQty,
                  variance: qtyDiff,
                },
              });
            } else {
              await allocateBatchStock(client, {
                productId,
                storeId: current.destination_id,
                qty: Math.abs(qtyDiff),
                preferredBatchId: batchId,
                allowExpired: true,
                referenceType: "stock_validation_edit",
                referenceId: id,
                meta: {
                  source: "stock_validation_edit",
                  validationId: id,
                  productName,
                  previousQty: currentStockQty,
                  countedQty: nextQty,
                  variance: qtyDiff,
                },
              });
            }
          }
          if (item.batch_id) {
            await client.query(
              `UPDATE inventory_batches
               SET expiry_date = COALESCE($1, expiry_date),
                   meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb,
                   updated_at = NOW()
               WHERE id = $3`,
              [
                normalizeDateValue(item.expiry_date),
                JSON.stringify({
                  mrp: toNumber(item.mrp),
                  sellingPrice: toNumber(
                    item.selling_price || item.sellingPrice,
                  ),
                }),
                Number(item.batch_id),
              ],
            );
          }
        }
      }

      const itemTotals = await client.query(
        `SELECT
          COALESCE(SUM(qty), 0) AS total_items,
          COALESCE(SUM(qty * cost_price), 0) AS items_cost,
          COALESCE(SUM(qty * tax_value), 0) AS total_tax
        FROM stock_validation_items
        WHERE stock_validation_id = $1`,
        [id],
      );
      const totals = itemTotals.rows[0] || {};

      await client.query(
        `UPDATE stock_validation SET
          invoice_date = $1,
          invoice_number = $2,
          other_charges = $3,
          remarks = $4,
          rack_no = $5,
          total_items = $6,
          total_cost = $7,
          total_tax = $8,
          meta = COALESCE(meta, '{}'::jsonb) || $9::jsonb
        WHERE id = $10`,
        [
          normalizeDateValue(body.invoice_date),
          body.invoice_number || null,
          otherCharges,
          body.remarks || null,
          body.rack_no || null,
          Number(totals.total_items || 0),
          Number(totals.items_cost || 0) + otherCharges,
          Number(totals.total_tax || 0),
          JSON.stringify({
            invoice_date: normalizeDateValue(body.invoice_date),
            invoice_number: body.invoice_number || null,
            other_charges: otherCharges,
            remarks: body.remarks || null,
            rack_no: body.rack_no || null,
          }),
          id,
        ],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[stockvalidation PUT id]", err.message);
    return NextResponse.json(
      { error: "Failed to update stock validation" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockValidationSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_STOCK_VALIDATION",
      "MANAGE_INVENTORY",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const currentRes = await query(
      `SELECT id, destination_id, status, created_by FROM stock_validation WHERE id = $1`,
      [id],
    );
    if (!currentRes.rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const current = currentRes.rows[0];
    if (!canAccessValidationRecord(auth.user, current)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const storeCheck = requireStore(auth.user, current.destination_id);
    if (storeCheck.error) return storeCheck.error;

    if (current.status === "confirmed") {
      return NextResponse.json(
        { error: "Confirmed stock validations cannot be deleted" },
        { status: 400 },
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      await setRecycleBinContext(
        client,
        auth.user.id,
        "Stock validation deleted",
      );
      await client.query(
        "DELETE FROM stock_validation_items WHERE stock_validation_id = $1",
        [id],
      );
      await client.query("DELETE FROM stock_validation WHERE id = $1", [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[stockvalidation DELETE id]", err.message);
    return NextResponse.json(
      { error: "Failed to delete stock validation" },
      { status: 500 },
    );
  }
}
