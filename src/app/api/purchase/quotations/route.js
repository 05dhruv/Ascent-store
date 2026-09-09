import { NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { ensureProcurementSchema } from '@/lib/procurementSchema';
import { appendStoreScope, auditLog, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapRow(row) {
  const totalAmount = Number(row.total_amount || 0);
  return {
    id: row.id,
    transactionId: row.transaction_id || `VQ-${String(row.id).padStart(4, '0')}`,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name || '-',
    storeId: row.store_id,
    storeName: row.store_name || '-',
    quotationNo: row.quotation_no || '',
    quotationDate: row.quotation_date,
    validUntil: row.valid_until,
    deliveryDays: Number(row.delivery_days || 0),
    freightAmount: Number(row.freight_amount || 0),
    paymentTerms: row.payment_terms || '',
    status: row.status || 'Draft',
    remarks: row.remarks || '',
    totalItems: Number(row.total_items || 0),
    totalAmount,
    score: Math.max(0, 100 - Number(row.delivery_days || 0) * 2 - Number(row.freight_amount || 0) / Math.max(totalAmount || 1, 1) * 10),
    createdAt: row.created_at,
  };
}

export async function GET(request) {
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS', 'MANAGE_VENDORS');
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
    const scope = appendStoreScope(where, params, 'vq.store_id', auth.user, storeId);
    if (scope.error) return scope.error;

    if (vendorId) {
      params.push(vendorId);
      where.push(`vq.vendor_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`vq.status = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`vq.quotation_date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`vq.quotation_date <= $${params.length}::date`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        COALESCE(vq.transaction_id, '') ILIKE $${params.length}
        OR COALESCE(vq.quotation_no, '') ILIKE $${params.length}
        OR COALESCE(v.name, '') ILIKE $${params.length}
        OR COALESCE(s.name, '') ILIKE $${params.length}
      )`);
    }

    const res = await query(
      `SELECT vq.*,
              v.name AS vendor_name,
              s.name AS store_name,
              COALESCE(COUNT(vqi.id), 0)::int AS total_items,
              COALESCE(SUM(vqi.qty * vqi.quoted_price + vqi.tax_value), 0) AS total_amount
       FROM vendor_quotations vq
       LEFT JOIN vendors v ON v.id = vq.vendor_id
       LEFT JOIN stores s ON s.id = vq.store_id
       LEFT JOIN vendor_quotation_items vqi ON vqi.quotation_id = vq.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY vq.id, v.name, s.name
       ORDER BY vq.created_at DESC
       LIMIT 500`,
      params
    );

    return NextResponse.json(res.rows.map(mapRow));
  } catch (err) {
    console.error('[purchase quotations GET]', err.message);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request) {
  const client = await getClient();
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS', 'MANAGE_VENDORS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const vendorId = toNum(body.vendorId || body.vendor_id, 0);
    const storeId = toNum(body.storeId || body.store_id, 0);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!vendorId) return NextResponse.json({ error: 'Vendor is required' }, { status: 400 });
    if (!storeId) return NextResponse.json({ error: 'Store is required' }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });

    const vendorCheck = await query(
      `SELECT id FROM vendors WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE LIMIT 1`,
      [vendorId]
    );
    if (!vendorCheck.rows.length) {
      return NextResponse.json({ error: 'Selected vendor was not found' }, { status: 404 });
    }

    const selectedStoreCheck = await query(
      `SELECT id FROM stores WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE LIMIT 1`,
      [storeId]
    );
    if (!selectedStoreCheck.rows.length) {
      return NextResponse.json({ error: 'Selected store was not found' }, { status: 404 });
    }

    const storeAccessCheck = requireStore(auth.user, storeId);
    if (storeAccessCheck.error) return storeAccessCheck.error;

    await client.query('BEGIN');
    const quote = await client.query(
      `INSERT INTO vendor_quotations (
         vendor_id, store_id, quotation_no, quotation_date, valid_until,
         delivery_days, freight_amount, payment_terms, status, remarks, meta
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       RETURNING id`,
      [
        vendorId,
        storeId,
        body.quotationNo || body.quotation_no || null,
        body.quotationDate || body.quotation_date || new Date().toISOString().slice(0, 10),
        body.validUntil || body.valid_until || null,
        toNum(body.deliveryDays || body.delivery_days, 0),
        toNum(body.freightAmount || body.freight_amount, 0),
        body.paymentTerms || body.payment_terms || null,
        body.status || 'Draft',
        body.remarks || null,
        JSON.stringify(body),
      ]
    );
    const id = quote.rows[0].id;
    await client.query('UPDATE vendor_quotations SET transaction_id = $1 WHERE id = $2', [`VQ-${String(id).padStart(4, '0')}`, id]);

    for (const item of items) {
      const qty = toNum(item.qty, 1);
      const quotedPrice = toNum(item.quotedPrice || item.quoted_price || item.costPrice || item.cost_price, 0);
      const taxValue = toNum(item.taxValue || item.tax_value, 0);
      if (qty <= 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Quotation item quantity must be greater than zero' }, { status: 400 });
      }
      if (quotedPrice < 0 || taxValue < 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Quotation price and tax cannot be negative' }, { status: 400 });
      }
      await client.query(
        `INSERT INTO vendor_quotation_items (quotation_id, product_id, product_name, qty, quoted_price, tax_value)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          toNum(item.productId || item.product_id, 0) || null,
          item.productName || item.product_name || item.name || null,
          qty,
          quotedPrice,
          taxValue,
        ]
      );
    }

    await client.query('COMMIT');
    await auditLog(auth.user.id, 'vendor_quotation.create', 'vendor_quotation', id, {
      vendorId,
      storeId,
      totalItems: items.length,
    });
    return NextResponse.json({ id, transactionId: `VQ-${String(id).padStart(4, '0')}` }, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[purchase quotations POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to save quotation' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request) {
  try {
    await ensureProcurementSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_PURCHASE_ORDERS', 'MANAGE_VENDORS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const id = toNum(body.id, 0);
    const status = String(body.status || '').trim();
    const allowedStatuses = ['Draft', 'Submitted', 'Approved', 'Rejected'];
    if (!id) return NextResponse.json({ error: 'Valid quotation id is required' }, { status: 400 });
    if (!allowedStatuses.includes(status)) return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });

    const current = await query('SELECT id, store_id, status FROM vendor_quotations WHERE id = $1', [id]);
    if (!current.rows.length) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    const storeCheck = requireStore(auth.user, current.rows[0].store_id);
    if (storeCheck.error) return storeCheck.error;

    const updated = await query(
      `UPDATE vendor_quotations
       SET status = $2,
           remarks = COALESCE($3, remarks),
           meta = COALESCE(meta, '{}'::jsonb) || $4::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, transaction_id, status`,
      [
        id,
        status,
        body.remarks || body.reason || null,
        JSON.stringify({ approval: { status, by: auth.user.id, at: new Date().toISOString(), remarks: body.remarks || body.reason || null } }),
      ]
    );

    await auditLog(auth.user.id, 'vendor_quotation.status_update', 'vendor_quotation', id, {
      from: current.rows[0].status,
      to: status,
    });
    return NextResponse.json({ ok: true, row: updated.rows[0] });
  } catch (err) {
    console.error('[purchase quotations PATCH]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to update quotation' }, { status: 500 });
  }
}
