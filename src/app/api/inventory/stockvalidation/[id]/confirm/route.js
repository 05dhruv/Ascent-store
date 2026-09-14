import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { ensureStockValidationSchema } from "@/lib/stockValidationSchema";
import {
  allocateBatchStock,
  ensureInventoryBatchSchema,
  receiveBatchStock,
} from "@/lib/inventoryBatching";
import {
  canAccessAllStores,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { setRecycleBinContext } from "@/lib/recycleBin";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canAccessValidationRecord(user, row) {
  return canAccessAllStores(user) || Number(row.created_by) === Number(user.id);
}

function toNumericId(value) {
  const raw = String(value ?? "").trim();
  const leading = raw.match(/^\d+/)?.[0];
  return Number(leading || raw || 0);
}

function toBatchId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parts = raw.match(/\d+/g) || [];
  const id = Number(parts.length > 1 ? parts[parts.length - 1] : parts[0]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toQty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 1000) / 1000;
}

function roundQty(value) {
  return Math.round(toNumber(value) * 1000) / 1000;
}

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

function buildItemSnapshot(item, productName) {
  return {
    variantKey: item.variantKey || item.variant_key || null,
    name: item.name || item.product_name || productName || "",
    sku: item.sku || "",
    barcode: item.barcode || "",
    batch_no: item.batch_no || item.batchNo || "",
    existing_qty: toQty(item.existing_qty || item.existingQty || 0),
    selling_price: toNumber(item.selling_price || item.sellingPrice),
    mrp: toNumber(item.mrp),
  };
}

function aggregateItems(items) {
  const grouped = new Map();
  for (const item of items) {
    const productId = toNumericId(item.product_id || item.productId);
    if (!productId) throw new Error("Each item must have a product");
    const batchId = toBatchId(item.batch_id || item.batchId);
    const qty = toQty(item.qty);
    const costPrice = toNumber(item.cost_price || item.costPrice);
    const taxValue = toNumber(item.tax_value || item.taxValue);
    const expiryDate = normalizeDateValue(item.expiry_date || item.expiryDate);
    const key = batchId
      ? `${productId}:batch:${batchId}`
      : `${productId}:audit:${item.variantKey || item.variant_key || item.batch_no || item.batchNo || ""}:mrp:${toNumber(item.mrp)}:exp:${expiryDate || ""}:cost:${costPrice}`;
    const existing = grouped.get(key) || {
      product_id: productId,
      batch_id: batchId,
      variantKey: item.variantKey || item.variant_key || null,
      name: item.name || item.product_name || "",
      sku: item.sku || "",
      barcode: item.barcode || "",
      batch_no: item.batch_no || item.batchNo || "",
      existing_qty: toQty(item.existing_qty || item.existingQty || 0),
      selling_price: toNumber(item.selling_price || item.sellingPrice),
      qty: 0,
      cost_price: costPrice,
      tax_value: taxValue,
      mrp: toNumber(item.mrp),
      expiry_date: expiryDate,
    };
    existing.qty = roundQty(existing.qty + qty);
    existing.cost_price = costPrice || existing.cost_price;
    existing.tax_value = taxValue || existing.tax_value;
    grouped.set(key, existing);
  }
  return Array.from(grouped.values());
}

export async function POST(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockValidationSchema();
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_STOCK_VALIDATION",
      "STOCK_AUDIT",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const form = body.form || {};
    const items = body.items || [];

    if (!items.length) {
      return NextResponse.json(
        { error: "Add at least one product" },
        { status: 400 },
      );
    }

    let aggregatedItems;
    try {
      aggregatedItems = aggregateItems(items);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    let totalItems = 0;
    let totalCost = toNumber(form.other_charges);
    let totalTax = 0;

    for (const item of aggregatedItems) {
      const qty = toQty(item.qty);
      const cost = toNumber(item.cost_price);
      const tax = toNumber(item.tax_value);
      if (qty < 0) {
        return NextResponse.json(
          { error: "Quantity cannot be negative" },
          { status: 400 },
        );
      }
      totalItems += qty;
      totalCost += qty * cost;
      totalTax += tax * qty;
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const draft = await client.query(
        "SELECT id, status, destination_id, created_by FROM stock_validation WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (draft.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Stock validation not found" },
          { status: 404 },
        );
      }
      if (draft.rows[0].status === "confirmed") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Already confirmed" },
          { status: 409 },
        );
      }
      if (!canAccessValidationRecord(auth.user, draft.rows[0])) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Stock validation not found" },
          { status: 404 },
        );
      }
      const storeCheck = requireStore(auth.user, draft.rows[0].destination_id);
      if (storeCheck.error) {
        await client.query("ROLLBACK");
        return storeCheck.error;
      }

      const productIds = aggregatedItems.map((item) => Number(item.product_id));
      const productsRes = await client.query(
        `SELECT id, name
         FROM products
         WHERE id = ANY($1::int[])`,
        [productIds],
      );
      const productMap = new Map(
        productsRes.rows.map((row) => [Number(row.id), row]),
      );
      const missingProducts = productIds.filter(
        (productId) => !productMap.has(productId),
      );
      if (missingProducts.length) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: `Products not found in catalog: IDs ${missingProducts.join(", ")}`,
          },
          { status: 422 },
        );
      }

      await setRecycleBinContext(
        client,
        auth.user.id,
        "Stock validation confirmed",
      );
      await client.query(
        "DELETE FROM stock_validation_items WHERE stock_validation_id = $1",
        [id],
      );
      for (const item of aggregatedItems) {
        const productId = Number(item.product_id);
        const countedQty = toQty(item.qty);
        const productName =
          item.name ||
          item.product_name ||
          productMap.get(productId)?.name ||
          `Product ${productId}`;
        const itemSnapshot = buildItemSnapshot(item, productName);
        await client.query(
          `INSERT INTO stock_validation_items (
            stock_validation_id, product_id, product_name, qty, cost_price, tax_value, batch_id, expiry_date, mrp, meta, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())`,
          [
            id,
            productId,
            productName,
            countedQty,
            item.cost_price || 0,
            item.tax_value || 0,
            item.batch_id || null,
            normalizeDateValue(item.expiry_date),
            item.mrp || 0,
            JSON.stringify(itemSnapshot),
          ],
        );

        if (item.batch_id && (item.expiry_date || item.mrp)) {
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
                sellingPrice: toNumber(item.selling_price || item.sellingPrice),
              }),
              Number(item.batch_id),
            ],
          );
        }

        const stockParams = [
          productId,
          draft.rows[0].destination_id,
          Number(item.batch_id || 0) || null,
        ];
        const stockRes = await client.query(
          `SELECT COALESCE(SUM(available_qty), 0) AS qty
           FROM inventory_batches
           WHERE product_id = $1
             AND store_id = $2
             AND status = 'active'
             AND available_qty > 0
             AND ($3::bigint IS NULL OR id = $3::bigint)`,
          stockParams,
        );
        const currentQty = toQty(stockRes.rows[0]?.qty || 0);
        const variance = roundQty(countedQty - currentQty);

        if (variance > 0) {
          await receiveBatchStock(client, {
            stockInId: id,
            productId,
            storeId: draft.rows[0].destination_id,
            qty: variance,
            costPrice: toNumber(item.cost_price),
            batchNo: item.batch_no || `AUD-${id}-${productId}`,
            expiryDate: normalizeDateValue(item.expiry_date),
            meta: {
              source: "stock_validation",
              validationId: id,
              sourceBatchId: item.batch_id || null,
              productName,
              countedQty,
              previousQty: currentQty,
              variance,
              adjustmentType: "gain",
              costPrice: toNumber(item.cost_price),
              mrp: toNumber(item.mrp),
              sellingPrice: toNumber(item.selling_price || item.sellingPrice),
            },
          });
        } else if (variance < 0) {
          await allocateBatchStock(client, {
            productId,
            storeId: draft.rows[0].destination_id,
            qty: Math.abs(variance),
            preferredBatchId: item.batch_id || null,
            allowExpired: true,
            referenceType: "stock_validation",
            referenceId: id,
            meta: {
              source: "stock_validation",
              validationId: id,
              productName,
              countedQty,
              previousQty: currentQty,
              variance,
              adjustmentType: "loss",
            },
          });
        }
      }

      await client.query(
        `UPDATE stock_validation SET
          status = 'confirmed',
          invoice_date = $1,
          invoice_number = $2,
          other_charges = $3,
          remarks = $4,
          rack_no = $5,
          total_items = $6,
          total_cost = $7,
          total_tax = $8,
          meta = COALESCE(meta, '{}'::jsonb) || $9::jsonb,
          confirmed_at = NOW()
        WHERE id = $10`,
        [
          normalizeDateValue(form.invoice_date),
          form.invoice_number || null,
          toNumber(form.other_charges),
          form.remarks || null,
          form.rack_no || null,
          totalItems,
          totalCost,
          totalTax,
          JSON.stringify(form),
          id,
        ],
      );

      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        id,
        totalItems,
        totalCost,
        totalTax,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[stockvalidation confirm]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to confirm stock validation" },
      { status: 500 },
    );
  }
}
