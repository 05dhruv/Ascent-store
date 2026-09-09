import { query } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  validationError,
} from "@/lib/api-response";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { requireAuth, requirePermission } from "@/lib/api-protection";

function toDateString(v) {
  if (!v) return null;
  try {
    return String(v).slice(0, 10);
  } catch {
    return null;
  }
}

function safeNumber(v, fallback = null) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getIndiaDateString() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

async function ensurePromotionsColumns() {
  // Idempotent column additions in case global schema migration didn't run yet
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS store_id BIGINT`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_applied_on VARCHAR(60) NOT NULL DEFAULT 'ORDER'`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS max_repeat_count INTEGER NOT NULL DEFAULT 0`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS use_for_customer BOOLEAN NOT NULL DEFAULT false`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS remove_other_discounts BOOLEAN NOT NULL DEFAULT false`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS is_auto_applied BOOLEAN NOT NULL DEFAULT false`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_cart_value NUMERIC(14,2) NOT NULL DEFAULT 0`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS max_discount_value NUMERIC(14,2) NOT NULL DEFAULT 0`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS apply_after_tax BOOLEAN NOT NULL DEFAULT false`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS allow_merging BOOLEAN NOT NULL DEFAULT false`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS apply_on_product_mrp BOOLEAN NOT NULL DEFAULT false`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS description TEXT`,
  );
  await query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS products JSONB`);
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS coupon_enabled BOOLEAN NOT NULL DEFAULT false`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS promotion_slots_enabled BOOLEAN NOT NULL DEFAULT false`,
  );
  await query(
    `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`,
  );
}

export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    await ensurePromotionsColumns();
    await query(`UPDATE promotions SET status = 'Inactive', updated_at = NOW() WHERE LOWER(COALESCE(status, '')) = 'active' AND end_date IS NOT NULL AND end_date::date < CURRENT_DATE`);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)),
    );
    const offset = (page - 1) * pageSize;

    const params = [];
    const conditions = [];

    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(
        `(p.name ILIKE $${params.length} OR p.promotion_type ILIKE $${params.length} OR p.status ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`,
      );
    }

    const statusFilter = searchParams.get("status");
    if (statusFilter) {
      params.push(String(statusFilter));
      conditions.push(`p.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRes = await query(
      `SELECT COUNT(*)::int AS n
       FROM promotions p
       LEFT JOIN users u ON u.id = p.requested_by_user_id
       ${where}`,
      params,
    );
    const total = countRes.rows[0].n || 0;

    const limIdx = params.length + 1;
    const offIdx = params.length + 2;

    const result = await query(
      `SELECT p.id, p.name, p.promotion_type, p.discount_value, p.start_date, p.end_date, p.status, p.created_at,
              p.store_id, p.discount_applied_on, p.max_repeat_count, p.use_for_customer,
              p.remove_other_discounts, p.is_auto_applied, p.min_cart_value, p.max_discount_value,
              p.apply_after_tax, p.allow_merging, p.apply_on_product_mrp, p.description,
              p.products, p.coupon_enabled, p.promotion_slots_enabled,
              p.requested_by_user_id,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), 'User') AS requested_by_name,
              CASE
                WHEN p.requested_by_user_id IS NOT NULL THEN CONCAT(COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), 'User'), ' (ID: ', p.requested_by_user_id, ')')
                ELSE NULL
              END AS requested_by
       FROM promotions p
       LEFT JOIN users u ON u.id = p.requested_by_user_id
       ${where}
       ORDER BY p.id DESC
       LIMIT $${limIdx} OFFSET $${offIdx}`,
      [...params, pageSize, offset],
    );

    return successResponse({
      records: result.rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

export async function POST(request) {
  try {
    await ensureCatalogExtrasSchema();
    await ensurePromotionsColumns();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, "MANAGE_CATALOG");
    if (permissionCheck.error) return permissionCheck.error;
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return validationError({ name: "Name is required" });

    const promotionType = String(
      body.promotion_type || body.type || "Discount",
    );
    const discountValue = String(body.discount_value ?? body.discount ?? "0");
    const startDate = toDateString(body.start_date || body.startDate);
    const endDate = toDateString(body.end_date || body.endDate);
    const today = getIndiaDateString();
    if (!startDate || !endDate) {
      return validationError({ date_range: "Date range is required" });
    }
    if (startDate < today) {
      return validationError({
        start_date: "Start date cannot be before today",
      });
    }
    if (endDate < startDate) {
      return validationError({
        end_date: "End date cannot be before start date",
      });
    }

    // extra fields
    const storeId = safeNumber(body.store_id, null);
    const discountAppliedOn = String(
      body.discount_applied_on || body.discountAppliedOn || "ORDER",
    );
    const maxRepeatCount =
      safeNumber(body.max_repeat_count ?? body.maxRepeatCount, 0) || 0;
    const useForCustomer = !!body.use_for_customer || !!body.useForCustomer;
    const removeOtherDiscounts =
      !!body.remove_other_discounts || !!body.removeOtherDiscounts;
    const isAutoApplied = !!body.is_auto_applied || !!body.isAutoApplied;
    const minCartValue =
      safeNumber(body.min_cart_value ?? body.minCartValue, 0) || 0;
    const maxDiscountValue =
      safeNumber(body.max_discount_value ?? body.maxDiscountValue, 0) || 0;
    const applyAfterTax = !!body.apply_after_tax || !!body.applyAfterTax;
    const allowMerging = !!body.allow_merging || !!body.allowMerging;
    const applyOnProductMrp =
      !!body.apply_on_product_mrp || !!body.applyOnProductMrp;
    const description = body.description ? String(body.description) : null;
    let products = null;
    if (body.products) {
      if (Array.isArray(body.products)) products = body.products;
      else if (typeof body.products === "object") products = body.products;
      else if (typeof body.products === "string") {
        // accept comma-separated product ids/tokens
        products = body.products
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    const couponEnabled = !!body.coupon_enabled || !!body.couponEnabled;
    const promotionSlotsEnabled =
      !!body.promotion_slots_enabled || !!body.promotionSlotsEnabled;

    const result = await query(
      `INSERT INTO promotions (
        name, promotion_type, discount_value, start_date, end_date, status,
        store_id, discount_applied_on, max_repeat_count, use_for_customer, remove_other_discounts,
        is_auto_applied, min_cart_value, max_discount_value, apply_after_tax, allow_merging,
        apply_on_product_mrp, description, products, coupon_enabled, promotion_slots_enabled,
        requested_by_user_id, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,COALESCE($6, 'Active'),
        $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),NOW()
      ) RETURNING *`,
      [
        name,
        promotionType,
        discountValue,
        startDate,
        endDate,
        "Pending",
        storeId,
        discountAppliedOn,
        maxRepeatCount,
        useForCustomer,
        removeOtherDiscounts,
        isAutoApplied,
        minCartValue,
        maxDiscountValue,
        applyAfterTax,
        allowMerging,
        applyOnProductMrp,
        description,
        products ? JSON.stringify(products) : null,
        couponEnabled,
        promotionSlotsEnabled,
        auth.user.id,
      ],
    );

    return successResponse(
      result.rows[0],
      "Promotion created successfully",
      201,
    );
  } catch (err) {
    if (err.code === "23505")
      return errorResponse("Promotion already exists", 409);
    return errorResponse(err.message);
  }
}
