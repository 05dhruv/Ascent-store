import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export const MAX_UPLOAD_BYTES =
  Number(process.env.UPLOAD_MAX_BYTES) > 0
    ? Number(process.env.UPLOAD_MAX_BYTES)
    : DEFAULT_MAX_BYTES;

export class UploadError extends Error {
  constructor(message) {
    super(message);
    this.name = "UploadError";
    this.status = 400;
  }
}

// Type is decided from file content, never from the client's name or MIME,
// so HTML/SVG/JS can't be planted under /uploads and served from our origin.
function detectFileType(buffer) {
  const b = buffer;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: ".png", mimeType: "image/png" };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: ".jpg", mimeType: "image/jpeg" };
  }
  if (b.length >= 6 && b.toString("ascii", 0, 6).startsWith("GIF8")) {
    return { ext: ".gif", mimeType: "image/gif" };
  }
  if (
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: ".webp", mimeType: "image/webp" };
  }
  if (b.length >= 5 && b.toString("ascii", 0, 5) === "%PDF-") {
    return { ext: ".pdf", mimeType: "application/pdf" };
  }
  return null;
}

/**
 * Persist an image/PDF buffer under public/uploads and return a public URL path.
 * Throws UploadError (status 400) for oversized or disallowed files.
 */
export async function saveUploadBuffer(buffer, {
  originalName = "file",
  prefix = "evidence",
} = {}) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!data.length) throw new UploadError("Uploaded file is empty");
  if (data.length > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `File too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`,
    );
  }
  const type = detectFileType(data);
  if (!type) {
    throw new UploadError("Only PNG, JPEG, GIF, WEBP images or PDF files are allowed");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const safePrefix = String(prefix || "file").replace(/[^a-z0-9-]/gi, "").slice(0, 20) || "file";
  const safeBase = String(originalName || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\.[^.]*$/, "")
    .slice(0, 80);
  const name = `${safePrefix}-${Date.now()}-${randomBytes(4).toString("hex")}${type.ext}`;
  const fullPath = path.join(UPLOAD_DIR, name);
  await writeFile(fullPath, data);
  return {
    fileUrl: `/uploads/${name}`,
    fileName: `${safeBase || safePrefix}${type.ext}`,
    mimeType: type.mimeType,
    absolutePath: fullPath,
  };
}

/**
 * Save a base64 data-URL (e.g. signature pad) to uploads.
 */
export async function saveDataUrl(dataUrl, { prefix = "signature" } = {}) {
  const raw = String(dataUrl || "");
  // base64 inflates ~4/3; reject before decoding huge payloads
  if (raw.length > Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 100) {
    throw new UploadError(
      `File too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`,
    );
  }
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) throw new UploadError("Invalid data URL");
  const buffer = Buffer.from(match[2], "base64");
  return saveUploadBuffer(buffer, { originalName: prefix, prefix });
}

/**
 * Accept only our own upload paths or http(s) links for stored file URLs,
 * blocking javascript:/data: and other scheme injection.
 */
export function isSafeFileUrl(value) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (url.startsWith("/uploads/") && !url.includes("..")) return true;
  return /^https?:\/\/[^\s]+$/i.test(url);
}
