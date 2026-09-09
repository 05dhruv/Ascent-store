import { query } from "@/lib/db";
import { ensureStoresSchema } from "@/lib/storesSchema";
import { failure, optionsResponse, success } from "../_utils";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  try {
    await ensureStoresSchema();

    const result = await query(
      `SELECT id, name, address_line1, address_line2, city, state, pincode, country,
              opening_time, closing_time, meta
       FROM stores
       WHERE is_active = TRUE
         AND LOWER(COALESCE(meta->>'locationType', 'Store')) <> 'warehouse'
       ORDER BY name ASC
       LIMIT 200`,
    );

    return success({ records: result.rows }, "Stores fetched");
  } catch (err) {
    console.error("[public stores]", err);
    return failure("Failed to fetch stores");
  }
}
