import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureVendorsSchema } from "@/lib/vendorsSchema";
import { ensurePurchaseOrderSchema } from "@/lib/purchaseOrderSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import {
  auditLog,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";

function normalizePurchaseOrderLookup(value) {
  const raw = decodeURIComponent(String(value || ""))
    .replace(/^#/, "")
    .trim();
  const numericId = /^\d+$/.test(raw) ? Number(raw) : null;
  const transactionId = raw.toUpperCase();
  return { numericId, transactionId };
}

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockInSchema();
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "VIEW_PURCHASE_ORDERS",
      "MANAGE_PURCHASE_ORDERS",
      "CREATE_STORE_PURCHASE_ORDER",
      "MANAGE_VENDORS",
    );
    if (permissionCheck.error) return permissionCheck.error;
    const storeOnlyCreator =
      auth.user.permissions?.includes("CREATE_STORE_PURCHASE_ORDER") &&
      !auth.user.permissions?.some((permission) =>
        ["MANAGE_PURCHASE_ORDERS", "MANAGE_VENDORS", "*"].includes(permission),
      );
    const { numericId, transactionId } = normalizePurchaseOrderLookup(id);

    const res = await query(
      `SELECT po.id, po.transaction_id, po.destination_id, po.vendor_id, po.invoice_date, po.expected_delivery_date,
              po.payment_due_date, po.vendor_credit_days,
              po.shipment_mode, po.invoice_number, po.cc_emails, po.status, po.meta, po.total_items, po.total_cost, po.total_tax,
              po.created_at, po.confirmed_at,
              st.name AS destination_name, st.meta AS destination_meta,
              v.name AS vendor_name, v.credit_days AS current_vendor_credit_days
       FROM purchase_orders po
       LEFT JOIN stores st ON st.id = po.destination_id
       LEFT JOIN vendors v ON v.id = po.vendor_id
       WHERE po.id = COALESCE($1::int, -1)
          OR UPPER(po.transaction_id) = $2`,
      [numericId, transactionId],
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = res.rows[0];
    const storeCheck = requireStore(auth.user, row.destination_id);
    if (storeCheck.error) return storeCheck.error;
    if (
      storeOnlyCreator &&
      String(row.destination_meta?.locationType || "Store").toLowerCase() ===
        "warehouse"
    ) {
      return NextResponse.json(
        {
          error:
            "Warehouse purchase orders are not available for this permission",
        },
        { status: 403 },
      );
    }
    const meta = typeof row.meta === "object" && row.meta ? row.meta : {};
    const itemsRes = await query(
      `SELECT poi.id, poi.product_id, COALESCE(poi.product_name, p.name) AS product_name,
              p.sku, p.barcode, b.name AS brand_name, poi.qty, poi.mrp, poi.selling_price,
              poi.expiry_date, poi.meta,
              COALESCE((
                SELECT SUM(ib.available_qty)
                FROM inventory_batches ib
                WHERE ib.product_id = poi.product_id
                  AND ib.store_id = $2
                  AND ib.status = 'active'
                  AND ib.available_qty > 0
              ), 0) AS available_qty,
              ${
                storeOnlyCreator
                  ? `COALESCE((
                SELECT SUM(ib.available_qty * ib.cost_price) / NULLIF(SUM(ib.available_qty), 0)
                FROM inventory_batches ib
                WHERE ib.product_id = poi.product_id
                  AND ib.store_id = $2
                  AND ib.status = 'active'
                  AND ib.available_qty > 0
              ), 0)`
                  : "poi.cost_price"
              } AS cost_price,
              poi.tax_value
       FROM purchase_order_items poi
       LEFT JOIN products p ON p.id = poi.product_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE poi.purchase_order_id = $1
       ORDER BY poi.id`,
      [row.id, row.destination_id],
    );

    return NextResponse.json({
      id: row.id,
      transactionId:
        row.transaction_id || `PO-${String(row.id).padStart(4, "0")}`,
      destination: row.destination_id,
      destinationName: row.destination_name || "",
      vendor: row.vendor_id,
      vendorName: row.vendor_name || "",
      invoice_date: row.invoice_date
        ? String(row.invoice_date).slice(0, 10)
        : meta.invoice_date || "",
      expected_delivery_date: row.expected_delivery_date
        ? String(row.expected_delivery_date).slice(0, 10)
        : meta.expected_delivery_date || "",
      payment_due_date: row.payment_due_date
        ? String(row.payment_due_date).slice(0, 10)
        : meta.payment_due_date || meta.paymentDueDate || "",
      paymentDueDate: row.payment_due_date
        ? String(row.payment_due_date).slice(0, 10)
        : meta.payment_due_date || meta.paymentDueDate || "",
      vendorCreditDays: Number(row.vendor_credit_days || row.current_vendor_credit_days || 0) || null,
      createdAt: row.created_at,
      shipment_mode: row.shipment_mode || meta.shipment_mode || "",
      invoice_number: row.invoice_number || meta.invoice_number || "",
      cc_emails: row.cc_emails || meta.cc_emails || "",
      status: row.status || "draft",
      totalItems: Number(row.total_items || 0),
      totalCost: storeOnlyCreator ? null : Number(row.total_cost || 0),
      totalTax: Number(row.total_tax || 0),
      items: itemsRes.rows.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        name: item.product_name,
        sku: item.sku,
        barcode: item.barcode,
        available_qty: Number(item.available_qty || 0),
        availableQty: Number(item.available_qty || 0),
        qty: Number(item.qty || 0),
        cost_price: Number(item.cost_price || 0),
        mrp: Number(item.mrp || 0),
        selling_price: Number(item.selling_price || 0),
        expiry_date: item.expiry_date,
        variant_key: item.meta?.variantKey || null,
        brand_name: item.meta?.brandName || item.brand_name || "",
        current_stock: Number(item.meta?.currentStock || 0),
        last_grn_date: item.meta?.lastGrnDate || null,
        last_grn_qty: Number(item.meta?.lastGrnQty || 0),
        avg_daily_sales: Number(item.meta?.avgDailySales || 0),
        sale_22_to_30: Number(item.meta?.sale22To30 || 0),
        sale_15_to_21: Number(item.meta?.sale15To21 || 0),
        sale_8_to_14: Number(item.meta?.sale8To14 || 0),
        sale_1_to_7: Number(item.meta?.sale1To7 || 0),
        mbq: Number(item.meta?.mbq || 0),
        required_qty: Number(item.meta?.requiredQty || item.qty || 0),
        tax_value: Number(item.tax_value || 0),
      })),
    });
  } catch (err) {
    console.error("[purchase-orders GET id]", err.message);
    return NextResponse.json(
      { error: "Failed to load purchase order" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockInSchema();
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
      "CREATE_STORE_PURCHASE_ORDER",
    );
    if (permissionCheck.error) return permissionCheck.error;
    const { numericId, transactionId } = normalizePurchaseOrderLookup(id);

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const po = await client.query(
        `SELECT id, status, destination_id, transaction_id
         FROM purchase_orders
         WHERE id = COALESCE($1::int, -1)
            OR UPPER(transaction_id) = $2
         FOR UPDATE`,
        [numericId, transactionId],
      );

      if (po.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Purchase order not found" },
          { status: 404 },
        );
      }

      const row = po.rows[0];
      const storeCheck = requireStore(auth.user, row.destination_id);
      if (storeCheck.error) {
        await client.query("ROLLBACK");
        return storeCheck.error;
      }

      if (String(row.status || "draft").toLowerCase() !== "draft") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Only draft purchase orders can be deleted" },
          { status: 409 },
        );
      }

      await client.query(
        "DELETE FROM purchase_order_items WHERE purchase_order_id = $1",
        [row.id],
      );
      await client.query("DELETE FROM purchase_orders WHERE id = $1", [row.id]);
      await client.query("COMMIT");
      await auditLog(
        auth.user.id,
        "purchase_order.delete",
        "purchase_order",
        row.id,
        {
          transactionId: row.transaction_id,
          destinationId: row.destination_id,
        },
      );
      return NextResponse.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[purchase-orders DELETE id]", err.message);
    return NextResponse.json(
      { error: "Failed to delete purchase order" },
      { status: 500 },
    );
  }
}
