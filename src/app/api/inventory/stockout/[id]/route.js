import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { ensureStockOutSchema } from '@/lib/stockOutSchema';
import { ensureInventoryBatchSchema, restoreBatchStock } from '@/lib/inventoryBatching';
import { setRecycleBinContext } from '@/lib/recycleBin';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockOutSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'VIEW_INVENTORY', 'MANAGE_INVENTORY');
    if (permissionCheck.error) return permissionCheck.error;

    const res = await query(
      `SELECT s.id, s.method, COALESCE(s.source_id, s.destination_id) AS source_id,
              s.destination_id, s.meta, s.status, s.created_at,
              s.purchase_order_id, s.vendor_name, s.invoice_number, s.invoice_date,
              s.other_charges, s.remarks, s.reason, s.grn_id,
              s.transaction_id, s.apply_taxes, s.add_products_prefill,
              source_store.name AS source_name, destination_store.name AS destination_name
       FROM stock_out s
       LEFT JOIN stores source_store ON source_store.id = COALESCE(s.source_id, s.destination_id)
       LEFT JOIN stores destination_store ON destination_store.id = s.destination_id
       WHERE s.id = $1`,
      [id]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const row = res.rows[0];
    const storeCheck = requireStore(auth.user, row.source_id);
    if (storeCheck.error) return storeCheck.error;

    const itemsRes = await query(
      `SELECT
        soi.id,
        soi.product_id,
        soi.product_name,
        soi.qty,
        soi.cost_price,
        soi.tax_value,
        soi.batch_id,
        soi.batch_no,
        soi.expiry_date,
        p.sku,
        p.barcode,
        COALESCE(
          CASE
            WHEN COALESCE(ib.meta->>'mrp', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
              THEN (ib.meta->>'mrp')::numeric
            ELSE NULL
          END,
          p.mrp,
          0
        ) AS mrp,
        CASE
          WHEN COALESCE(ib.meta->>'sellingPrice', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
            THEN (ib.meta->>'sellingPrice')::numeric
          WHEN COALESCE(ib.meta->>'selling_price', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
            THEN (ib.meta->>'selling_price')::numeric
          ELSE COALESCE(p.selling_price, 0)
        END AS selling_price
      FROM stock_out_items soi
      LEFT JOIN products p ON p.id = soi.product_id
      LEFT JOIN inventory_batches ib ON ib.id = soi.batch_id
      WHERE soi.stock_out_id = $1
      ORDER BY soi.id ASC`,
      [id]
    );

    const meta = typeof row.meta === 'object' ? row.meta : {};
    return NextResponse.json({
      id: row.id,
      transactionId: row.transaction_id || `STKO-${String(row.id).padStart(4, '0')}`,
      method: row.method,
      destination: row.destination_id,
      source: row.source_id,
      sourceName: row.source_name || row.destination_name || 'All',
      destinationName: row.destination_name || 'All',
      status: row.status || 'draft',
      applyTaxes: row.apply_taxes,
      addProductsPrefill: row.add_products_prefill,
      purchase_order_id: row.purchase_order_id || meta.purchaseOrderId || '',
      grn_id: row.grn_id || meta.grnId || '',
      vendor_name: row.vendor_name || meta.vendor || '',
      invoice_number: row.invoice_number || meta.invoiceNumber || '',
      invoice_date: row.invoice_date ? String(row.invoice_date).slice(0, 10) : '',
      other_charges: row.other_charges ?? meta.other_charges ?? '',
      remarks: row.remarks || meta.remarks || '',
      reason: row.reason || meta.reason || '',
      meta,
      items: itemsRes.rows.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        name: item.product_name,
        sku: item.sku || '',
        barcode: item.barcode || '',
        qty: Number(item.qty || 0),
        cost_price: Number(item.cost_price || 0),
        tax_value: Number(item.tax_value || 0),
        batch_id: item.batch_id || null,
        batch_no: item.batch_no || '',
        expiry_date: item.expiry_date ? String(item.expiry_date).slice(0, 10) : '',
        mrp: Number(item.mrp || 0),
        selling_price: Number(item.selling_price || 0),
      })),
    });
  } catch (err) {
    console.error('[stockout GET id]', err.message);
    return NextResponse.json(
      {
        error: 'Failed to load stock out details',
        code: err.code || 'STOCK_OUT_DETAIL_ERROR',
      },
      { status: 500 },
    );
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockOutSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'MANAGE_INVENTORY');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const currentRes = await query(
      `SELECT id, COALESCE(source_id, destination_id) AS source_id,
              destination_id, reference_type, status
       FROM stock_out WHERE id = $1`,
      [id]
    );
    if (!currentRes.rows.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const storeCheck = requireStore(auth.user, currentRes.rows[0].source_id);
    if (storeCheck.error) return storeCheck.error;
    if (String(currentRes.rows[0].reference_type || '').toLowerCase() === 'sales_bill') {
      return NextResponse.json(
        { error: 'POS stock out must be edited through its related sales bill' },
        { status: 409 },
      );
    }

    const requestedSource =
      Number(
        body.source_id ||
          body.source ||
          currentRes.rows[0].source_id ||
          0,
      ) || null;
    const requestedDestination =
      Number(
        body.destination_id ||
          body.destination ||
          currentRes.rows[0].destination_id ||
          0,
      ) || null;
    if (!requestedSource || !requestedDestination) {
      return NextResponse.json(
        { error: 'Source and destination stores are required for stock out' },
        { status: 400 },
      );
    }
    const sourceCheck = requireStore(auth.user, requestedSource);
    if (sourceCheck.error) return sourceCheck.error;
    const destinationCheck = requireStore(auth.user, requestedDestination);
    if (destinationCheck.error) return destinationCheck.error;

    const otherCharges = Number(body.other_charges || 0);
    if (!Number.isFinite(otherCharges) || otherCharges < 0) {
      return NextResponse.json({ error: 'Other charges must be a valid amount' }, { status: 400 });
    }

    const itemTotals = await query(
      `SELECT
        COALESCE(SUM(qty), 0) AS total_items,
        COALESCE(SUM(qty * cost_price), 0) AS items_cost,
        COALESCE(SUM(qty * tax_value), 0) AS total_tax
      FROM stock_out_items
      WHERE stock_out_id = $1`,
      [id]
    );
    const totals = itemTotals.rows[0] || {};

    await query(
      `UPDATE stock_out SET
        source_id = $1,
        destination_id = $2,
        vendor_name = $3,
        invoice_date = $4,
        invoice_number = $5,
        purchase_order_id = $6,
        other_charges = $7,
        remarks = $8,
        reason = $9,
        grn_id = $10,
        total_items = $11,
        total_cost = $12,
        total_tax = $13,
        meta = meta || $14::jsonb
      WHERE id = $15`,
      [
        requestedSource,
        requestedDestination,
        body.vendor || body.vendor_name || null,
        body.invoice_date || null,
        body.invoice_number || null,
        body.purchase_order_id || null,
        otherCharges,
        body.remarks || null,
        body.reason || null,
        body.grn_id || null,
        Number(totals.total_items || 0),
        Number(totals.items_cost || 0) + otherCharges,
        Number(totals.total_tax || 0),
        JSON.stringify({
          destination: requestedDestination,
          source: requestedSource,
          vendor: body.vendor || body.vendor_name || null,
          invoice_date: body.invoice_date || null,
          invoice_number: body.invoice_number || null,
          purchase_order_id: body.purchase_order_id || null,
          other_charges: otherCharges,
          remarks: body.remarks || null,
          reason: body.reason || null,
          grn_id: body.grn_id || null,
        }),
        id,
      ]
    );

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[stockout PUT id]', err.message);
    return NextResponse.json({ error: 'Failed to update stock out' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const client = await getClient();
  try {
    await ensureStockOutSchema();
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'MANAGE_INVENTORY');
    if (permissionCheck.error) return permissionCheck.error;

    await client.query('BEGIN');
    const recordRes = await client.query(
      `SELECT id, transaction_id, status, reference_type,
              COALESCE(source_id, destination_id) AS source_id
       FROM stock_out
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );
    const record = recordRes.rows[0];
    if (!record) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Stock out record not found' }, { status: 404 });
    }

    const storeCheck = requireStore(auth.user, record.source_id);
    if (storeCheck.error) {
      await client.query('ROLLBACK');
      return storeCheck.error;
    }
    if (String(record.reference_type || '').toLowerCase() === 'sales_bill') {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'POS stock out must be deleted through its related sales bill' },
        { status: 409 },
      );
    }

    if (String(record.status || '').toLowerCase() === 'confirmed') {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'Posted material issues cannot be deleted. Use a linked return or adjustment.'},{status:409});
    }
    if (String(record.status || '').toLowerCase() === 'confirmed') {
      const itemsRes = await client.query(
        `SELECT id, product_id, qty, batch_id, product_name
         FROM stock_out_items
         WHERE stock_out_id = $1
         ORDER BY id ASC`,
        [id],
      );
      const missingAllocations = itemsRes.rows.filter(
        (item) => Number(item.qty || 0) > 0 && !Number(item.batch_id),
      );
      if (missingAllocations.length) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'This stock out cannot be safely deleted because batch allocation data is missing' },
          { status: 409 },
        );
      }

      for (const item of itemsRes.rows) {
        const restored = await restoreBatchStock(client, {
          batchId: item.batch_id,
          productId: item.product_id,
          storeId: record.source_id,
          qty: item.qty,
          referenceType: 'stock_out_delete',
          referenceId: id,
          sourceItemId: item.id,
          meta: {
            transactionId: record.transaction_id,
            productName: item.product_name,
            deletedBy: auth.user.id,
          },
        });
        if (!restored) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: `Unable to restore inventory for ${item.product_name || `product ${item.product_id}`}` },
            { status: 409 },
          );
        }
      }
    }

    await setRecycleBinContext(
      client,
      auth.user.id,
      `Stock out ${record.transaction_id || id} deleted`,
    );
    await client.query('DELETE FROM stock_out WHERE id = $1', [id]);
    await client.query('COMMIT');
    return NextResponse.json({ success: true, id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[stockout DELETE id]', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to delete stock out' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
