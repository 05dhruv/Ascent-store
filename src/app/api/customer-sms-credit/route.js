import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomerSmsCreditSchema } from '@/lib/customerSmsCreditSchema';
import { ensureCustomerMessageHistorySchema } from '@/lib/customerMessageHistorySchema';
import { requireAuth, requirePermission } from '@/lib/api-protection';

function parseNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function parsePositiveNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

async function getSummary() {
  const purchasedRes = await query(`
    SELECT COALESCE(SUM(credits_purchased), 0)::numeric AS total_purchased
    FROM customer_sms_credit_purchases
  `);

  const consumedRes = await query(`
    SELECT COALESCE(SUM(credits_used), 0)::numeric AS total_consumed
    FROM customer_message_history
    WHERE LOWER(COALESCE(message_type, '')) = 'sms'
  `);

  const purchased = Number(purchasedRes.rows?.[0]?.total_purchased || 0);
  const consumed = Number(consumedRes.rows?.[0]?.total_consumed || 0);
  const left = purchased - consumed;

  return {
    purchased,
    consumed,
    left: left < 0 ? 0 : left,
  };
}

export async function GET(request) {
  try {
    await Promise.all([ensureCustomerSmsCreditSchema(), ensureCustomerMessageHistorySchema()]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;
    const summary = await getSummary();
    return NextResponse.json({ summary });
  } catch (err) {
    console.error('[customer-sms-credit GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to load SMS credit summary' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await Promise.all([ensureCustomerSmsCreditSchema(), ensureCustomerMessageHistorySchema()]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const creditsPurchased = parsePositiveNumber(body.creditsPurchased, 0);
    const ratePerCredit = parseNumber(body.ratePerCredit, 0);
    const amountPaid = parseNumber(body.amountPaid, creditsPurchased * ratePerCredit);
    const purchasedAt = parseDateTime(body.purchasedAt) || new Date().toISOString();
    const remarks = normalizeText(body.remarks);
    const createdBy = normalizeText(body.createdBy) || 'System';

    if (!creditsPurchased) {
      return NextResponse.json({ error: 'creditsPurchased is required' }, { status: 400 });
    }

    const inserted = await query(
      `
        INSERT INTO customer_sms_credit_purchases (
          purchased_at, credits_purchased, rate_per_credit, amount_paid, remarks, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [purchasedAt, creditsPurchased, ratePerCredit, amountPaid, remarks, createdBy]
    );

    const summary = await getSummary();

    return NextResponse.json({ ok: true, id: inserted.rows[0].id, summary }, { status: 201 });
  } catch (err) {
    console.error('[customer-sms-credit POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to save SMS credits' }, { status: 500 });
  }
}

export default null;
