import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/api-protection';
import { errorResponse } from '@/lib/api-response';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensurePurchaseOrderEditRequestsTable } from '@/lib/purchaseOrderEditApprovals';

async function resolveRequestId(params) {
  const resolvedParams = await params;
  const requestId = Number(resolvedParams?.id);
  return Number.isFinite(requestId) && requestId > 0 ? requestId : null;
}

export async function PATCH(request, { params }) {
  try {
    await ensurePurchaseOrderSchema();
    await ensurePurchaseOrderEditRequestsTable();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const roleCheck = requireRole(auth.user, 'super_admin');
    if (roleCheck.error) return roleCheck.error;

    const requestId = await resolveRequestId(params);
    if (!requestId) {
      return NextResponse.json({ success: false, message: 'Invalid request id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim().toLowerCase();
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, message: 'Action must be approve or reject' }, { status: 400 });
    }

    const result = action === 'approve'
      ? await query(
          `UPDATE purchase_order_edit_requests
           SET status = 'approved',
               approved_by = $2,
               approved_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
             AND status = 'pending'
           RETURNING id, purchase_order_id, requested_by, status`,
          [requestId, auth.user.id]
        )
      : await query(
          `UPDATE purchase_order_edit_requests
           SET status = 'rejected',
               rejected_by = $2,
               rejected_at = NOW(),
               rejection_reason = $3,
               updated_at = NOW()
           WHERE id = $1
             AND status = 'pending'
           RETURNING id, purchase_order_id, requested_by, status`,
          [requestId, auth.user.id, body.reason || body.rejectionReason || null]
        );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pending purchase order edit request not found' },
        { status: 404 }
      );
    }

    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, status, details, created_at)
       VALUES ($1, $2, 'PURCHASE_ORDER_EDIT_REQUEST', $3, 'success', $4::jsonb, NOW())`,
      [
        auth.user.id,
        action === 'approve' ? 'PURCHASE_ORDER_EDIT_APPROVED' : 'PURCHASE_ORDER_EDIT_REJECTED',
        requestId,
        JSON.stringify({
          purchase_order_id: result.rows[0].purchase_order_id,
          requested_by: result.rows[0].requested_by,
        }),
      ]
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: action === 'approve'
        ? 'Purchase order edit request approved.'
        : 'Purchase order edit request rejected.',
      data: { request: result.rows[0] },
    });
  } catch (err) {
    console.error('[purchase-order edit-requests PATCH]', err.message);
    return errorResponse(err.message || 'Unable to update purchase order edit request');
  }
}
