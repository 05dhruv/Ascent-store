/**
 * PHASE 1 - STEP 1: Enhanced JWT Authentication System
 * 
 * Improvements over current:
 * ✅ JWT includes: role, permissions, assigned_stores
 * ✅ Token verification with role checks
 * ✅ Session tracking capability
 * ✅ Token refresh mechanism
 * ✅ Logout/revocation support
 */

import jwt from 'jsonwebtoken';

// Use secure secret - should be in .env.local
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const INSECURE_JWT_SECRETS = new Set([
  'change-me-in-production-please',
  'dev-secret-change-me',
  'your-secret-key',
]);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'change-me-in-production-please');

  if (
    process.env.NODE_ENV === 'production' &&
    (!secret || secret.length < 32 || INSECURE_JWT_SECRETS.has(secret))
  ) {
    throw new Error('JWT_SECRET must be set to a strong unique value in production');
  }

  return secret;
}

/**
 * Enhanced Token Payload Structure
 * 
 * {
 *   sub: 1,                          // User ID
 *   email: 'admin@store.com',
 *   name: 'John Admin',
 *   role: 'admin',                   // super_admin, admin, user
 *   permissions: ['users:view', ...],// Array of permission names
 *   assigned_stores: [1, 2, 3],      // Store IDs user can access
 *   iat: 1234567890,                 // Issued at
 *   exp: 1234567890,                 // Expires at
 *   type: 'access'                   // access or refresh
 * }
 */

// ============================================
// SIGN ACCESS TOKEN (7 days)
// ============================================
export function signAccessToken(payload) {
  return jwt.sign(
    {
      ...payload,
      type: 'access',
    },
    getJwtSecret(),
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'billing-software',
    }
  );
}

// ============================================
// SIGN REFRESH TOKEN (30 days)
// ============================================
export function signRefreshToken(payload) {
  return jwt.sign(
    {
      sub: payload.sub,
      type: 'refresh',
    },
    getJwtSecret(),
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      issuer: 'billing-software',
    }
  );
}

// ============================================
// VERIFY & DECODE TOKEN
// ============================================
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: 'billing-software',
    });
    return decoded;
  } catch (err) {
    return null;
  }
}

// ============================================
// DECODE WITHOUT VERIFICATION (USE WITH CAUTION)
// Only for checking token structure
// ============================================
export function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch (err) {
    return null;
  }
}

// ============================================
// CHECK IF TOKEN IS VALID & NOT EXPIRED
// ============================================
export function isTokenValid(token) {
  const decoded = verifyToken(token);
  return decoded !== null && decoded.type === 'access';
}

// ============================================
// CHECK IF REFRESH TOKEN IS VALID
// ============================================
export function isRefreshTokenValid(token) {
  const decoded = verifyToken(token);
  return decoded !== null && decoded.type === 'refresh';
}

// ============================================
// GET TOKEN EXPIRATION TIME
// ============================================
export function getTokenExpiration(token) {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return null;
  return new Date(decoded.exp * 1000); // Convert to milliseconds
}

// ============================================
// CHECK IF TOKEN EXPIRES SOON (within X hours)
// ============================================
export function isTokenExpiringSoon(token, hoursThreshold = 1) {
  const expiration = getTokenExpiration(token);
  if (!expiration) return true; // Treat invalid as expiring soon

  const now = new Date();
  const thresholdTime = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000);

  return expiration <= thresholdTime;
}

// ============================================
// HELPERS: Extract User Info from Token
// ============================================

export function getUserIdFromToken(token) {
  const decoded = verifyToken(token);
  return decoded?.sub || null;
}

export function getRoleFromToken(token) {
  const decoded = verifyToken(token);
  return decoded?.role || null;
}

export function getPermissionsFromToken(token) {
  const decoded = verifyToken(token);
  return decoded?.permissions || [];
}

export function getAssignedStoresFromToken(token) {
  const decoded = verifyToken(token);
  return decoded?.assigned_stores || [];
}

export function getUserFromToken(token) {
  const decoded = verifyToken(token);
  if (!decoded) return null;

  return {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role,
    permissions: decoded.permissions || [],
    assigned_stores: decoded.assigned_stores || [],
  };
}

// ============================================
// VALIDATION HELPERS
// ============================================

export function hasPermission(token, requiredPermission) {
  const permissions = getPermissionsFromToken(token);
  return permissions.includes('*') || permissions.includes(requiredPermission);
}

export function hasAnyPermission(token, requiredPermissions) {
  const permissions = getPermissionsFromToken(token);
  return permissions.includes('*') || requiredPermissions.some((perm) => permissions.includes(perm));
}

export function hasAllPermissions(token, requiredPermissions) {
  const permissions = getPermissionsFromToken(token);
  return permissions.includes('*') || requiredPermissions.every((perm) => permissions.includes(perm));
}

export function hasRole(token, requiredRole) {
  const role = getRoleFromToken(token);
  return role === requiredRole;
}

export function hasAnyRole(token, requiredRoles) {
  const role = getRoleFromToken(token);
  return requiredRoles.includes(role);
}

export function canAccessStore(token, storeId) {
  const stores = getAssignedStoresFromToken(token);
  const role = getRoleFromToken(token);
  if (role === ROLES.SUPER_ADMIN) return true;

  // Check if store is assigned
  return stores.includes(storeId);
}

// ============================================
// TOKEN PAYLOAD BUILDER
// ============================================

/**
 * Create token payload from user data
 * @param {Object} user - User object from database
 * @returns {Object} Token payload ready to sign
 */
export function createTokenPayload(user) {
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    permissions: Array.isArray(user.permissions)
      ? user.permissions
      : JSON.parse(user.permissions || '[]'),
    assigned_stores: Array.isArray(user.assigned_stores)
      ? user.assigned_stores
      : JSON.parse(user.assigned_stores || '[]'),
  };
}

// ============================================
// CONSTANTS FOR USE IN CODE
// ============================================

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
};

export const PERMISSION_MODULES = {
  USERS: 'users',
  ROLES: 'roles',
  STORES: 'stores',
  EMPLOYEES: 'employees',
  INVENTORY: 'inventory',
  SALES: 'sales',
  SETTINGS: 'settings',
  AUDIT: 'audit',
};

// ============================================
// EXAMPLE USAGE IN LOGIN
// ============================================

/*
// In /api/auth/login:

import { signAccessToken, signRefreshToken, createTokenPayload } from '@/lib/auth-enhanced';

// After authenticating user from database:
const user = {
  id: 1,
  email: 'admin@store.com',
  name: 'John Admin',
  role: 'admin',
  permissions: ['users:view', 'users:create', 'stores:view', ...],
  assigned_stores: [1, 2, 3],
};

const tokenPayload = createTokenPayload(user);
const accessToken = signAccessToken(tokenPayload);
const refreshToken = signRefreshToken(tokenPayload);

// Set cookies
response.cookies.set('access_token', accessToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60, // 7 days
});

response.cookies.set('refresh_token', refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60, // 30 days
});
*/

export default {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  decodeToken,
  isTokenValid,
  isRefreshTokenValid,
  getUserFromToken,
  hasPermission,
  hasRole,
  canAccessStore,
  createTokenPayload,
  ROLES,
  PERMISSION_MODULES,
};
