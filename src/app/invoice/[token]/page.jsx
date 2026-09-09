/**
 * /invoice/[token]  — Public invoice viewer (Server Component)
 *
 * Fetches the invoice server-side (fast, no client JS needed for data),
 * then hands it to InvoiceClientView for interactive elements (QR, print).
 *
 * This page is deliberately outside the auth middleware — no login required.
 */

import { notFound } from 'next/navigation';
import { query }    from '@/lib/db';
import InvoiceClientView from './InvoiceClientView';

export const dynamic   = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }) {
  const { token } = await params;
  // Minimal meta so search engines / link-unfurlers show something useful
  return {
    title:       'Invoice — Buyzaar Sync',
    description: `Digital invoice ${token.slice(0, 8).toUpperCase()}`,
  };
}

async function fetchInvoice(token) {
  try {
    let billRes;
    try {
      billRes = await query(
        `SELECT
           sb.*,
           s.name    AS store_name,
           s.address AS store_address,
           s.phone   AS store_phone,
           s.gstin   AS store_gstin,
           s.email   AS store_email,
           s.city    AS store_city,
           s.state   AS store_state,
           s.pincode AS store_pincode
         FROM sales_bills sb
         LEFT JOIN stores s ON s.id = sb.store_id
         WHERE sb.public_token = $1`,
        [token]
      );
    } catch {
      billRes = await query(
        `SELECT sb.*, s.name AS store_name
         FROM sales_bills sb
         LEFT JOIN stores s ON s.id = sb.store_id
         WHERE sb.public_token = $1`,
        [token]
      );
    }

    if (!billRes.rows[0]) return null;

    const bill = billRes.rows[0];
    const [itemsRes, paymentsRes] = await Promise.all([
      query('SELECT * FROM sales_bill_items  WHERE sales_bill_id = $1 ORDER BY id', [bill.id]),
      query('SELECT * FROM sales_bill_payments WHERE sales_bill_id = $1 ORDER BY id', [bill.id]),
    ]);

    return { bill, items: itemsRes.rows, payments: paymentsRes.rows };
  } catch (err) {
    console.error('[Invoice Page]', err.message);
    return null;
  }
}

export default async function InvoicePage({ params }) {
  const { token } = await params;

  if (!token || token.length < 10) notFound();

  const data = await fetchInvoice(token);
  if (!data) notFound();

  // Dates aren't serializable — convert to plain objects for the client component
  const serialized = JSON.parse(JSON.stringify(data));

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const invoiceURL = `${appUrl}/invoice/${token}`;

  return (
    <InvoiceClientView
      data={serialized}
      token={token}
      invoiceURL={invoiceURL}
    />
  );
}
