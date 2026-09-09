import { NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { ensureProcurementSchema } from '@/lib/procurementSchema';
import { appendStoreScope, auditLog, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapRow(row) {
  return {
    id: row.id,
    transactionId: row.transaction_id || `PR-${String(row.id).padStart(4, '0')}`,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name || '-',
    storeId: row.store_id,
    storeName: row.store_name || '-',
    stockInId: row.stock_in_id,
    purchaseOrderId: row.purchase_order_id,
    returnDate: row.return_date,
    reason: row.reason || '',
    status: row.status || 'Draft',
    totalQty: Number(row.total_qty || 0),
    totalAmount: Number(row.total_amount || 0),
    createdBy: row.created_by || '',
    createdAt: row.created_at,
  };
}

async function applyConfirmedReturnStock(client, { id, transactionId, storeId, items }) {
  for (const item of items) {
    const productId = toNum(item.product_id || item.productId, 0);
    const qty = toNum(item.qty, 0);
    const available = await client.query(
      `SELECT COALESCE(SUM(available_qty), 0) AS qty
       FROM inventory_batches
       WHERE product_id = $1 AND store_id = $2 AND status = 'active'`,
      [productId, storeId]
    );
    if (Number(available.rows[0]?.qty || 0) < qty) {
      throw new Error(`Not enough stock available to return product ${productId}`);
    }

    const batches = await client.query(
      `SELECT id, available_qty
       FROM inventory_batches
       WHERE product_id = $1 AND store_id = $2 AND status = 'active' AND available_qty > 0
       ORDER BY expiry_date NULLS LAST, id
       FOR UPDATE`,
      [productId, storeId]
    );
    let remaining = qty;
    for (const batch of batches.rows) {
      if (remaining <= 0) break;
      const deductQty = Math.min(Number(batch.available_qty || 0), remaining);
      if (deductQty <= 0) continue;
      await client.query(
        `UPDATE inventory_batches
         SET available_qty = available_qty - $1,
             status = CASE WHEN available_qty - $1 <= 0 THEN 'depleted' ELSE status END,
             updated_at = NOW()
         WHERE id = $2`,
        [deductQty, batch.id]
      );
      await client.query(
        `INSERT INTO inventory_batch_movements (batch_id, product_id, store_id, direction, qty, reference_type, reference_id, meta)
         VALUES ($1,$2,$3,'out',$4,'purchase_return',$5,$6::jsonb)`,
        [batch.id, productId, storeId, deductQty, transactionId, JSON.stringify({ purchaseReturnId: id })]
      );
      remaining = Math.round((remaining - deductQty) * 1000) / 1000;
    }
    if (remaining > 0) throw new Error(`Not enough stock available to return product ${productId}`);
  }
}

export async function GET(request) {
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get('search') || '').trim();
    const storeId = searchParams.get('storeId') || searchParams.get('store_id');
    const vendorId = Number(searchParams.get('vendorId') || searchParams.get('vendor_id') || 0) || null;
    const status = String(searchParams.get('status') || '').trim();
    const dateFrom = String(searchParams.get('dateFrom') || searchParams.get('date_from') || '').trim();
    const dateTo = String(searchParams.get('dateTo') || searchParams.get('date_to') || '').trim();
    const where = [];
    const params = [];
    const scope = appendStoreScope(where, params, 'pr.store_id', auth.user, storeId);
    if (scope.error) return scope.error;

    if (vendorId) {
      params.push(vendorId);
      where.push(`pr.vendor_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`pr.status = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`pr.return_date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`pr.return_date <= $${params.length}::date`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        COALESCE(pr.transaction_id, '') ILIKE $${params.length}
        OR COALESCE(v.name, '') ILIKE $${params.length}
        OR COALESCE(s.name, '') ILIKE $${params.length}
        OR COALESCE(pr.reason, '') ILIKE $${params.length}
      )`);
    }

    const res = await query(
      `SELECT pr.*, v.name AS vendor_name, s.name AS store_name
       FROM purchase_returns pr
       LEFT JOIN vendors v ON v.id = pr.vendor_id
       LEFT JOIN stores s ON s.id = pr.store_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY pr.created_at DESC
       LIMIT 500`,
      params
    );

    return NextResponse.json(res.rows.map(mapRow));
  } catch (err) {
    console.error('[purchase returns GET]', err.message);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request) {
  const client = await getClient();
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const vendorId = toNum(body.vendorId || body.vendor_id, 0) || null;
    const storeId = toNum(body.storeId || body.store_id, 0);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!storeId) return NextResponse.json({ error: 'Store is required' }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;
    for (const item of items) {
      const productId = toNum(item.productId || item.product_id, 0);
      const qty = toNum(item.qty, 0);
      const costPrice = toNum(item.costPrice || item.cost_price, 0);
      if (!productId || qty <= 0) return NextResponse.json({ error: 'Each item must have a product and quantity greater than zero' }, { status: 400 });
      if (costPrice < 0) return NextResponse.json({ error: 'Cost price cannot be negative' }, { status: 400 });
    }

    const totalQty = items.reduce((sum, item) => sum + toNum(item.qty, 0), 0);
    const totalAmount = items.reduce((sum, item) => sum + toNum(item.qty, 0) * toNum(item.costPrice || item.cost_price, 0), 0);

    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO purchase_returns (
         vendor_id, store_id, stock_in_id, purchase_order_id, return_date,
         reason, status, total_qty, total_amount, created_by, meta
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       RETURNING id`,
      [
        vendorId,
        storeId,
        toNum(body.stockInId || body.stock_in_id, 0) || null,
        toNum(body.purchaseOrderId || body.purchase_order_id, 0) || null,
        body.returnDate || body.return_date || new Date().toISOString().slice(0, 10),
        body.reason || null,
        body.status || 'Draft',
        totalQty,
        totalAmount,
        body.createdBy || auth.user.name || auth.user.email || 'System',
        JSON.stringify(body),
      ]
    );
    const id = created.rows[0].id;
    const transactionId = `PR-${String(id).padStart(4, '0')}`;
    await client.query('UPDATE purchase_returns SET transaction_id = $1 WHERE id = $2', [transactionId, id]);

    for (const item of items) {
      await client.query(
        `INSERT INTO purchase_return_items (purchase_return_id, product_id, product_name, qty, cost_price, reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          toNum(item.productId || item.product_id, 0) || null,
          item.productName || item.product_name || item.name || null,
          toNum(item.qty, 0),
          toNum(item.costPrice || item.cost_price, 0),
          item.reason || null,
        ]
      );
    }

    if (String(body.status || '').toLowerCase() === 'confirmed') {
      await applyConfirmedReturnStock(client, { id, transactionId, storeId, items });
    }

    await client.query('COMMIT');
    await auditLog(auth.user.id, 'purchase_return.create', 'purchase_return', id, {
      transactionId,
      vendorId,
      storeId,
      totalQty,
      totalAmount,
      status: body.status || 'Draft',
    });
    return NextResponse.json({ id, transactionId }, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[purchase returns POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to save purchase return' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request) {
  const client = await getClient();
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const id = toNum(body.id, 0);
    const status = String(body.status || '').trim();
    const allowedStatuses = ['Draft', 'Submitted', 'Confirmed', 'Rejected', 'Cancelled'];
    if (!id) return NextResponse.json({ error: 'Valid return id is required' }, { status: 400 });
    if (!allowedStatuses.includes(status)) return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });

    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id, transaction_id, store_id, status
       FROM purchase_returns
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (!current.rows.length) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Purchase return not found' }, { status: 404 });
    }
    const row = current.rows[0];
    const storeCheck = requireStore(auth.user, row.store_id);
    if (storeCheck.error) {
      await client.query('ROLLBACK');
      return storeCheck.error;
    }
    if (String(row.status).toLowerCase() === 'confirmed' && status !== 'Confirmed') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Confirmed return cannot be moved back' }, { status: 409 });
    }

    if (status === 'Confirmed' && String(row.status).toLowerCase() !== 'confirmed') {
      const itemRes = await client.query(
        `SELECT product_id, qty
         FROM purchase_return_items
         WHERE purchase_return_id = $1`,
        [id]
      );
      await applyConfirmedReturnStock(client, {
        id,
        transactionId: row.transaction_id || `PR-${String(id).padStart(4, '0')}`,
        storeId: row.store_id,
        items: itemRes.rows,
      });
    }

    const updated = await client.query(
      `UPDATE purchase_returns
       SET status = $2,
           reason = COALESCE($3, reason),
           meta = COALESCE(meta, '{}'::jsonb) || $4::jsonb
       WHERE id = $1
       RETURNING id, transaction_id, status`,
      [
        id,
        status,
        body.remarks || body.reason || null,
        JSON.stringify({ approval: { status, by: auth.user.id, at: new Date().toISOString(), remarks: body.remarks || body.reason || null } }),
      ]
    );

    await client.query('COMMIT');
    await auditLog(auth.user.id, 'purchase_return.status_update', 'purchase_return', id, {
      from: row.status,
      to: status,
    });
    return NextResponse.json({ ok: true, row: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[purchase returns PATCH]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to update purchase return' }, { status: 500 });
  } finally {
    client.release();
  }
}
