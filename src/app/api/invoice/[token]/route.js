/**
 * GET /api/invoice/[token]
 *
 * Public endpoint — no authentication required.
 * Returns the full invoice data for a bill identified by its public_token.
 * The token is a UUID stored in sales_bills.public_token.
 */

import { NextResponse } from 'next/server';
import { query }        from '@/lib/db';

export async function GET(_request, { params }) {
  const { token } = await params;

  if (!token || token.length < 10) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  try {
    // ── Bill + store details ───────────────────────────────────────────────
    // Try with extended store columns first; fall back if migration not run yet
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
      // Extended store columns not yet added — graceful fallback
      billRes = await query(
        `SELECT sb.*, s.name AS store_name
         FROM sales_bills sb
         LEFT JOIN stores s ON s.id = sb.store_id
         WHERE sb.public_token = $1`,
        [token]
      );
    }

    if (!billRes.rows[0]) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const bill = billRes.rows[0];

    // ── Items + payments (parallel) ────────────────────────────────────────
    const [itemsRes, paymentsRes] = await Promise.all([
      query(
        'SELECT * FROM sales_bill_items  WHERE sales_bill_id = $1 ORDER BY id',
        [bill.id]
      ),
      query(
        'SELECT * FROM sales_bill_payments WHERE sales_bill_id = $1 ORDER BY id',
        [bill.id]
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        bill,
        items:    itemsRes.rows,
        payments: paymentsRes.rows,
      },
    });
  } catch (err) {
    console.error('[Invoice API]', err.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
