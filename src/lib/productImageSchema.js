import { query } from "@/lib/db";

let ensured = false;

export async function ensureProductImageSchema() {
  if (ensured) return;
  await query("ALTER TABLE products ALTER COLUMN image_url TYPE TEXT");
  ensured = true;
}
