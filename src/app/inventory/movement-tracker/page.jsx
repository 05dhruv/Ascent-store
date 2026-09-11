'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';

const input='rounded border border-slate-300 p-2 text-sm w-full';
const button='rounded bg-indigo-700 px-3 py-2 text-sm text-white disabled:opacity-40';
const pretty=value=>String(value||'').replaceAll('_',' ');
const num=value=>Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:3});
function exportRows(rows) {
  if(!rows.length)return;
  const keys=Object.keys(rows[0]).filter(k=>typeof rows[0][k]!=='object');
  const escape=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const csv=[keys,...rows.map(row=>keys.map(k=>row[k]))].map(row=>row.map(escape).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='material-movement.csv';a.click();URL.revokeObjectURL(url);
}

export default function MovementTracker() {
  const attempts=useRef(new Map());
  const [data,setData]=useState(null),[tab,setTab]=useState('transfers'),[filters,setFilters]=useState({search:'',store:'',project:'',from:'',to:''});
  const [error,setError]=useState(''),[loading,setLoading]=useState(false),[detail,setDetail]=useState(null),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({}),[lines,setLines]=useState([]),[notice,setNotice]=useState('');
  async function load() {
    setLoading(true);setError('');
    try{const r=await fetch('/api/inventory/movement-tracker?'+new URLSearchParams(filters));const json=await r.json();if(!r.ok)throw new Error(json.error);setData(json);}
    catch(e){setError(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);
  async function open(id) {
    setError('');setBusy(true);
    try{const r=await fetch(`/api/inventory/stocktransfer/${id}/workflow`);const json=await r.json();if(!r.ok)throw new Error(json.error);
      setDetail(json);setForm({});setLines(json.items.map(x=>({...x,dispatch:Number(x.qty),received:0,accepted:0,damaged:0,rejected:0,short:0,excess:0,
        pending:Number(x.dispatched_qty)-Number(x.received_qty)-Number(x.short_qty)+Number(x.excess_qty)})));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function action(name,extra={}) {
    if(busy)return;setBusy(true);setError('');setNotice('');
    const items=name==='dispatch'?lines.map(x=>({id:x.id,qty:x.dispatch})):name==='receive'?lines.filter(x=>Number(x.received)||Number(x.short)).map(x=>({id:x.id,received:x.received,accepted:x.accepted,damaged:x.damaged,rejected:x.rejected,short:x.short,excess:x.excess})):undefined;
    const signature=JSON.stringify({id:detail.transfer.id,name,form,extra,items});
    if(!attempts.current.has(signature)) attempts.current.set(signature,crypto.randomUUID());
    try{const r=await fetch(`/api/inventory/stocktransfer/${detail.transfer.id}/workflow`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,...extra,eta:form.eta?new Date(form.eta).toISOString():undefined,action:name,items:extra.items||items,requestKey:attempts.current.get(signature)})});
      const json=await r.json();if(!r.ok)throw new Error(json.error);attempts.current.delete(signature);setNotice(`${pretty(name)} recorded`);await open(detail.transfer.id);await load();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  function updateReceiptLine(index,key,value) {
    setLines(lines.map((line,i)=>{
      if(i!==index) return line;
      if(key!=='received') return {...line,[key]:value};
      const previousReceived=Number(line.received||0);
      return {...line,received:value,accepted:Number(line.accepted||0)===previousReceived?value:line.accepted};
    }));
  }
  const rows=data?.[tab]||[],state=detail?.transfer.workflow_status;
  const receiving=['dispatched','partially_received'].includes(state);
  const usableExcessApprovals=(detail?.events||[]).filter(event=>event.action==='approve_excess')
    .filter(event=>!(detail?.events||[]).some(receipt=>receipt.action==='receive' && String(receipt.details?.excessApprovalId||'')===String(event.id)));
  const hasEnteredExcess=lines.some(line=>Number(line.excess)>0);
  const cols=tab==='transfers'?['Transfer','Source to destination','Status','Sent','Accepted','Transit','Damaged / Rejected','Short / Excess','Open cases','ETA']:tab==='buckets'?['Location','Material','Unit','Usable','Reserved','Quarantine','Damaged','Rejected','Expired','Inactive','Physical qty','Physical value']:['Date / Time','Location','Material / Batch','Unit','In','Out','Recorded balance','Document','Actor'];
  return <MainLayout><div className="p-4 sm:p-6 space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Material movement</h1><p className="text-sm text-slate-600">Dispatch, receipt, stock condition and material history</p></div><div className="flex gap-3"><Link className={button} href="/inventory/stocktransfer">Create transfer</Link><Link className={button} href="/inventory/stockin">Stock In / GRN</Link></div></div>
    {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}{notice&&<p role="status" className="text-green-800">{notice}</p>}
    <form onSubmit={e=>{e.preventDefault();load();}} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <input aria-label="Search material or transfer" className={input} placeholder="Material, batch, transfer, vehicle" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/>
      {['store','project'].map(key=><select key={key} aria-label={key} className={input} value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}><option value="">All {key==='store'?'locations':'projects'}</option>{data?.[key==='store'?'stores':'projects']?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>)}
      {['from','to'].map(key=><label key={key} className="text-xs">{key}<input type="date" className={input} value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}/></label>)}
      <button className={button} disabled={loading}>{loading?'Loading…':'Apply filters'}</button>
    </form>
    <div className="flex flex-wrap gap-2">{['transfers','buckets','ledger'].map(x=><button key={x} onClick={()=>setTab(x)} className={`rounded px-4 py-2 ${tab===x?'bg-slate-900 text-white':'bg-slate-100'}`}>{x==='buckets'?'Location stock':pretty(x)}</button>)}<button className="ml-auto text-indigo-700" onClick={()=>exportRows(rows)}>Export displayed rows</button></div>
    {tab==='buckets'&&<p className="text-xs text-slate-600">Current physical stock. Usable excludes expired, reserved and isolated material. Date filters apply only to transfers and ledger; transit is shown by transfer.</p>}
    {tab==='ledger'&&<p className="text-xs text-slate-600">Recorded balance follows retained movement history, including isolated stock. Historical corrections before this workflow may require opening reconciliation.</p>}
    {data?.truncated&&<p className="text-amber-800">Showing up to 500 rows per report. Narrow the filters for a complete export.</p>}
    <div className="overflow-auto rounded border"><table className="w-full whitespace-nowrap text-sm"><thead className="bg-slate-100"><tr>{cols.map(c=><th key={c} className="p-3 text-left">{c}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id||`${row.store_id}-${row.product_id}`} className="border-t">
      {(tab==='transfers'?[<button className="text-indigo-700 underline" onClick={()=>open(row.id)} key="open">{row.transaction_id}</button>,`${row.source_name} to ${row.destination_name}`,row.workflow_version===2?pretty(row.status):`Historical: ${pretty(row.status)}`,row.workflow_version===2?num(row.dispatched):'-',row.workflow_version===2?num(row.accepted):'-',row.workflow_version===2?num(row.in_transit):'-',`${num(row.damaged)} / ${num(row.rejected)}`,`${num(row.short)} / ${num(row.excess)}`,row.open_cases,row.expected_arrival_at?new Date(row.expected_arrival_at).toLocaleString():'-']:tab==='buckets'?[row.location,row.product,row.unit,num(row.available),num(row.reserved),num(row.quarantine),num(row.damaged),num(row.rejected),num(row.expired),num(row.inactive),num(row.physical_qty),num(row.physical_value)]:[new Date(row.created_at).toLocaleString(),row.location,`${row.product} / ${row.batch_no||'-'}`,row.unit,row.direction==='in'?num(row.qty):'-',row.direction==='out'?num(row.qty):'-',num(row.recorded_balance),`${pretty(row.reference_type)} ${row.meta?.transactionId||row.reference_id}`,row.actor]).map((cell,i)=><td key={i} className="p-3">{cell}</td>)}
    </tr>)}</tbody></table>{!rows.length&&!loading&&<p className="p-8 text-center text-slate-500">No records match these filters.</p>}</div>
    {detail&&<section className="rounded-xl border-2 border-indigo-200 bg-white p-4 space-y-4" aria-label="Transfer detail">
      <div className="flex justify-between"><div><h2 className="text-xl font-semibold">{detail.transfer.transaction_id} · {pretty(state)}</h2><p>{detail.transfer.source_name} to {detail.transfer.destination_name}</p></div><button onClick={()=>setDetail(null)}>Close detail</button></div>
      {detail.transfer.workflow_version!==2?<p>Historical transfer. Its original stock posting is preserved; receipt quantities were not captured in this workflow.</p>:<>
        <div className="grid gap-3 sm:grid-cols-3">{['remarks','evidence',...(state==='picked'?['vehicle','challan','transporter','driver','eta']:[])].map(key=><label key={key} className="text-sm">{key==='evidence'?'Proof / document link or reference':pretty(key)}<input className={input} type={key==='eta'?'datetime-local':'text'} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</div>
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{['Material','Requested','Dispatched','Accepted','Pending',...(state==='picked'?['Dispatch now']:receiving?['Received now','Accepted now','Damaged','Rejected','Short (final)','Excess']:[])].map(c=><th key={c} className="p-2 text-left">{c}</th>)}</tr></thead><tbody>{lines.map((line,index)=><tr key={line.id} className="border-t"><td className="p-2">{line.product_name}</td>{[line.qty,line.dispatched_qty,line.accepted_qty,line.pending].map((n,i)=><td key={i} className="p-2">{num(n)}</td>)}{(state==='picked'?['dispatch']:receiving?['received','accepted','damaged','rejected','short','excess']:[]).map(key=><td key={key} className="p-2"><input aria-label={`${line.product_name} ${key}`} type="number" min="0" step="0.001" className={`${input} min-w-24`} value={line[key]} onChange={e=>key==='received'?updateReceiptLine(index,key,e.target.value):setLines(lines.map((x,i)=>i===index?{...x,[key]:e.target.value}:x))}/></td>)}</tr>)}</tbody></table></div>
        {receiving&&<p className="text-sm text-slate-600">Enter this receipt only. Accepted + damaged + rejected must equal received. Leave a later delivery pending; use Short only for a declared shortage.</p>}
        <div className="flex flex-wrap gap-2">
          {detail.canSend&&state==='submitted'&&<button disabled={busy} className={button} onClick={()=>action('approve')}>Approve & reserve</button>}
          {detail.canSend&&state==='approved'&&<button disabled={busy} className={button} onClick={()=>action('pick')}>Confirm picking</button>}
          {detail.canSend&&state==='picked'&&<button disabled={busy} className={button} onClick={()=>action('dispatch')}>Dispatch material</button>}
          {detail.canReceive&&receiving&&<>{hasEnteredExcess&&<select aria-label="Approved excess" className="rounded border p-2" value={form.excessApprovalId||''} onChange={e=>setForm({...form,excessApprovalId:e.target.value})}><option value="">Select approved excess</option>{usableExcessApprovals.map(event=><option key={event.id} value={event.id}>Approval #{event.id}</option>)}</select>}<button disabled={busy || (hasEnteredExcess && !form.excessApprovalId)} className={button} onClick={()=>action('receive')}>Confirm actual receipt</button></>}
          {detail.canSend&&receiving&&hasEnteredExcess&&<button disabled={busy} className={button} onClick={()=>action('approve_excess',{items:lines.filter(x=>Number(x.excess)>0).map(x=>({id:x.id,qty:x.excess}))})}>Approve excess</button>}
          {detail.canSend&&['submitted','approved','picked'].includes(state)&&<button disabled={busy} className="rounded border px-3 py-2" onClick={()=>action('cancel')}>Cancel request</button>}
        </div>
      </>}
      <h3 className="font-semibold">Discrepancies</h3>{!detail.discrepancies.length&&<p className="text-sm text-slate-500">No discrepancies recorded.</p>}
      {detail.discrepancies.map(x=><div key={x.id} className="flex flex-wrap justify-between gap-3 rounded bg-amber-50 p-3"><span>{x.discrepancy_number} · {num(x.quantity)} {x.discrepancy_type} · {x.status}<br/>{x.resolution}</span>{detail.canSend&&['open','under_review'].includes(x.status)&&<button className={button} disabled={busy} onClick={()=>action('resolve',{discrepancyId:x.id})}>Resolve with entered reason/proof</button>}</div>)}
      <p className="text-xs text-slate-500">Resolving a case records its investigation outcome. Damaged/rejected goods remain isolated; resolution does not make them usable.</p>
      <h3 className="font-semibold">Document timeline</h3>{detail.events.map(event=><div key={event.id} className="border-l-2 border-indigo-200 pl-3 text-sm"><strong>#{event.id} {pretty(event.action)}</strong> · {new Date(event.created_at).toLocaleString()} · {event.details.actorName||`User ${event.actor_id}`}<p>{event.details.remarks} {event.details.evidence}</p></div>)}
    </section>}
  </div></MainLayout>;
}
