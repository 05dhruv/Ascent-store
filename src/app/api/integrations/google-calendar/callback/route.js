import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-protection";
import {
  exchangeGoogleCode,
  saveGoogleCalendarConnection,
} from "@/lib/googleCalendar";

function redirectToSettlement(request, result, message) {
  const url = new URL("/purchase/invoice-settlement", request.url);
  url.searchParams.set("calendar", result);
  if (message) url.searchParams.set("message", message);
  const response = NextResponse.redirect(url);
  response.cookies.delete("google_calendar_oauth_state");
  return response;
}

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return redirectToSettlement(request, "error", "Sign in again");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("google_calendar_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToSettlement(request, "error", "Invalid OAuth response");
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    await saveGoogleCalendarConnection(auth.user.id, tokens);
    return redirectToSettlement(request, "connected", "Google Calendar connected");
  } catch (error) {
    console.error("[GOOGLE CALENDAR CALLBACK]", error.message);
    return redirectToSettlement(request, "error", error.message);
  }
}
