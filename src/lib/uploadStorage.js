import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Persist a Buffer/Uint8Array under public/uploads and return a public URL path.
 */
export async function saveUploadBuffer(buffer, {
  originalName = "file",
  mimeType = "application/octet-stream",
  prefix = "evidence",
} = {}) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const safeBase = String(originalName || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  const ext = path.extname(safeBase) || guessExt(mimeType);
  const name = `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, name);
  await writeFile(fullPath, buffer);
  return {
    fileUrl: `/uploads/${name}`,
    fileName: safeBase || name,
    mimeType,
    absolutePath: fullPath,
  };
}

/**
 * Save a data-URL (e.g. signature pad) to uploads.
 */
export async function saveDataUrl(dataUrl, { prefix = "signature" } = {}) {
  const match = String(dataUrl || "").match(
    /^data:([^;]+);base64,(.+)$/i,
  );
  if (!match) {
    throw new Error("Invalid data URL");
  }
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return saveUploadBuffer(buffer, {
    originalName: `${prefix}${guessExt(mimeType)}`,
    mimeType,
    prefix,
  });
}

function guessExt(mimeType) {
  const m = String(mimeType || "").toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("webp")) return ".webp";
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("gif")) return ".gif";
  return ".bin";
}
