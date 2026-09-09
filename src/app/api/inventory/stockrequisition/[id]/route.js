import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensureStockRequisitionSchema } from '@/lib/stockRequisitionSchema';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

export async function PATCH(request, { params }) {
  try {
    await ensurePurchaseOrderSchema();
    await ensureStockRequisitionSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'MANAGE_STOCK_REQUISITION', 'MANAGE_INVENTORY');
    if (permissionCheck.error) return permissionCheck.error;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').toLowerCase();

    const reqRes = await query('SELECT id, destination_id, requested_by_user_id, approval_status, fulfillment_status FROM stock_requisitions WHERE id = $1', [id]);
    if (!reqRes.rows.length) return NextResponse.json({ success: false, message: 'Requisition not found' }, { status: 404 });

    const storeCheck = requireStore(auth.user, reqRes.rows[0].destination_id);
    if (storeCheck.error) return storeCheck.error;

    if (action === 'approve') {
      await query(
        `UPDATE stock_requisitions
         SET approval_status = 'approved',
             status = 'approved',
             approved_by_user_id = $2,
             approved_at = NOW()
         WHERE id = $1`,
        [id, auth.user.id]
      );
    } else if (action === 'reject') {
      await query(
        `UPDATE stock_requisitions
         SET approval_status = 'rejected',
             status = 'rejected',
             rejected_at = NOW(),
             rejection_reason = $2
         WHERE id = $1`,
        [id, body.reason || body.rejectionReason || null]
      );
    } else if (action === 'fulfill') {
      await query(
        `UPDATE stock_requisitions
         SET fulfillment_status = 'completed', status = 'fulfilled', fulfilled_at = NOW()
         WHERE id = $1`,
        [id]
      );
    } else {
      return NextResponse.json({ success: false, message: 'Unsupported action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[stockrequisition PATCH]', err);
    return NextResponse.json({ success: false, message: err.message || 'Failed to update requisition' }, { status: 500 });
  }
}
