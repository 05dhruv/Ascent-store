import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth-enhanced';
import { errorResponse } from '@/lib/api-response';
import { ensureUsersTable } from '@/lib/userAuth';
import {
  applyEffectivePasswordChange,
  ensurePasswordChangeRequestsTable,
  getLatestPasswordChangeRequest,
} from '@/lib/passwordChangeRequests';

function clearAuthCookies(response) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  };

  response.cookies.set('access_token', '', cookieOptions);
  response.cookies.set('refresh_token', '', cookieOptions);
  response.cookies.set('auth_token', '', cookieOptions);
  response.cookies.set('token', '', cookieOptions);
}

export async function GET() {
  try {
    await ensureUsersTable();
    await ensurePasswordChangeRequestsTable();

    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value || cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ success: true, data: { status: null } });
    }

    const payload = verifyToken(token);
    if (!payload?.sub) {
      return NextResponse.json({ success: true, data: { status: null } });
    }

    let request = await getLatestPasswordChangeRequest(payload.sub);
    if (!request) {
      return NextResponse.json({ success: true, data: { status: null } });
    }

    if (request.status === 'approved' && Number(request.seconds_remaining || 0) <= 0) {
      await applyEffectivePasswordChange(payload.sub);
      const response = NextResponse.json({
        success: true,
        data: {
          status: 'applied',
          forceLogout: true,
          message: 'Your new password is active. Please login again with the new password.',
        },
      });
      clearAuthCookies(response);
      return response;
    }

    return NextResponse.json({
      success: true,
      data: {
        status: request.status,
        effectiveAt: request.effective_at,
        secondsRemaining: Number(request.seconds_remaining || 0),
      },
    });
  } catch (err) {
    console.error('[password-change-status GET]', err.message);
    return errorResponse(err.message || 'Unable to fetch password change status');
  }
}
