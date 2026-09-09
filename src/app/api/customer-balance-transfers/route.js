import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureCustomerAdvancePaymentsSchema } from '@/lib/customerAdvancePaymentsSchema';
import { ensureCustomerBalanceTransferSchema } from '@/lib/customerBalanceTransferSchema';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function parsePositiveInteger(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function parseAmount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
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

function mapRow(row, index, page, pageSize) {
  return {
    id: row.id,
    sNo: (page - 1) * pageSize + index + 1,
    fromCustomerId: row.from_customer_id,
    fromCustomerCode: row.from_customer_code || '',
    fromCustomerName: row.from_customer_name || '',
    fromCustomerPhone: row.from_customer_phone || '',
    fromAccountType: row.from_customer_type || '',
    toCustomerId: row.to_customer_id,
    toCustomerCode: row.to_customer_code || '',
    toCustomerName: row.to_customer_name || '',
    toCustomerPhone: row.to_customer_phone || '',
    toAccountType: row.to_customer_type || '',
    date: row.transfer_date,
    amount: Number(row.amount || 0),
    reference: row.reference_id || '',
    storeId: row.store_id,
    storeName: row.store_name || '',
    remainingFromBalance: Number(row.remaining_from_balance || 0),
    receivedToBalance: Number(row.received_to_balance || 0),
    remarks: row.remarks || '',
  };
}

async function getCustomerBalances(page, pageSize, filters) {
  const { store, search, dateFrom, dateTo } = filters;
  const params = [];
  const where = [];

  if (store && store.toLowerCase() !== 'all') {
    params.push(store);
    const idx = params.length;
    where.push(`(
      CAST(balance.store_id AS TEXT) = $${idx}
      OR LOWER(COALESCE(balance.store_name, '')) = LOWER($${idx})
    )`);
  }

  if (Array.isArray(filters.storeIds)) {
    if (!filters.storeIds.length) {
      where.push('1 = 0');
    } else {
      params.push(filters.storeIds);
      where.push(`balance.store_id = ANY($${params.length}::int[])`);
    }
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    where.push(`(
      COALESCE(balance.customer_code, '') ILIKE $${idx}
      OR COALESCE(balance.customer_name, '') ILIKE $${idx}
      OR COALESCE(balance.mobile_number, '') ILIKE $${idx}
    )`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    const idx = params.length;
    where.push(`balance.transfer_date >= $${idx}::date`);
  }

  if (dateTo) {
    params.push(dateTo);
    const idx = params.length;
    where.push(`balance.transfer_date <= $${idx}::date`);
  }

  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const result = await query(
    `
      WITH transfers AS (
        SELECT
          cbt.id,
          cbt.from_customer_id,
          cbt.to_customer_id,
          cbt.store_id,
          cbt.amount,
          cbt.transfer_date,
          cbt.reference_id,
          cbt.remarks,
          cbt.created_by,
          cbt.created_at,
          cf.customer_code AS from_customer_code,
          TRIM(COALESCE(cf.first_name, '') || ' ' || COALESCE(cf.last_name, '')) AS from_customer_name,
          cf.mobile_number AS from_customer_phone,
          cf.customer_type AS from_customer_type,
          ct.customer_code AS to_customer_code,
          TRIM(COALESCE(ct.first_name, '') || ' ' || COALESCE(ct.last_name, '')) AS to_customer_name,
          ct.mobile_number AS to_customer_phone,
          ct.customer_type AS to_customer_type,
          s.name AS store_name,
          COALESCE(cf_balance.current_balance, 0) AS remaining_from_balance,
          COALESCE(ct_balance.current_balance, 0) AS received_to_balance,
          COUNT(*) OVER()::INT AS total_count
        FROM customer_balance_transfers cbt
        JOIN customers cf ON cf.id = cbt.from_customer_id
        JOIN customers ct ON ct.id = cbt.to_customer_id
        LEFT JOIN stores s ON s.id = cbt.store_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(cap.amount - cap.used_amount), 0) AS current_balance
          FROM customer_advance_payments cap
          WHERE cap.customer_id = cf.id
        ) cf_balance ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(cap.amount - cap.used_amount), 0) AS current_balance
          FROM customer_advance_payments cap
          WHERE cap.customer_id = ct.id
        ) ct_balance ON TRUE
      )
      SELECT *
      FROM transfers balance
      ${whereSql}
      ORDER BY balance.transfer_date DESC, balance.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    params
  );

  const rows = Array.isArray(result.rows) ? result.rows : [];
  const total = rows.length ? Number(rows[0].total_count || 0) : 0;

  return {
    rows: rows.map((row, index) => mapRow(row, index, page, pageSize)),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
    },
  };
}

export async function GET(request) {
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureCustomerAdvancePaymentsSchema(),
      ensureCustomerBalanceTransferSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(url.searchParams.get('pageSize'), 10);
    const store = normalizeText(url.searchParams.get('store'));
    const search = normalizeText(url.searchParams.get('search'));
    const dateFrom = parseDate(url.searchParams.get('dateFrom'));
    const dateTo = parseDate(url.searchParams.get('dateTo'));

    const data = await getCustomerBalances(page, pageSize, {
      store,
      search,
      dateFrom,
      dateTo,
      storeIds: auth.user.role === 'super_admin' ? null : getAssignedStoreIds(auth.user),
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[customer-balance-transfers GET]', err.message);
    return NextResponse.json({ rows: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 }, error: err.message || 'Failed to fetch balance tracker' }, { status: 500 });
  }
}

export async function POST(request) {
  const client = await getClient();
  try {
    await Promise.all([
      ensureCustomersSchema(),
      ensureCustomerAdvancePaymentsSchema(),
      ensureCustomerBalanceTransferSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const fromCustomerId = parsePositiveInteger(body.fromCustomerId, 0);
    const toCustomerId = parsePositiveInteger(body.toCustomerId, 0);
    const amount = parseAmount(body.amount, 0);
    const transferDate = parseDate(body.transferDate) || new Date().toISOString().slice(0, 10);
    const referenceId = normalizeText(body.referenceId);
    const remarks = normalizeText(body.remarks);
    const createdBy = normalizeText(body.createdBy) || 'System';

    if (!fromCustomerId || !toCustomerId) {
      return NextResponse.json({ error: 'Both source and destination customers are required' }, { status: 400 });
    }

    if (fromCustomerId === toCustomerId) {
      return NextResponse.json({ error: 'Source and destination customers must be different' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
    }

    await client.query('BEGIN');

    await client.query(
      `SELECT id FROM customers WHERE id = ANY($1::bigint[]) FOR UPDATE`,
      [[fromCustomerId, toCustomerId]]
    );

    const balanceRows = await client.query(
      `
        SELECT
          c.id,
          COALESCE(adv.balance, 0) AS direct_balance,
          COALESCE(incoming.balance, 0) AS incoming_balance,
          COALESCE(outgoing.balance, 0) AS outgoing_balance,
          COALESCE(adv.balance, 0) + COALESCE(incoming.balance, 0) - COALESCE(outgoing.balance, 0) AS customer_balance
        FROM customers c
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(cap.amount - cap.used_amount), 0) AS balance
          FROM customer_advance_payments cap
          WHERE cap.customer_id = c.id
        ) adv ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(cbt.amount), 0) AS balance
          FROM customer_balance_transfers cbt
          WHERE cbt.to_customer_id = c.id
        ) incoming ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(cbt.amount), 0) AS balance
          FROM customer_balance_transfers cbt
          WHERE cbt.from_customer_id = c.id
        ) outgoing ON TRUE
        WHERE c.id IN ($1, $2)
      `,
      [fromCustomerId, toCustomerId]
    );

    const balances = new Map((balanceRows.rows || []).map((row) => [row.id, Number(row.customer_balance || 0)]));
    const fromBalance = balances.get(fromCustomerId) || 0;

    if (fromBalance < amount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Source customer does not have sufficient balance' }, { status: 400 });
    }

    const sourceStoreRes = await client.query(
      `SELECT store_id FROM customer_advance_payments WHERE customer_id = $1 AND store_id IS NOT NULL ORDER BY payment_date DESC, id DESC LIMIT 1`,
      [fromCustomerId]
    );
    const storeId = sourceStoreRes.rows?.[0]?.store_id || null;
    if (!storeId) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Source customer has no store-linked balance' }, { status: 400 });
    }
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) {
      await client.query('ROLLBACK');
      return storeCheck.error;
    }

    const result = await client.query(
      `
        INSERT INTO customer_balance_transfers (
          from_customer_id, to_customer_id, store_id, amount, transfer_date, reference_id, remarks, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [fromCustomerId, toCustomerId, storeId, amount, transferDate, referenceId, remarks, createdBy]
    );

    await client.query('COMMIT');

    return NextResponse.json({ ok: true, id: result.rows[0].id }, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[customer-balance-transfers POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to transfer balance' }, { status: 500 });
  } finally {
    client.release();
  }
}

export default null;
