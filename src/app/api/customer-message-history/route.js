import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureCustomerMessageHistorySchema } from '@/lib/customerMessageHistorySchema';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function parsePositiveInteger(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseDateTime(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseAmount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mapRow(row, index, page, pageSize) {
  const sentAt = row.sent_at ? new Date(row.sent_at) : null;
  const deliveryDate = sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt.toISOString().slice(0, 10) : null;
  const deliveryTime = sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt.toISOString().slice(11, 19) : null;

  return {
    id: row.id,
    sNo: (page - 1) * pageSize + index + 1,
    storeId: row.store_id || '—',
    store: row.store_name || '—',
    orderId: row.order_id || '—',
    customerId: row.customer_id || '—',
    customerMobile: row.customer_mobile || '—',
    mobile: row.mobile_number || '—',
    messageType: row.message_type || 'SMS',
    messageTypeName: row.message_type_name || row.message_type || 'SMS',
    message: row.message_text || '',
    creditsUsed: Number(row.credits_used || 0),
    status: row.status || 'Sent',
    sentAt: row.sent_at || null,
    deliveryDate: deliveryDate || '—',
    deliveryTime: deliveryTime || '—',
    customerName: row.customer_name || '',
  };
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureCustomerMessageHistorySchema(),
      ensureStockInSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(url.searchParams.get('pageSize'), 10);
    const dateFrom = parseDate(url.searchParams.get('dateFrom'));
    const dateTo = parseDate(url.searchParams.get('dateTo'));
    const store = normalizeText(url.searchParams.get('store'));
    const search = normalizeText(url.searchParams.get('search'));
    const messageType = normalizeText(url.searchParams.get('messageType'));

    const params = [];
    const where = [];

    if (dateFrom) {
      params.push(dateFrom);
      where.push(`COALESCE(mh.sent_at::date, mh.created_at::date) >= $${params.length}::date`);
    }

    if (dateTo) {
      params.push(dateTo);
      where.push(`COALESCE(mh.sent_at::date, mh.created_at::date) <= $${params.length}::date`);
    }

    if (store && store.toLowerCase() !== 'all') {
      params.push(store);
      const idx = params.length;
      where.push(`(CAST(mh.store_id AS TEXT) = $${idx} OR LOWER(COALESCE(s.name, '')) = LOWER($${idx}))`);
    }

    if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) return NextResponse.json({ rows: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
      params.push(assignedStores);
      where.push(`mh.store_id = ANY($${params.length}::int[])`);
    }

    if (messageType && messageType.toLowerCase() !== 'all') {
      params.push(messageType);
      const idx = params.length;
      where.push(`LOWER(COALESCE(mh.message_type, '')) = LOWER($${idx})`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where.push(`(
        COALESCE(mh.order_id, '') ILIKE $${idx}
        OR COALESCE(mh.mobile_number, '') ILIKE $${idx}
        OR COALESCE(mh.message_text, '') ILIKE $${idx}
        OR COALESCE(mh.message_type, '') ILIKE $${idx}
        OR COALESCE(c.customer_code, '') ILIKE $${idx}
        OR COALESCE(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') ILIKE $${idx}
        OR COALESCE(s.name, '') ILIKE $${idx}
      )`);
    }

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const res = await query(
      `
        SELECT
          mh.id,
          mh.store_id,
          s.name AS store_name,
          mh.customer_id,
          COALESCE(c.customer_code, c.id::text) AS customer_code,
          TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name,
          c.mobile_number AS customer_mobile,
          mh.order_id,
          COALESCE(mh.mobile_number, c.mobile_number) AS mobile_number,
          mh.message_type,
          CASE
            WHEN LOWER(COALESCE(mh.message_type, '')) = 'whatsapp' THEN 'WhatsApp'
            WHEN LOWER(COALESCE(mh.message_type, '')) = 'sms' THEN 'SMS'
            ELSE COALESCE(mh.message_type, 'Message')
          END AS message_type_name,
          mh.message_text,
          mh.credits_used,
          mh.status,
          mh.sent_at,
          COUNT(*) OVER()::INT AS total_count
        FROM customer_message_history mh
        LEFT JOIN customers c ON c.id = mh.customer_id
        LEFT JOIN stores s ON s.id = mh.store_id
        ${whereSql}
        ORDER BY COALESCE(mh.sent_at, mh.created_at) DESC, mh.id DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      params
    );

    const rows = Array.isArray(res.rows) ? res.rows : [];
    const total = rows.length ? Number(rows[0].total_count || 0) : 0;

    return NextResponse.json({
      rows: rows.map((row, index) => mapRow(row, index, page, pageSize)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      },
    });
  } catch (err) {
    console.error('[customer-message-history GET]', err.message);
    return NextResponse.json(
      {
        rows: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        error: err.message || 'Failed to fetch message history',
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureCustomerMessageHistorySchema(),
      ensureStockInSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const customerId = body.customerId == null || body.customerId === '' ? null : parsePositiveInteger(body.customerId, 0);
    const storeId = body.storeId == null || body.storeId === '' ? null : parsePositiveInteger(body.storeId, 0);
    const orderId = normalizeText(body.orderId);
    const mobileNumber = normalizeText(body.mobileNumber);
    const messageType = normalizeText(body.messageType) || 'SMS';
    const messageText = normalizeText(body.messageText);
    const creditsUsed = parseAmount(body.creditsUsed, 0);
    const status = normalizeText(body.status) || 'Sent';
    const sentAt = parseDateTime(body.sentAt) || new Date().toISOString();
    const createdBy = normalizeText(body.createdBy) || 'System';

    if (!messageText) {
      return NextResponse.json({ error: 'messageText is required' }, { status: 400 });
    }

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    const result = await query(
      `
        INSERT INTO customer_message_history (
          store_id, customer_id, order_id, mobile_number, message_type, message_text,
          credits_used, status, sent_at, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `,
      [storeId, customerId, orderId, mobileNumber, messageType, messageText, creditsUsed, status, sentAt, createdBy]
    );

    return NextResponse.json({ ok: true, id: result.rows[0].id }, { status: 201 });
  } catch (err) {
    console.error('[customer-message-history POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to save message history' }, { status: 500 });
  }
}

export default null;
