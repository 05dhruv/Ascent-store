import { ensureMovementWorkflowSchema } from '@/lib/movementWorkflowSchema';
import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { ensureStockTransferSchema } from "@/lib/stockTransferSchema";
import {
  ensureInventoryBatchSchema,
} from "@/lib/inventoryBatching";
import { toDateInputValue } from "@/lib/dateUtils";
import {
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import {
  createMarginApprovalRequest,
  ensureMarginApprovalSchema,
} from "@/lib/marginApprovalSchema";

function toNumericId(value) {
  const raw = String(value ?? "").trim();
  const leading = raw.match(/^\d+/)?.[0];
  return Number(leading || raw || 0);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBatchId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parts = raw.match(/\d+/g) || [];
  const id = Number(parts.length > 1 ? parts[parts.length - 1] : parts[0]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeOptionalDate(value) {
  if (!value) return null;
  return toDateInputValue(value) || null;
}

export async function POST(request, { params }) {
  const { id: rawId } = await params;
  const id = toNumericId(rawId);
  try {
    await ensureMovementWorkflowSchema();
    await ensureInventoryBatchSchema();
    await ensureMarginApprovalSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "TRANSFER_DISPATCH");
    if (permissionCheck.error) return permissionCheck.error;
    if (!id) {
      return NextResponse.json(
        { error: "Invalid stock transfer identifier" },
        { status: 400 },
      );
    }

    const incomingBody = await request.json();
    let body = incomingBody || {};
    if (!body.items?.length) {
      const savedPayloadRes = await getClient();
      try {
        const saved = await savedPayloadRes.query(
          `SELECT meta
           FROM stock_transfer
           WHERE id = $1 AND status = 'margin_hold'
           LIMIT 1`,
          [id],
        );
        const savedPayload = saved.rows[0]?.meta?.pendingConfirmation;
        if (savedPayload?.items?.length) body = savedPayload;
      } finally {
        savedPayloadRes.release();
      }
    }
    const form = body.form || {};
    const items = body.items || [];
    const invoiceDate = normalizeOptionalDate(
      form.invoice_date || form.invoiceDate,
    );
    if ((form.invoice_date || form.invoiceDate) && !invoiceDate) {
      return NextResponse.json(
        { error: "Invalid invoice date" },
        { status: 400 },
      );
    }
    const invoiceNumber =
      String(form.invoice_number || form.invoiceNumber || "").trim() || null;

    if (!items.length) {
      return NextResponse.json(
        { error: "Add at least one product" },
        { status: 400 },
      );
    }

    let totalItems = 0;
    let totalCost = Number(form.other_charges || 0);
    let totalTax = 0;

    for (const item of items) {
      const qty = Number(item.qty || 0);
      const cost = Number(item.cost_price || 0);
      const tax = Number(item.tax_value || 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { error: "Quantity must be greater than zero" },
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
        "SELECT id, status, source_id, destination_id, transaction_id FROM stock_transfer WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (draft.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Stock transfer not found" },
          { status: 404 },
        );
      }
      if (!["draft", "margin_hold"].includes(draft.rows[0].status)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Already confirmed" },
          { status: 409 },
        );
      }
      if (String(draft.rows[0].status || "").toLowerCase() === "margin_hold") {
        const approvalStateRes = await client.query(
          `SELECT
             COUNT(*)::int AS total_count,
             COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'pending')::int AS pending_count,
             COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'rejected')::int AS rejected_count,
             COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'approved')::int AS approved_count
           FROM margin_approval_requests
           WHERE stock_transfer_id = $1`,
          [id],
        );
        const approvalState = approvalStateRes.rows[0] || {};
        const totalApprovals = Number(approvalState.total_count || 0);
        const pendingApprovals = Number(approvalState.pending_count || 0);
        const rejectedApprovals = Number(approvalState.rejected_count || 0);
        const approvedApprovals = Number(approvalState.approved_count || 0);
        if (
          totalApprovals === 0 ||
          pendingApprovals > 0 ||
          rejectedApprovals > 0 ||
          approvedApprovals !== totalApprovals
        ) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error:
                totalApprovals === 0
                  ? "This held transfer has no linked margin approvals. Open Margin Approvals to repair/review it before release."
                  : rejectedApprovals > 0
                    ? "This transfer has rejected margin approvals and cannot be released. Correct its prices and submit again."
                    : "This transfer still has pending margin approvals and cannot be released yet.",
            },
            { status: 409 },
          );
        }
      }
      if (!draft.rows[0].source_id || !draft.rows[0].destination_id || Number(draft.rows[0].source_id) === Number(draft.rows[0].destination_id)) {
        throw new Error('Distinct source and destination locations are required');
      }
      for (const storeId of [draft.rows[0].source_id]) {
        const storeCheck = requireStore(auth.user, storeId);
        if (storeCheck.error) {
          await client.query("ROLLBACK");
          return storeCheck.error;
        }
      }

      const requestedByProduct = new Map();
      for (const item of items) {
        const productId = toNumericId(item.product_id || item.productId);
        const qty = toNumber(item.qty);
        if (!productId || qty <= 0) continue;
        const current = requestedByProduct.get(productId) || {
          qty: 0,
          name: item.name || item.product_name || `Product ${productId}`,
          rows: [],
        };
        current.qty = Math.round((current.qty + qty) * 1000) / 1000;
        if (item.meta?.sourceRow) current.rows.push(item.meta.sourceRow);
        requestedByProduct.set(productId, current);
      }

      const productIds = Array.from(requestedByProduct.keys());
      if (productIds.length) {
        const stockRes = await client.query(
          `SELECT ib.product_id, COALESCE(SUM(ib.available_qty), 0) AS available_qty
           FROM inventory_batches ib
           WHERE ib.store_id = $1
             AND ib.product_id = ANY($2::int[])
             AND ib.status = 'active'
             AND ib.available_qty > 0
             AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
           GROUP BY ib.product_id`,
          [draft.rows[0].source_id, productIds],
        );
        const availableByProduct = new Map(
          stockRes.rows.map((row) => [
            Number(row.product_id),
            toNumber(row.available_qty),
          ]),
        );
        const insufficient = [];
        for (const productId of productIds) {
          const requested = requestedByProduct.get(productId);
          const available = availableByProduct.get(productId) || 0;
          if (requested.qty > available) {
            const rowText = requested.rows.length
              ? `Row ${requested.rows.join(", ")}: `
              : "";
            insufficient.push(
              `${rowText}${requested.name} requested ${requested.qty}, available ${available} in source. Short by ${Math.round((requested.qty - available) * 1000) / 1000}`,
            );
          }
        }
        if (insufficient.length) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error: `Insufficient source batch stock.\n${insufficient.slice(0, 8).join("\n")}`,
            },
            { status: 409 },
          );
        }
      }

      let marginApprovalCount = 0;
      const marginApprovalRequests = [];
      if (productIds.length) {
        const priceRes = await client.query(
          `SELECT
             p.id,
             p.name,
             COALESCE(p.cost_price, 0) AS cost_price,
             COALESCE(p.mrp, 0) AS mrp,
             COALESCE(p.selling_price, 0) AS selling_price,
             COALESCE(ps.mrp, p.mrp, 0) AS current_mrp,
             COALESCE(ps.selling_price, p.selling_price, 0) AS current_selling_price
           FROM products p
           LEFT JOIN product_saleability ps
             ON ps.product_id = p.id AND ps.store_id = $2
           WHERE p.id = ANY($1::int[])`,
          [productIds, draft.rows[0].destination_id],
        );
        const priceByProduct = new Map(
          priceRes.rows.map((row) => [Number(row.id), row]),
        );

        for (const item of items) {
          const productId = toNumericId(item.product_id || item.productId);
          const product = priceByProduct.get(productId);
          if (!product) continue;
          const requestedMrp = toNumber(
            item.destination_mrp || item.destinationMrp || item.mrp,
          );
          const requestedSellingPrice = toNumber(
            item.selling_price || item.sellingPrice,
          );
          if (requestedMrp > 0 && requestedSellingPrice > requestedMrp) {
            await client.query("ROLLBACK");
            return NextResponse.json(
              { error: `Selling price cannot be greater than MRP for ${item.name || item.product_name || `product ${productId}`}` },
              { status: 400 },
            );
          }
          const requestedCostPrice = toNumber(item.cost_price);
          const approvalRequest = await createMarginApprovalRequest(client, {
            stockTransferId: id,
            sourceType: "stock_transfer",
            sourceReference: draft.rows[0].transaction_id || String(id),
            productId,
            storeId: draft.rows[0].destination_id,
            requestedBy: auth.user.id,
            currentCostPrice: product.cost_price,
            requestedCostPrice,
            currentMrp: product.current_mrp,
            requestedMrp,
            currentSellingPrice: product.current_selling_price,
            requestedSellingPrice,
            remarks: `Price change requested from ${draft.rows[0].transaction_id || `Stock Transfer ${id}`}`,
            meta: {
              productName: product.name,
              invoiceNumber,
              stockTransferId: Number(id),
              source: "stock_transfer_confirm",
            },
          });
          if (approvalRequest?.id) {
            marginApprovalCount += 1;
            marginApprovalRequests.push({
              id: approvalRequest.id,
              productId,
              productName: product.name,
            });
          }
        }
      }

      if (marginApprovalCount > 0) {
        await client.query(
          "DELETE FROM stock_transfer_items WHERE stock_transfer_id = $1",
          [id],
        );
        for (const item of items) {
          const productId = toNumericId(item.product_id || item.productId);
          const product = requestedByProduct.get(productId);
          if (!productId || !product) continue;
          const destinationMrp = toNumber(
            item.destination_mrp || item.destinationMrp || item.mrp,
          );
          const sellingPrice = toNumber(
            item.selling_price || item.sellingPrice,
          );
          if (destinationMrp > 0 && sellingPrice > destinationMrp) {
            await client.query("ROLLBACK");
            return NextResponse.json(
              { error: `Selling price cannot be greater than MRP for ${item.name || item.product_name || `product ${productId}`}` },
              { status: 400 },
            );
          }
          await client.query(
            `INSERT INTO stock_transfer_items (
              stock_transfer_id, product_id, product_name, sku, barcode, qty,
              cost_price, mrp, selling_price, destination_mrp, tax_value, meta,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())`,
            [
              id,
              productId,
              item.name || item.product_name || product.name || null,
              item.sku || null,
              item.barcode || null,
              item.qty,
              item.cost_price || 0,
              item.mrp || 0,
              sellingPrice,
              destinationMrp,
              item.tax_value || 0,
              JSON.stringify({
                ...(item.meta || {}),
                uploadedCostPrice: toNumber(item.cost_price),
                pendingMarginApproval: true,
              }),
            ],
          );
        }

        await client.query(
          `UPDATE stock_transfer SET
             status = 'margin_hold',
             invoice_date = $1,
             invoice_number = $2,
             other_charges = $3,
             remarks = $4,
             total_items = $5,
             total_cost = $6,
             total_tax = $7,
             meta = COALESCE(meta, '{}'::jsonb) || $8::jsonb
           WHERE id = $9`,
          [
            invoiceDate,
            invoiceNumber,
            Number(form.other_charges || 0),
            form.remarks || null,
            totalItems,
            totalCost,
            totalTax,
            JSON.stringify({
              pendingConfirmation: {
                form: {
                  ...form,
                  invoice_date: invoiceDate,
                  invoice_number: invoiceNumber,
                },
                items,
                heldAt: new Date().toISOString(),
                reason: "margin_approval",
                requestIds: marginApprovalRequests.map((request) => request.id),
              },
            }),
            id,
          ],
        );

        await client.query("COMMIT");
        return NextResponse.json(
          {
            success: true,
            requiresMarginApproval: true,
            message:
              "Pricing approval pending. After approval, submit this transfer for dispatch approval.",
            id,
            marginApprovalCount,
            marginApprovalRequests,
          },
          { status: 202 },
        );
      }

      await client.query(
        "DELETE FROM stock_transfer_items WHERE stock_transfer_id = $1",
        [id],
      );
      for (const item of items) {
        const productId = toNumericId(item.product_id || item.productId);
        if (!productId) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Invalid product id in transfer item" },
            { status: 400 },
          );
        }
        const destinationMrp = Number(
          item.destination_mrp || item.destinationMrp || item.mrp || 0,
        );
        const sellingPrice = Number(
          item.selling_price || item.sellingPrice || 0,
        );
        if (destinationMrp > 0 && sellingPrice > destinationMrp) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: `Selling price cannot be greater than MRP for ${item.name || item.product_name || `product ${productId}`}` },
            { status: 400 },
          );
        }
        const transferItemRes = await client.query(
          `INSERT INTO stock_transfer_items (
            stock_transfer_id, product_id, product_name, sku, barcode, qty,
            cost_price, mrp, selling_price, destination_mrp, tax_value, meta,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
          RETURNING id`,
          [
            id,
            productId,
            item.name || item.product_name || null,
            item.sku || null,
            item.barcode || null,
            item.qty,
            item.cost_price || 0,
            item.mrp || 0,
            sellingPrice,
            destinationMrp,
            item.tax_value || 0,
            JSON.stringify({
              ...(item.meta || {}),
              uploadedCostPrice: toNumber(item.cost_price),
            }),
          ],
        );
        const transferItemId = transferItemRes.rows[0]?.id;
        await client.query(`UPDATE stock_transfer_items SET meta = meta || $1::jsonb WHERE id=$2`, [JSON.stringify({ preferredBatchId: toBatchId(item.batch_id || item.batchId) }), transferItemId]);

      }

      await client.query(
        `UPDATE stock_transfer SET
          status = 'submitted', workflow_status = 'submitted', workflow_version = 2,
          invoice_date = $1,
          invoice_number = $2,
          other_charges = $3,
          remarks = $4,
          total_items = $5,
          total_cost = $6,
          total_tax = $7,
          meta = meta || $8::jsonb,
          confirmed_at = NULL
        WHERE id = $9`,
        [
          invoiceDate,
          invoiceNumber,
          Number(form.other_charges || 0),
          form.remarks || null,
          totalItems,
          totalCost,
          totalTax,
          JSON.stringify({
            ...form,
            invoice_date: invoiceDate,
            invoice_number: invoiceNumber,
            marginHoldReleaseError: null,
            marginHoldReleaseCheckedAt: new Date().toISOString(),
          }),
          id,
        ],
      );

      await client.query(`INSERT INTO inventory_transfer_events(transfer_id,action,actor_id,request_key,details) VALUES($1,'submitted',$2,$3,$4::jsonb)`, [id, auth.user.id, `submit-${id}`, JSON.stringify({ remarks: form.remarks || '' })]);
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
    console.error("[stocktransfer confirm]", err.stack || err.message);
    return NextResponse.json(
      { error: err.message || "Failed to confirm stock transfer" },
      { status: 500 },
    );
  }
}
