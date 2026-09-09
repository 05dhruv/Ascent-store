import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { buildGoogleAuthorizationUrl } from "@/lib/googleCalendar";

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const permission = requirePermission(
    auth.user,
    "MANAGE_PURCHASE_ORDERS",
    "MANAGE_VENDORS",
  );
  if (permission.error) return permission.error;

  try {
    const state = crypto.randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(buildGoogleAuthorizationUrl(state));
    response.cookies.set("google_calendar_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
