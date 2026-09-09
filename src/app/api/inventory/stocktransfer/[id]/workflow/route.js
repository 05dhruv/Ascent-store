import { NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';
import { ensureMovementWorkflowSchema } from '@/lib/movementWorkflowSchema';
import { transferAction } from '@/lib/transferWorkflow';

export async function GET(request,{params}) {
  const auth=await requireAuth(request); if(auth.error) return auth.error;
  const permission=requirePermission(auth.user,'VIEW_INVENTORY','MANAGE_INVENTORY'); if(permission.error)return permission.error;
  await ensureMovementWorkflowSchema();
  const {id}=await params;
  const transfer=(await query(`SELECT t.*,s.name source_name,d.name destination_name FROM stock_transfer t
    JOIN stores s ON s.id=t.source_id JOIN stores d ON d.id=t.destination_id WHERE t.id=$1`,[id])).rows[0];
  if(!transfer)return NextResponse.json({error:'Transfer not found'},{status:404});
  const source=requireStore(auth.user,transfer.source_id),destination=requireStore(auth.user,transfer.destination_id);
  if(source.error&&destination.error)return source.error;
  const [items,events,discrepancies]=await Promise.all([
    query('SELECT * FROM stock_transfer_items WHERE stock_transfer_id=$1 ORDER BY id',[id]),
    query('SELECT * FROM inventory_transfer_events WHERE transfer_id=$1 ORDER BY id',[id]),
    query('SELECT * FROM construction_discrepancies WHERE transfer_id=$1 ORDER BY id',[id]),
  ]);
  return NextResponse.json({transfer,items:items.rows,events:events.rows,discrepancies:discrepancies.rows,
    canSend:!source.error&&!requirePermission(auth.user,'MANAGE_INVENTORY').error,
    canReceive:!destination.error&&!requirePermission(auth.user,'MANAGE_INVENTORY').error});
}

export async function POST(request,{params}) {
  const auth=await requireAuth(request);if(auth.error)return auth.error;
  const permission=requirePermission(auth.user,'MANAGE_INVENTORY');if(permission.error)return permission.error;
  await ensureMovementWorkflowSchema();
  const {id}=await params;
  const body=await request.json();
  const client=await getClient();
  try {
    await client.query('BEGIN');
    const transfer=(await client.query('SELECT * FROM stock_transfer WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!transfer) { await client.query('ROLLBACK');return NextResponse.json({error:'Transfer not found'},{status:404}); }
    const scope=requireStore(auth.user,body.action==='receive'?transfer.destination_id:transfer.source_id);
    if(scope.error){await client.query('ROLLBACK');return scope.error;}
    const result=await transferAction(client,transfer,body.action,body,auth.user);
    await client.query('COMMIT');
    return NextResponse.json({success:true,...result});
  }catch(error){await client.query('ROLLBACK');return NextResponse.json({error:error.message},{status:400});}
  finally{client.release();}
}
