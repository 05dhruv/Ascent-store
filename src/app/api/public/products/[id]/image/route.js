import { query } from "@/lib/db";
import { toPositiveInt } from "../../../_utils";

export const dynamic = "force-dynamic";

const DATA_URL_RE = /^data:([^;,]+)?((?:;[^;,]+)*?)(;base64)?,(.*)$/is;

const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

function decodeDataUrl(value) {
  const match = DATA_URL_RE.exec(value);
  if (!match) return null;
  const mime = (match[1] || "").trim().toLowerCase();
  if (!mime.startsWith("image/")) return null;
  try {
    const body = match[3]
      ? Buffer.from(match[4], "base64")
      : Buffer.from(decodeURIComponent(match[4]), "utf8");
    return body.length ? { mime, body } : null;
  } catch {
    return null;
  }
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const productId = toPositiveInt(id);
    if (!productId) return notFound();

    const result = await query(
      `SELECT image_url,
              FLOOR(EXTRACT(EPOCH FROM COALESCE(updated_at, created_at, 'epoch'::timestamptz)))::bigint
                || '-' || pg_column_size(image_url) AS version
       FROM products
       WHERE id = $1`,
      [productId],
    );
    const row = result.rows[0];
    const imageUrl = String(row?.image_url || "").trim();
    if (!imageUrl) return notFound();

    if (/^https?:\/\//i.test(imageUrl)) {
      return new Response(null, {
        status: 302,
        headers: { Location: imageUrl, "Cache-Control": "public, max-age=300" },
      });
    }

    const decoded = imageUrl.startsWith("data:") ? decodeDataUrl(imageUrl) : null;
    if (!decoded) return notFound();

    const etag = `"${row.version}"`;
    const requestedVersion = new URL(request.url).searchParams.get("v");
    const cacheControl =
      requestedVersion === row.version
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate";

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": cacheControl },
      });
    }

    return new Response(decoded.body, {
      status: 200,
      headers: {
        ...SAFE_HEADERS,
        "Content-Type": decoded.mime,
        "Content-Length": String(decoded.body.length),
        "Cache-Control": cacheControl,
        ETag: etag,
      },
    });
  } catch (err) {
    console.error("[public product image]", err);
    return new Response("Failed to load image", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
