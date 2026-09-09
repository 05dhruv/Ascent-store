'use client';

import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { fetchAuthEndpoint } from '@/lib/auth-endpoints';

/**
 * UserContext - Global user state
 */
const UserContext = createContext(null);

async function parseJsonResponse(response, contextMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const preview = text.replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(
      `${contextMessage}: expected JSON response, received ${contentType || 'unknown content type'}${preview ? ` (${preview})` : ''}`
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${contextMessage}: invalid JSON response`);
  }
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUser = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetchAuthEndpoint('/api/auth/me');

      const json = await parseJsonResponse(res, 'Failed to fetch user');

      if (!res.ok || !json.success) {
        setUser(null);
        setError(json.message || 'Failed to fetch user');
        return;
      }

      setUser(json.data.user);
      setError(null);
    } catch (err) {
      console.error('[useUser] Error fetching user:', err);
      setUser(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await fetchAuthEndpoint('/api/auth/logout', { method: 'POST' });
      setUser(null);
      window.location.href = '/login';
    } catch (err) {
      console.error('[useUser] Logout error:', err);
    }
  }, []);

  const refetch = useCallback((silent = true) => {
    fetchUser(silent);
  }, [fetchUser]);

  return (
    <UserContext.Provider value={{ user, loading, error, logout, refetch }}>
      {children}
    </UserContext.Provider>
  );
}

/**
 * useUser() - Hook to access user data and functions
 * 
 * Usage:
 * const { user, loading, error, logout } = useUser();
 * 
 * if (loading) return <div>Loading...</div>;
 * if (!user) return <div>Not authenticated</div>;
 * 
 * return <div>Welcome, {user.name}!</div>;
 */
export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within <UserProvider>');
  }
  return context;
}

/**
 * useCanAccess() - Check if user has permission
 * 
 * Usage:
 * const canCreate = useCanAccess('users:create');
 * if (!canCreate) return null;
 */
export function useCanAccess(permission) {
  const { user } = useUser();
  
  if (!user) return false;
  
  // Super admin wildcard permission grants all access
  if (user.permissions?.includes('*')) return true;
  
  // Check if user has the permission
  return user.permissions?.includes(permission) || false;
}

/**
 * useHasRole() - Check if user has specific role
 * 
 * Usage:
 * const isAdmin = useHasRole('super_admin', 'admin');
 */
export function useHasRole(...roles) {
  const { user } = useUser();
  
  if (!user) return false;
  
  return roles.includes(user.role);
}

/**
 * useCanAccessStore() - Check if user can access store
 * 
 * Usage:
 * const canAccess = useCanAccessStore(storeId);
 */
export function useCanAccessStore(storeId) {
  const { user } = useUser();
  
  if (!user) return false;
  
  // Global wildcard permission grants access to all stores
  if (user.permissions?.includes('*')) return true;

  // Check if store is in assigned stores
  return user.assigned_stores?.includes(Number(storeId)) || false;
}
