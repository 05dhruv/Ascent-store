import { receiveBatchStock } from '@/lib/inventoryBatching';
import { quantity, roundQty } from '@/lib/movementRules.mjs';

export function inspectedCounts(batch) {
  const received=quantity(batch.qty,'Received quantity',false);
  const damaged=quantity(batch.damaged_qty??0,'Damaged quantity');
  const rejected=quantity(batch.rejected_qty??0,'Rejected quantity');
  const accepted=roundQty(received-damaged-rejected);
  if(accepted<0)throw new Error('Damaged + rejected cannot exceed received quantity');
  return {received,accepted,damaged,rejected};
}

export async function receiveInspectedStock(client,args) {
  const counts=args.inspection;
  for(const [condition,qty] of [['active',counts.accepted],['damaged',counts.damaged],['rejected',counts.rejected]]) {
    if(!qty)continue;
    const batch=await receiveBatchStock(client,{...args,qty,meta:{...args.meta,condition,workflowVersion:2}});
    if(condition!=='active')await client.query('UPDATE inventory_batches SET status=$1 WHERE id=$2',[condition,batch.id]);
  }
  await client.query(`UPDATE stock_in_items SET meta=meta || $1::jsonb WHERE id=$2`,[JSON.stringify({inspection:counts}),args.stockInItemId]);
}
