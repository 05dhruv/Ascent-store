import {
  successResponse,
  errorResponse,
  validationError,
} from "@/lib/api-response";
import { query } from "@/lib/db";
import { ensureStoresSchema } from "@/lib/storesSchema";
import {
  appendStoreScope,
  canAccessAllStores,
  getAssignedStoreIds,
  requireAuth,
  requirePermission,
} from "@/lib/api-protection";
import {
  buildStoreMeta,
  buildStoreCodeDuplicateQuery,
  ASCENT_FRANCHISE_TYPE,
  KIRANA_FRANCHISE_TYPE,
  normalizeStoreCode,
  validateStoreCommercialPayload,
  validateStoreDeliveryPayload,
} from "@/lib/storeMeta";

function hasAnyPermission(user, permissions = []) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  const userPermissions = Array.isArray(user.permissions)
    ? user.permissions
    : [];
  return (
    userPermissions.includes("*") ||
    permissions.some((permission) => userPermissions.includes(permission))
  );
}

function wantsAllLocationTypes(searchParams) {
  return ["all", "true", "1", "yes"].includes(
    String(
      searchParams.get("include_locations") ||
        searchParams.get("includeLocations") ||
        "",
    ).toLowerCase(),
  );
}

function appendStoreListScope(
  where,
  params,
  columnName,
  user,
  includeWarehouses,
) {
  if (canAccessAllStores(user)) return { error: null };

  const assignedStoreIds = getAssignedStoreIds(user);
  if (includeWarehouses) {
    const metaColumn = columnName.includes(".")
      ? `${columnName.split(".")[0]}.meta`
      : "meta";
    params.push(assignedStoreIds);
    where.push(`(
      ${columnName} = ANY($${params.length}::int[])
      OR LOWER(COALESCE(${metaColumn}->>'locationType', 'Store')) = 'warehouse'
    )`);
    return { error: null };
  }

  return appendStoreScope(where, params, columnName, user);
}

export async function GET(request) {
  try {
    await ensureStoresSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");
    const searchParam = (url.searchParams.get("search") || "").trim();
    const includeAllLocations =
      wantsAllLocationTypes(url.searchParams) &&
      hasAnyPermission(auth.user, [
        "VIEW_INVENTORY",
        "MANAGE_INVENTORY",
        "MANAGE_STOCK_REQUISITION",
        "CREATE_PURCHASE_ORDER",
        "MANAGE_PURCHASE",
      ]);
    const storeOnlyViewer =
      auth.user.permissions?.some((permission) =>
        [
          "PROCESS_STORE_BILL_EXCHANGE",
          "CREATE_STORE_PURCHASE_ORDER",
          "VIEW_STORE_SALES",
          "VIEW_STORE_PRODUCT_INVENTORY",
          "VIEW_STORE_EXPIRY",
          "VIEW_STORE_ACCOUNTING",
          "VIEW_TAX_WISE_REPORTS",
        ].includes(permission),
      ) &&
      !auth.user.permissions?.includes("*") &&
      !auth.user.permissions?.includes("MANAGE_INVENTORY") &&
      !auth.user.permissions?.includes("VIEW_INVENTORY");

    // If pagination/search params present, return paginated shape expected by stores list page
    if (pageParam || pageSizeParam || searchParam) {
      const page = Math.max(1, Number(pageParam) || 1);
      const pageSize = Math.max(1, Number(pageSizeParam) || 10);

      const where = [];
      const params = [];
      const scope = appendStoreListScope(
        where,
        params,
        "s.id",
        auth.user,
        includeAllLocations,
      );
      if (scope.error) return scope.error;
      if (storeOnlyViewer && !includeAllLocations)
        where.push(
          "LOWER(COALESCE(s.meta->>'locationType', 'Store')) = 'store'",
        );

      if (searchParam) {
        params.push(`%${searchParam}%`);
        where.push(`(
          s.name ILIKE $${params.length}
          OR COALESCE(s.meta->>'storeCode', s.meta->>'shortCode', '') ILIKE $${params.length}
        )`);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const totalRes = await query(
        `SELECT COUNT(*)::INT AS total FROM stores s ${whereSql}`,
        params,
      );
      const total = Number(totalRes.rows[0]?.total || 0);

      const offset = (page - 1) * pageSize;
      const qParams = params.slice();
      qParams.push(pageSize, offset);

      const res = await query(
        `SELECT s.id, s.name, s.address_line1, s.address_line2, s.city, s.state, s.pincode, s.country,
                s.manager_name, s.manager_mobile, s.manager_email, s.opening_time, s.closing_time,
                s.is_active, s.meta, s.created_at, s.updated_at
         FROM stores s
         ${whereSql}
         ORDER BY s.name ASC
         LIMIT $${qParams.length - 1} OFFSET $${qParams.length}`,
        qParams,
      );

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return successResponse(
        {
          stores: res.rows,
          records: res.rows,
          page,
          pageSize,
          total,
          totalPages,
        },
        "Stores fetched",
      );
    }

    const where = [];
    const params = [];
    const scope = appendStoreListScope(
      where,
      params,
      "id",
      auth.user,
      includeAllLocations,
    );
    if (scope.error) return scope.error;
    if (storeOnlyViewer && !includeAllLocations)
      where.push("LOWER(COALESCE(meta->>'locationType', 'Store')) = 'store'");
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Fallback: return accessible stores as an array for legacy callers
    const res = await query(
      `SELECT id, name, address_line1, address_line2, city, state, pincode, country,
              manager_name, manager_mobile, manager_email, opening_time, closing_time, is_active, meta, created_at, updated_at
       FROM stores
       ${whereSql}
       ORDER BY name`,
      params,
    );
    return successResponse(
      { stores: res.rows, records: res.rows },
      "Stores fetched",
    );
  } catch (err) {
    console.error(err);
    return errorResponse("Failed to fetch stores");
  }
}

export async function POST(request) {
  try {
    await ensureStoresSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "MANAGE_STORES");
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const franchiseType = String(body.franchiseType || "")
      .trim()
      .toUpperCase();
    const isMinimalStore = [
      KIRANA_FRANCHISE_TYPE,
      ASCENT_FRANCHISE_TYPE,
    ].includes(franchiseType);
    const name = String(body.name || "").trim();
    const locationType = String(body.locationType || "").trim();
    const addressLine1 = String(body.addressLine1 || "").trim();
    const addressLine2 = String(body.addressLine2 || "").trim();
    const city = String(body.city || "").trim();
    const state = String(body.state || "").trim();
    const pincode = String(body.pincode || "").trim();
    const country = String(body.country || "").trim() || "India";
    const requiredErrors = [];
    if (!name)
      requiredErrors.push({ field: "name", message: "Store name is required" });
    if (!isMinimalStore && !locationType)
      requiredErrors.push({
        field: "locationType",
        message: "Location type is required",
      });
    if (!addressLine1)
      requiredErrors.push({
        field: "addressLine1",
        message: "Address line 1 is required",
      });
    if (!isMinimalStore && !city)
      requiredErrors.push({ field: "city", message: "City is required" });
    if (!isMinimalStore && !state)
      requiredErrors.push({ field: "state", message: "State is required" });
    if (!isMinimalStore && !pincode)
      requiredErrors.push({ field: "pincode", message: "Pincode is required" });
    else if (!isMinimalStore && !/^\d{6}$/.test(pincode))
      requiredErrors.push({
        field: "pincode",
        message: "Pincode must be 6 digits",
      });
    if (!isMinimalStore && !country)
      requiredErrors.push({ field: "country", message: "Country is required" });
    requiredErrors.push(...validateStoreCommercialPayload(body));
    if (!isMinimalStore) {
      requiredErrors.push(...validateStoreDeliveryPayload(body));
    }
    if (requiredErrors.length) {
      return validationError(requiredErrors);
    }
    const managerMobile = String(body.managerMobile || "").replace(/\D/g, "");
    const managerEmail = String(body.managerEmail || "")
      .trim()
      .toLowerCase();
    if (!isMinimalStore && !managerMobile) {
      return validationError([
        {
          field: "managerMobile",
          message: "Mobile number is required",
        },
      ]);
    }
    if (!isMinimalStore && !/^\d{10}$/.test(managerMobile)) {
      return validationError([
        {
          field: "managerMobile",
          message: "Mobile number must be exactly 10 digits",
        },
      ]);
    }
    if (managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) {
      return validationError([
        { field: "managerEmail", message: "Enter a valid e-mail address" },
      ]);
    }
    const storeCode = normalizeStoreCode(body);
    if (storeCode) {
      const duplicateQuery = buildStoreCodeDuplicateQuery(storeCode);
      const duplicate = await query(duplicateQuery.sql, duplicateQuery.params);
      if (duplicate.rows.length) {
        return validationError([
          { field: "storeCode", message: "Store code is already in use" },
        ]);
      }
    }

    const meta = buildStoreMeta(body);

    const insert = await query(
      `INSERT INTO stores (
         name, address_line1, address_line2, city, state, pincode, country,
         manager_name, manager_mobile, manager_email, opening_time, closing_time, meta, is_active, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,NOW(),NOW())
       RETURNING id, name, address_line1, address_line2, city, state, pincode, country,
                 manager_name, manager_mobile, manager_email, opening_time, closing_time, is_active, meta, created_at, updated_at`,
      [
        name,
        addressLine1,
        addressLine2 || null,
        city,
        state,
        pincode,
        country,
        body.managerName || null,
        managerMobile || null,
        managerEmail || null,
        body.openingTime || null,
        body.closingTime || null,
        JSON.stringify(meta),
      ],
    );

    if (!insert.rows.length) {
      return errorResponse("Failed to create store");
    }

    const createdStore = insert.rows[0];

    // If linked to a construction project, ensure a construction_site record exists and links to this store
    const projectId = Number(body.projectId);
    if (projectId) {
      try {
        const { ensureConstructionSchema } = await import("@/lib/constructionSchema");
        await ensureConstructionSchema();
        const siteCode = String(storeCode || `SITE-${createdStore.id}`).trim().toUpperCase();
        await query(
          `INSERT INTO construction_sites (project_id, site_code, name, address, store_id, status)
           VALUES ($1, $2, $3, $4, $5, 'active')
           ON CONFLICT (project_id, site_code) 
           DO UPDATE SET store_id = EXCLUDED.store_id, name = EXCLUDED.name, address = EXCLUDED.address, updated_at = NOW()`,
          [projectId, siteCode, name, addressLine1, createdStore.id]
        );
      } catch (siteErr) {
        console.error("[stores POST link construction site]", siteErr);
      }
    }

    return successResponse({ store: createdStore }, "Store created", 201);
  } catch (err) {
    console.error("[stores POST]", err);
    return errorResponse("Failed to create store");
  }
}
