import { NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensureStockRequisitionSchema } from '@/lib/stockRequisitionSchema';
import { ensureVendorsSchema } from '@/lib/vendorsSchema';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';
import { resolveVendorPaymentTerms } from '@/lib/vendorCreditTerms';
import { sendVendorPurchaseOrderRequirementEmail } from '@/lib/email';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request) {
  try {
    await Promise.allSettled([
      ensureVendorsSchema(),
      ensurePurchaseOrderSchema(),
      ensureStockRequisitionSchema(),
    ]);

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      'MANAGE_PURCHASE_ORDERS',
      'MANAGE_INVENTORY',
      'STOCK_REQUISITION_APPROVE',
      'STOCK_REQUISITION_CREATE'
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const requisitionId = body.requisitionId || body.requisition_id;
    const vendorId = body.vendorId || body.vendor_id || body.vendor;
    const sendEmail = body.sendEmail !== false && body.send_email !== false;
    const customVendorEmail = body.vendorEmail || body.vendor_email || body.email;

    if (!requisitionId) {
      return NextResponse.json({ error: 'Requisition is required' }, { status: 400 });
    }
    if (!vendorId) {
      return NextResponse.json({ error: 'Vendor is required' }, { status: 400 });
    }

    // 1. Fetch Requisition and Vendor details
    const reqRes = await query(
      `SELECT
        sr.id,
        sr.transaction_id,
        sr.source_id,
        sr.destination_id,
        sr.requested_by,
        sr.requested_by_user_id,
        sr.mail_to,
        sr.remarks,
        sr.approval_status,
        sr.purchase_order_id,
        s_dest.name AS destination_name,
        s_dest.address AS destination_address,
        s_src.name AS source_name
       FROM stock_requisitions sr
       LEFT JOIN stores s_dest ON s_dest.id = sr.destination_id
       LEFT JOIN stores s_src ON s_src.id = sr.source_id
       WHERE sr.id = $1`,
      [requisitionId]
    );
    if (!reqRes.rows.length) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    const requisition = reqRes.rows[0];

    const vendorRes = await query(
      `SELECT id, name, company, email, mobile_number, credit_days FROM vendors WHERE id = $1`,
      [vendorId]
    );
    if (!vendorRes.rows.length) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }
    const vendor = vendorRes.rows[0];
    const targetVendorEmail = (customVendorEmail || vendor.email || '').trim();

    // 2. Resolve items to be placed on PO (custom shortage items list or full requisition items)
    let poItems = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      poItems = body.items.map((item) => ({
        product_id: Number(item.productId || item.product_id),
        product_name: item.productName || item.product_name,
        qty: toNumber(item.qty || item.shortage_qty || item.shortageQty, 1),
        cost_price: toNumber(item.costPrice || item.cost_price, 0),
        unit: item.unit || 'PCS',
        dimensions: item.dimensions || '',
      })).filter((item) => item.product_id && item.qty > 0);
    } else {
      const itemsRes = await query(
        `SELECT
          sri.product_id,
          COALESCE(sri.product_name, p.name) AS product_name,
          sri.qty,
          COALESCE(sri.unit, p.unit, 'PCS') AS unit,
          COALESCE(sri.dimensions, p.dimensions, '') AS dimensions,
          COALESCE(NULLIF(sri.cost_price, 0), p.cost_price, 0) AS cost_price
         FROM stock_requisition_items sri
         LEFT JOIN products p ON p.id = sri.product_id
         WHERE sri.requisition_id = $1
         ORDER BY sri.id`,
        [requisitionId]
      );
      poItems = itemsRes.rows.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        qty: toNumber(row.qty, 1),
        cost_price: toNumber(row.cost_price, 0),
        unit: row.unit,
        dimensions: row.dimensions,
      }));
    }

    if (!poItems.length) {
      return NextResponse.json({ error: 'No shortage items provided for Purchase Order' }, { status: 400 });
    }

    const totalItems = poItems.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const totalCost = poItems.reduce((sum, item) => sum + toNumber(item.qty) * toNumber(item.cost_price), 0);
    const expectedDeliveryDate = body.expectedDeliveryDate || body.expected_delivery_date || null;
    const poRemarks = body.remarks || `Shortage PO generated for Site Request ${requisition.transaction_id}`;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const paymentTerms = await resolveVendorPaymentTerms(client, {
        vendorId,
        paymentDueDate: body.paymentDueDate || body.payment_due_date,
      });

      const poRes = await client.query(
        `INSERT INTO purchase_orders (
           destination_id,
           vendor_id,
           invoice_date,
           expected_delivery_date,
           payment_due_date,
           vendor_credit_days,
           shipment_mode,
           invoice_number,
           cc_emails,
           status,
           total_items,
           total_cost,
           total_tax,
           meta,
           created_at
         ) VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,0,$11::jsonb,NOW())
         RETURNING id`,
        [
          requisition.destination_id || requisition.source_id,
          vendorId,
          expectedDeliveryDate,
          paymentTerms.paymentDueDate,
          paymentTerms.creditDays,
          body.shipmentMode || body.shipment_mode || 'Direct Site Delivery',
          body.invoiceNumber || body.invoice_number || `REQ-${requisition.transaction_id}`,
          body.ccEmails || body.cc_emails || null,
          totalItems,
          totalCost,
          JSON.stringify({
            ...body,
            source: 'stock_requisition_shortage',
            requisitionId,
            requisitionTransactionId: requisition.transaction_id,
            siteName: requisition.destination_name,
            requestedBy: requisition.requested_by,
            vendorEmail: targetVendorEmail,
          }),
        ]
      );

      const poId = poRes.rows[0].id;
      const poTransactionId = `PO-${String(poId).padStart(4, '0')}`;
      await client.query('UPDATE purchase_orders SET transaction_id = $1 WHERE id = $2', [poTransactionId, poId]);

      for (const item of poItems) {
        await client.query(
          `INSERT INTO purchase_order_items (
             purchase_order_id,
             product_id,
             product_name,
             qty,
             cost_price,
             tax_value,
             created_at
           ) VALUES ($1,$2,$3,$4,$5,0,NOW())`,
          [poId, item.product_id, item.product_name, item.qty, item.cost_price]
        );
      }

      // Update Requisition status
      await client.query(
        `UPDATE stock_requisitions
         SET purchase_order_id = $1,
             vendor_id = $2,
             vendor_email = $3,
             status = 'po_created',
             fulfillment_status = 'po_created',
             total_shortage_qty = $4
         WHERE id = $5`,
        [poId, vendorId, targetVendorEmail, totalItems, requisitionId]
      );

      await client.query('COMMIT');

      // 3. Send automated Vendor Email Notification
      let emailResult = { sent: false };
      if (sendEmail && targetVendorEmail) {
        try {
          emailResult = await sendVendorPurchaseOrderRequirementEmail({
            vendorEmail: targetVendorEmail,
            vendorName: vendor.name,
            ccEmails: body.ccEmails || body.cc_emails || null,
            poNumber: poTransactionId,
            requisitionNumber: requisition.transaction_id,
            siteName: requisition.destination_name,
            deliveryAddress: requisition.destination_address,
            expectedDeliveryDate,
            requestedBy: requisition.requested_by,
            items: poItems,
            totalItems,
            totalCost,
            remarks: poRemarks,
          });

          if (emailResult.sent) {
            await query(
              `UPDATE stock_requisitions
               SET po_emailed_at = NOW(), email_message_id = $1
               WHERE id = $2`,
              [emailResult.messageId || 'sent', requisitionId]
            );
          }
        } catch (mailError) {
          console.error('[email notification error]', mailError);
        }
      }

      return NextResponse.json(
        {
          success: true,
          id: poId,
          transactionId: poTransactionId,
          emailSent: emailResult.sent,
          vendorEmail: targetVendorEmail,
          message: `Purchase Order ${poTransactionId} created successfully${targetVendorEmail ? ` and email sent to ${targetVendorEmail}` : ''}.`,
        },
        { status: 201 }
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[purchase-orders from requisition]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create PO from requisition' },
      { status: err.status || 500 }
    );
  }
}
