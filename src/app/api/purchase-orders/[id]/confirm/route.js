import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureVendorsSchema } from "@/lib/vendorsSchema";
import { ensurePurchaseOrderSchema } from "@/lib/purchaseOrderSchema";
import {
  ensurePurchaseOrderEditRequestsTable,
  isSuperAdminUser,
} from "@/lib/purchaseOrderEditApprovals";
import {
  auditLog,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { resolveVendorPaymentTerms } from "@/lib/vendorCreditTerms";

function normalizePurchaseOrderLookup(value) {
  const raw = decodeURIComponent(String(value || ""))
    .replace(/^#/, "")
    .trim();
  const numericId = /^\d+$/.test(raw) ? Number(raw) : null;
  const transactionId = raw.toUpperCase();
  return { numericId, transactionId };
}

export async function POST(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockInSchema();
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensurePurchaseOrderEditRequestsTable();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
      "CREATE_STORE_PURCHASE_ORDER",
    );
    if (permissionCheck.error) return permissionCheck.error;
    const { numericId, transactionId } = normalizePurchaseOrderLookup(id);

    const body = await request.json();
    const form = body.form || {};
    const items = body.items || [];

    if (!items.length) {
      return NextResponse.json(
        { error: "Add at least one product" },
        { status: 400 },
      );
    }

    let totalItems = 0;
    let totalCost = 0;
    let totalTax = 0;

    for (const item of items) {
      const qty = Number(item.qty || 0);
      const cost = Number(item.cost_price || 0);
      const tax = Number(item.tax_value || 0);
      if (!item.product_id || qty <= 0) {
        return NextResponse.json(
          {
            error:
              "Each item must have a product and quantity greater than zero",
          },
          { status: 400 },
        );
      }
      if (cost < 0 || tax < 0) {
        return NextResponse.json(
          { error: "Cost and tax cannot be negative" },
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
        `SELECT id, status, destination_id, vendor_id, payment_due_date, vendor_credit_days,
                (created_at AT TIME ZONE 'Asia/Kolkata')::date AS created_date,
                (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today_date
         FROM purchase_orders
         WHERE id = COALESCE($1::int, -1)
            OR UPPER(transaction_id) = $2`,
        [numericId, transactionId],
      );
      if (draft.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Purchase order not found" },
          { status: 404 },
        );
      }
      const purchaseOrderId = draft.rows[0].id;
      const destinationId = form.destination || draft.rows[0].destination_id;
      const vendorId = form.vendor || draft.rows[0].vendor_id;
      const storeCheck = requireStore(auth.user, destinationId);
      if (storeCheck.error) {
        await client.query("ROLLBACK");
        return storeCheck.error;
      }
      const storeOnlyCreator =
        auth.user.permissions?.includes("CREATE_STORE_PURCHASE_ORDER") &&
        !auth.user.permissions?.some((permission) =>
          ["MANAGE_PURCHASE_ORDERS", "*"].includes(permission),
        );
      if (storeOnlyCreator) {
        const location = await client.query(
          `SELECT meta FROM stores WHERE id = $1`,
          [destinationId],
        );
        if (
          String(
            location.rows[0]?.meta?.locationType || "Store",
          ).toLowerCase() === "warehouse"
        ) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error:
                "This permission can confirm purchase orders only for stores",
            },
            { status: 403 },
          );
        }
      }
      if (draft.rows[0].status === "confirmed") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Already confirmed" },
          { status: 409 },
        );
      }
      const vendorChanged = String(vendorId) !== String(draft.rows[0].vendor_id);
      const paymentTerms = await resolveVendorPaymentTerms(client, {
        vendorId,
        baseDate: draft.rows[0].created_date,
        paymentDueDate:
          form.payment_due_date ||
          form.paymentDueDate ||
          draft.rows[0].payment_due_date,
        creditDaysOverride: vendorChanged
          ? undefined
          : draft.rows[0].vendor_credit_days,
      });
      const isSameDay =
        String(draft.rows[0].created_date) === String(draft.rows[0].today_date);
      let approvalRequestId = null;
      if (!isSameDay && !isSuperAdminUser(auth.user)) {
        const approvedRequest = await client.query(
          `SELECT id
           FROM purchase_order_edit_requests
           WHERE purchase_order_id = $1
             AND requested_by = $2
             AND status = 'approved'
             AND used_at IS NULL
           ORDER BY approved_at DESC, id DESC
           LIMIT 1`,
          [purchaseOrderId, auth.user.id],
        );

        if (approvedRequest.rows.length === 0) {
          await client.query(
            `INSERT INTO purchase_order_edit_requests (
               purchase_order_id, requested_by, status, reason, request_payload,
               requested_at, created_at, updated_at
             )
             SELECT $1, $2, 'pending', $3, $4::jsonb, NOW(), NOW(), NOW()
             WHERE NOT EXISTS (
               SELECT 1
               FROM purchase_order_edit_requests
               WHERE purchase_order_id = $1
                 AND requested_by = $2
                 AND status = 'pending'
             )`,
            [
              purchaseOrderId,
              auth.user.id,
              body.reason ||
                body.editReason ||
                "Edit requested after same-day window",
              JSON.stringify({ form, items }),
            ],
          );
          await client.query("COMMIT");
          return NextResponse.json(
            {
              error:
                "This purchase order is older than one day. Edit request has been sent to super admin for approval.",
              requestPending: true,
            },
            { status: 403 },
          );
        }

        approvalRequestId = approvedRequest.rows[0].id;
      }

      await client.query(
        "DELETE FROM purchase_order_items WHERE purchase_order_id = $1",
        [purchaseOrderId],
      );

      for (const item of items) {
        await client.query(
          `INSERT INTO purchase_order_items (
             purchase_order_id, product_id, product_name, qty, cost_price,
             mrp, selling_price, expiry_date, meta, tax_value, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,NOW())`,
          [
            purchaseOrderId,
            item.product_id,
            item.name || null,
            item.qty,
            item.cost_price || 0,
            item.mrp || 0,
            item.selling_price || item.sellingPrice || 0,
            item.expiry_date || item.expiryDate || null,
            JSON.stringify({
              variantKey: item.variant_key || item.variantKey || null,
              brandName: item.brand_name || item.brandName || "",
              currentStock: Number(
                item.current_stock || item.currentStock || 0,
              ),
              lastGrnDate: item.last_grn_date || item.lastGrnDate || null,
              lastGrnQty: Number(item.last_grn_qty || item.lastGrnQty || 0),
              avgDailySales: Number(
                item.avg_daily_sales || item.avgDailySales || 0,
              ),
              sale22To30: Number(item.sale_22_to_30 || item.sale22To30 || 0),
              sale15To21: Number(item.sale_15_to_21 || item.sale15To21 || 0),
              sale8To14: Number(item.sale_8_to_14 || item.sale8To14 || 0),
              sale1To7: Number(item.sale_1_to_7 || item.sale1To7 || 0),
              mbq: Number(item.mbq || 0),
              requiredQty: Number(
                item.required_qty || item.requiredQty || item.qty || 0,
              ),
            }),
            item.tax_value || 0,
          ],
        );
      }

      await client.query(
        `UPDATE purchase_orders SET
          status = 'confirmed',
          destination_id = COALESCE($1, destination_id),
          vendor_id = COALESCE($2, vendor_id),
          invoice_date = COALESCE($3, invoice_date),
          expected_delivery_date = COALESCE($4, expected_delivery_date),
          payment_due_date = $5,
          vendor_credit_days = $6,
          shipment_mode = COALESCE($7, shipment_mode),
          invoice_number = COALESCE($8, invoice_number),
          cc_emails = COALESCE($9, cc_emails),
          total_items = $10,
          total_cost = $11,
          total_tax = $12,
          meta = meta || $13::jsonb,
          confirmed_at = NOW()
        WHERE id = $14`,
        [
          form.destination || null,
          form.vendor || null,
          form.invoice_date || null,
          form.expected_delivery_date || null,
          paymentTerms.paymentDueDate,
          paymentTerms.creditDays,
          form.shipment_mode || null,
          form.invoice_number || null,
          form.cc_emails || null,
          totalItems,
          totalCost,
          totalTax,
          JSON.stringify(form),
          purchaseOrderId,
        ],
      );
      if (approvalRequestId) {
        await client.query(
          `UPDATE purchase_order_edit_requests
           SET status = 'used',
               used_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [approvalRequestId],
        );
      }

      await client.query("COMMIT");
      await auditLog(
        auth.user.id,
        "purchase_order.confirm",
        "purchase_order",
        purchaseOrderId,
        {
          destinationId,
          totalItems,
          totalCost,
          totalTax,
        },
      );
      return NextResponse.json({
        success: true,
        id: purchaseOrderId,
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
    console.error("[purchase-orders confirm]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to confirm purchase order" },
      { status: err.status || 500 },
    );
  }
}
