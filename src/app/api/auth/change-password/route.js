import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { errorResponse, successResponse, validationError } from '@/lib/api-response';
import { verifyToken } from '@/lib/auth-enhanced';
import { ensureUsersTable } from '@/lib/userAuth';
import { query } from '@/lib/db';
import { ensurePasswordChangeRequestsTable } from '@/lib/passwordChangeRequests';

export async function POST(request) {
  try {
    await ensureUsersTable();
    await ensurePasswordChangeRequestsTable();

    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value || cookieStore.get('auth_token')?.value;

    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return errorResponse('Unauthorized', 401);
    }

    if (!payload?.sub) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const currentPassword = body?.currentPassword || '';
    const newPassword = body?.newPassword || '';
    const confirmPassword = body?.confirmPassword || '';

    const errors = {};
    if (!currentPassword) errors.currentPassword = 'Current password is required';
    if (!newPassword) errors.newPassword = 'New password is required';
    if (newPassword && newPassword.length < 8) errors.newPassword = 'New password must be at least 8 characters';
    if (newPassword !== confirmPassword) errors.confirmPassword = 'New passwords do not match';

    if (Object.keys(errors).length) {
      return validationError(errors);
    }

    const userResult = await query(
      `SELECT id, password_hash, is_active FROM users WHERE id = $1 LIMIT 1`,
      [payload.sub]
    );
    const user = userResult.rows[0];

    if (!user || !user.is_active) {
      return errorResponse('Unauthorized', 401);
    }

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      return validationError({ currentPassword: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await query(
      `INSERT INTO password_change_requests (
         user_id,
         requested_password_hash,
         status,
         requested_at,
         created_at,
         updated_at
       )
       VALUES ($1, $2, 'pending', NOW(), NOW(), NOW())
       ON CONFLICT (user_id) WHERE status = 'pending'
       DO UPDATE SET
         requested_password_hash = EXCLUDED.requested_password_hash,
         requested_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [user.id, newHash]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, status, details, created_at)
       VALUES ($1, 'PASSWORD_CHANGE_REQUESTED', 'AUTH', 'success', $2::jsonb, NOW())`,
      [user.id, JSON.stringify({ requested_by: user.id })]
    ).catch(() => {});

    return successResponse(
      { status: 'pending' },
      'Password change request sent to Super Admin for approval'
    );
  } catch (err) {
    return errorResponse(err.message || 'Unable to change password');
  }
}
