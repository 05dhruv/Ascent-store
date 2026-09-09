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
    const search = String(searchParams.get('search') || '').trim();
    const requestedStoreId = Number(searchParams.get('storeId') || searchParams.get('store_id') || 0) || null;
    const dateFrom = String(searchParams.get('dateFrom') || searchParams.get('date_from') || '').trim();
    const dateTo = String(searchParams.get('dateTo') || searchParams.get('date_to') || '').trim();
    const params = [];
    const poFilters = ['po.vendor_id IS NOT NULL'];
    const returnFilters = ['pr.vendor_id IS NOT NULL'];
    const invoiceFilters = ['vi.vendor_id IS NOT NULL'];

    if (requestedStoreId) {
      if (auth.user.role !== 'super_admin' && !getAssignedStoreIds(auth.user).includes(requestedStoreId)) {
        return NextResponse.json({ error: 'You do not have access to this store' }, { status: 403 });
      }
      params.push(requestedStoreId);
      poFilters.push(`po.destination_id = $${params.length}`);
      returnFilters.push(`pr.store_id = $${params.length}`);
      invoiceFilters.push(`COALESCE(po.destination_id, si.destination_id) = $${params.length}`);
    } else if (auth.user.role !== 'super_admin') {
      const storeIds = getAssignedStoreIds(auth.user);
      if (!storeIds.length) {
        poFilters.push('1 = 0');
        returnFilters.push('1 = 0');
        invoiceFilters.push('1 = 0');
      } else {
        params.push(storeIds);
        poFilters.push(`po.destination_id = ANY($${params.length}::int[])`);
        returnFilters.push(`pr.store_id = ANY($${params.length}::int[])`);
        invoiceFilters.push(`COALESCE(po.destination_id, si.destination_id) = ANY($${params.length}::int[])`);
      }
    }

    if (dateFrom) {
      params.push(dateFrom);
      poFilters.push(`po.created_at::date >= $${params.length}::date`);
      returnFilters.push(`pr.return_date >= $${params.length}::date`);
      invoiceFilters.push(`vi.created_at::date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      poFilters.push(`po.created_at::date <= $${params.length}::date`);
      returnFilters.push(`pr.return_date <= $${params.length}::date`);
      invoiceFilters.push(`vi.created_at::date <= $${params.length}::date`);
    }
    if (search) params.push(`%${search}%`);

    const res = await query(
      `WITH po_stats AS (
         SELECT po.vendor_id,
                COUNT(*)::int AS po_count,
                COUNT(*) FILTER (WHERE po.status = 'confirmed')::int AS confirmed_po_count,
                COALESCE(SUM(po.total_cost), 0) AS purchase_value,
                AVG(EXTRACT(EPOCH FROM (COALESCE(si.confirmed_at, po.confirmed_at, po.created_at) - po.created_at)) / 86400.0) AS avg_lead_days
         FROM purchase_orders po
         LEFT JOIN stock_in si ON si.reference_type = 'purchase_order' AND si.reference_id::text = po.id::text
         WHERE ${poFilters.join(' AND ')}
         GROUP BY po.vendor_id
       ), return_stats AS (
         SELECT pr.vendor_id,
                COUNT(*)::int AS return_count,
                COALESCE(SUM(pr.total_amount), 0) AS return_value
         FROM purchase_returns pr
         WHERE ${returnFilters.join(' AND ')}
         GROUP BY pr.vendor_id
       ), invoice_stats AS (
         SELECT vi.vendor_id,
                COUNT(*)::int AS invoice_count,
                COALESCE(SUM(vi.total_amount), 0) AS invoice_value,
                COALESCE(SUM(vi.total_amount - vi.amount_paid), 0) AS outstanding
         FROM vendor_invoices vi
         LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
         LEFT JOIN stock_in si ON si.id = vi.stock_in_id
         WHERE ${invoiceFilters.join(' AND ')}
         GROUP BY vi.vendor_id
       )
       SELECT v.id,
              v.name,
              COALESCE(ps.po_count, 0) AS po_count,
              COALESCE(ps.confirmed_po_count, 0) AS confirmed_po_count,
              COALESCE(ps.purchase_value, 0) AS purchase_value,
              COALESCE(ps.avg_lead_days, 0) AS avg_lead_days,
              COALESCE(rs.return_count, 0) AS return_count,
              COALESCE(rs.return_value, 0) AS return_value,
              COALESCE(ins.invoice_count, 0) AS invoice_count,
              COALESCE(ins.invoice_value, 0) AS invoice_value,
              COALESCE(ins.outstanding, 0) AS outstanding
       FROM vendors v
       LEFT JOIN po_stats ps ON ps.vendor_id = v.id
       LEFT JOIN return_stats rs ON rs.vendor_id = v.id
       LEFT JOIN invoice_stats ins ON ins.vendor_id = v.id
       ${search ? `WHERE v.name ILIKE $${params.length}` : ''}
       ORDER BY purchase_value DESC, v.name ASC
       LIMIT 500`,
      params
    );

    return NextResponse.json(res.rows.map((row) => {
      const poCount = Number(row.po_count || 0);
      const returnRate = poCount ? Number(row.return_count || 0) / poCount : 0;
      const leadDays = Number(row.avg_lead_days || 0);
      const outstanding = Number(row.outstanding || 0);
      const invoiceValue = Number(row.invoice_value || 0);
      const paymentRisk = invoiceValue ? outstanding / invoiceValue : 0;
      const score = Math.max(0, Math.min(100, Math.round(100 - returnRate * 25 - Math.max(0, leadDays - 3) * 2 - paymentRisk * 10)));
      return {
        vendorId: row.id,
        vendorName: row.name || '-',
        poCount,
        confirmedPoCount: Number(row.confirmed_po_count || 0),
        purchaseValue: Number(row.purchase_value || 0),
        avgLeadDays: Number(leadDays.toFixed(1)),
        returnCount: Number(row.return_count || 0),
        returnValue: Number(row.return_value || 0),
        invoiceValue,
        outstanding,
        score,
        grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D',
      };
    }));
  } catch (err) {
    console.error('[vendor performance GET]', err.message);
    return NextResponse.json([], { status: 200 });
  }
}
