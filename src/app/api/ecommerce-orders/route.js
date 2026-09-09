import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  canAccessAllStores,
  getAssignedStoreIds,
  requireAuth,
  requirePermission,
  requireStore,
} from '@/lib/api-protection';
import { callEcommerce } from '@/lib/ecommerceIntegration';

async function validateOrderStock(order) {
  const productIds = order.items.map((item) => Number(item.product_id)).filter(Boolean);
  const result = await query(
    `SELECT p.id, p.name, COALESCE(SUM(ib.available_qty), 0) AS available_qty
     FROM products p
     LEFT JOIN inventory_batches ib
       ON ib.product_id = p.id
      AND ib.store_id = $1
      AND ib.status = 'active'
      AND ib.available_qty > 0
      AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
     WHERE p.id = ANY($2::bigint[])
     GROUP BY p.id, p.name`,
    [Number(order.store_id), productIds],
  );
  const availableByProduct = new Map(
    result.rows.map((row) => [Number(row.id), Number(row.available_qty)]),
  );
  const unavailable = order.items
    .map((item) => ({
      name: item.name,
      requested: Number(item.qty),
      available: Number(availableByProduct.get(Number(item.product_id)) || 0),
    }))
    .filter((item) => item.available < item.requested);
  if (unavailable.length) {
    const first = unavailable[0];
    const error = new Error(
      `${first.name} has only ${first.available} available; ${first.requested} requested`,
    );
    error.status = 409;
    throw error;
  }
}

function scopedStoreId(user, requestedStoreId = null) {
  const requested = Number(requestedStoreId || 0) || null;
  if (canAccessAllStores(user)) return requested;
  const assigned = getAssignedStoreIds(user);
  if (requested && assigned.includes(requested)) return requested;
  return assigned[0] || null;
}

function ecommercePaymentMode(order) {
  if (order.payment_method === 'razorpay') {
    return order.payment_method_detail === 'card' ? 'card' : 'upi';
  }
  return order.payment_method === 'upi_on_delivery' ? 'upi' : 'cod';
}

async function authenticate(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth;
  const permission = requirePermission(
    auth.user,
    'VIEW_ORDERS',
    'MANAGE_ORDERS',
    'CREATE_POS_BILL',
  );
  return permission.error
    ? { user: null, error: permission.error }
    : { user: auth.user, error: null };
}

export async function GET(request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const storeId = scopedStoreId(auth.user, searchParams.get('store_id'));
    if (!canAccessAllStores(auth.user) && !storeId) {
      return NextResponse.json(
        { success: false, message: 'No store is assigned to this user' },
        { status: 403 },
      );
    }
    const params = new URLSearchParams();
    if (storeId) params.set('store_id', String(storeId));
    if (searchParams.get('status')) params.set('status', searchParams.get('status'));
    const data = await callEcommerce(
      `/api/integrations/tbm/orders?${params.toString()}`,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[ecommerce orders GET]', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status || 502 },
    );
  }
}

export async function PATCH(request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    const managePermission = requirePermission(
      auth.user,
      'MANAGE_ORDERS',
      'CREATE_POS_BILL',
      'MANAGE_BILLING',
    );
    if (managePermission.error) return managePermission.error;
    const body = await request.json();
    const orderId = Number(body.orderId);
    if (!orderId) {
      return NextResponse.json(
        { success: false, message: 'Order ID is required' },
        { status: 400 },
      );
    }

    const lookup = await callEcommerce(`/api/integrations/tbm/orders/${orderId}`);
    const order = lookup.order;
    const storeCheck = requireStore(auth.user, order.store_id);
    if (storeCheck.error) return storeCheck.error;

    if (body.action === 'assign_rider') {
      const agentId = Number(body.agentId);
      const agentResult = await query(
        `SELECT e.id, e.user_id, e.first_name, e.last_name, e.mobile_number
         FROM employees e
         INNER JOIN users u ON u.id = e.user_id AND u.is_active = TRUE
         INNER JOIN user_stores us
           ON us.user_id = e.user_id
          AND us.store_id = $2
          AND us.is_active = TRUE
         WHERE e.id = $1
           AND LOWER(COALESCE(e.employment_status, 'active')) = 'active'
           AND (
             LOWER(COALESCE(e.role_name, '')) LIKE '%rider%'
             OR LOWER(COALESCE(e.role_name, '')) LIKE '%delivery%'
           )
         LIMIT 1`,
        [agentId, Number(order.store_id)],
      );
      const agent = agentResult.rows[0];
      if (!agent) {
        return NextResponse.json(
          { success: false, message: 'Select an active rider from this store' },
          { status: 400 },
        );
      }
      const updated = await callEcommerce(
        `/api/integrations/tbm/orders/${orderId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'assign_rider',
            storeId: Number(order.store_id),
            agentId: Number(agent.id),
            agentUserId: Number(agent.user_id),
            agentName: [agent.first_name, agent.last_name]
              .filter(Boolean)
              .join(' '),
            agentPhone: agent.mobile_number || '',
            actorId: auth.user.id,
            actorName: auth.user.name,
          }),
        },
      );
      return NextResponse.json({
        success: true,
        data: updated,
        message: 'Rider assigned',
      });
    }

    if (body.action === 'accept' || body.action === 'generate_receipt') {
      await validateOrderStock(order);
    }

    if (body.action === 'generate_receipt') {
      const billingPermission = requirePermission(
        auth.user,
        'CREATE_POS_BILL',
        'MANAGE_BILLING',
      );
      if (billingPermission.error) return billingPermission.error;
      if (order.status !== 'packed') {
        return NextResponse.json(
          { success: false, message: 'Pack the order before generating receipt' },
          { status: 409 },
        );
      }

      const origin = new URL(request.url).origin;
      const billingResponse = await fetch(`${origin}/api/pos/billing`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          cookie: request.headers.get('cookie') || '',
          authorization: request.headers.get('authorization') || '',
        },
        body: JSON.stringify({
          store_id: Number(order.store_id),
          customer_name:
            order.delivery_address?.name || order.account_name || 'Online Customer',
          customer_mobile:
            order.delivery_address?.phone || order.account_phone || '',
          items: order.items.map((item) => ({
            product_id: Number(item.product_id),
            product_name: item.name,
            barcode: item.barcode,
            sku: item.sku,
            qty: Number(item.qty),
            selling_price: Number(item.selling_price),
            mrp: Number(item.mrp),
          })),
          payment_mode: ecommercePaymentMode(order),
          total_amount: Number(order.grand_total),
          total_tax: Number(order.tax_total),
          discount_amount: Number(order.discount_total),
          round_off: Number(order.delivery_fee),
          notes: `Ecommerce order ${order.order_number}`,
          invoice_number: order.order_number,
        }),
      });
      const billingPayload = await billingResponse.json().catch(() => ({}));
      if (!billingResponse.ok || billingPayload.success === false) {
        return NextResponse.json(
          {
            success: false,
            message: billingPayload.message || 'Receipt generation failed',
          },
          { status: billingResponse.status || 500 },
        );
      }
      const bill = billingPayload.data || billingPayload;
      const updated = await callEcommerce(
        `/api/integrations/tbm/orders/${orderId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'mark_billed',
            storeId: Number(order.store_id),
            actorId: auth.user.id,
            actorName: auth.user.name,
            billId: bill.bill_id,
            billNumber: bill.bill_number || order.order_number,
            invoiceToken: bill.public_token || '',
          }),
        },
      );
      return NextResponse.json({
        success: true,
        data: updated,
        message: 'Receipt generated and order updated',
      });
    }

    const updated = await callEcommerce(
      `/api/integrations/tbm/orders/${orderId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: body.action,
          reason: body.reason || '',
          note: body.note || '',
          storeId: Number(order.store_id),
          actorId: auth.user.id,
          actorName: auth.user.name,
        }),
      },
    );
    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Order updated',
    });
  } catch (error) {
    console.error('[ecommerce orders PATCH]', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status || 502 },
    );
  }
}
