import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/api-protection';
import { errorResponse } from '@/lib/api-response';
import { ensurePasswordChangeRequestsTable } from '@/lib/passwordChangeRequests';
import { ensureUsersTable } from '@/lib/userAuth';
import { query } from '@/lib/db';

async function resolveRequestId(params) {
  const resolvedParams = await params;
  const requestId = Number(resolvedParams?.id);
  return Number.isFinite(requestId) && requestId > 0 ? requestId : null;
}

export async function PATCH(request, { params }) {
  try {
    await ensureUsersTable();
    await ensurePasswordChangeRequestsTable();

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
          `UPDATE password_change_requests
           SET status = 'approved',
               approved_by = $2,
               approved_at = NOW(),
               effective_at = NOW() + INTERVAL '5 minutes',
               updated_at = NOW()
           WHERE id = $1
             AND status = 'pending'
           RETURNING id, user_id, status, approved_at, effective_at`,
          [requestId, auth.user.id]
        )
      : await query(
          `UPDATE password_change_requests
           SET status = 'rejected',
               rejected_by = $2,
               rejected_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
             AND status = 'pending'
           RETURNING id, user_id, status, rejected_at`,
          [requestId, auth.user.id]
        );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pending password request not found' },
        { status: 404 }
      );
    }

    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, status, details, created_at)
       VALUES ($1, $2, 'AUTH', $3, 'success', $4::jsonb, NOW())`,
      [
        auth.user.id,
        action === 'approve' ? 'PASSWORD_CHANGE_APPROVED' : 'PASSWORD_CHANGE_REJECTED',
        requestId,
        JSON.stringify({ target_user_id: result.rows[0].user_id }),
      ]
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: action === 'approve'
        ? 'Password request approved. The employee will be logged out in 5 minutes.'
        : 'Password request rejected.',
      data: { request: result.rows[0] },
    });
  } catch (err) {
    console.error('[password-change-requests PATCH]', err.message);
    return errorResponse(err.message || 'Unable to update password request');
  }
}
