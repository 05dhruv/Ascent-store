import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';

function parseRecordId(value) {
  const match = String(value || '').trim().match(/^(SO|POS)-(\d+)$/i);
  return match ? { source: match[1].toUpperCase(), id: Number(match[2]) } : null;
}

async function loadBillDetails(billId) {
  if (!billId) return { items: [], payments: [] };
  const [items, payments] = await Promise.all([
    query('SELECT * FROM sales_bill_items WHERE sales_bill_id = $1 ORDER BY id', [billId]),
    query('SELECT * FROM sales_bill_payments WHERE sales_bill_id = $1 ORDER BY id', [billId]),
  ]);
  return { items: items.rows, payments: payments.rows };
}

export async function GET(request, { params }) {
  try {
    await Promise.all([ensureInvoiceSalesOrdersSchema(), ensureSalesBillingSchema()]);

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_SALES', 'MANAGE_SALES', 'MANAGE_POS');
    if (permissionCheck.error) return permissionCheck.error;

    const { id: routeId } = await params;
    const recordId = parseRecordId(routeId);
    if (!recordId) {
      return NextResponse.json({ error: 'Invalid invoice record' }, { status: 400 });
    }

    if (recordId.source === 'POS') {
      const result = await query(
        `SELECT sb.*, s.name AS store_name, u.name AS billing_username
           FROM sales_bills sb
           LEFT JOIN stores s ON s.id = sb.store_id
           LEFT JOIN users u ON u.id = sb.user_id
          WHERE sb.id = $1`,
        [recordId.id],
      );
      const record = result.rows[0];
      if (!record) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

      const storeCheck = requireStore(auth.user, record.store_id);
      if (storeCheck.error) return storeCheck.error;
      const details = await loadBillDetails(record.id);
      return NextResponse.json({ record: { ...record, source: 'sales_bill' }, ...details });
    }

    const result = await query(
      `SELECT iso.*, s.name AS store_name, COALESCE(iso.billing_username, u.name) AS billing_username
         FROM invoice_sales_orders iso
         LEFT JOIN stores s ON s.id = iso.store_id
         LEFT JOIN users u ON u.id = iso.billing_user_id
        WHERE iso.id = $1`,
      [recordId.id],
    );
    const record = result.rows[0];
    if (!record) return NextResponse.json({ error: 'Sales order not found' }, { status: 404 });

    const storeCheck = requireStore(auth.user, record.store_id);
    if (storeCheck.error) return storeCheck.error;
    const details = await loadBillDetails(record.sales_bill_id);
    const metaItems = Array.isArray(record.meta?.items) ? record.meta.items : [];
    return NextResponse.json({
      record: { ...record, source: 'sales_order' },
      items: details.items.length ? details.items : metaItems,
      payments: details.payments,
    });
  } catch (error) {
    console.error('[invoice sales order detail GET]', error.message);
    return NextResponse.json({ error: error.message || 'Failed to load invoice details' }, { status: 500 });
  }
}
