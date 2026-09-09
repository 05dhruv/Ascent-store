import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureEmployeesSchema } from "@/lib/employeesSchema";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { callEcommerce } from "@/lib/ecommerceIntegration";

async function requireRider(request) {
  await ensureEmployeesSchema();
  const auth = await requireAuth(request);
  if (auth.error) return { error: auth.error, rider: null, user: null };
  const permission = requirePermission(auth.user, "MANAGE_DELIVERIES");
  if (permission.error) {
    return { error: permission.error, rider: null, user: auth.user };
  }
  if (auth.user.role === "super_admin") {
    return { error: null, rider: null, user: auth.user, adminView: true };
  }
  const result = await query(
    `SELECT e.id, e.user_id, e.first_name, e.last_name, e.mobile_number,
            us.store_id, s.name AS store_name
     FROM employees e
     INNER JOIN user_stores us ON us.user_id = e.user_id AND us.is_active = TRUE
     INNER JOIN stores s ON s.id = us.store_id AND s.is_active = TRUE
     WHERE e.user_id = $1
       AND LOWER(COALESCE(e.employment_status, 'active')) = 'active'
       AND (
         LOWER(COALESCE(e.role_name, '')) LIKE '%rider%'
         OR LOWER(COALESCE(e.role_name, '')) LIKE '%delivery%'
       )
     ORDER BY us.store_id
     LIMIT 1`,
    [auth.user.id],
  );
  if (!result.rows[0]) {
    return {
      error: NextResponse.json(
        { success: false, message: "Delivery rider access required" },
        { status: 403 },
      ),
      rider: null,
      user: auth.user,
    };
  }
  return { error: null, rider: result.rows[0], user: auth.user };
}

export async function GET(request) {
  try {
    const auth = await requireRider(request);
    if (auth.error) return auth.error;
    const data = await callEcommerce(
      auth.adminView
        ? `/api/integrations/tbm/orders?status=billed%2Cdispatched`
        : `/api/integrations/tbm/orders?store_id=${auth.rider.store_id}&status=billed%2Cdispatched`,
    );
    const orders = (data.orders || [])
      .filter((order) =>
        auth.adminView
          ? Boolean(order.delivery_agent_id)
          : Number(order.delivery_agent_id) === Number(auth.rider.id),
      )
      .map((order) => ({
        id: Number(order.id),
        order_number: order.order_number,
        status: order.status,
        store_id: Number(order.store_id || 0),
        store_name: order.store_name || order.store?.name || "",
        delivery_agent_id: Number(order.delivery_agent_id || 0),
        delivery_agent_name:
          order.delivery_agent_name || order.delivery_agent?.name || "",
        grand_total: Number(order.grand_total || 0),
        payment_method: order.payment_method,
        account_name: order.account_name,
        account_phone: order.account_phone,
        delivery_address: {
          name: order.delivery_address?.name || "",
          phone: order.delivery_address?.phone || "",
          line: order.delivery_address?.line || "",
          city: order.delivery_address?.city || "",
          state: order.delivery_address?.state || "",
          pincode: order.delivery_address?.pincode || "",
          landmark: order.delivery_address?.landmark || "",
          latitude: order.delivery_address?.latitude ?? null,
          longitude: order.delivery_address?.longitude ?? null,
        },
      }));
    return NextResponse.json({
      success: true,
      data: {
        mode: auth.adminView ? "admin" : "rider",
        rider: auth.adminView
          ? {
              id: Number(auth.user.id),
              name: auth.user.name || "Super Admin",
              storeId: null,
              storeName: "All stores",
            }
          : {
              id: Number(auth.rider.id),
              name: [auth.rider.first_name, auth.rider.last_name]
                .filter(Boolean)
                .join(" "),
              storeId: Number(auth.rider.store_id),
              storeName: auth.rider.store_name,
            },
        orders,
      },
    });
  } catch (error) {
    console.error("[delivery orders GET]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Unable to load deliveries" },
      { status: error.status || 502 },
    );
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireRider(request);
    if (auth.error) return auth.error;
    const body = await request.json();
    const orderId = Number(body.orderId);
    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "Order ID is required" },
        { status: 400 },
      );
    }
    const lookup = await callEcommerce(
      `/api/integrations/tbm/orders/${orderId}`,
    );
    const order = lookup.order;
    if (
      Number(order.store_id) !== Number(auth.rider.store_id) ||
      Number(order.delivery_agent_id) !== Number(auth.rider.id)
    ) {
      return NextResponse.json(
        { success: false, message: "This delivery is not assigned to you" },
        { status: 403 },
      );
    }
    const actionMap = {
      start_delivery: "dispatch",
      update_location: "update_location",
      deliver: "deliver",
    };
    const action = actionMap[body.action];
    if (!action) {
      return NextResponse.json(
        { success: false, message: "Unsupported delivery action" },
        { status: 400 },
      );
    }
    const updated = await callEcommerce(
      `/api/integrations/tbm/orders/${orderId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action,
          storeId: Number(auth.rider.store_id),
          agentId: Number(auth.rider.id),
          actorId: auth.user.id,
          actorName: auth.user.name,
          latitude: body.latitude,
          longitude: body.longitude,
          accuracy: body.accuracy,
          otp: body.otp,
        }),
      },
    );
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[delivery orders PATCH]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Unable to update delivery" },
      { status: error.status || 502 },
    );
  }
}
