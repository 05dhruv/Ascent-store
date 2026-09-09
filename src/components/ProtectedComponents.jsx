'use client';

import { useCanAccess, useHasRole, useCanAccessStore } from '@/hooks/useUser';

/**
 * ProtectedButton - Button that disables if user lacks permission
 * 
 * Usage:
 * <ProtectedButton permission="users:create" onClick={handleCreate}>
 *   Create User
 * </ProtectedButton>
 */
export function ProtectedButton({
  permission,
  role,
  storeId,
  onClick,
  children,
  className = '',
  ...props
}) {
  const canAccessPermission = permission ? useCanAccess(permission) : true;
  const canAccessRole = role ? useHasRole(role) : true;
  const canAccessStoreData = storeId ? useCanAccessStore(storeId) : true;

  const isDisabled = !canAccessPermission || !canAccessRole || !canAccessStoreData;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`${className} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={
        isDisabled
          ? permission
            ? `Requires permission: ${permission}`
            : role
            ? `Requires role: ${role}`
            : 'Access denied'
          : ''
      }
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * ProtectedDiv - Container that only renders if user has access
 * 
 * Usage:
 * <ProtectedDiv permission="users:edit">
 *   <EditUserForm />
 * </ProtectedDiv>
 */
export function ProtectedDiv({
  permission,
  role,
  storeId,
  children,
  fallback = null,
}) {
  const canAccessPermission = permission ? useCanAccess(permission) : true;
  const canAccessRole = role ? useHasRole(role) : true;
  const canAccessStoreData = storeId ? useCanAccessStore(storeId) : true;

  const hasAccess = canAccessPermission && canAccessRole && canAccessStoreData;

  return hasAccess ? <>{children}</> : fallback;
}

/**
 * ProtectedMenuItem - Menu item that hides if user lacks permission
 * 
 * Usage:
 * <ProtectedMenuItem permission="users:view">
 *   <a href="/users">Users</a>
 * </ProtectedMenuItem>
 */
export function ProtectedMenuItem({ permission, role, children, fallback = null }) {
  const canAccessPermission = permission ? useCanAccess(permission) : true;
  const canAccessRole = role ? useHasRole(role) : true;

  const hasAccess = canAccessPermission && canAccessRole;

  return hasAccess ? <>{children}</> : fallback;
}

/**
 * RoleBasedRenderer - Render different content based on role
 * 
 * Usage:
 * <RoleBasedRenderer
 *   superAdmin={<SuperAdminPanel />}
 *   admin={<AdminPanel />}
 *   user={<UserPanel />}
 *   fallback={<div>No access</div>}
 * />
 */
export function RoleBasedRenderer({
  superAdmin,
  admin,
  storeAdmin,
  manager,
  user,
  fallback = null,
}) {
  const userRole = useHasRole('super_admin') ? 'super_admin' : 
                   useHasRole('admin') ? 'admin' : 
                   useHasRole('store_admin') ? 'store_admin' :
                   useHasRole('manager') ? 'manager' : 'user';

  const componentMap = {
    super_admin: superAdmin,
    admin: admin,
    store_admin: storeAdmin,
    manager: manager,
    user: user,
  };

  return componentMap[userRole] || fallback;
}
