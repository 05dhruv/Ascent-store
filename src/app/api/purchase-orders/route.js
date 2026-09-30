import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { ensureVendorsSchema } from '@/lib/vendorsSchema';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { appendStoreScope, auditLog, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';
import { resolveVendorPaymentTerms } from '@/lib/vendorCreditTerms';
import { assertWithinApprovalLimit } from '@/lib/approvalLimits';
import { successResponse } from '@/lib/api-response';
import { getPagination, limitOffsetSql, pagedPayload, spreadsheetResponse } from '@/lib/pagination';

function mapRow(row, { hideTransactionCost = false } = {}) {
  return {
    id: row.id,
    transactionId: row.transaction_id || `PO-${String(row.id).padStart(4, '0')}`,
    destinationId: row.destination_id,
    destinationName: row.destination_name || '—',
    vendorId: row.vendor_id,
    vendorName: row.vendor_name || '—',
    invoiceDate: row.invoice_date,
    expectedDeliveryDate: row.expected_delivery_date,
    paymentDueDate: row.payment_due_date,
    vendorCreditDays: row.vendor_credit_days == null ? null : Number(row.vendor_credit_days),
    shipmentMode: row.shipment_mode || '—',
    invoiceNumber: row.invoice_number || '—',
    ccEmails: row.cc_emails || '',
    status: row.status || 'draft',
    totalItems: Number(row.total_items || 0),
    totalCost: hideTransactionCost ? null : Number(row.total_cost || 0),
    totalTax: Number(row.total_tax || 0),
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

export async function GET(request) {
  try {
    await ensureStockInSchema();
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_PURCHASE_ORDERS', 'MANAGE_PURCHASE_ORDERS', 'CREATE_STORE_PURCHASE_ORDER', 'MANAGE_VENDORS');
    if (permissionCheck.error) return permissionCheck.error;

    const where = [];
    const params = [];
    const scope = appendStoreScope(where, params, 'po.destination_id', auth.user);
    if (scope.error) return scope.error;
    const storeOnlyCreator = auth.user.permissions?.includes('CREATE_STORE_PURCHASE_ORDER')
      && !auth.user.permissions?.some((permission) => ['MANAGE_PURCHASE_ORDERS', 'MANAGE_VENDORS', '*'].includes(permission));

    const sp = new URL(request.url).searchParams;
    const pagination = getPagination(sp, { legacyLimit: 200 });
    const search = String(sp.get('search') || '').trim();
    const destinationId = sp.get('destinationId');
    const vendorId = sp.get('vendorId');
    const status = String(sp.get('status') || '').trim().toLowerCase();
    const dateFrom = sp.get('dateFrom');
    const dateTo = sp.get('dateTo');
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      where.push(`(po.id::text ILIKE ${p} OR po.transaction_id ILIKE ${p} OR st.name ILIKE ${p}
        OR v.name ILIKE ${p} OR po.invoice_number ILIKE ${p} OR po.shipment_mode ILIKE ${p} OR po.status ILIKE ${p})`);
    }
    if (destinationId && destinationId !== 'all') {
      params.push(String(destinationId));
      where.push(`po.destination_id::text = $${params.length}`);
    }
    if (vendorId && vendorId !== 'all') {
      params.push(String(vendorId));
      where.push(`po.vendor_id::text = $${params.length}`);
    }
    if (status && status !== 'all') {
      params.push(status);
      where.push(`LOWER(COALESCE(po.status, 'draft')) = $${params.length}`);
    }
    const activityDate = 'COALESCE(po.confirmed_at, po.created_at, po.invoice_date::timestamp)';
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`${activityDate} >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`${activityDate} < ($${params.length}::date + INTERVAL '1 day')`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const res = await query(
      `SELECT po.id, po.transaction_id, po.destination_id, po.vendor_id, po.invoice_date, po.expected_delivery_date,
              po.payment_due_date, po.vendor_credit_days,
              po.shipment_mode, po.invoice_number, po.cc_emails, po.status, po.total_items, po.total_cost, po.total_tax,
              po.created_at, po.confirmed_at,
              st.name AS destination_name,
              v.name AS vendor_name,
              COUNT(*) OVER() AS __total
       FROM purchase_orders po
       LEFT JOIN stores st ON st.id = po.destination_id
       LEFT JOIN vendors v ON v.id = po.vendor_id
       ${whereSql}
       ORDER BY po.confirmed_at DESC NULLS LAST, po.created_at DESC
       ${limitOffsetSql(pagination, params)}`,
      params
    );

    const mapped = res.rows.map((row) => ({
      ...mapRow(row, { hideTransactionCost: storeOnlyCreator }),
      __total: row.__total,
    }));

    if (pagination.isExport) {
      return spreadsheetResponse(mapped, {
        filename: 'purchase_orders',
        format: pagination.format,
        sheetName: 'Purchase Orders',
        columns: [
          { key: 'transactionId', label: 'Purchase Order ID' },
          { key: 'destinationName', label: 'Destination Name' },
          { key: 'vendorName', label: 'Vendor Name' },
          { key: 'invoiceNumber', label: 'Invoice Number' },
          { key: 'invoiceDate', label: 'Invoice Date' },
          { key: 'expectedDeliveryDate', label: 'Expected Delivery Date' },
          { key: 'paymentDueDate', label: 'Payment Due Date' },
          { key: 'shipmentMode', label: 'Shipment Mode' },
          { key: 'totalItems', label: 'Total Items' },
          ...(storeOnlyCreator ? [] : [{ key: 'totalCost', label: 'Total Cost' }]),
          { key: 'totalTax', label: 'Total Tax' },
          { key: 'status', label: 'Status' },
          { key: 'createdAt', label: 'Created At' },
          { key: 'confirmedAt', label: 'Confirmed At' },
        ],
      });
    }
    if (pagination.paged) {
      return successResponse(pagedPayload(mapped, pagination));
    }
    return NextResponse.json(mapped.map(({ __total, ...row }) => row));
  } catch (err) {
    console.error('[purchase-orders GET]', err.message);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  try {
    await ensureStockInSchema();
    await ensureVendorsSchema();
    await ensurePurchaseOrderSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS', 'CREATE_STORE_PURCHASE_ORDER');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const destinationId = body.destination || body.destinationId || null;
    const vendorId = body.vendor || body.vendorId || null;

    if (!destinationId) {
      return NextResponse.json({ error: 'Destination is required' }, { status: 400 });
    }
    if (!vendorId) {
      return NextResponse.json({ error: 'Vendor is required' }, { status: 400 });
    }
    const storeCheck = requireStore(auth.user, destinationId);
    if (storeCheck.error) return storeCheck.error;

    const declaredAmount = Number(
      body.totalCost ??
        body.total_cost ??
        body.declaredAmount ??
        (Array.isArray(body.items)
          ? body.items.reduce(
              (sum, item) =>
                sum +
                Number(item.qty || item.quantity || 0) *
                  Number(item.cost_price || item.costPrice || item.rate || 0),
              0,
            )
          : 0),
    );
    if (declaredAmount > 0) {
      try {
        await assertWithinApprovalLimit(
          auth.user,
          'QC_APPROVE',
          declaredAmount,
        );
      } catch (limitError) {
        return NextResponse.json({ error: limitError.message }, { status: 403 });
      }
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const paymentTerms = await resolveVendorPaymentTerms(client, {
        vendorId,
        paymentDueDate: body.payment_due_date || body.paymentDueDate,
      });
      const res = await client.query(
        `INSERT INTO purchase_orders (
          destination_id, vendor_id, invoice_date, expected_delivery_date,
          payment_due_date, vendor_credit_days, shipment_mode, invoice_number,
          cc_emails, status, meta, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,NOW())
        RETURNING id`,
        [
          destinationId,
          vendorId,
          body.invoice_date || null,
          body.expected_delivery_date || null,
          paymentTerms.paymentDueDate,
          paymentTerms.creditDays,
          body.shipment_mode || null,
          body.invoice_number || null,
          body.cc_emails || null,
          JSON.stringify(body),
        ]
      );

      const id = res.rows[0].id;
      const transactionId = `PO-${String(id).padStart(4, '0')}`;
      await client.query('UPDATE purchase_orders SET transaction_id = $1 WHERE id = $2', [transactionId, id]);
      await client.query('COMMIT');
      await auditLog(auth.user.id, 'purchase_order.create', 'purchase_order', id, {
        transactionId,
        destinationId,
        vendorId,
      });
      return NextResponse.json({ id, transactionId }, { status: 201 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[purchase-orders POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to create purchase order' }, { status: err.status || 500 });
  }
}
