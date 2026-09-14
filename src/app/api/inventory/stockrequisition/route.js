import { NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { ensureStoresSchema } from '@/lib/storesSchema';
import { ensurePurchaseOrderSchema } from '@/lib/purchaseOrderSchema';
import { ensureStockRequisitionSchema } from '@/lib/stockRequisitionSchema';
import { appendStoreScope, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapRow(row) {
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    transactionId: row.transaction_id || `REQ-${String(row.id).padStart(4, '0')}`,
    sourceId: row.source_id,
    sourceName: row.source_name || '',
    destinationId: row.destination_id,
    destinationName: row.destination_name || '',
    requestedBy: row.requested_by || '',
    mailTo: row.mail_to || '',
    remarks: row.remarks || '',
    status: row.status || 'pending',
    fulfillmentStatus: row.fulfillment_status || 'pending',
    approvalStatus: row.approval_status || 'pending',
    purchaseOrderId: row.purchase_order_id,
    stockTransferId: row.stock_transfer_id,
    requestedByUserId: row.requested_by_user_id,
    approvedByUserId: row.approved_by_user_id,
    rejectionReason: row.rejection_reason || '',
    totalItems: Number(row.total_items || 0),
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    fulfilledAt: row.fulfilled_at,
    items,
  };
}

export async function GET(request) {
  try {
    await ensureStoresSchema();
    await ensurePurchaseOrderSchema();
    await ensureStockRequisitionSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'SITE_REQUEST_CREATE', 'SITE_REQUEST_APPROVE', 'STOCK_VIEW');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get('search') || '').trim();
    const forPo = searchParams.get('for_po') === 'true';
    const where = [];
    const params = [];

    const scope = appendStoreScope(where, params, 'sr.destination_id', auth.user);
    if (scope.error) return scope.error;

    if (forPo) {
      where.push(`sr.approval_status = 'approved'`);
      where.push(`sr.purchase_order_id IS NULL`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        sr.transaction_id ILIKE $${params.length}
        OR COALESCE(src.name, '') ILIKE $${params.length}
        OR COALESCE(dst.name, '') ILIKE $${params.length}
        OR COALESCE(sr.requested_by, '') ILIKE $${params.length}
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await query(
      `SELECT
         sr.*,
         src.name AS source_name,
         dst.name AS destination_name,
         COALESCE(SUM(sri.qty), 0) AS total_items,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', sri.id,
               'productId', sri.product_id,
               'productName', COALESCE(sri.product_name, p.name),
               'sku', p.sku,
               'qty', sri.qty,
               'fulfilledQty', sri.fulfilled_qty,
               'costPrice', COALESCE(NULLIF(sri.cost_price, 0), p.cost_price, 0)
             )
             ORDER BY COALESCE(sri.product_name, p.name)
           ) FILTER (WHERE sri.id IS NOT NULL),
           '[]'::json
         ) AS items
       FROM stock_requisitions sr
       LEFT JOIN stores src ON src.id = sr.source_id
       LEFT JOIN stores dst ON dst.id = sr.destination_id
       LEFT JOIN stock_requisition_items sri ON sri.requisition_id = sr.id
       LEFT JOIN products p ON p.id = sri.product_id
       ${whereSql}
       GROUP BY sr.id, src.name, dst.name
       ORDER BY sr.created_at DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ success: true, records: res.rows.map(mapRow) });
  } catch (err) {
    console.error('[stockrequisition GET]', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch requisitions', records: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureStoresSchema();
    await ensurePurchaseOrderSchema();
    await ensureStockRequisitionSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'SITE_REQUEST_CREATE');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const sourceId = body.sourceId || body.source_id || null;
    const destinationId = body.destinationId || body.destination_id || null;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!destinationId) return NextResponse.json({ success: false, message: 'Destination is required' }, { status: 400 });
    const storeCheck = requireStore(auth.user, destinationId);
    if (storeCheck.error) return storeCheck.error;
    if (!items.length) return NextResponse.json({ success: false, message: 'Add at least one product' }, { status: 400 });

    const productIds = [...new Set(items.map((item) => Number(item.productId || item.product_id)).filter(Boolean))];
    const productsRes = await query(
      `SELECT id, name, cost_price FROM products WHERE id = ANY($1::int[])`,
      [productIds]
    );
    const productMap = Object.fromEntries(productsRes.rows.map((row) => [Number(row.id), row]));
    const missing = productIds.filter((id) => !productMap[id]);
    if (missing.length) {
      return NextResponse.json({ success: false, message: `Products not found: ${missing.join(', ')}` }, { status: 422 });
    }

    const cleanItems = items
      .map((item) => {
        const productId = Number(item.productId || item.product_id);
        const qty = toNumber(item.qty);
        if (!productId || qty <= 0) return null;
        const product = productMap[productId];
        return {
          productId,
          productName: product?.name || item.productName || item.name || null,
          qty,
          costPrice: toNumber(item.costPrice || item.cost_price || product?.cost_price || 0),
        };
      })
      .filter(Boolean);

    if (!cleanItems.length) return NextResponse.json({ success: false, message: 'Add valid product quantities' }, { status: 400 });

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const reqRes = await client.query(
        `INSERT INTO stock_requisitions (
           source_id, destination_id, requested_by, requested_by_user_id, mail_to, remarks,
           status, fulfillment_status, approval_status, meta, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'pending','pending','pending',$7::jsonb,NOW())
         RETURNING id`,
        [
          sourceId || null,
          destinationId,
          body.requestedBy || body.requested_by || auth.user?.name || auth.user?.username || null,
          auth.user?.id || null,
          body.mailTo || body.mail_to || null,
          body.remarks || null,
          JSON.stringify(body),
        ]
      );
      const id = reqRes.rows[0].id;
      const transactionId = `REQ-${String(id).padStart(4, '0')}`;
      await client.query('UPDATE stock_requisitions SET transaction_id = $1 WHERE id = $2', [transactionId, id]);

      for (const item of cleanItems) {
        await client.query(
          `INSERT INTO stock_requisition_items (requisition_id, product_id, product_name, qty, cost_price, created_at)
           VALUES ($1,$2,$3,$4,$5,NOW())`,
          [id, item.productId, item.productName, item.qty, item.costPrice]
        );
      }

      await client.query('COMMIT');
      return NextResponse.json({ success: true, id, transactionId }, { status: 201 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[stockrequisition POST]', err);
    return NextResponse.json({ success: false, message: err.message || 'Failed to create requisition' }, { status: 500 });
  }
}
