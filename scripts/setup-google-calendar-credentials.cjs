const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const credentialsPath = process.argv[2];
if (!credentialsPath) {
  throw new Error("Pass the downloaded Google OAuth JSON file path");
}

const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
const web = credentials.web;
if (!web?.client_id || !web?.client_secret) {
  throw new Error("The file is not a valid Google Web OAuth credential");
}

const productionRedirect =
  "https://sync.thebuyzaarmart.com/api/integrations/google-calendar/callback";
if (!Array.isArray(web.redirect_uris) || !web.redirect_uris.includes(productionRedirect)) {
  throw new Error(`Google credential is missing redirect URI: ${productionRedirect}`);
}

const envPath = path.join(process.cwd(), ".env.local");
const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const existingEncryptionKey = current.match(
  /^GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=(.+)$/m,
)?.[1];
const values = {
  GOOGLE_CALENDAR_CLIENT_ID: web.client_id,
  GOOGLE_CALENDAR_CLIENT_SECRET: web.client_secret,
  GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY:
    existingEncryptionKey || crypto.randomBytes(48).toString("base64url"),
  GOOGLE_CALENDAR_REDIRECT_URI: productionRedirect,
};

let next = current;
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  next = pattern.test(next)
    ? next.replace(pattern, line)
    : `${next.trimEnd()}${next.trim() ? "\n" : ""}${line}\n`;
}
fs.writeFileSync(envPath, next, "utf8");
console.log("Google Calendar credentials configured in .env.local (secret values hidden).");
