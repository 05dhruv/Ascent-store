import { allocateBatchStock, receiveBatchStock } from '@/lib/inventoryBatching';
import { quantity, roundQty, receiptQuantities, splitReceipt, transferState, requestSignature, transferPrices } from '@/lib/movementRules.mjs';

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export async function transferAction(client, transfer, action, body, user) {
  const id = transfer.id;
  const requestKey = required(body.requestKey, 'Request identifier');
  if (requestKey.length > 120) throw new Error('Request identifier is too long');
  const previous = await client.query('SELECT action, details FROM inventory_transfer_events WHERE transfer_id=$1 AND request_key=$2', [id, requestKey]);
  if (previous.rows.length) {
    if (previous.rows[0].action !== action) throw new Error('Request identifier already used for a different action');
    const signature=requestSignature(body);
    const saved=previous.rows[0].details.requestSignature;
    if(!saved || requestSignature(JSON.parse(saved))!==signature) throw new Error('Request identifier reused with different quantities or details');
    return { replay: true };
  }
  if (transfer.workflow_version !== 2) throw new Error('Historical transfers cannot enter the new dispatch/receipt workflow');
  if (Number(transfer.source_id) === Number(transfer.destination_id)) throw new Error('Source and destination must be different');
  const items = (await client.query('SELECT * FROM stock_transfer_items WHERE stock_transfer_id=$1 ORDER BY id FOR UPDATE', [id])).rows;
  if (!items.length) throw new Error('Transfer has no items');
  const details = { requestSignature:requestSignature(body), remarks: body.remarks || '', evidence: body.evidence || '', actorName: user.name || '', ...(['dispatch'].includes(action) ? { vehicle: body.vehicle, challan: body.challan, transporter: body.transporter, driver: body.driver, eta: body.eta } : {}) };
  let state = transfer.workflow_status;
  if (action === 'approve') {
    if (state !== 'submitted') throw new Error('Only submitted transfers can be approved');
    // Lock batches in deterministic product order. Other allocations share these locks.
    for (const item of [...items].sort((a,b) => Number(a.product_id)-Number(b.product_id) || a.id-b.id)) {
      let remaining = quantity(item.qty, 'Requested quantity', false);
      const batches = (await client.query(`SELECT * FROM inventory_batches WHERE product_id=$1 AND store_id=$2
        AND status='active' AND available_qty > reserved_qty AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
        AND ($3::bigint IS NULL OR id=$3) ORDER BY expiry_date ASC NULLS LAST,id FOR UPDATE`,
      [item.product_id, transfer.source_id, item.meta?.preferredBatchId || null])).rows;
      for (const batch of batches) {
        const qty = Math.min(remaining, roundQty(Number(batch.available_qty)-Number(batch.reserved_qty)));
        if (!qty) continue;
        await client.query('UPDATE inventory_batches SET reserved_qty=reserved_qty+$1 WHERE id=$2', [qty,batch.id]);
        await client.query('INSERT INTO inventory_transfer_reservations(transfer_id,item_id,batch_id,qty) VALUES($1,$2,$3,$4)', [id,item.id,batch.id,qty]);
        remaining=roundQty(remaining-qty);
        if (!remaining) break;
      }
      if (remaining) throw new Error(`Insufficient available stock to reserve ${item.product_name}; short ${remaining}`);
    }
    state='approved';
  } else if (action === 'pick') {
    if (state !== 'approved') throw new Error('Approve and reserve the transfer before picking');
    required(body.evidence, 'Packing proof reference');
    state='picked';
  } else if (action === 'cancel') {
    if (!['submitted','approved','picked'].includes(state)) throw new Error('Only an undispatched transfer can be cancelled');
    required(body.remarks, 'Cancellation reason');
    await releaseReservations(client,id);
    state='cancelled';
  } else if (action === 'dispatch') {
    if (state !== 'picked') throw new Error('Complete picking before dispatch');
    required(body.vehicle, 'Vehicle number'); required(body.challan, 'Challan number');
    required(body.evidence, 'Dispatch proof reference');
    if (!body.eta || !Number.isFinite(Date.parse(body.eta)) || Date.parse(body.eta) < Date.now()) throw new Error('A future expected arrival time is required');
    const lines = new Map((body.items || []).map(x=>[Number(x.id),x]));
    if (lines.size !== items.length || lines.size !== body.items?.length) throw new Error('Enter dispatch quantity for each transfer line exactly once');
    const reservations=(await client.query('SELECT * FROM inventory_transfer_reservations WHERE transfer_id=$1 ORDER BY batch_id FOR UPDATE',[id])).rows;
    // Release our reservation while retaining the batch row locks through COMMIT.
    await releaseReservations(client,id);
    let dispatched=0;
    for (const item of items) {
      const qty=quantity(lines.get(Number(item.id))?.qty, 'Dispatched quantity');
      if(qty>Number(item.qty)) throw new Error('Dispatched quantity cannot exceed approved quantity');
      let allocations=[];
      if(qty) {
        const batchIds=reservations.filter(x=>Number(x.item_id)===Number(item.id)).map(x=>Number(x.batch_id));
        if(!batchIds.length) throw new Error('Missing stock reservation');
        allocations=await allocateBatchStock(client,{productId:item.product_id,storeId:transfer.source_id,qty,allowedBatchIds:batchIds,
          referenceType:'stock_transfer_dispatch',referenceId:id,sourceItemId:item.id,meta:{actorId:user.id,transactionId:transfer.transaction_id,workflowVersion:2}});
      }
      await client.query(`UPDATE stock_transfer_items SET dispatched_qty=$1,meta=meta || $2::jsonb WHERE id=$3`,[qty,JSON.stringify({batchAllocations:allocations}),item.id]);
      dispatched+=qty;
    }
    if(!dispatched) throw new Error('Dispatch at least one item');
    await client.query(`UPDATE stock_transfer SET dispatched_at=NOW(),dispatched_by=$2,vehicle_number=$3,challan_number=$4,
      transporter_name=$5,driver_name=$6,expected_arrival_at=$7 WHERE id=$1`,[id,user.id,body.vehicle,body.challan,body.transporter||null,body.driver||null,body.eta]);
    state='dispatched';
    details.items=body.items;
  } else if (action === 'receive') {
    if (!['dispatched','partially_received'].includes(state)) throw new Error('This transfer has no outstanding receipt');
    required(body.evidence, 'Receiver acknowledgement / proof reference');
    if(!Array.isArray(body.items)||!body.items.length) throw new Error('Enter at least one receipt line');
    if(new Set(body.items.map(x=>Number(x.id))).size!==body.items.length) throw new Error('Duplicate receipt line');
    const validated=body.items.map(line=>{
      const item=items.find(x=>Number(x.id)===Number(line.id));
      if(!item) throw new Error('Receipt item does not belong to this transfer');
      const pending=roundQty(Number(item.dispatched_qty)-Number(item.received_qty)-Number(item.short_qty)+Number(item.excess_qty));
      const counts=receiptQuantities(line,pending);
      // Excess is a separately authorized receipt, never silently accepted by a receiver.
      if(counts.excess) {
        if(!body.excessApprovalId) throw new Error('Excess requires prior source approval');
      }
      return {item,counts};
    });
    const totalExcess=roundQty(validated.reduce((n,x)=>n+x.counts.excess,0));
    if(totalExcess) {
      const approval=(await client.query("SELECT * FROM inventory_transfer_events WHERE id=$1 AND transfer_id=$2 AND action='approve_excess'",[body.excessApprovalId,id])).rows[0];
      const used=await client.query("SELECT 1 FROM inventory_transfer_events WHERE transfer_id=$1 AND action='receive' AND details->>'excessApprovalId'=$2",[id,String(body.excessApprovalId)]);
      if(!approval||used.rows.length) throw new Error('Excess approval is missing or already used');
      for(const {item,counts} of validated) {
        if(counts.excess > Number(approval.details.items?.find(x=>Number(x.id)===Number(item.id))?.qty || 0)) throw new Error('Excess exceeds the approved line quantity');
      }
    }
    details.excessApprovalId=body.excessApprovalId || null;
    details.items=body.items;
    const event=await recordEvent(client,id,action,user.id,requestKey,details);
    for(const {item,counts:c} of validated) {
      const receipt=(await client.query(`INSERT INTO inventory_transfer_receipts(transfer_id,item_id,event_id,received,accepted,damaged,rejected,short,excess)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[id,item.id,event.id,c.received,c.accepted,c.damaged,c.rejected,c.short,c.excess])).rows[0];
      const offset=roundQty(Number(item.received_qty)+Number(item.short_qty)-Number(item.excess_qty));
      const base=splitReceipt(item.meta?.batchAllocations || [],roundQty(c.received-c.excess),offset);
      if(c.excess) base.push({qty:c.excess,costPrice:item.cost_price,batchNo:`EXCESS-${id}-${item.id}`,mrp:item.destination_mrp,sellingPrice:item.selling_price});
      let receivedOffset=0;
      let usablePrices = null;
      for(const [bucket,count] of [['active',c.accepted],['damaged',c.damaged],['rejected',c.rejected]]) {
        for(const allocation of splitReceipt(base,count,receivedOffset)) {
          const prices = transferPrices(item, allocation);
          if(bucket === 'active' && !usablePrices) usablePrices = prices;
          const batch=await receiveBatchStock(client,{stockInId:id,stockInItemId:item.id,productId:item.product_id,storeId:transfer.destination_id,
            qty:allocation.qty,costPrice:prices.costPrice,batchNo:allocation.batchNo,mfgDate:allocation.mfgDate,expiryDate:allocation.expiryDate,
            sourceType:'stock_transfer',movementReferenceType:'stock_transfer_receipt',meta:{workflowVersion:2,actorId:user.id,receiptId:receipt.id,transferId:id,
              transactionId:transfer.transaction_id,condition:bucket,sourceBatchId:allocation.batchId||null,mrp:prices.mrp,sellingPrice:prices.sellingPrice}});
          if(bucket!=='active') await client.query('UPDATE inventory_batches SET status=$1 WHERE id=$2',[bucket,batch.id]);
        }
        receivedOffset=roundQty(receivedOffset+count);
      }
      for(const type of ['damaged','rejected','short','excess']) if(c[type]) {
        await client.query(`INSERT INTO construction_discrepancies(discrepancy_number,transfer_id,product_id,discrepancy_type,quantity,owner_id,evidence,created_by,receipt_id)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,[`EX-${receipt.id}-${type}`,id,item.product_id,type,c[type],transfer.dispatched_by,JSON.stringify([body.evidence]),user.id,receipt.id]);
      }
      await client.query(`UPDATE stock_transfer_items SET received_qty=received_qty+$1,accepted_qty=accepted_qty+$2,damaged_qty=damaged_qty+$3,
        rejected_qty=rejected_qty+$4,short_qty=short_qty+$5,excess_qty=excess_qty+$6 WHERE id=$7`,[c.received,c.accepted,c.damaged,c.rejected,c.short,c.excess,item.id]);
      if(c.accepted) await client.query(`INSERT INTO product_saleability(product_id,store_id,is_active,selling_price,mrp,low_stock_value,created_at,updated_at)
        VALUES($1,$2,true,$3,$4,0,NOW(),NOW()) ON CONFLICT(product_id,store_id) DO UPDATE SET is_active=true,
        selling_price=CASE WHEN COALESCE(product_saleability.selling_price,0)>0 THEN product_saleability.selling_price ELSE EXCLUDED.selling_price END,
        mrp=CASE WHEN COALESCE(product_saleability.mrp,0)>0 THEN product_saleability.mrp ELSE EXCLUDED.mrp END,
        updated_at=NOW()`,[item.product_id,transfer.destination_id,usablePrices?.sellingPrice||0,usablePrices?.mrp||0]);
    }
    state=await receiptState(client,id);
    await client.query('UPDATE stock_transfer SET received_at=NOW(),received_by=$2 WHERE id=$1',[id,user.id]);
  } else if(action==='approve_excess') {
    if(!['dispatched','partially_received'].includes(state)) throw new Error('Excess approval requires an outstanding transfer');
    required(body.remarks,'Excess explanation');
    if(!body.items?.length) throw new Error('Select excess lines');
    if(new Set(body.items.map(line => Number(line.id))).size !== body.items.length) throw new Error('Duplicate excess approval line');
    details.items=body.items.map(line=>{
      if(!items.some(x=>Number(x.id)===Number(line.id))) throw new Error('Unknown transfer line');
      return {id:Number(line.id),qty:quantity(line.qty,'Approved excess',false)};
    });
  } else if(action==='resolve') {
    required(body.remarks,'Resolution / claim reference'); required(body.evidence,'Resolution evidence reference');
    const result=await client.query(`UPDATE construction_discrepancies SET status='resolved',resolution=$1,resolved_at=NOW(),resolved_by=$2
      WHERE id=$3 AND transfer_id=$4 AND status IN ('open','under_review') RETURNING id`,[body.remarks,user.id,body.discrepancyId,id]);
    if(!result.rows.length) throw new Error('Open discrepancy not found');
    details.discrepancyId=body.discrepancyId;
    // Resolving an investigation does not make damaged/rejected goods usable.
    state=await receiptState(client,id);
  } else throw new Error('Unsupported transfer action');

  if(action!=='receive') await recordEvent(client,id,action,user.id,requestKey,details);
  await client.query('UPDATE stock_transfer SET workflow_status=$1,status=$1 WHERE id=$2',[state,id]);
  if (transfer.meta?.requisitionId) {
    const requisitionId=Number(transfer.meta.requisitionId);
    if(state==='cancelled') {
      await client.query(`UPDATE stock_requisitions SET stock_transfer_id=NULL,fulfillment_status='pending'
        WHERE id=$1 AND stock_transfer_id=$2`,[requisitionId,id]);
    } else if(action==='receive') {
      const accepted=(await client.query('SELECT product_id,SUM(accepted_qty) qty FROM stock_transfer_items WHERE stock_transfer_id=$1 GROUP BY product_id',[id])).rows;
      const remaining=new Map(accepted.map(x=>[Number(x.product_id),Number(x.qty)]));
      const requested=(await client.query('SELECT * FROM stock_requisition_items WHERE requisition_id=$1 ORDER BY id FOR UPDATE',[requisitionId])).rows;
      let complete=true,any=false;
      for(const row of requested) {
        const available=remaining.get(Number(row.product_id))||0;
        const fulfilled=Math.min(Number(row.qty),available);
        remaining.set(Number(row.product_id),roundQty(available-fulfilled));
        if(fulfilled<Number(row.qty))complete=false;
        if(fulfilled>0)any=true;
        await client.query('UPDATE stock_requisition_items SET fulfilled_qty=$1 WHERE id=$2',[fulfilled,row.id]);
      }
      await client.query(`UPDATE stock_requisitions SET fulfillment_status=$1,status=$2,
        fulfilled_at=CASE WHEN $1='completed' THEN NOW() ELSE NULL END WHERE id=$3`,
      [complete?'completed':any?'partial':'pending',complete?'fulfilled':'approved',requisitionId]);
    }
  }
  return {status:state};
}

async function releaseReservations(client,id) {
  const rows=(await client.query('SELECT * FROM inventory_transfer_reservations WHERE transfer_id=$1 ORDER BY batch_id FOR UPDATE',[id])).rows;
  for(const row of rows) await client.query('UPDATE inventory_batches SET reserved_qty=reserved_qty-$1 WHERE id=$2',[row.qty,row.batch_id]);
  await client.query('DELETE FROM inventory_transfer_reservations WHERE transfer_id=$1',[id]);
}
async function recordEvent(client,id,action,actor,key,details) {
  return (await client.query(`INSERT INTO inventory_transfer_events(transfer_id,action,actor_id,request_key,details) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *`,[id,action,actor,key,JSON.stringify(details)])).rows[0];
}
async function receiptState(client,id) {
  const rows=(await client.query('SELECT * FROM stock_transfer_items WHERE stock_transfer_id=$1',[id])).rows;
  const open=(await client.query("SELECT count(*)::int n FROM construction_discrepancies WHERE transfer_id=$1 AND status IN ('open','under_review')",[id])).rows[0].n;
  return transferState(rows,open);
}
