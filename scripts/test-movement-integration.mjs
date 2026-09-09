import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
dotenv.config({quiet:true});
globalThis._schemaEnsured_inventory_batching_v8=true;
const {default:pool}=await import('../src/lib/db.js');
const {transferAction}=await import('../src/lib/transferWorkflow.js');
const {receiveInspectedStock}=await import('../src/lib/grnInspection.js');
const {allocateBatchStock}=await import('../src/lib/inventoryBatching.js');
const client=await pool.connect();
const schema=`movement_test_${Date.now()}`;
try {
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}`);
  await client.query(`
    CREATE TABLE stores(id SERIAL PRIMARY KEY,name TEXT);
    CREATE TABLE users(id BIGSERIAL PRIMARY KEY,name TEXT);
    CREATE TABLE products(id BIGSERIAL PRIMARY KEY,name TEXT,sku TEXT,unit TEXT);
    CREATE TABLE construction_projects(id BIGSERIAL PRIMARY KEY,name TEXT);
    CREATE TABLE construction_sites(id BIGSERIAL PRIMARY KEY,project_id BIGINT,store_id INTEGER);
    CREATE TABLE stock_transfer(id SERIAL PRIMARY KEY,transaction_id TEXT,source_id INTEGER,destination_id INTEGER,status TEXT,
      workflow_status TEXT,meta JSONB DEFAULT '{}',dispatched_at TIMESTAMPTZ,dispatched_by BIGINT,received_at TIMESTAMPTZ,received_by BIGINT,
      vehicle_number TEXT,challan_number TEXT,transporter_name TEXT,driver_name TEXT,expected_arrival_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE stock_transfer_items(id SERIAL PRIMARY KEY,stock_transfer_id INTEGER,product_id BIGINT,product_name TEXT,sku TEXT,barcode TEXT,qty NUMERIC,
      cost_price NUMERIC DEFAULT 1,mrp NUMERIC DEFAULT 2,destination_mrp NUMERIC DEFAULT 2,selling_price NUMERIC DEFAULT 2,
      meta JSONB DEFAULT '{}',dispatched_qty NUMERIC DEFAULT 0,received_qty NUMERIC DEFAULT 0,accepted_qty NUMERIC DEFAULT 0,
      damaged_qty NUMERIC DEFAULT 0,rejected_qty NUMERIC DEFAULT 0,short_qty NUMERIC DEFAULT 0,excess_qty NUMERIC DEFAULT 0);
    CREATE TABLE stock_requisitions(id SERIAL PRIMARY KEY,stock_transfer_id INTEGER,fulfillment_status TEXT,status TEXT,fulfilled_at TIMESTAMPTZ);
    CREATE TABLE stock_requisition_items(id SERIAL PRIMARY KEY,requisition_id INTEGER,product_id BIGINT,qty NUMERIC,fulfilled_qty NUMERIC DEFAULT 0);
    CREATE TABLE stock_in_items(id SERIAL PRIMARY KEY,mrp NUMERIC,selling_price NUMERIC,cost_price NUMERIC,meta JSONB DEFAULT '{}');
    CREATE TABLE inventory_batches(id BIGSERIAL PRIMARY KEY,product_id BIGINT,store_id INTEGER,batch_no TEXT,mfg_date DATE,expiry_date DATE,
      received_qty NUMERIC,available_qty NUMERIC,reserved_qty NUMERIC DEFAULT 0,cost_price NUMERIC,source_type TEXT,source_id TEXT,
      status TEXT DEFAULT 'active',meta JSONB DEFAULT '{}',created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK(reserved_qty >= 0 AND available_qty >= reserved_qty));
    CREATE TABLE inventory_batch_movements(id BIGSERIAL PRIMARY KEY,batch_id BIGINT,product_id BIGINT,store_id INTEGER,direction TEXT,qty NUMERIC,
      reference_type TEXT,reference_id TEXT,source_item_id BIGINT,meta JSONB DEFAULT '{}',created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE product_saleability(product_id BIGINT,store_id INTEGER,is_active BOOLEAN,selling_price NUMERIC,mrp NUMERIC,low_stock_value NUMERIC,
      created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,UNIQUE(product_id,store_id));
    CREATE TABLE construction_discrepancies(id BIGSERIAL PRIMARY KEY,discrepancy_number TEXT,transfer_id INTEGER,product_id BIGINT,
      discrepancy_type TEXT,quantity NUMERIC,owner_id BIGINT,evidence JSONB,created_by BIGINT,status TEXT DEFAULT 'open',resolution TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),resolved_at TIMESTAMPTZ);
    INSERT INTO users(name) VALUES('Sender'),('Receiver');
    INSERT INTO stores(name) VALUES('Warehouse'),('Site A');
    INSERT INTO products(name,sku,unit) VALUES('Cement','CEM','BAG');
    INSERT INTO stock_transfer(transaction_id,source_id,destination_id,status,workflow_status) VALUES('TEST-1',1,2,'submitted','submitted');
    INSERT INTO stock_transfer_items(stock_transfer_id,product_id,product_name,qty) VALUES(1,1,'Cement',100);
    INSERT INTO inventory_batches(product_id,store_id,batch_no,received_qty,available_qty,cost_price) VALUES(1,1,'CEMENT-LOT',500,500,1);
  `);
  const source=await readFile(new URL('../src/lib/movementWorkflowSchema.js',import.meta.url),'utf8');
  const ddl=source.match(/await query\(`([\s\S]*?)`\);/)[1];
  await client.query(ddl);
  await client.query('UPDATE stock_transfer SET workflow_version=2');
  await client.query(`INSERT INTO stock_requisitions(stock_transfer_id,fulfillment_status,status) VALUES(1,'pending','approved');
    INSERT INTO stock_requisition_items(requisition_id,product_id,qty) VALUES(1,1,100);
    UPDATE stock_transfer SET meta='{"requisitionId":1}' WHERE id=1`);
  const user={id:1,name:'Sender'};
  async function run(action,body={},actor=user) {
    const t=(await client.query('SELECT * FROM stock_transfer WHERE id=1 FOR UPDATE')).rows[0];
    return transferAction(client,t,action,{requestKey:`${action}-${Date.now()}-${Math.random()}`,...body},actor);
  }
  async function expectedFailure(fn) {
    await client.query('SAVEPOINT invalid_case');
    await assert.rejects(fn);
    await client.query('ROLLBACK TO SAVEPOINT invalid_case');
  }
  await expectedFailure(()=>run('dispatch',{}));
  await run('approve');
  let batch=(await client.query('SELECT * FROM inventory_batches WHERE id=1')).rows[0];
  assert.equal(Number(batch.available_qty),500);assert.equal(Number(batch.reserved_qty),100);
  await expectedFailure(()=>allocateBatchStock(client,{productId:1,storeId:1,qty:401}));
  await expectedFailure(()=>run('pick',{}));
  await run('pick',{evidence:'Packing checklist P-1'});
  await run('dispatch',{items:[{id:1,qty:95}],vehicle:'TEST-VEHICLE',challan:'CH-1',eta:new Date(Date.now()+3600000).toISOString(),evidence:'Dispatch photo D-1'});
  batch=(await client.query('SELECT * FROM inventory_batches WHERE id=1')).rows[0];
  assert.equal(Number(batch.available_qty),405);assert.equal(Number(batch.reserved_qty),0);
  assert.equal((await client.query('SELECT * FROM inventory_batches WHERE store_id=2')).rows.length,0);
  await expectedFailure(()=>run('receive',{evidence:'Receipt',items:[{id:1,received:96,accepted:96,damaged:0,rejected:0,short:0,excess:0}]}));
  const receipt={requestKey:'receipt-1',evidence:'Receiver signed R-1',items:[{id:1,received:94,accepted:93,damaged:1,rejected:0,short:1,excess:0}]};
  assert.equal((await run('receive',receipt,{id:2,name:'Receiver'})).status,'under_dispute');
  assert.equal((await run('receive',receipt,{id:2,name:'Receiver'})).replay,true);
  await expectedFailure(()=>run('receive',{...receipt,remarks:'changed payload'},{id:2,name:'Receiver'}));
  assert.equal(Number((await client.query('SELECT fulfilled_qty FROM stock_requisition_items')).rows[0].fulfilled_qty),93);
  assert.equal((await client.query('SELECT fulfillment_status FROM stock_requisitions')).rows[0].fulfillment_status,'partial');
  const stock=(await client.query('SELECT status,SUM(available_qty) qty FROM inventory_batches WHERE store_id=2 GROUP BY status')).rows;
  assert.equal(Number(stock.find(x=>x.status==='active').qty),93);assert.equal(Number(stock.find(x=>x.status==='damaged').qty),1);
  const cases=(await client.query('SELECT * FROM construction_discrepancies')).rows;
  assert.equal(cases.length,2);
  for(const c of cases)await run('resolve',{discrepancyId:c.id,remarks:'Claim approved; isolated material retained',evidence:'Claim approval C-1'});
  assert.equal((await client.query('SELECT status FROM stock_transfer WHERE id=1')).rows[0].status,'closed');
  await expectedFailure(()=>client.query("UPDATE inventory_transfer_events SET action='tampered'"));
  await expectedFailure(()=>client.query('DELETE FROM inventory_transfer_receipts'));
  await expectedFailure(()=>client.query("DELETE FROM inventory_batch_movements WHERE meta->>'workflowVersion'='2'"));
  const grnItem=(await client.query('INSERT INTO stock_in_items DEFAULT VALUES RETURNING id')).rows[0];
  await receiveInspectedStock(client,{stockInId:99,stockInItemId:grnItem.id,productId:1,storeId:1,qty:500,costPrice:1,batchNo:'GRN-TEST',
    inspection:{received:500,accepted:490,damaged:10,rejected:0},meta:{actorId:1,mrp:2,sellingPrice:2}});
  const grn=(await client.query("SELECT status,available_qty FROM inventory_batches WHERE batch_no='GRN-TEST'")).rows;
  assert.equal(Number(grn.find(x=>x.status==='active').available_qty),490);assert.equal(Number(grn.find(x=>x.status==='damaged').available_qty),10);
  // Execute report SQL against real PostgreSQL to catch grouping/cast/schema errors.
  const report=await readFile(new URL('../src/app/api/inventory/movement-tracker/route.js',import.meta.url),'utf8');
  for(const name of ['transfers','buckets','ledger','projects']) {
    const sql=report.match(new RegExp(`const ${name}=await query\\(\x60([\\s\\S]*?)\x60`))[1];
    const params=name==='projects'?[null]:name==='buckets'?[null,null,null,'%']:[null,null,null,'%',null,null];
    await client.query(sql,params);
  }
  console.log('PASS: actual PostgreSQL reservations, dispatch, receipt, discrepancy closure, retry idempotency, immutable events, GRN condition split and report queries');
} finally {
  await client.query('ROLLBACK'); // Test schema and all fixture records are discarded atomically.
  client.release();await pool.end();
}
