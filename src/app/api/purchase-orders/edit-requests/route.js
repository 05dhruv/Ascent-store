import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/api-protection';
import { errorResponse } from '@/lib/api-response';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensurePurchaseOrderEditRequestsTable } from '@/lib/purchaseOrderEditApprovals';

export async function GET(request) {
  try {
    await ensurePurchaseOrderSchema();
    await ensurePurchaseOrderEditRequestsTable();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const roleCheck = requireRole(auth.user, 'super_admin');
    if (roleCheck.error) return roleCheck.error;

    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get('status') || 'pending').toLowerCase();
    const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'used', 'cancelled', 'all']);

    const params = [];
    const where = [];
    if (allowedStatuses.has(status) && status !== 'all') {
      params.push(status);
      where.push(`per.status = $${params.length}`);
    } else if (!allowedStatuses.has(status)) {
      params.push('pending');
      where.push(`per.status = $${params.length}`);
    }

    const result = await query(
      `SELECT per.id,
              per.purchase_order_id,
              per.requested_by,
              per.status,
              per.reason,
              per.requested_at,
              per.approved_at,
              per.rejected_at,
              po.transaction_id,
              po.created_at AS purchase_order_created_at,
              st.name AS destination_name,
              v.name AS vendor_name,
              u.name AS requested_by_name,
              u.email AS requested_by_email
       FROM purchase_order_edit_requests per
       JOIN purchase_orders po ON po.id = per.purchase_order_id
       LEFT JOIN stores st ON st.id = po.destination_id
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN users u ON u.id = per.requested_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY per.requested_at DESC, per.id DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ success: true, data: { requests: result.rows } });
  } catch (err) {
    console.error('[purchase-order edit-requests GET]', err.message);
    return errorResponse(err.message || 'Unable to fetch purchase order edit requests');
  }
}
