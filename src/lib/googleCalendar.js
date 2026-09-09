import crypto from "crypto";
import { query } from "@/lib/db";
import { ensureGoogleCalendarSchema } from "@/lib/googleCalendarSchema";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getGoogleCalendarConfig() {
  return {
    clientId: requiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    redirectUri: requiredEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
  };
}

function getEncryptionKey() {
  return crypto
    .createHash("sha256")
    .update(requiredEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY"))
    .digest();
}

export function encryptCalendarToken(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptCalendarToken(value) {
  if (!value) return null;
  const [ivValue, tagValue, encryptedValue] = String(value).split(".");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Stored Google Calendar token is invalid");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function buildGoogleAuthorizationUrl(state) {
  const config = getGoogleCalendarConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function requestToken(body) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google OAuth failed");
  }
  return data;
}

export async function exchangeGoogleCode(code) {
  const config = getGoogleCalendarConfig();
  return requestToken({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
}

async function fetchGoogleEmail(accessToken) {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.email || null;
}

export async function saveGoogleCalendarConnection(userId, tokenData) {
  await ensureGoogleCalendarSchema();
  const existing = await query(
    `SELECT refresh_token_encrypted FROM google_calendar_connections WHERE user_id = $1`,
    [userId],
  );
  const refreshToken = tokenData.refresh_token
    ? encryptCalendarToken(tokenData.refresh_token)
    : existing.rows[0]?.refresh_token_encrypted || null;
  const email = await fetchGoogleEmail(tokenData.access_token);
  const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000);
  await query(
    `INSERT INTO google_calendar_connections (
       user_id, google_email, access_token_encrypted, refresh_token_encrypted,
       token_expires_at, scope, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       google_email = COALESCE(EXCLUDED.google_email, google_calendar_connections.google_email),
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, google_calendar_connections.refresh_token_encrypted),
       token_expires_at = EXCLUDED.token_expires_at,
       scope = EXCLUDED.scope,
       updated_at = NOW()`,
    [
      userId,
      email,
      encryptCalendarToken(tokenData.access_token),
      refreshToken,
      expiresAt,
      tokenData.scope || CALENDAR_SCOPE,
    ],
  );
}

async function getCalendarAccessToken(userId) {
  await ensureGoogleCalendarSchema();
  const result = await query(
    `SELECT * FROM google_calendar_connections WHERE user_id = $1`,
    [userId],
  );
  const connection = result.rows[0];
  if (!connection) throw new Error("Connect Google Calendar first");
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  if (expiresAt > Date.now() + 60_000) {
    return decryptCalendarToken(connection.access_token_encrypted);
  }
  const refreshToken = decryptCalendarToken(connection.refresh_token_encrypted);
  if (!refreshToken) throw new Error("Reconnect Google Calendar to continue");
  const config = getGoogleCalendarConfig();
  const tokenData = await requestToken({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  await saveGoogleCalendarConnection(userId, {
    ...tokenData,
    refresh_token: refreshToken,
  });
  return tokenData.access_token;
}

export async function upsertVendorPayableCalendarEvent({
  userId,
  invoice,
  attendees,
  reminderMinutes,
}) {
  await ensureGoogleCalendarSchema();
  const accessToken = await getCalendarAccessToken(userId);
  const existing = await query(
    `SELECT google_event_id FROM vendor_payable_calendar_events
     WHERE vendor_invoice_id = $1 AND user_id = $2`,
    [invoice.id, userId],
  );
  const dueDate = String(invoice.due_date).slice(0, 10);
  const [year, month, day] = dueDate.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  const cleanAttendees = [...new Set(attendees.map((email) => email.toLowerCase()))]
    .map((email) => ({ email }));
  const event = {
    summary: `Vendor payable due: ${invoice.vendor_name || "Vendor"}`,
    description: [
      `Invoice: ${invoice.invoice_number || invoice.transaction_id}`,
      `Amount pending: INR ${Number(invoice.amount_left || 0).toFixed(2)}`,
      invoice.transferred_stores ? `Transferred store(s): ${invoice.transferred_stores}` : null,
      invoice.remarks ? `Remarks: ${invoice.remarks}` : null,
    ].filter(Boolean).join("\n"),
    start: { date: dueDate },
    end: { date: endDate },
    attendees: cleanAttendees,
    reminders: {
      useDefault: false,
      overrides: [{ method: "email", minutes: reminderMinutes }],
    },
  };
  const eventId = existing.rows[0]?.google_event_id;
  const method = eventId ? "PUT" : "POST";
  const path = eventId
    ? `/calendars/primary/events/${encodeURIComponent(eventId)}`
    : "/calendars/primary/events";
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}${path}?sendUpdates=all`,
    {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      cache: "no-store",
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Could not save Google Calendar event");
  }
  await query(
    `INSERT INTO vendor_payable_calendar_events (
       vendor_invoice_id, user_id, google_event_id, google_event_link,
       attendees, due_date, updated_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
     ON CONFLICT (vendor_invoice_id, user_id) DO UPDATE SET
       google_event_id = EXCLUDED.google_event_id,
       google_event_link = EXCLUDED.google_event_link,
       attendees = EXCLUDED.attendees,
       due_date = EXCLUDED.due_date,
       updated_at = NOW()`,
    [invoice.id, userId, data.id, data.htmlLink || null, JSON.stringify(attendees), dueDate],
  );
  return { eventId: data.id, eventLink: data.htmlLink || null };
}
