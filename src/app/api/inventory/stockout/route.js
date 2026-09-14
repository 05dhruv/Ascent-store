import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { ensureStockOutSchema } from '@/lib/stockOutSchema';
import { appendStoreScope, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

export async function GET(request) {
  try {
    await ensureStockOutSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'STOCK_VIEW', 'MATERIAL_ISSUE_CREATE', 'MATERIAL_RETURN_CREATE');
    if (permissionCheck.error) return permissionCheck.error;

    const params = [];
    const whereClauses = [`s.status = 'confirmed'`];
    const scope = appendStoreScope(whereClauses, params, 'COALESCE(s.source_id, s.destination_id)', auth.user);
    if (scope.error) return scope.error;

    const res = await query(
      `SELECT
        s.id,
        s.transaction_id,
        s.invoice_number,
        s.invoice_date,
        s.purchase_order_id,
        s.vendor_name,
        s.other_charges,
        s.method,
        s.total_items,
        s.total_cost,
        s.total_tax,
        s.reference_type,
        s.reference_id,
        s.status,
        s.created_at,
        source_store.name AS source_name,
        destination_store.name AS destination_name,
        COALESCE(SUM(soi.qty), 0) AS item_qty_sum,
        COALESCE(SUM(soi.qty * soi.cost_price), 0) AS items_cost_sum
      FROM stock_out s
      LEFT JOIN stores source_store ON source_store.id = COALESCE(s.source_id, s.destination_id)
      LEFT JOIN stores destination_store ON destination_store.id = s.destination_id
      LEFT JOIN stock_out_items soi ON soi.stock_out_id = s.id
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY s.id, source_store.name, destination_store.name
      ORDER BY s.confirmed_at DESC NULLS LAST, s.created_at DESC
      LIMIT 200`,
      params
    );

    const records = res.rows.map((row) => {
      const totalItems = Number(row.total_items || row.item_qty_sum || 0);
      const totalCost = Number(row.total_cost || Number(row.items_cost_sum || 0) + Number(row.other_charges || 0));
      const refType =
        row.reference_type ||
        (row.method === 'po_return' ? 'PO Return' : 'Stock Out');
      const refId =
        row.reference_id ||
        row.purchase_order_id ||
        (row.method === 'po_return' ? row.invoice_number : null) ||
        '—';

      return {
        id: row.id,
        transactionId: row.transaction_id || `STKO-${String(row.id).padStart(4, '0')}`,
        invoiceNumber: row.invoice_number || '—',
        destination: row.destination_name || 'All',
        source: row.source_name || row.destination_name || 'All',
        invoiceDate: row.invoice_date,
        totalItems,
        cost: totalCost,
        referenceType: refType,
        referenceId: refId,
        vendorName: row.vendor_name,
        totalTax: Number(row.total_tax || 0),
        method: row.method,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json(records);
  } catch (err) {
    console.error('[stockout GET]', err.message);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request) {
  try {
    await ensureStockOutSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const payload = await request.json();
    const method = payload.method || 'stock_out';
    const permissionCheck = requirePermission(
      auth.user,
      ['return_vendor', 'po_return'].includes(method) ? 'MATERIAL_RETURN_CREATE' : 'MATERIAL_ISSUE_CREATE',
    );
    if (permissionCheck.error) return permissionCheck.error;
    if (method === 'return_warehouse') {
      return NextResponse.json({ error: 'Use Stock Transfer for internal warehouse returns' }, { status: 403 });
    }
    const sourceId = Number(payload.source || payload.sourceId || payload.source_id || 0) || null;
    const destinationId =
      payload.destination && payload.destination !== 'all'
        ? Number(payload.destination)
        : null;
    if (!sourceId || !destinationId) {
      return NextResponse.json({ error: 'Source and destination stores are required for stock out' }, { status: 400 });
    }
    const sourceCheck = requireStore(auth.user, sourceId);
    if (sourceCheck.error) return sourceCheck.error;
    if (destinationId) {
      const storeCheck = requireStore(auth.user, destinationId);
      if (storeCheck.error) return storeCheck.error;
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `INSERT INTO stock_out (
          method, source_id, destination_id, apply_taxes, add_products_prefill,
          purchase_order_id, invoice_number, reference_type, reference_id, reason, grn_id,
          meta, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', NOW())
        RETURNING id`,
        [
          method,
          sourceId,
          destinationId,
          payload.applyTaxes ?? true,
          payload.addProductsPrefill ?? false,
          payload.purchaseOrderId || null,
          payload.invoiceNumber || null,
          method === 'return_vendor' ? 'Return to Vendor' : method === 'return_warehouse' ? 'Return to Warehouse' : method === 'damage_dump' ? 'Damage/Dump' : method === 'po_return' ? 'PO Return' : 'Stock Out',
          payload.grnId || payload.purchaseOrderId || payload.invoiceNumber || null,
          payload.reason || null,
          payload.grnId || null,
          JSON.stringify(payload),
        ]
      );
      const id = res.rows[0].id;
      const transactionId = `STKO-${String(id).padStart(4, '0')}`;
      await client.query('UPDATE stock_out SET transaction_id = $1 WHERE id = $2', [
        transactionId,
        id,
      ]);
      await client.query('COMMIT');
      return NextResponse.json({ id, transactionId }, { status: 201 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[stockout POST]', err.message);
    return NextResponse.json({ error: 'Failed to create stock out' }, { status: 500 });
  }
}
