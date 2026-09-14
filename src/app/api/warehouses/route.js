import { getClient, query } from '@/lib/db';
import { successResponse, errorResponse, validationError } from '@/lib/api-response';
import { ensureStoresSchema } from '@/lib/storesSchema';
import { ensureConstructionSchema } from '@/lib/constructionSchema';
import { ensureUsersTable } from '@/lib/userAuth';
import { validatePhoneNumber } from '@/lib/phoneValidator';
import { requireAuth, requirePermission } from '@/lib/api-protection';
import { setRecycleBinContext } from '@/lib/recycleBin';

function parseList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parsePositiveIntegerId(value) {
  const id = String(value ?? '').trim();
  if (!/^\d+$/.test(id) || id === '0') return null;
  return id;
}

async function syncWarehouseUsers(client, warehouseId, userIds) {
  const ids = [...new Set((userIds || []).map(Number).filter(Number.isInteger))];
  await client.query(
    `UPDATE user_stores
     SET is_active = FALSE, updated_at = NOW()
     WHERE store_id = $1
       AND ($2::int[] IS NULL OR user_id <> ALL($2::int[]))`,
    [warehouseId, ids.length ? ids : null],
  );
  for (const userId of ids) {
    await client.query(
      `INSERT INTO user_stores (user_id, store_id, is_active, created_at, updated_at)
       VALUES ($1, $2, TRUE, NOW(), NOW())
       ON CONFLICT (user_id, store_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()`,
      [userId, warehouseId],
    );
  }
}

export async function GET(request) {
  try {
    await ensureUsersTable();
    await ensureStoresSchema();
    await ensureConstructionSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'WAREHOUSE_VIEW', 'WAREHOUSE_CREATE', 'WAREHOUSE_EDIT');
    if (permissionCheck.error) return permissionCheck.error;

    const res = await query(
      `SELECT id, name, address_line1, address_line2, city, state, pincode, country,
              manager_mobile, manager_email, meta, is_active, created_at, updated_at
       FROM stores
       WHERE LOWER(COALESCE(NULLIF(location_type, ''), meta->>'locationType', 'warehouse')) = 'warehouse'
       ORDER BY created_at DESC, id DESC`
    );
    return successResponse({ records: res.rows }, 'Warehouses fetched');
  } catch (err) {
    console.error(err);
    return errorResponse('Failed to fetch warehouses');
  }
}

export async function POST(request) {
  try {
    await ensureUsersTable();
    await ensureStoresSchema();
    await ensureConstructionSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'WAREHOUSE_CREATE');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const name = String(body.name || '').trim();
    const mobileNumber = String(body.mobileNumber || '').replace(/\D/g, '');
    const email = String(body.email || body.warehouseEmail || '').trim().toLowerCase();

    if (!name) {
      return validationError([{ field: 'name', message: 'Warehouse name is required' }]);
    }

    if (!mobileNumber) {
      return validationError([{ field: 'mobileNumber', message: 'Mobile number is required' }]);
    }
    if (!/^\d{10}$/.test(mobileNumber)) {
      return validationError([{ field: 'mobileNumber', message: 'Mobile number must be exactly 10 digits' }]);
    }

    if (!email) {
      return validationError([{ field: 'email', message: 'Warehouse email is required' }]);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return validationError([{ field: 'email', message: 'Enter a valid warehouse email' }]);
    }

    const users = parseList(body.users ?? body.userIds);
    const notificationEmails = parseList(body.notificationEmails);

    const meta = {
      locationType: 'Warehouse',
      users,
      gstNumber: String(body.gstNumber || '').trim(),
      notificationEmails,
    };

    const fullMobile = `+91 ${mobileNumber}`.trim();

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const res = await client.query(
      `INSERT INTO stores (
         name, address_line1, address_line2, city, state, pincode, country,
         manager_mobile, manager_email, meta, location_type, is_active, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10::jsonb, 'warehouse', TRUE, NOW(), NOW()
       )
       RETURNING id, name, address_line1, address_line2, city, state, pincode, country,
                 manager_mobile, manager_email, meta, is_active, created_at, updated_at`,
      [
        name,
        body.addressLine1 || null,
        body.addressLine2 || null,
        body.city || null,
        body.state || null,
        body.pincode || null,
        body.country || 'India',
        fullMobile,
        email,
        JSON.stringify(meta),
      ]
      );
      await syncWarehouseUsers(client, res.rows[0].id, users);
      await client.query('COMMIT');

      return successResponse({ warehouse: res.rows[0] }, 'Warehouse created and employee access mapped', 201);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return errorResponse(err.message || 'Failed to create warehouse');
  }
}

export async function PUT(request) {
  try {
    await ensureUsersTable();
    await ensureStoresSchema();
    await ensureConstructionSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'WAREHOUSE_EDIT');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const id = parsePositiveIntegerId(body.id);
    const name = String(body.name || '').trim();
    const mobileNumber = String(body.mobileNumber || '').replace(/\D/g, '');
    const email = String(body.email || body.warehouseEmail || '').trim().toLowerCase();

    if (!id) {
      return validationError([{ field: 'id', message: 'Warehouse id is required' }]);
    }

    if (!name) {
      return validationError([{ field: 'name', message: 'Warehouse name is required' }]);
    }

    if (!mobileNumber) {
      return validationError([{ field: 'mobileNumber', message: 'Mobile number is required' }]);
    }
    if (!/^\d{10}$/.test(mobileNumber)) {
      return validationError([{ field: 'mobileNumber', message: 'Mobile number must be exactly 10 digits' }]);
    }

    const phoneValidation = validatePhoneNumber(mobileNumber);
    if (!phoneValidation.isValid) {
      return validationError([{ field: 'mobileNumber', message: phoneValidation.error }]);
    }

    if (!email) {
      return validationError([{ field: 'email', message: 'Warehouse email is required' }]);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return validationError([{ field: 'email', message: 'Enter a valid warehouse email' }]);
    }

    const users = parseList(body.users ?? body.userIds);
    const notificationEmails = parseList(body.notificationEmails);

    const meta = {
      locationType: 'Warehouse',
      users,
      gstNumber: String(body.gstNumber || '').trim(),
      notificationEmails,
    };

    const fullMobile = `+91 ${mobileNumber}`.trim();

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const res = await client.query(
      `UPDATE stores
       SET name = $1,
           address_line1 = $2,
           address_line2 = $3,
           city = $4,
           state = $5,
           pincode = $6,
           country = $7,
           manager_mobile = $8,
           manager_email = $9,
           meta = $10::jsonb,
           location_type = 'warehouse',
           updated_at = NOW()
       WHERE id = $11::bigint
         AND LOWER(COALESCE(NULLIF(location_type, ''), meta->>'locationType', 'warehouse')) = 'warehouse'
       RETURNING id, name, address_line1, address_line2, city, state, pincode, country,
                 manager_mobile, manager_email, meta, is_active, created_at, updated_at`,
      [
        name,
        body.addressLine1 || null,
        body.addressLine2 || null,
        body.city || null,
        body.state || null,
        body.pincode || null,
        body.country || 'India',
        fullMobile,
        email,
        JSON.stringify(meta),
        id,
      ]
      );

      if (!res.rows.length) {
        await client.query('ROLLBACK');
        return errorResponse('Warehouse not found', 404);
      }
      await syncWarehouseUsers(client, id, users);
      await client.query('COMMIT');

      return successResponse({ warehouse: res.rows[0] }, 'Warehouse updated and employee access mapped');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return errorResponse(err.message || 'Failed to update warehouse');
  }
}

export async function DELETE(request) {
  let client;
  try {
    await ensureUsersTable();
    await ensureStoresSchema();
    await ensureConstructionSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'WAREHOUSE_EDIT');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const id = parsePositiveIntegerId(url.searchParams.get('id'));

    if (!id) {
      return validationError([{ field: 'id', message: 'Warehouse id is required' }]);
    }

    client = await getClient();
    await client.query('BEGIN');
    await setRecycleBinContext(client, auth.user.id, 'Warehouse deleted');
    const res = await client.query(
      `DELETE FROM stores
       WHERE id = $1::bigint
         AND LOWER(COALESCE(NULLIF(location_type, ''), meta->>'locationType', 'warehouse')) = 'warehouse'
       RETURNING id`,
      [id]
    );

    if (!res.rows.length) {
      await client.query('ROLLBACK');
      return errorResponse('Warehouse not found', 404);
    }

    await client.query('COMMIT');
    return successResponse({ id }, 'Warehouse deleted');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return errorResponse(err.message || 'Failed to delete warehouse');
  } finally {
    client?.release();
  }
}
