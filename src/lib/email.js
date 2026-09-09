import nodemailer from 'nodemailer';

/**
 * Create a nodemailer transport using environment variables.
 */
function getTransport() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 0);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const secureValue = String(process.env.SMTP_SECURE || "").toLowerCase();
  const secure = secureValue ? ["true", "1", "yes"].includes(secureValue) : port === 465;
  if (!host || !port || !user || !pass) {
    console.warn('[EMAIL] SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS.');
    return null;
  }
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

/**
 * Send a minimal payment notification email to a vendor.
 *
 * @param {Object} params
 * @param {string} params.vendorEmail - Recipient email address.
 * @param {string} [params.vendorName] - Optional vendor name for greeting.
 * @param {string} params.paymentDueDate - Due date in YYYY-MM-DD format.
 * @param {number} params.creditDays - Number of credit days.
 */
export async function sendVendorPaymentNotification({
  vendorEmail,
  vendorName = 'Vendor',
  paymentDueDate,
  creditDays,
  grnNumber,
  invoiceNumber,
  amount,
}) {
  if (!vendorEmail) {
    console.warn('[EMAIL] Vendor email is missing; GRN notification was not sent.');
    return { sent: false, reason: 'Vendor email is missing' };
  }
  const transport = getTransport();
  if (!transport) return { sent: false, reason: 'SMTP is not configured' };

  const subject = `GRN confirmed${grnNumber ? `: ${grnNumber}` : ''}`;
  const text = [
    `Dear ${vendorName},`,
    '',
    'Your goods receipt has been confirmed.',
    grnNumber ? `GRN: ${grnNumber}` : null,
    invoiceNumber ? `Invoice: ${invoiceNumber}` : null,
    Number.isFinite(Number(amount)) ? `Amount: ₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : null,
    paymentDueDate ? `Payment due date: ${paymentDueDate}${creditDays != null ? ` (${creditDays} credit days)` : ''}` : null,
    '',
    'Thank you.',
  ].filter((line) => line !== null).join('\n');

  const result = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.EMAIL_FROM || user,
    to: vendorEmail,
    subject,
    text,
  });
  console.info(`[EMAIL] GRN notification accepted for ${vendorEmail}: ${result.messageId}`);
  return { sent: true, messageId: result.messageId };
}
