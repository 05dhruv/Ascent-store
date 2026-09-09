import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureProcurementSchema } from '@/lib/procurementSchema';
import { getAssignedStoreIds, requireAuth, requirePermission } from '@/lib/api-protection';

export async function GET(request) {
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS', 'MANAGE_VENDORS');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const vendorId = Number(searchParams.get('vendorId') || searchParams.get('vendor_id') || 0) || null;
    const search = String(searchParams.get('search') || '').trim();
    const dateFrom = String(searchParams.get('dateFrom') || searchParams.get('date_from') || '').trim();
    const dateTo = String(searchParams.get('dateTo') || searchParams.get('date_to') || '').trim();
    const params = [];
    const filters = [];

    if (vendorId) {
      params.push(vendorId);
      filters.push(`ledger.vendor_id = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      filters.push(`ledger.entry_at::date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      filters.push(`ledger.entry_at::date <= $${params.length}::date`);
    }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(
        COALESCE(ledger.transaction_id, '') ILIKE $${params.length}
        OR COALESCE(ledger.vendor_name, '') ILIKE $${params.length}
        OR COALESCE(ledger.reference_no, '') ILIKE $${params.length}
        OR COALESCE(ledger.remarks, '') ILIKE $${params.length}
      )`);
    }
    if (auth.user.role !== 'super_admin') {
      const storeIds = getAssignedStoreIds(auth.user);
      if (!storeIds.length) filters.push('1 = 0');
      else {
        params.push(storeIds);
        filters.push(`(ledger.store_id IS NULL OR ledger.store_id = ANY($${params.length}::int[]))`);
      }
    }

    const res = await query(
      `WITH ledger AS (
         SELECT vi.created_at AS entry_at,
                vi.vendor_id,
                v.name AS vendor_name,
                COALESCE(po.destination_id, si.destination_id) AS store_id,
                vi.transaction_id,
                vi.invoice_number AS reference_no,
                'Invoice' AS entry_type,
                vi.total_amount AS debit,
                0::numeric AS credit,
                vi.remarks
         FROM vendor_invoices vi
         LEFT JOIN vendors v ON v.id = vi.vendor_id
         LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
         LEFT JOIN stock_in si ON si.id = vi.stock_in_id
         UNION ALL
         SELECT vis.created_at AS entry_at,
                vi.vendor_id,
                v.name AS vendor_name,
                COALESCE(po.destination_id, si.destination_id) AS store_id,
                vi.transaction_id,
                vis.reference_no,
                'Payment' AS entry_type,
                0::numeric AS debit,
                vis.amount AS credit,
                vis.remarks
         FROM vendor_invoice_settlements vis
         JOIN vendor_invoices vi ON vi.id = vis.vendor_invoice_id
         LEFT JOIN vendors v ON v.id = vi.vendor_id
         LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
         LEFT JOIN stock_in si ON si.id = vi.stock_in_id
         UNION ALL
         SELECT pr.created_at AS entry_at,
                pr.vendor_id,
                v.name AS vendor_name,
                pr.store_id,
                pr.transaction_id,
                pr.transaction_id AS reference_no,
                'Purchase Return' AS entry_type,
                0::numeric AS debit,
                pr.total_amount AS credit,
                pr.reason AS remarks
         FROM purchase_returns pr
         LEFT JOIN vendors v ON v.id = pr.vendor_id
       )
       SELECT ledger.*,
              SUM(debit - credit) OVER (PARTITION BY vendor_id ORDER BY entry_at, transaction_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
       FROM ledger
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY entry_at DESC
       LIMIT 1000`,
      params
    );

    return NextResponse.json(res.rows.map((row) => ({
      entryAt: row.entry_at,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name || '-',
      storeId: row.store_id,
      transactionId: row.transaction_id || '',
      referenceNo: row.reference_no || '',
      entryType: row.entry_type,
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      balance: Number(row.balance || 0),
      remarks: row.remarks || '',
    })));
  } catch (err) {
    console.error('[vendor ledger GET]', err.message);
    return NextResponse.json([], { status: 200 });
  }
}
