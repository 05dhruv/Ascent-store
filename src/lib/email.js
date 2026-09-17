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

  try {
    const fromAddress = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;
    const result = await transport.sendMail({
      from: fromAddress,
      to: vendorEmail,
      subject,
      text,
    });
    console.info(`[EMAIL] GRN notification accepted for ${vendorEmail}: ${result.messageId}`);
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    console.error(`[EMAIL] Failed sending GRN notification to ${vendorEmail}:`, err);
    return { sent: false, reason: err.message };
  }
}

/**
 * Send a professional Purchase Order / Material Requirement email to a vendor.
 */
export async function sendVendorPurchaseOrderRequirementEmail({
  vendorEmail,
  vendorName = 'Vendor',
  ccEmails,
  poNumber,
  requisitionNumber,
  siteName,
  deliveryAddress,
  expectedDeliveryDate,
  requestedBy,
  items = [],
  totalItems,
  totalCost,
  remarks,
}) {
  if (!vendorEmail) {
    console.warn('[EMAIL] Vendor email is missing; Purchase Order notification was not sent.');
    return { sent: false, reason: 'Vendor email is missing' };
  }

  const transport = getTransport();
  const fromAddress = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;
  const subject = `Purchase Order ${poNumber || 'New Requirement'}${siteName ? ` - Delivery for ${siteName}` : ''}`;

  const formattedItems = (items || []).map((item, idx) => {
    const qty = Number(item.qty || 0);
    const unit = item.unit || 'PCS';
    const dim = item.dimensions ? ` [${item.dimensions}]` : '';
    const rate = Number(item.costPrice || item.cost_price || 0);
    const est = rate > 0 ? ` (Est. ₹${(qty * rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })})` : '';
    return `${idx + 1}. ${item.productName || item.product_name || 'Material'}${dim} - Qty: ${qty} ${unit}${est}`;
  }).join('\n');

  const text = [
    `Dear ${vendorName},`,
    '',
    `We have generated Purchase Order ${poNumber || ''} for material requirement at our site${siteName ? `: ${siteName}` : ''}.`,
    '',
    '--------------------------------------------------',
    'MATERIAL REQUIREMENT & SPECIFICATIONS:',
    '--------------------------------------------------',
    formattedItems,
    '--------------------------------------------------',
    '',
    requisitionNumber ? `Site Request Ref: ${requisitionNumber}` : null,
    expectedDeliveryDate ? `Expected Delivery Date: ${expectedDeliveryDate}` : null,
    deliveryAddress ? `Delivery Address: ${deliveryAddress}` : (siteName ? `Delivery Site: ${siteName}` : null),
    requestedBy ? `Site Requester / Contact: ${requestedBy}` : null,
    remarks ? `Special Instructions / Remarks: ${remarks}` : null,
    Number(totalCost) > 0 ? `Total Estimated Value: ₹${Number(totalCost).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : null,
    '',
    'Please confirm receipt of this order and let us know the dispatch schedule.',
    '',
    'Regards,',
    'Procurement & Site Store Team',
    'Ascent Store Management',
  ].filter((line) => line !== null).join('\n');

  const htmlItems = (items || []).map((item, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px; text-align: center; color: #64748b;">${idx + 1}</td>
      <td style="padding: 10px; font-weight: 600; color: #1e293b;">
        ${item.productName || item.product_name || 'Material'}
        ${item.dimensions ? `<br/><span style="font-size: 11px; color: #64748b; font-weight: normal;">Specs/Dim: ${item.dimensions}</span>` : ''}
      </td>
      <td style="padding: 10px; text-align: center; font-weight: 600; color: #2563eb;">
        ${item.qty} ${item.unit || 'PCS'}
      </td>
      <td style="padding: 10px; text-align: right; color: #475569;">
        ${Number(item.costPrice || item.cost_price || 0) > 0 ? `₹${Number(item.costPrice || item.cost_price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
      </td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 24px; color: #ffffff;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Purchase Order & Material Requirement</h1>
        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">PO Number: ${poNumber || 'New'} | ${siteName || 'Site Requirement'}</p>
      </div>
      
      <div style="padding: 24px;">
        <p style="margin-top: 0; font-size: 15px; color: #334155;">Dear <strong>${vendorName}</strong>,</p>
        <p style="font-size: 14px; color: #475569; line-height: 1.5;">
          Please process the following material requirement. Delivery is requested at <strong>${siteName || 'our project site'}</strong>.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px; color: #334155;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${expectedDeliveryDate ? `<div><strong>Expected Delivery:</strong> ${expectedDeliveryDate}</div>` : ''}
            ${requisitionNumber ? `<div><strong>Site Request ID:</strong> ${requisitionNumber}</div>` : ''}
            ${requestedBy ? `<div><strong>Site Contact / Requester:</strong> ${requestedBy}</div>` : ''}
            ${deliveryAddress ? `<div><strong>Delivery Address:</strong> ${deliveryAddress}</div>` : ''}
          </div>
          ${remarks ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1;"><strong>Remarks:</strong> ${remarks}</div>` : ''}
        </div>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f1f5f9; color: #475569; text-align: left; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 10px; width: 40px; text-align: center;">#</th>
              <th style="padding: 10px;">Material & Specifications</th>
              <th style="padding: 10px; text-align: center;">Required Qty</th>
              <th style="padding: 10px; text-align: right;">Est. Rate</th>
            </tr>
          </thead>
          <tbody>
            ${htmlItems}
          </tbody>
        </table>

        ${Number(totalCost) > 0 ? `
          <div style="text-align: right; margin-top: 12px; font-size: 14px; font-weight: bold; color: #1e293b;">
            Total Estimated Value: <span style="color: #2563eb;">₹${Number(totalCost).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        ` : ''}

        <p style="font-size: 13px; color: #64748b; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          Please confirm your acceptance of this Purchase Order and inform us of the expected dispatch time.
        </p>
      </div>

      <div style="background: #f8fafc; padding: 14px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
        Ascent Store Management System • Automated Procurement Notification
      </div>
    </div>
  `;

  if (!transport) {
    console.info(`[EMAIL SIMULATION] SMTP not configured. PO email for ${vendorEmail}:\nSubject: ${subject}\n${text}`);
    return {
      sent: true,
      simulated: true,
      messageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      notice: 'SMTP is not configured in environment. Notification logged in system.',
    };
  }

  try {
    const result = await transport.sendMail({
      from: fromAddress,
      to: vendorEmail,
      cc: ccEmails || undefined,
      subject,
      text,
      html,
    });
    console.info(`[EMAIL] PO notification sent successfully to ${vendorEmail}: ${result.messageId}`);
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    console.error(`[EMAIL] Failed sending PO email to ${vendorEmail}:`, err);
    return { sent: false, reason: err.message };
  }
}
