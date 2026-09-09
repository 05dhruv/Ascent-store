import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/api-protection';
import { errorResponse } from '@/lib/api-response';
import { ensurePasswordChangeRequestsTable } from '@/lib/passwordChangeRequests';
import { ensureUsersTable } from '@/lib/userAuth';
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    await ensureUsersTable();
    await ensurePasswordChangeRequestsTable();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const roleCheck = requireRole(auth.user, 'super_admin');
    if (roleCheck.error) return roleCheck.error;

    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get('status') || 'pending').toLowerCase();
    const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'applied', 'all']);

    const params = [];
    const where = [];
    if (allowedStatuses.has(status) && status !== 'all') {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    } else if (!allowedStatuses.has(status)) {
      params.push('pending');
      where.push(`p.status = $${params.length}`);
    }

    const result = await query(
      `SELECT p.id,
              p.user_id,
              p.status,
              p.requested_at,
              p.approved_at,
              p.rejected_at,
              p.effective_at,
              p.applied_at,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (p.effective_at - NOW()))))::int AS seconds_remaining,
              u.name AS user_name,
              u.email AS user_email,
              e.username,
              e.first_name,
              e.last_name,
              e.role_name
       FROM password_change_requests p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employees e ON e.user_id = u.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY p.requested_at DESC, p.id DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ success: true, data: { requests: result.rows } });
  } catch (err) {
    console.error('[password-change-requests GET]', err.message);
    return errorResponse(err.message || 'Unable to fetch password requests');
  }
}
