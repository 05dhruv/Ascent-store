import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensurePermissionsSchema } from '@/lib/permissionsSchema';
import { ensureEmployeesSchema } from '@/lib/employeesSchema';

function mapPermissionRow(row) {
  return {
    id: row.id,
    permissionForOrg: row.permission_for_org,
    permissionForInterface: row.permission_for_interface,
    permissionName: row.permission_name,
    displayName: row.display_name || '',
    description: row.description || '',
    userCount: Number(row.user_count || 0),
    createdAt: row.created_at,
  };
}

export async function GET() {
  try {
    await ensurePermissionsSchema();
    await ensureEmployeesSchema();

    const res = await query(
      `SELECT p.id,
              p.permission_for_org,
              p.permission_for_interface,
              p.permission_name,
              p.display_name,
              p.description,
              p.created_at,
              COUNT(e.id)::int AS user_count
       FROM permissions p
       LEFT JOIN employees e ON e.permissions @> jsonb_build_array(p.permission_name)
       GROUP BY p.id, p.permission_for_org, p.permission_for_interface, p.permission_name, p.display_name, p.description, p.created_at
       ORDER BY p.permission_name ASC`
    );

    return NextResponse.json(res.rows.map(mapPermissionRow));
  } catch (err) {
    console.error('[employee permissions GET]', err.message);
    return NextResponse.json([]);
  }
}

export default null;
