import { successResponse } from '@/lib/api-response';
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json(
    successResponse({}, 'Logged out successfully')
  );

  // Clear all auth cookies
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

  // Prevent caching
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  return response;
}
