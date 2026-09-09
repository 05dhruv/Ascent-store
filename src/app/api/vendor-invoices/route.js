import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { ensureVendorsSchema } from "@/lib/vendorsSchema";
import { ensurePurchaseOrderSchema } from "@/lib/purchaseOrderSchema";
import { ensureVendorInvoicesSchema } from "@/lib/vendorInvoicesSchema";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import {
  getAssignedStoreIds,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { resolveVendorPaymentTerms } from "@/lib/vendorCreditTerms";

function mapRow(row) {
  const totalAmount = Number(row.total_amount || 0);
  const amountPaid = Number(row.amount_paid || 0);
  const amountLeft = Math.max(totalAmount - amountPaid, 0);
  return {
    id: row.id,
    transactionId:
      row.transaction_id || `INV-${String(row.id).padStart(4, "0")}`,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name || "—",
    brandNames: row.brand_names || "—",
    transferredStores: row.transferred_stores || "Not transferred",
    poId: row.purchase_order_transaction_id || row.purchase_order_id || null,
    stockInId: row.stock_in_id || null,
    grnId: row.stock_in_transaction_id || row.stock_in_id || null,
    invoiceNumber: row.invoice_number,
    totalAmount,
    amountPaid,
    amountLeft,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    sourceType: row.source_type || "",
    sourceTransactionId: row.source_transaction_id || null,
    sourceDate: row.source_date || null,
    vendorCreditDays:
      row.vendor_credit_days == null ? null : Number(row.vendor_credit_days),
    createdBy: row.created_by || "System",
    remarks: row.remarks || "",
    status: row.status || "Pending",
    billVerifiedSubmitted: Boolean(row.bill_verified_submitted),
    billVerifiedSubmittedBy: row.bill_verified_submitted_by || null,
    billVerifiedSubmittedAt: row.bill_verified_submitted_at || null,
    createdAt: row.created_at,
    settlementCount: Number(row.settlement_count || 0),
    lastPaymentDate: row.last_payment_date || null,
    payments: Array.isArray(row.payments) ? row.payments : [],
  };
}

function normalizeStatus(totalAmount, amountPaid) {
  if (amountPaid >= totalAmount && totalAmount > 0) return "Paid";
  if (amountPaid > 0) return "Partial";
  return "Pending";
}

function generateVendorInvoiceNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VINV-${date}-${time}-${suffix}`;
}

export async function GET(request) {
  try {
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensureStockInSchema();
    await ensureVendorInvoicesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
      "MANAGE_VENDORS",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const vendorId = Number(searchParams.get("vendorId") || 0) || null;
    const status = String(searchParams.get("status") || "").trim();
    const search = String(searchParams.get("search") || "").trim();
    const params = [];
    const conditions = [];
    if (auth.user.role !== "super_admin") {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) {
        conditions.push("1 = 0");
      } else {
        params.push(assignedStores);
        conditions.push(
          `(po.destination_id = ANY($${params.length}::int[]) OR si.destination_id = ANY($${params.length}::int[]))`,
        );
      }
    }

    if (vendorId) {
      params.push(vendorId);
      conditions.push(`vi.vendor_id = $${params.length}`);
    }
    if (status && status.toLowerCase() !== "all") {
      params.push(status.toLowerCase());
      conditions.push(`LOWER(vi.status) = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        vi.transaction_id ILIKE $${params.length}
        OR vi.invoice_number ILIKE $${params.length}
        OR COALESCE(v.name, '') ILIKE $${params.length}
        OR COALESCE(invoice_transfers.transferred_stores, '') ILIKE $${params.length}
        OR COALESCE(vi.remarks, '') ILIKE $${params.length}
      )`);
    }

    const res = await query(
      `WITH transferred_invoice_stores AS (
         SELECT source_item.stock_in_id,
                STRING_AGG(DISTINCT destination_store.name, ', ' ORDER BY destination_store.name) AS transferred_stores
         FROM stock_transfer st
         JOIN stores destination_store ON destination_store.id = st.destination_id
         JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(sti.meta->'batchAllocations') = 'array'
               THEN sti.meta->'batchAllocations'
             ELSE '[]'::jsonb
           END
         ) allocation
         JOIN inventory_batches source_batch
           ON COALESCE(allocation->>'batchId', '') ~ '^[0-9]+$'
          AND source_batch.id = (allocation->>'batchId')::bigint
         JOIN stock_in_items source_item
           ON source_batch.source_type = 'stock_in'
          AND COALESCE(source_batch.source_id, '') ~ '^[0-9]+$'
          AND source_item.id = source_batch.source_id::bigint
         WHERE LOWER(COALESCE(st.status, '')) = 'confirmed'
         GROUP BY source_item.stock_in_id
       )
       SELECT vi.id, vi.transaction_id, vi.vendor_id, vi.purchase_order_id, vi.invoice_number, vi.total_amount, vi.amount_paid,
              vi.stock_in_id,
              COALESCE(
                vi.due_date,
                CASE
                  WHEN v.credit_days IS NOT NULL AND v.credit_days > 0 THEN
                    (COALESCE(vi.invoice_date, si.invoice_date, si.confirmed_at::date, si.created_at::date, vi.created_at::date)
                      + (v.credit_days::text || ' days')::interval)::date
                  ELSE NULL
                END
              ) AS due_date,
              vi.invoice_date, vi.created_by, vi.remarks, vi.status,
              vi.bill_verified_submitted, vi.bill_verified_submitted_by,
              vi.bill_verified_submitted_at, vi.created_at,
              v.name AS vendor_name,
              v.credit_days AS vendor_credit_days,
              po.transaction_id AS purchase_order_transaction_id,
              si.transaction_id AS stock_in_transaction_id,
              CASE
                WHEN si.id IS NOT NULL THEN 'Stock In'
                WHEN po.id IS NOT NULL THEN 'Purchase Order'
                ELSE 'Manual Invoice'
              END AS source_type,
              COALESCE(si.transaction_id, po.transaction_id, vi.transaction_id) AS source_transaction_id,
              COALESCE(si.confirmed_at::date, si.created_at::date, po.confirmed_at::date, po.created_at::date, vi.created_at::date) AS source_date,
              COALESCE(invoice_brands.brand_names, '—') AS brand_names,
              invoice_transfers.transferred_stores,
              COALESCE(settlement_stats.settlement_count, 0) AS settlement_count,
              settlement_stats.last_payment_date,
              COALESCE(settlement_stats.payments, '[]'::jsonb) AS payments
       FROM vendor_invoices vi
       LEFT JOIN vendors v ON v.id = vi.vendor_id
       LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
       LEFT JOIN stock_in si ON si.id = vi.stock_in_id
       LEFT JOIN transferred_invoice_stores invoice_transfers ON invoice_transfers.stock_in_id = vi.stock_in_id
       LEFT JOIN LATERAL (
         SELECT STRING_AGG(DISTINCT COALESCE(b.name, 'Unbranded'), ', ' ORDER BY COALESCE(b.name, 'Unbranded')) AS brand_names
         FROM products p
         LEFT JOIN brands b ON b.id = p.brand_id
         WHERE p.id IN (
           SELECT sii.product_id FROM stock_in_items sii WHERE sii.stock_in_id = vi.stock_in_id
           UNION
           SELECT poi.product_id FROM purchase_order_items poi WHERE poi.purchase_order_id = vi.purchase_order_id
         )
       ) invoice_brands ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS settlement_count,
           MAX(vis.settlement_date) AS last_payment_date,
           jsonb_agg(
             jsonb_build_object(
               'id', vis.id,
               'amount', vis.amount,
               'paymentMode', vis.payment_mode,
               'referenceNo', vis.reference_no,
               'settlementDate', vis.settlement_date,
               'settledBy', vis.settled_by,
               'remarks', vis.remarks,
               'createdAt', vis.created_at,
               'updatedAt', vis.updated_at
             )
             ORDER BY vis.settlement_date DESC, vis.id DESC
           ) AS payments
         FROM vendor_invoice_settlements vis
         WHERE vis.vendor_invoice_id = vi.id
       ) settlement_stats ON TRUE
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY vi.created_at DESC
       LIMIT 500`,
      params,
    );

    return NextResponse.json(res.rows.map(mapRow));
  } catch (err) {
    console.error("[vendor-invoices GET]", err.message);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  try {
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensureStockInSchema();
    await ensureVendorInvoicesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const vendorId = body.vendor || body.vendorId || null;
    const invoiceNumber =
      String(body.invoice_number || body.invoiceNumber || "").trim() ||
      generateVendorInvoiceNumber();
    const totalAmount = Number(body.total_amount ?? body.amount ?? 0);
    const rawAmountPaid = Number(body.amount_paid ?? 0);
    const amountPaid = Math.min(
      Math.max(Number.isFinite(rawAmountPaid) ? rawAmountPaid : 0, 0),
      Math.max(totalAmount, 0),
    );
    const purchaseOrderId =
      Number(body.purchase_order_id || body.purchaseOrderId || 0) || null;
    const stockInId = Number(body.stock_in_id || body.stockInId || 0) || null;

    if (!vendorId)
      return NextResponse.json(
        { error: "Vendor is required" },
        { status: 400 },
      );
    if (!Number.isFinite(totalAmount) || totalAmount < 0)
      return NextResponse.json(
        { error: "Amount is required" },
        { status: 400 },
      );

    const client = await getClient();
    try {
      await client.query("BEGIN");
      let linkedPurchaseOrder = null;
      if (purchaseOrderId) {
        const poRes = await client.query(
          `SELECT destination_id, vendor_id, payment_due_date, vendor_credit_days,
                  (created_at AT TIME ZONE 'Asia/Kolkata')::date AS created_date
           FROM purchase_orders WHERE id = $1`,
          [purchaseOrderId],
        );
        linkedPurchaseOrder = poRes.rows[0] || null;
        const storeCheck = requireStore(
          auth.user,
          poRes.rows[0]?.destination_id,
        );
        if (storeCheck.error) {
          await client.query("ROLLBACK");
          return storeCheck.error;
        }
        if (
          linkedPurchaseOrder &&
          String(linkedPurchaseOrder.vendor_id) !== String(vendorId)
        ) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Vendor does not match the selected purchase order" },
            { status: 400 },
          );
        }
      }

      if (stockInId) {
        const stockRes = await client.query(
          "SELECT destination_id FROM stock_in WHERE id = $1",
          [stockInId],
        );
        const storeCheck = requireStore(
          auth.user,
          stockRes.rows[0]?.destination_id,
        );
        if (storeCheck.error) {
          await client.query("ROLLBACK");
          return storeCheck.error;
        }
      }

      if (auth.user.role !== "super_admin" && !purchaseOrderId && !stockInId) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Store-linked purchase order or GRN is required" },
          { status: 400 },
        );
      }

      const paymentTerms = await resolveVendorPaymentTerms(client, {
        vendorId,
        baseDate: linkedPurchaseOrder?.created_date || body.invoice_date,
        paymentDueDate: linkedPurchaseOrder?.payment_due_date || body.due_date,
        creditDaysOverride: linkedPurchaseOrder?.vendor_credit_days,
      });

      const res = await client.query(
        `INSERT INTO vendor_invoices (
          vendor_id, purchase_order_id, stock_in_id, invoice_number, total_amount, amount_paid,
          due_date, invoice_date, created_by, remarks, status, meta, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
        RETURNING id`,
        [
          vendorId,
          purchaseOrderId,
          stockInId,
          invoiceNumber,
          totalAmount,
          amountPaid,
          paymentTerms.paymentDueDate,
          body.invoice_date || null,
          body.created_by || "System",
          body.remarks || null,
          body.status || normalizeStatus(totalAmount, amountPaid),
          JSON.stringify(body),
        ],
      );

      const id = res.rows[0].id;
      const transactionId = `INV-${String(id).padStart(4, "0")}`;
      await client.query(
        "UPDATE vendor_invoices SET transaction_id = $1 WHERE id = $2",
        [transactionId, id],
      );
      if (amountPaid > 0) {
        await client.query(
          `INSERT INTO vendor_invoice_settlements (
            vendor_invoice_id, amount, payment_mode, reference_no, settlement_date, settled_by, remarks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            amountPaid,
            body.payment_mode || body.paymentMode || "Bank Transfer",
            body.reference_no || body.referenceNo || null,
            body.payment_date ||
              body.paymentDate ||
              new Date().toISOString().slice(0, 10),
            body.created_by || "System",
            body.payment_remarks || null,
          ],
        );
      }
      await client.query("COMMIT");
      return NextResponse.json({ id, transactionId }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[vendor-invoices POST]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to create vendor invoice" },
      { status: err.status || 500 },
    );
  }
}

export async function PUT(request) {
  let client;
  try {
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensureStockInSchema();
    await ensureVendorInvoicesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const invoiceId = Number(body.invoiceId || body.id || 0);
    const amount = Number(body.amount || body.settlementAmount || 0);
    const paymentMode =
      String(body.paymentMode || body.payment_mode || "Bank Transfer").trim() ||
      "Bank Transfer";
    const referenceNo = String(
      body.referenceNo || body.reference_no || "",
    ).trim();
    const settlementDate =
      body.settlementDate ||
      body.settlement_date ||
      new Date().toISOString().slice(0, 10);
    const remarks = String(body.remarks || "").trim();
    const settledBy =
      String(body.settledBy || body.settled_by || "System").trim() || "System";

    if (!invoiceId)
      return NextResponse.json(
        { error: "Invoice is required" },
        { status: 400 },
      );
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json(
        { error: "Settlement amount must be greater than zero" },
        { status: 400 },
      );

    client = await getClient();
    await client.query("BEGIN");

    const invoiceRes = await client.query(
      `SELECT vi.id, vi.total_amount, vi.amount_paid,
              po.destination_id AS po_store_id,
              si.destination_id AS stock_store_id
       FROM vendor_invoices vi
       LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
       LEFT JOIN stock_in si ON si.id = vi.stock_in_id
       WHERE vi.id = $1
       FOR UPDATE OF vi`,
      [invoiceId],
    );
    const invoice = invoiceRes.rows[0];
    if (!invoice) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const storeCheck = requireStore(
      auth.user,
      invoice.po_store_id || invoice.stock_store_id,
    );
    if (storeCheck.error) {
      await client.query("ROLLBACK");
      return storeCheck.error;
    }

    const totalAmount = Number(invoice.total_amount || 0);
    const currentPaid = Number(invoice.amount_paid || 0);
    const amountLeft = Math.max(totalAmount - currentPaid, 0);
    if (amountLeft <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Invoice is already paid" },
        { status: 400 },
      );
    }

    const appliedAmount = Math.min(amount, amountLeft);
    const nextPaid = currentPaid + appliedAmount;
    const nextStatus = normalizeStatus(totalAmount, nextPaid);

    const settlementRes = await client.query(
      `INSERT INTO vendor_invoice_settlements (
        vendor_invoice_id, amount, payment_mode, reference_no, settlement_date, settled_by, remarks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        invoiceId,
        appliedAmount,
        paymentMode,
        referenceNo || null,
        settlementDate,
        settledBy,
        remarks || null,
      ],
    );

    await client.query(
      `UPDATE vendor_invoices
       SET amount_paid = $2, status = $3, updated_at = NOW()
       WHERE id = $1`,
      [invoiceId, nextPaid, nextStatus],
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      settlementId: settlementRes.rows[0].id,
      invoiceId,
      settledAmount: appliedAmount,
      amountPaid: nextPaid,
      amountLeft: Math.max(totalAmount - nextPaid, 0),
      status: nextStatus,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[vendor-invoices PUT]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to settle vendor invoice" },
      { status: 500 },
    );
  } finally {
    if (client) client.release();
  }
}

// Amend an existing payment while keeping the invoice balance and status in sync.
export async function PATCH(request) {
  let client;
  try {
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensureStockInSchema();
    await ensureVendorInvoicesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const action = String(body.action || "").trim();

    if (action === "bill-verification") {
      const invoiceId = Number(body.invoiceId || body.id || 0);
      if (!invoiceId) {
        return NextResponse.json(
          { error: "Invoice is required" },
          { status: 400 },
        );
      }

      const invoiceRes = await query(
        `SELECT vi.id, po.destination_id AS po_store_id,
                si.destination_id AS stock_store_id
         FROM vendor_invoices vi
         LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
         LEFT JOIN stock_in si ON si.id = vi.stock_in_id
         WHERE vi.id = $1`,
        [invoiceId],
      );
      const invoice = invoiceRes.rows[0];
      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      const storeCheck = requireStore(
        auth.user,
        invoice.po_store_id || invoice.stock_store_id,
      );
      if (storeCheck.error) return storeCheck.error;

      const verified = body.billVerifiedSubmitted === true;
      const updated = await query(
        `UPDATE vendor_invoices
         SET bill_verified_submitted = $1,
             bill_verified_submitted_by = CASE WHEN $1 THEN $2 ELSE NULL END,
             bill_verified_submitted_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $3
         RETURNING bill_verified_submitted, bill_verified_submitted_by,
                   bill_verified_submitted_at`,
        [verified, auth.user.name || auth.user.email || String(auth.user.id), invoiceId],
      );
      const row = updated.rows[0];
      return NextResponse.json({
        ok: true,
        invoiceId,
        billVerifiedSubmitted: Boolean(row.bill_verified_submitted),
        billVerifiedSubmittedBy: row.bill_verified_submitted_by || null,
        billVerifiedSubmittedAt: row.bill_verified_submitted_at || null,
      });
    }

    const settlementId = Number(body.settlementId || body.id || 0);
    const amount = Number(body.amount || 0);
    const paymentMode =
      String(body.paymentMode || body.payment_mode || "Bank Transfer").trim() ||
      "Bank Transfer";
    const referenceNo = String(
      body.referenceNo || body.reference_no || "",
    ).trim();
    const settlementDate =
      body.settlementDate ||
      body.settlement_date ||
      new Date().toISOString().slice(0, 10);
    const remarks = String(body.remarks || "").trim();

    if (!settlementId) {
      return NextResponse.json(
        { error: "Payment record is required" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Payment amount must be greater than zero" },
        { status: 400 },
      );
    }

    client = await getClient();
    await client.query("BEGIN");
    const paymentRes = await client.query(
      `SELECT vis.id, vis.vendor_invoice_id, vi.total_amount,
              po.destination_id AS po_store_id,
              si.destination_id AS stock_store_id
       FROM vendor_invoice_settlements vis
       JOIN vendor_invoices vi ON vi.id = vis.vendor_invoice_id
       LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
       LEFT JOIN stock_in si ON si.id = vi.stock_in_id
       WHERE vis.id = $1
       FOR UPDATE OF vis, vi`,
      [settlementId],
    );
    const payment = paymentRes.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Payment record not found" },
        { status: 404 },
      );
    }
    const storeCheck = requireStore(
      auth.user,
      payment.po_store_id || payment.stock_store_id,
    );
    if (storeCheck.error) {
      await client.query("ROLLBACK");
      return storeCheck.error;
    }

    const otherPayments = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS amount_paid
       FROM vendor_invoice_settlements
       WHERE vendor_invoice_id = $1 AND id <> $2`,
      [payment.vendor_invoice_id, settlementId],
    );
    const nextPaid = Number(otherPayments.rows[0]?.amount_paid || 0) + amount;
    const totalAmount = Number(payment.total_amount || 0);
    if (nextPaid > totalAmount + 0.0001) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Payment amount exceeds the remaining invoice balance" },
        { status: 400 },
      );
    }

    await client.query(
      `UPDATE vendor_invoice_settlements
       SET amount = $2, payment_mode = $3, reference_no = $4,
           settlement_date = $5, remarks = $6, updated_at = NOW()
       WHERE id = $1`,
      [
        settlementId,
        amount,
        paymentMode,
        referenceNo || null,
        settlementDate,
        remarks || null,
      ],
    );
    const nextStatus = normalizeStatus(totalAmount, nextPaid);
    await client.query(
      `UPDATE vendor_invoices
       SET amount_paid = $2, status = $3, updated_at = NOW()
       WHERE id = $1`,
      [payment.vendor_invoice_id, nextPaid, nextStatus],
    );
    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      settlementId,
      invoiceId: payment.vendor_invoice_id,
      amountPaid: nextPaid,
      amountLeft: Math.max(totalAmount - nextPaid, 0),
      status: nextStatus,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[vendor-invoices PATCH]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to update payment" },
      { status: 500 },
    );
  } finally {
    if (client) client.release();
  }
}
