import { ensureMovementWorkflowSchema } from '@/lib/movementWorkflowSchema';
import { NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { ensureStockRequisitionSchema } from '@/lib/stockRequisitionSchema';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request) {
  let client;
  try {
    await ensureStockRequisitionSchema();
    await ensureMovementWorkflowSchema();
    await ensureInventoryBatchSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'TRANSFER_CREATE');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const requisitionId = Number(body.requisitionId || body.requisition_id || 0);
    const sourceId = Number(body.sourceId || body.source_id || 0);
    if (!requisitionId) return NextResponse.json({ success: false, message: 'Requisition is required' }, { status: 400 });
    if (!sourceId) return NextResponse.json({ success: false, message: 'Fulfillment source is required' }, { status: 400 });

    client = await getClient();
    await client.query('BEGIN');
    const reqRes = await client.query(
      `SELECT id, transaction_id, source_id, destination_id, approval_status, fulfillment_status, stock_transfer_id
       FROM stock_requisitions
       WHERE id = $1 FOR UPDATE`,
      [requisitionId]
    );
    if (!reqRes.rows.length) return NextResponse.json({ success: false, message: 'Requisition not found' }, { status: 404 });
    const requisition = reqRes.rows[0];
    if (requisition.approval_status !== 'approved') {
      return NextResponse.json({ success: false, message: 'Approve requisition before fulfillment' }, { status: 400 });
    }
    if (requisition.fulfillment_status === 'completed' || requisition.stock_transfer_id) {
      return NextResponse.json({ success: false, message: 'Requisition is already fulfilled by transfer' }, { status: 409 });
    }

    if (sourceId === Number(requisition.destination_id)) throw new Error('Source and destination must be different');
    for (const storeId of [sourceId]) {
      const storeCheck = requireStore(auth.user, storeId);
      if (storeCheck.error) return storeCheck.error;
    }

    const itemsRes = await client.query(
      `SELECT sri.product_id, COALESCE(sri.product_name, p.name) AS product_name, sri.qty,
              COALESCE(NULLIF(sri.cost_price, 0), p.cost_price, 0) AS cost_price
       FROM stock_requisition_items sri
       LEFT JOIN products p ON p.id = sri.product_id
       WHERE sri.requisition_id = $1
       ORDER BY sri.id`,
      [requisitionId]
    );
    if (!itemsRes.rows.length) return NextResponse.json({ success: false, message: 'Requisition has no items' }, { status: 400 });

    const totalItems = itemsRes.rows.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const totalCost = itemsRes.rows.reduce((sum, item) => sum + toNumber(item.qty) * toNumber(item.cost_price), 0);

    const transferRes = await client.query(
      `INSERT INTO stock_transfer (
         source_id, destination_id, apply_taxes, status, workflow_status, workflow_version, invoice_date, remarks,
         total_items, total_cost, total_tax, meta, created_at, confirmed_at
       ) VALUES ($1,$2,true,'submitted','submitted',2,CURRENT_DATE,$3,$4,$5,0,$6::jsonb,NOW(),NULL)
       RETURNING id`,
      [
        sourceId,
        requisition.destination_id,
        `Fulfilled from requisition ${requisition.transaction_id || requisition.id}`,
        totalItems,
        totalCost,
        JSON.stringify({ source: 'stock_requisition', requisitionId }),
      ]
    );
    const transferId = transferRes.rows[0].id;
    const transactionId = `TRN-${String(transferId).padStart(4, '0')}`;
    await client.query('UPDATE stock_transfer SET transaction_id = $1 WHERE id = $2', [transactionId, transferId]);

    for (const item of itemsRes.rows) {
      const transferItemRes = await client.query(
        `INSERT INTO stock_transfer_items (stock_transfer_id, product_id, product_name, qty, cost_price, tax_value, created_at)
         VALUES ($1,$2,$3,$4,$5,0,NOW())
         RETURNING id`,
        [transferId, item.product_id, item.product_name, item.qty, item.cost_price]
      );

    }

    await client.query(
      `UPDATE stock_requisitions
       SET source_id = $1,
           stock_transfer_id = $2,
           fulfillment_status = 'pending',
           status = 'approved',
           fulfilled_at = NULL,
           meta = meta || $3::jsonb
       WHERE id = $4`,
      [sourceId, transferId, JSON.stringify({ fulfilledBy: 'stock_transfer', stockTransferId: transferId }), requisitionId]
    );

    await client.query(`INSERT INTO inventory_transfer_events(transfer_id,action,actor_id,request_key,details) VALUES($1,'submitted',$2,$3,$4::jsonb)`,[transferId,auth.user.id,`submit-${transferId}`,JSON.stringify({requisitionId})]);
    await client.query('COMMIT');
    return NextResponse.json({ success: true, id: transferId, transactionId, totalItems, totalCost }, { status: 201 });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[stocktransfer from requisition]', err);
    return NextResponse.json({ success: false, message: err.message || 'Failed to fulfill requisition' }, { status: 500 });
  } finally {
    if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); }
  }
}
