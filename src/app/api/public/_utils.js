import { NextResponse } from "next/server";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

export function publicHeaders() {
  const allowedOrigin = process.env.PUBLIC_API_ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function optionsResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: publicHeaders(),
  });
}

export function jsonResponse(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: publicHeaders(),
  });
}

export function success(data, message = "Success", status = 200) {
  return jsonResponse(
    {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    },
    status,
  );
}

export function failure(message = "Something went wrong", status = 500) {
  return jsonResponse(
    {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    },
    status,
  );
}

export function toPositiveInt(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getPagination(searchParams) {
  const page = toPositiveInt(searchParams.get("page"), 1);
  const requestedPageSize = toPositiveInt(
    searchParams.get("pageSize") || searchParams.get("limit"),
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function mapPublicProduct(row) {
  const mrp = Number(row.mrp || 0);
  const sellingPrice = Number(row.selling_price || 0);
  const stock = Number(row.stock || 0);
  return {
    id: Number(row.id),
    product_id: row.product_id,
    name: row.name || "",
    sku: row.sku || "",
    barcode: row.barcode || "",
    image_url: row.image_url || null,
    mrp,
    selling_price: sellingPrice,
    price: sellingPrice,
    discount_amount: Math.max(mrp - sellingPrice, 0),
    discount_percent:
      mrp > 0 && sellingPrice > 0 && mrp > sellingPrice
        ? Math.round(((mrp - sellingPrice) / mrp) * 100)
        : 0,
    stock,
    in_stock: stock > 0,
    unit: row.unit || "PCS",
    category_id: row.category_id ? Number(row.category_id) : null,
    category_name: row.category_name || null,
    sub_category_id: row.sub_category_id ? Number(row.sub_category_id) : null,
    sub_category_name: row.sub_category_name || null,
    brand_id: row.brand_id ? Number(row.brand_id) : null,
    brand_name: row.brand_name || null,
    department_id: row.department_id ? Number(row.department_id) : null,
    department_name: row.department_name || null,
    tax_rate: Number(row.tax_rate || 0),
    pricing_source: row.pricing_source || "product",
  };
}

export const STORE_PRICE_LATERAL_SQL = `
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(NULLIF(sti.destination_mrp, 0), NULLIF(sti.mrp, 0), 0) AS mrp,
      COALESCE(NULLIF(sti.selling_price, 0), 0) AS selling_price,
      COALESCE(st.confirmed_at, st.created_at) AS confirmed_at
    FROM stock_transfer_items sti
    INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
    WHERE st.status = 'confirmed'
      AND st.destination_id = ps.store_id
      AND sti.product_id = p.id
      AND (
        COALESCE(sti.destination_mrp, 0) > 0
        OR COALESCE(sti.mrp, 0) > 0
        OR COALESCE(sti.selling_price, 0) > 0
      )
    ORDER BY COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
    LIMIT 1
  ) transfer_price ON TRUE
`;

export const PRODUCT_STOCK_CTE_SQL = `
  stock AS (
    SELECT product_id, store_id, SUM(available_qty) AS stock
    FROM inventory_batches
    WHERE status = 'active'
      AND available_qty > 0
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    GROUP BY product_id, store_id
  )
`;
