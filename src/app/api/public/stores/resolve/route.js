import { query } from "@/lib/db";
import { ensureStoresSchema } from "@/lib/storesSchema";
import { distanceKm, validLatitude, validLongitude } from "@/lib/geo";
import { failure, optionsResponse, success } from "../../_utils";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request) {
  try {
    await ensureStoresSchema();

    const { searchParams } = new URL(request.url);
    const pincode = String(searchParams.get("pincode") || "").replace(/\D/g, "");
    const latitude = searchParams.get("latitude");
    const longitude = searchParams.get("longitude");
    const hasCoordinates =
      validLatitude(latitude) && validLongitude(longitude);

    if (!/^\d{6}$/.test(pincode)) {
      return failure("Valid 6 digit pincode is required", 400);
    }

    if (hasCoordinates) {
      const stores = await query(
        `SELECT id, name, address_line1, address_line2, city, state, pincode, country,
                opening_time, closing_time, meta
         FROM stores
         WHERE is_active = TRUE
           AND LOWER(COALESCE(meta->>'locationType', 'Store')) <> 'warehouse'
         ORDER BY name ASC
         LIMIT 200`,
      );
      const configuredStores = stores.rows
        .map((store) => {
          const radiusKm = 5;
          const calculatedDistance = distanceKm(
            latitude,
            longitude,
            store.meta?.deliveryLatitude,
            store.meta?.deliveryLongitude,
          );
          return {
            store,
            radiusKm,
            distanceKm: calculatedDistance,
          };
        })
        .filter(
          (entry) =>
            entry.distanceKm != null &&
            Number.isFinite(entry.radiusKm) &&
            entry.radiusKm > 0,
        );

      if (!configuredStores.length) {
        return failure("Store delivery locations are not configured", 503);
      }
      const nearest = configuredStores.sort(
        (left, right) => left.distanceKm - right.distanceKm,
      )[0];
      if (nearest.distanceKm > nearest.radiusKm) {
        return failure(
          `Delivery is available within ${nearest.radiusKm} km of the nearest store`,
          404,
        );
      }
      return success(
        {
          store: {
            ...nearest.store,
            delivery_distance_km: Number(nearest.distanceKm.toFixed(2)),
            delivery_radius_km: nearest.radiusKm,
          },
        },
        "Store resolved",
      );
    }

    const result = await query(
      `SELECT id, name, address_line1, address_line2, city, state, pincode, country,
              opening_time, closing_time, meta
       FROM stores
       WHERE is_active = TRUE
         AND (
           pincode = $1
           OR EXISTS (
             SELECT 1
             FROM jsonb_array_elements_text(
               CASE
                 WHEN jsonb_typeof(meta->'deliveryPincodes') = 'array'
                   THEN meta->'deliveryPincodes'
                 ELSE '[]'::jsonb
               END
             ) AS delivery_pin(value)
             WHERE delivery_pin.value = $1
           )
         )
         AND LOWER(COALESCE(meta->>'locationType', 'Store')) <> 'warehouse'
       ORDER BY
         CASE WHEN pincode = $1 THEN 0 ELSE 1 END,
         name ASC
       LIMIT 1`,
      [pincode],
    );

    if (!result.rows.length) {
      return failure("Sorry, currently we are not delivering at your location", 404);
    }

    return success({ store: result.rows[0] }, "Store resolved");
  } catch (err) {
    console.error("[public stores resolve]", err);
    return failure(
      process.env.NODE_ENV === "development"
        ? `Failed to resolve store: ${err.message}`
        : "Failed to resolve store",
    );
  }
}
