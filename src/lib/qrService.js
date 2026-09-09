/**
 * qrService.js
 *
 * Utilities for generating QR codes that link to the public invoice viewer.
 *
 * ── How it works ─────────────────────────────────────────────────────────
 * 1. Every sales_bill has a unique `public_token` (UUID) stored in Postgres.
 * 2. getInvoiceURL(token) builds:  {APP_URL}/invoice/{token}
 * 3. generateQRDataURL(url) converts that URL into a base-64 PNG data URL
 *    that can be dropped into <img src="…"> or embedded in the print window.
 *
 * Both functions work in the browser (canvas-based) and in Node.js.
 */

/**
 * Build the public invoice URL for a given bill token.
 * @param {string} publicToken  UUID stored in sales_bills.public_token
 */
export function getInvoiceURL(publicToken) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return `${base}/invoice/${publicToken}`;
}

/**
 * Generate a QR code as a base-64 PNG data URL.
 * Uses dynamic import so the 'qrcode' package is NOT bundled into the
 * initial JS bundle — it is only loaded when actually needed.
 *
 * @param {string} url  The URL to encode
 * @param {object} [opts]
 * @param {number} [opts.size=200]      Width in pixels
 * @param {number} [opts.margin=1]      Quiet zone in modules
 * @param {string} [opts.quality='M']   Error correction: L | M | Q | H
 * @returns {Promise<string>}           data:image/png;base64,…
 */
export async function generateQRDataURL(url, opts = {}) {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(url, {
    width:                opts.size    ?? 200,
    margin:               opts.margin  ?? 1,
    errorCorrectionLevel: opts.quality ?? 'M',
    color: { dark: '#111827', light: '#FFFFFF' },
  });
}
