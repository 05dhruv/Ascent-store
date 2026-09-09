import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureProcurementSchema } from '@/lib/procurementSchema';
import { appendStoreScope, auditLog, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clean(value) {
  return String(value ?? '').trim();
}

function mapDemand(row) {
  return {
    id: row.id,
    transactionId: row.transaction_id || `CD-${String(row.id).padStart(4, '0')}`,
    storeId: row.store_id,
    storeName: row.store_name || '',
    productId: row.product_id,
    productName: row.product_name || '',
    sku: row.sku || '',
    barcode: row.barcode || '',
    requestedQty: Number(row.requested_qty || 0),
    customerName: row.customer_name || '',
    customerMobile: row.customer_mobile || '',
    remarks: row.remarks || '',
    status: row.status || 'new',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request) {
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS', 'VIEW_INVENTORY', 'CREATE_POS_BILL');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId') || searchParams.get('store_id');
    const status = clean(searchParams.get('status') || 'open').toLowerCase();
    const search = clean(searchParams.get('search'));
    const params = [];
    const where = ['1=1'];
    const scope = appendStoreScope(where, params, 'cd.store_id', auth.user, storeId);
    if (scope.error) return scope.error;

    if (status && status !== 'all') {
      if (status === 'open') where.push(`LOWER(COALESCE(cd.status, 'new')) IN ('new', 'reviewed')`);
      else {
        params.push(status);
        where.push(`LOWER(COALESCE(cd.status, 'new')) = $${params.length}`);
      }
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        COALESCE(cd.product_name, '') ILIKE $${params.length}
        OR COALESCE(cd.sku, '') ILIKE $${params.length}
        OR COALESCE(cd.barcode, '') ILIKE $${params.length}
        OR COALESCE(cd.customer_name, '') ILIKE $${params.length}
        OR COALESCE(cd.customer_mobile, '') ILIKE $${params.length}
      )`);
    }

    const res = await query(
      `SELECT cd.*, s.name AS store_name
       FROM customer_demands cd
       LEFT JOIN stores s ON s.id = cd.store_id
       WHERE ${where.join(' AND ')}
       ORDER BY cd.created_at DESC
       LIMIT 500`,
      params
    );

    return NextResponse.json({ records: res.rows.map(mapDemand) });
  } catch (err) {
    console.error('[customer-demand GET]', err.message);
    return NextResponse.json({ records: [] }, { status: 200 });
  }
}

export async function POST(request) {
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_PURCHASE_ORDERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const storeId = toNum(body.storeId || body.store_id, 0);
    let productId = toNum(body.productId || body.product_id, 0) || null;
    let productName = clean(body.productName || body.product_name);
    const requestedQty = Math.max(toNum(body.requestedQty || body.requested_qty, 1), 0.001);

    if (!storeId) return NextResponse.json({ error: 'Store is required' }, { status: 400 });
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;
    if (!productName) return NextResponse.json({ error: 'Product name is required' }, { status: 400 });

    let matchedProduct = null;
    if (!productId) {
      const lookupValue = clean(body.barcode || body.sku || productName);
      const productRes = await query(
        `SELECT id, name, sku, barcode
         FROM products
         WHERE LOWER(COALESCE(barcode, '')) = LOWER($1)
            OR LOWER(COALESCE(sku, '')) = LOWER($1)
            OR LOWER(COALESCE(name, '')) = LOWER($1)
         ORDER BY CASE WHEN LOWER(COALESCE(name, '')) = LOWER($1) THEN 0 ELSE 1 END, id ASC
         LIMIT 1`,
        [lookupValue]
      );
      matchedProduct = productRes.rows[0] || null;
      if (matchedProduct) productId = matchedProduct.id;
    }

    if (productId) {
      const productRes = await query('SELECT id, name, sku, barcode FROM products WHERE id = $1 LIMIT 1', [productId]);
      matchedProduct = productRes.rows[0] || matchedProduct;
    }

    const finalProductName = productName || matchedProduct?.name || 'Product';
    const res = await query(
      `INSERT INTO customer_demands (
         store_id, product_id, product_name, sku, barcode, requested_qty,
         customer_name, customer_mobile, remarks, status, created_by, meta, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,$11::jsonb,NOW(),NOW())
       RETURNING *`,
      [
        storeId,
        productId,
        finalProductName,
        clean(body.sku || matchedProduct?.sku),
        clean(body.barcode || matchedProduct?.barcode),
        requestedQty,
        clean(body.customerName || body.customer_name),
        clean(body.customerMobile || body.customer_mobile),
        clean(body.remarks),
        auth.user.id || null,
        JSON.stringify({ source: body.source || 'pos', matchedProduct: Boolean(matchedProduct) }),
      ]
    );

    const row = res.rows[0];
    const transactionId = `CD-${String(row.id).padStart(4, '0')}`;
    await query('UPDATE customer_demands SET transaction_id = $1 WHERE id = $2', [transactionId, row.id]);
    await auditLog(auth.user.id, 'customer_demand.create', 'customer_demand', row.id, { transactionId, storeId, productId });

    return NextResponse.json({ record: { ...mapDemand(row), transactionId } }, { status: 201 });
  } catch (err) {
    console.error('[customer-demand POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to save customer demand' }, { status: 500 });
  }
}
export async function PATCH(request) {
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const id = toNum(body.id, 0);
    const status = clean(body.status).toLowerCase();
    const allowed = new Set(['new', 'reviewed', 'added_to_po', 'rejected']);
    if (!id) return NextResponse.json({ error: 'Demand id is required' }, { status: 400 });
    if (!allowed.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

    const existing = await query('SELECT id, store_id FROM customer_demands WHERE id = $1', [id]);
    if (!existing.rows[0]) return NextResponse.json({ error: 'Demand not found' }, { status: 404 });
    const storeCheck = requireStore(auth.user, existing.rows[0].store_id);
    if (storeCheck.error) return storeCheck.error;

    const res = await query(
      `UPDATE customer_demands
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, auth.user.id || null]
    );
    await auditLog(auth.user.id, 'customer_demand.status', 'customer_demand', id, { status });
    return NextResponse.json({ record: mapDemand(res.rows[0]) });
  } catch (err) {
    console.error('[customer-demand PATCH]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to update demand' }, { status: 500 });
  }
}
