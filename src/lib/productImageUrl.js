const IMAGE_PATH_RE = /^(?:https?:\/\/[^/]+)?\/api\/public\/products\/(\d+)\/image(?:\?.*)?$/i;

/**
 * SQL expression that swaps inline data: images for a short, cache-busted
 * URL served by /api/public/products/[id]/image. Other values pass through.
 */
export function productImageUrlSql(alias = "p") {
  return `CASE WHEN LEFT(${alias}.image_url, 5) = 'data:'
    THEN '/api/public/products/' || ${alias}.id || '/image?v='
      || FLOOR(EXTRACT(EPOCH FROM COALESCE(${alias}.updated_at, ${alias}.created_at, 'epoch'::timestamptz)))::bigint
      || '-' || pg_column_size(${alias}.image_url)
    ELSE ${alias}.image_url END`;
}

export function getRequestOrigin(request) {
  const headers = request.headers;
  const url = new URL(request.url);
  const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host") || url.host;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function absolutizeProductImageUrl(value, origin) {
  if (typeof value !== "string" || !value.startsWith("/api/public/products/")) return value;
  return `${origin}${value}`;
}

export function isProductImageEndpointUrl(value, productId) {
  const match = String(value ?? "").trim().match(IMAGE_PATH_RE);
  return Boolean(match) && Number(match[1]) === Number(productId);
}
