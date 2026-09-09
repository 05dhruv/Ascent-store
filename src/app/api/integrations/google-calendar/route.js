import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  getAssignedStoreIds,
  requireAuth,
  requirePermission,
} from "@/lib/api-protection";
import { ensureGoogleCalendarSchema } from "@/lib/googleCalendarSchema";
import { upsertVendorPayableCalendarEvent } from "@/lib/googleCalendar";

function requireCalendarAccess(user) {
  return requirePermission(user, "MANAGE_PURCHASE_ORDERS", "MANAGE_VENDORS");
}

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const permission = requireCalendarAccess(auth.user);
  if (permission.error) return permission.error;
  try {
    await ensureGoogleCalendarSchema();
    const result = await query(
      `SELECT google_email, updated_at FROM google_calendar_connections WHERE user_id = $1`,
      [auth.user.id],
    );
    return NextResponse.json({
      connected: Boolean(result.rows[0]),
      email: result.rows[0]?.google_email || null,
      updatedAt: result.rows[0]?.updated_at || null,
    });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error.message });
  }
}

export async function DELETE(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const permission = requireCalendarAccess(auth.user);
  if (permission.error) return permission.error;
  await ensureGoogleCalendarSchema();
  await query(`DELETE FROM google_calendar_connections WHERE user_id = $1`, [auth.user.id]);
  return NextResponse.json({ success: true });
}

export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const permission = requireCalendarAccess(auth.user);
  if (permission.error) return permission.error;

  try {
    await ensureGoogleCalendarSchema();
    const body = await request.json();
    const invoiceId = Number(body.invoiceId || 0);
    const reminderMinutes = Math.max(0, Math.min(40320, Number(body.reminderMinutes || 1440)));
    const attendees = Array.isArray(body.attendees)
      ? body.attendees.map((value) => String(value).trim()).filter(Boolean)
      : [];
    const invalidEmail = attendees.find(
      (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    );
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice is required" }, { status: 400 });
    }
    if (invalidEmail) {
      return NextResponse.json({ error: `Invalid email: ${invalidEmail}` }, { status: 400 });
    }

    const params = [invoiceId];
    let storeScope = "";
    if (auth.user.role !== "super_admin") {
      const storeIds = getAssignedStoreIds(auth.user);
      if (!storeIds.length) {
        return NextResponse.json({ error: "No accessible store assigned" }, { status: 403 });
      }
      params.push(storeIds);
      storeScope = ` AND (po.destination_id = ANY($2::int[]) OR si.destination_id = ANY($2::int[]))`;
    }
    const result = await query(
      `SELECT vi.id, vi.transaction_id, vi.invoice_number, vi.due_date,
              vi.total_amount, vi.amount_paid, vi.remarks,
              GREATEST(vi.total_amount - vi.amount_paid, 0) AS amount_left,
              v.name AS vendor_name,
              transfers.transferred_stores
       FROM vendor_invoices vi
       LEFT JOIN vendors v ON v.id = vi.vendor_id
       LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
       LEFT JOIN stock_in si ON si.id = vi.stock_in_id
       LEFT JOIN LATERAL (
         SELECT STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name) AS transferred_stores
         FROM stock_transfer st
         JOIN stores s ON s.id = st.destination_id
         WHERE st.invoice_number = vi.invoice_number
           AND LOWER(COALESCE(st.status, '')) = 'confirmed'
       ) transfers ON TRUE
       WHERE vi.id = $1${storeScope}`,
      params,
    );
    const invoice = result.rows[0];
    if (!invoice) {
      return NextResponse.json({ error: "Vendor invoice not found" }, { status: 404 });
    }
    if (!invoice.due_date) {
      return NextResponse.json({ error: "This invoice has no due date" }, { status: 400 });
    }
    if (Number(invoice.amount_left || 0) <= 0) {
      return NextResponse.json({ error: "This invoice is already paid" }, { status: 400 });
    }

    const event = await upsertVendorPayableCalendarEvent({
      userId: auth.user.id,
      invoice,
      attendees,
      reminderMinutes,
    });
    return NextResponse.json({ success: true, ...event });
  } catch (error) {
    console.error("[GOOGLE CALENDAR EVENT]", error.message);
    const status = /Connect|Reconnect|configured/.test(error.message) ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
