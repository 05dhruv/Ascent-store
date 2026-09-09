'use client';

export default function GrnInspection({items,onChange,form,onFormChange}) {
  const update=(index,batchIndex,key,value)=>onChange(items.map((item,i)=>i!==index?item:batchIndex===null?{...item,[key]:value}:{...item,batches:item.batches.map((b,j)=>j===batchIndex?{...b,[key]:value}:b)}));
  return <section className="my-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
    <h2 className="font-semibold">Receipt inspection</h2><p className="text-sm text-slate-600">Quantity on each line is physically received. Accepted stock becomes usable; damaged and rejected quantities remain isolated.</p>
    <div className="grid gap-3 sm:grid-cols-3">{[['checkedBy','Checked by'],['vehicleNumber','Vehicle number'],['receiptEvidence','Gate entry / challan / photo reference']].map(([key,label])=><label key={key} className="text-sm">{label}<input className="w-full rounded border p-2" value={form[key]||''} onChange={e=>onFormChange({...form,[key]:e.target.value})}/></label>)}</div>
    <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{['Material / Batch','Received','Damaged','Rejected','Accepted'].map(x=><th className="p-2 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{items.flatMap((item,i)=>(item.batches?.length?item.batches.map((b,j)=>({b,j})): [{b:item,j:null}]).map(({b,j})=><tr key={`${i}-${j}`}><td className="p-2">{item.name||item.product_name} / {b.batch_no||b.batchNo||'—'}</td><td className="p-2">{b.qty}</td>{['damaged_qty','rejected_qty'].map(key=><td className="p-2" key={key}><input aria-label={`${item.name} ${key}`} className="w-24 rounded border p-2" type="number" min="0" max={b.qty} step="0.001" value={b[key]??0} onChange={e=>update(i,j,key,e.target.value)}/></td>)}<td className="p-2">{Math.round((Number(b.qty||0)-Number(b.damaged_qty||0)-Number(b.rejected_qty||0))*1000)/1000}</td></tr>))}</tbody></table></div>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={Boolean(form.inspectionConfirmed)} onChange={e=>onFormChange({...form,inspectionConfirmed:e.target.checked})}/>Physical count and condition checked; accept the usable quantities shown above.</label>
  </section>;
}
