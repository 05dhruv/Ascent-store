import { NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensureStockRequisitionSchema } from '@/lib/stockRequisitionSchema';
import { ensureVendorsSchema } from '@/lib/vendorsSchema';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';
import { resolveVendorPaymentTerms } from '@/lib/vendorCreditTerms';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request) {
  try {
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    await ensureStockRequisitionSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS', 'MANAGE_INVENTORY');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const requisitionId = body.requisitionId || body.requisition_id;
    const vendorId = body.vendorId || body.vendor_id || body.vendor;
    if (!requisitionId) return NextResponse.json({ error: 'Requisition is required' }, { status: 400 });
    if (!vendorId) return NextResponse.json({ error: 'Vendor is required' }, { status: 400 });

    const reqRes = await query(
      `SELECT id, transaction_id, destination_id, approval_status, purchase_order_id
       FROM stock_requisitions
       WHERE id = $1`,
      [requisitionId]
    );
    if (!reqRes.rows.length) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    const requisition = reqRes.rows[0];
    if (requisition.purchase_order_id) {
      return NextResponse.json({ error: 'Purchase order already created for this requisition' }, { status: 409 });
    }
    if (requisition.approval_status !== 'approved') {
      return NextResponse.json({ error: 'Approve requisition before creating PO' }, { status: 400 });
    }

    const storeCheck = requireStore(auth.user, requisition.destination_id);
    if (storeCheck.error) return storeCheck.error;

    const itemsRes = await query(
      `SELECT sri.product_id, COALESCE(sri.product_name, p.name) AS product_name, sri.qty,
              COALESCE(NULLIF(sri.cost_price, 0), p.cost_price, 0) AS cost_price
       FROM stock_requisition_items sri
       LEFT JOIN products p ON p.id = sri.product_id
       WHERE sri.requisition_id = $1
       ORDER BY sri.id`,
      [requisitionId]
    );
    if (!itemsRes.rows.length) return NextResponse.json({ error: 'Requisition has no items' }, { status: 400 });

    const totalItems = itemsRes.rows.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const totalCost = itemsRes.rows.reduce((sum, item) => sum + toNumber(item.qty) * toNumber(item.cost_price), 0);

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const paymentTerms = await resolveVendorPaymentTerms(client, {
        vendorId,
        paymentDueDate: body.paymentDueDate || body.payment_due_date,
      });
      const poRes = await client.query(
        `INSERT INTO purchase_orders (
           destination_id, vendor_id, invoice_date, expected_delivery_date,
           payment_due_date, vendor_credit_days, shipment_mode, invoice_number,
           cc_emails, status, total_items, total_cost,
           total_tax, meta, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,0,$12::jsonb,NOW())
         RETURNING id`,
        [
          requisition.destination_id,
          vendorId,
          body.invoiceDate || body.invoice_date || null,
          body.expectedDeliveryDate || body.expected_delivery_date || null,
          paymentTerms.paymentDueDate,
          paymentTerms.creditDays,
          body.shipmentMode || body.shipment_mode || null,
          body.invoiceNumber || body.invoice_number || null,
          body.ccEmails || body.cc_emails || null,
          totalItems,
          totalCost,
          JSON.stringify({ ...body, source: 'stock_requisition', requisitionId }),
        ]
      );
      const poId = poRes.rows[0].id;
      const transactionId = `PO-${String(poId).padStart(4, '0')}`;
      await client.query('UPDATE purchase_orders SET transaction_id = $1 WHERE id = $2', [transactionId, poId]);

      for (const item of itemsRes.rows) {
        await client.query(
          `INSERT INTO purchase_order_items (purchase_order_id, product_id, product_name, qty, cost_price, tax_value, created_at)
           VALUES ($1,$2,$3,$4,$5,0,NOW())`,
          [poId, item.product_id, item.product_name, item.qty, item.cost_price]
        );
      }

      await client.query(
        `UPDATE stock_requisitions
         SET purchase_order_id = $1, status = 'po_created', fulfillment_status = 'po_created'
         WHERE id = $2`,
        [poId, requisitionId]
      );

      await client.query('COMMIT');
      return NextResponse.json({ id: poId, transactionId }, { status: 201 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[purchase-orders from requisition]', err);
    return NextResponse.json({ error: err.message || 'Failed to create PO from requisition' }, { status: err.status || 500 });
  }
}
