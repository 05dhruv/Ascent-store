import { NextResponse } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/login', '/sales-order/pos'];
// Path prefixes that are always public (no token needed)
const publicPrefixes = ['/invoice/'];
const publicApiRoutes = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
];
const publicApiPrefixes = ['/api/invoice/', '/api/public/'];

function isPublicApi(pathname) {
  return publicApiRoutes.includes(pathname) || publicApiPrefixes.some((p) => pathname.startsWith(p));
}

function unauthorizedApiResponse() {
  return NextResponse.json(
    {
      success: false,
      message: 'Authentication required',
    },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

export function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get('access_token')?.value || 
                request.cookies.get('auth_token')?.value || 
                request.cookies.get('token')?.value;

  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname) || token) {
      return NextResponse.next();
    }

    return unauthorizedApiResponse();
  }

  // Allow public routes without token
  if (publicRoutes.includes(pathname) || publicPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Redirect to login if no token and route is protected
  if (!token && !publicRoutes.includes(pathname)) {
    // preserve original path so we can return after login
    const fullPath = pathname + (request.nextUrl.search || '');
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', fullPath);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Configure which routes to apply middleware to
export const config = {
  matcher: [
    // Match app routes and API routes, excluding static files and Next internals
    '/((?!_next|.*\\..*).*)',
  ],
};
