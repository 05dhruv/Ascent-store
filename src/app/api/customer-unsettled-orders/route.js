import { NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';
import { ensureCustomerOrderSettlementsSchema } from '@/lib/customerOrderSettlementsSchema';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function parsePositiveInteger(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.trunc(num);
}

function parseAmount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function mapRow(row, index, page, pageSize) {
  return {
    id: row.id,
    sNo: (page - 1) * pageSize + index + 1,
    orderId: row.order_id || row.sales_order_id || '',
    customerId: row.customer_code || String(row.customer_pk || row.booking_id || ''),
    customerName: row.customer_name || '',
    customerType: row.customer_type || 'INDIVIDUAL',
    orderAmount: Number(row.order_amount || 0),
    amountDue: Number(row.amount_due || 0),
    settledAmount: Number(row.settled_amount || 0),
    storeId: row.store_id,
    storeName: row.store_name || '',
    orderType: row.sales_order_type || 'Sales Order',
    invoiceDate: row.invoice_date,
    status: row.status || 'Pending',
  };
}

async function listUnsettledRows(filters) {
  const {
    page,
    pageSize,
    store,
    orderType,
    customerId,
    search,
    storeIds,
  } = filters;

  const params = [];
  const where = ['base.amount_due > 0'];

  if (store && store.toLowerCase() !== 'all') {
    params.push(store);
    const idx = params.length;
    where.push(`(CAST(base.store_id AS TEXT) = $${idx} OR LOWER(COALESCE(base.store_name, '')) = LOWER($${idx}))`);
  }

  if (Array.isArray(storeIds)) {
    if (!storeIds.length) {
      where.push('1 = 0');
    } else {
      params.push(storeIds);
      where.push(`base.store_id = ANY($${params.length}::int[])`);
    }
  }

  if (orderType && orderType.toLowerCase() !== 'all') {
    params.push(orderType);
    const idx = params.length;
    where.push(`LOWER(COALESCE(base.sales_order_type, 'Sales Order')) = LOWER($${idx})`);
  }

  if (customerId) {
    params.push(customerId);
    const idx = params.length;
    where.push('base.customer_pk = $' + idx + '::bigint');
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    where.push(`(
      COALESCE(base.order_id, '') ILIKE $${idx}
      OR COALESCE(base.sales_order_id, '') ILIKE $${idx}
      OR COALESCE(base.customer_code, '') ILIKE $${idx}
      OR COALESCE(base.customer_name, '') ILIKE $${idx}
      OR COALESCE(base.mobile_number, '') ILIKE $${idx}
    )`);
  }

  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const result = await query(
    `
      WITH base AS (
        SELECT
          iso.id,
          COALESCE(NULLIF(iso.invoice_id, ''), iso.sales_order_id) AS order_id,
          iso.sales_order_id,
          iso.sales_order_type,
          iso.booking_id,
          iso.invoice_date,
          iso.status,
          iso.store_id,
          s.name AS store_name,
          c.id AS customer_pk,
          c.customer_code,
          c.customer_type,
          c.mobile_number,
          TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name,
          GREATEST(
            COALESCE(iso.gross_bill, 0)
            + COALESCE(iso.additional_charge_value, 0)
            - COALESCE(iso.total_discount, 0)
            - COALESCE(iso.write_off_amount, 0),
            0
          ) AS order_amount,
          GREATEST(COALESCE((iso.meta->>'settled_amount')::numeric, 0), 0) AS settled_amount,
          GREATEST(
            GREATEST(
              COALESCE(iso.gross_bill, 0)
              + COALESCE(iso.additional_charge_value, 0)
              - COALESCE(iso.total_discount, 0)
              - COALESCE(iso.write_off_amount, 0),
              0
            ) - GREATEST(COALESCE((iso.meta->>'settled_amount')::numeric, 0), 0),
            0
          ) AS amount_due
        FROM invoice_sales_orders iso
        LEFT JOIN customers c ON (
          iso.booking_id = c.customer_code
          OR iso.booking_id = c.id::text
          OR (iso.meta->>'customer_id') = c.id::text
        )
        LEFT JOIN stores s ON s.id = iso.store_id
        WHERE COALESCE(NULLIF(iso.invoice_id, ''), '') <> ''
      )
      SELECT base.*,
             COUNT(*) OVER()::INT AS total_count
      FROM base
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(base.invoice_date, CURRENT_DATE) DESC, base.id DESC
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
      ensureInvoiceSalesOrdersSchema(),
      ensureCustomerOrderSettlementsSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const filters = {
      page: parsePositiveInteger(url.searchParams.get('page'), 1),
      pageSize: parsePositiveInteger(url.searchParams.get('pageSize'), 10),
      store: normalizeText(url.searchParams.get('store')),
      orderType: normalizeText(url.searchParams.get('orderType')),
      customerId: normalizeText(url.searchParams.get('customerId')),
      search: normalizeText(url.searchParams.get('search')),
      storeIds: auth.user.role === 'super_admin' ? null : getAssignedStoreIds(auth.user),
    };

    const data = await listUnsettledRows(filters);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[customer-unsettled-orders GET]', err.message);
    return NextResponse.json(
      {
        rows: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        error: err.message || 'Failed to fetch unsettled orders',
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const client = await getClient();
  try {
    await Promise.all([
      ensureInvoiceSalesOrdersSchema(),
      ensureCustomerOrderSettlementsSchema(),
    ]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => parsePositiveInteger(id, 0)).filter((id) => id > 0)
      : [];

    const settlementAmount = parseAmount(body.settlementAmount, 0);
    const paymentType = normalizeText(body.paymentType) || 'Cash';
    const referenceId = normalizeText(body.referenceId);
    const remarks = normalizeText(body.remarks);
    const settlementDate = parseDate(body.settlementDate) || new Date().toISOString().slice(0, 10);
    const settledBy = normalizeText(body.settledBy) || 'System';

    if (!ids.length) {
      return NextResponse.json({ error: 'Select at least one order to settle' }, { status: 400 });
    }

    await client.query('BEGIN');

    const selectedRes = await client.query(
      `
        SELECT
          iso.id,
          iso.store_id,
          COALESCE(NULLIF(iso.invoice_id, ''), iso.sales_order_id) AS order_id,
          GREATEST(
            COALESCE(iso.gross_bill, 0)
            + COALESCE(iso.additional_charge_value, 0)
            - COALESCE(iso.total_discount, 0)
            - COALESCE(iso.write_off_amount, 0),
            0
          ) AS order_amount,
          GREATEST(COALESCE((iso.meta->>'settled_amount')::numeric, 0), 0) AS settled_amount,
          GREATEST(
            GREATEST(
              COALESCE(iso.gross_bill, 0)
              + COALESCE(iso.additional_charge_value, 0)
              - COALESCE(iso.total_discount, 0)
              - COALESCE(iso.write_off_amount, 0),
              0
            ) - GREATEST(COALESCE((iso.meta->>'settled_amount')::numeric, 0), 0),
            0
          ) AS amount_due
        FROM invoice_sales_orders iso
        WHERE iso.id = ANY($1::bigint[])
        FOR UPDATE
      `,
      [ids]
    );

    const selectedRows = Array.isArray(selectedRes.rows) ? selectedRes.rows : [];
    if (!selectedRows.length) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'No matching orders found' }, { status: 404 });
    }

    for (const row of selectedRows) {
      const storeCheck = requireStore(auth.user, row.store_id);
      if (storeCheck.error) {
        await client.query('ROLLBACK');
        return storeCheck.error;
      }
    }

    const totalDue = selectedRows.reduce((acc, row) => acc + Number(row.amount_due || 0), 0);
    if (totalDue <= 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Selected orders are already settled' }, { status: 400 });
    }

    const amountToSettle = settlementAmount > 0 ? Math.min(settlementAmount, totalDue) : totalDue;
    let remaining = amountToSettle;

    const settlementRows = [];

    for (const row of selectedRows) {
      if (remaining <= 0) break;

      const due = Number(row.amount_due || 0);
      if (due <= 0) continue;

      const appliedAmount = Math.min(due, remaining);
      const nextSettledAmount = Number(row.settled_amount || 0) + appliedAmount;
      const nextDue = due - appliedAmount;
      const nextStatus = nextDue <= 0 ? 'Settled' : 'Partially Settled';

      await client.query(
        `
          UPDATE invoice_sales_orders
          SET
            status = $2,
            meta = jsonb_set(
              jsonb_set(COALESCE(meta, '{}'::jsonb), '{settled_amount}', to_jsonb($3::numeric), true),
              '{last_settlement_date}',
              to_jsonb($4::text),
              true
            ),
            updated_at = NOW()
          WHERE id = $1
        `,
        [row.id, nextStatus, nextSettledAmount, settlementDate]
      );

      const settlementInsert = await client.query(
        `
          INSERT INTO customer_order_settlements (
            invoice_sales_order_id,
            settled_amount,
            payment_type,
            reference_id,
            remarks,
            settlement_date,
            settled_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
        [row.id, appliedAmount, paymentType, referenceId, remarks, settlementDate, settledBy]
      );

      settlementRows.push({
        settlementId: settlementInsert.rows[0].id,
        orderDbId: row.id,
        orderId: row.order_id,
        settledAmount: appliedAmount,
        remainingDue: nextDue,
      });

      remaining -= appliedAmount;
    }

    await client.query('COMMIT');

    const refreshed = await listUnsettledRows({
      page: 1,
      pageSize: parsePositiveInteger(body.pageSize, 10),
      store: normalizeText(body.store),
      orderType: normalizeText(body.orderType),
      customerId: normalizeText(body.customerId),
      search: normalizeText(body.search),
      storeIds: auth.user.role === 'super_admin' ? null : getAssignedStoreIds(auth.user),
    });

    return NextResponse.json({
      ok: true,
      settledTotal: amountToSettle - remaining,
      affectedOrders: settlementRows.length,
      settlementRows,
      ...refreshed,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[customer-unsettled-orders POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to settle orders' }, { status: 500 });
  } finally {
    client.release();
  }
}

export default null;
