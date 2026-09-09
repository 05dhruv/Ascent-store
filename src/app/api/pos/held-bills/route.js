import { successResponse, errorResponse, validationError } from '@/lib/api-response';
import { query } from '@/lib/db';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { appendStoreScope, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function mapHeldBill(row) {
  const payload = row.payload || {};
  return {
    id: row.client_hold_id || String(row.id),
    dbId: row.id,
    heldAt: row.held_at,
    storeId: row.store_id,
    sessionId: row.session_id,
    customerName: row.customer_name || payload.customerName || '',
    customerMobile: row.customer_mobile || payload.customerMobile || '',
    cart: Array.isArray(payload.cart) ? payload.cart : [],
    orderDiscount: payload.orderDiscount ?? '0',
    roundOff: payload.roundOff ?? '0',
    paymentMode: payload.paymentMode || 'cash',
    payments: Array.isArray(payload.payments) ? payload.payments : [],
    totals: row.totals || payload.totals || {},
    source: 'server',
  };
}

export async function GET(request) {
  try {
    await ensureSalesBillingSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING', 'MANAGE_ORDERS');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const storeId = Number(url.searchParams.get('store_id') || 0) || null;
    const customerMobile = normalizeMobile(url.searchParams.get('customer_mobile'));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));

    const where = [`status = 'held'`];
    const params = [];
    const scope = appendStoreScope(where, params, 'store_id', auth.user, storeId);
    if (scope.error) return scope.error;

    if (customerMobile) {
      params.push(customerMobile);
      where.push(`customer_mobile = $${params.length}`);
    }

    params.push(limit);
    const res = await query(
      `SELECT id, client_hold_id, user_id, store_id, session_id, customer_name, customer_mobile,
              payload, totals, status, held_at, resumed_at, created_at, updated_at
       FROM pos_held_bills
       WHERE ${where.join(' AND ')}
       ORDER BY held_at DESC, id DESC
       LIMIT $${params.length}`,
      params
    );

    return successResponse({ heldBills: res.rows.map(mapHeldBill) }, 'Held bills fetched');
  } catch (err) {
    console.error('[pos held-bills GET]', err);
    return errorResponse('Failed to fetch held bills');
  }
}

export async function POST(request) {
  try {
    await ensureSalesBillingSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const storeId = Number(body.storeId || body.store_id || 0) || null;
    const cart = Array.isArray(body.cart) ? body.cart : [];
    if (!storeId) return validationError([{ field: 'storeId', message: 'Store is required' }]);
    if (!cart.length) return validationError([{ field: 'cart', message: 'At least one product is required' }]);

    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const clientHoldId = String(body.id || body.clientHoldId || `HOLD-${Date.now()}`).slice(0, 120);
    const customerName = String(body.customerName || '').trim() || 'Walk-in Customer';
    const customerMobile = normalizeMobile(body.customerMobile);
    const payload = {
      cart,
      customerName,
      customerMobile,
      orderDiscount: body.orderDiscount ?? '0',
      roundOff: body.roundOff ?? '0',
      paymentMode: body.paymentMode || 'cash',
      payments: Array.isArray(body.payments) ? body.payments : [],
      totals: body.totals || {},
      deviceUid: body.deviceUid || '',
      counterUid: body.counterUid || '',
      counterName: body.counterName || '',
    };

    const res = await query(
      `INSERT INTO pos_held_bills (
         client_hold_id, user_id, store_id, session_id, customer_name, customer_mobile,
         payload, totals, status, held_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'held',NOW(),NOW(),NOW())
       ON CONFLICT (client_hold_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         store_id = EXCLUDED.store_id,
         session_id = EXCLUDED.session_id,
         customer_name = EXCLUDED.customer_name,
         customer_mobile = EXCLUDED.customer_mobile,
         payload = EXCLUDED.payload,
         totals = EXCLUDED.totals,
         status = 'held',
         resumed_at = NULL,
         updated_at = NOW()
       RETURNING id, client_hold_id, user_id, store_id, session_id, customer_name, customer_mobile,
                 payload, totals, status, held_at, resumed_at, created_at, updated_at`,
      [
        clientHoldId,
        auth.user.id,
        storeId,
        body.sessionId || body.session_id || null,
        customerName,
        customerMobile || null,
        JSON.stringify(payload),
        JSON.stringify(body.totals || {}),
      ]
    );

    return successResponse({ heldBill: mapHeldBill(res.rows[0]) }, 'Bill held', 201);
  } catch (err) {
    console.error('[pos held-bills POST]', err);
    return errorResponse('Failed to hold bill');
  }
}

export async function DELETE(request) {
  try {
    await ensureSalesBillingSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const id = String(url.searchParams.get('id') || '').trim();
    if (!id) return validationError([{ field: 'id', message: 'Held bill id is required' }]);

    const where = [`status = 'held'`, `(client_hold_id = $1 OR id::text = $1)`];
    const params = [id];
    const scope = appendStoreScope(where, params, 'store_id', auth.user);
    if (scope.error) return scope.error;

    const res = await query(
      `UPDATE pos_held_bills
       SET status = 'resumed', resumed_at = NOW(), updated_at = NOW()
       WHERE ${where.join(' AND ')}
       RETURNING id`,
      params
    );

    if (!res.rows.length) return errorResponse('Held bill not found', 404);
    return successResponse({ id }, 'Held bill removed');
  } catch (err) {
    console.error('[pos held-bills DELETE]', err);
    return errorResponse('Failed to remove held bill');
  }
}
