import { NextResponse } from 'next/server';
import { ensureUsersTable } from '@/lib/userAuth';
import { query } from '@/lib/db';
import { ensureRolesSchema } from '@/lib/rolesSchema';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

export async function GET(request) {
  try {
    await ensureUsersTable();
    await ensureRolesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_USERS', 'VIEW_USERS');
    if (permissionCheck.error) return permissionCheck.error;

    const res = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active,
              COALESCE(json_agg(us.store_id ORDER BY us.store_id) FILTER (WHERE us.store_id IS NOT NULL), '[]') AS assigned_stores
       FROM users u
       LEFT JOIN user_stores us ON us.user_id = u.id AND us.is_active = TRUE
       WHERE u.is_active = TRUE
       GROUP BY u.id
       ORDER BY u.name ASC, u.id ASC`
    );

    return NextResponse.json(
      res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        assignedStores: row.assigned_stores || [],
      }))
    );
  } catch (err) {
    console.error('[auth users GET]', err.message);
    return NextResponse.json([]);
  }
}

export async function PUT(request) {
  try {
    await ensureUsersTable();
    await ensureRolesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_USERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const userId = Number(body.id || body.userId);
    const role = String(body.role || '').trim();
    const assignedStores = Array.isArray(body.assignedStores || body.assigned_stores)
      ? (body.assignedStores || body.assigned_stores).map(Number).filter(Number.isFinite)
      : [];

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 });
    }

    if (!['super_admin', 'admin', 'manager', 'user'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (auth.user.role !== 'super_admin' && role === 'super_admin') {
      return NextResponse.json({ error: 'Only Super Admin can assign Super Admin role' }, { status: 403 });
    }

    for (const storeId of assignedStores) {
      const storeCheck = requireStore(auth.user, storeId);
      if (storeCheck.error) return storeCheck.error;
    }

    await query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, userId]);
    await query('UPDATE user_stores SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1', [userId]);

    for (const storeId of assignedStores) {
      await query(
        `INSERT INTO user_stores (user_id, store_id, is_active, created_at, updated_at)
         VALUES ($1, $2, TRUE, NOW(), NOW())
         ON CONFLICT (user_id, store_id) DO UPDATE
         SET is_active = TRUE, updated_at = NOW()`,
        [userId, storeId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth users PUT]', err.message);
    return NextResponse.json({ error: 'Failed to update user access' }, { status: 500 });
  }
}
