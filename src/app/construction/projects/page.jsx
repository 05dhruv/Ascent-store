'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';

const emptyForm = { projectCode: '', name: '', clientName: '', budget: '', status: 'planning', startDate: '', expectedEndDate: '', address: '', siteCode: '', siteName: '', siteAddress: '' };

export default function ProjectsPage() {
  const [records, setRecords] = useState([]); const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const load = () => fetch('/api/construction/projects', { cache: 'no-store' }).then(r => r.json()).then(j => setRecords(j.data?.records || []));
  useEffect(() => { load(); }, []);
  async function submit(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    try { const res = await fetch('/api/construction/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const json = await res.json(); if (!res.ok) throw new Error(json.message); setForm(emptyForm); setMessage('Project and site created successfully.'); await load(); }
    catch (error) { setMessage(error.message || 'Unable to create project'); } finally { setSaving(false); }
  }
  const field = (key, label, type='text', required=false) => <label className="grid gap-1 text-xs font-semibold text-slate-600"><span>{label}{required ? ' *' : ''}</span><input required={required} type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-500" /></label>;
  return <MainLayout><div className="mb-5"><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-700">Project setup</p><h1 className="mt-1 text-3xl font-black text-slate-900">Projects & Construction Sites</h1><p className="mt-1 text-sm text-slate-500">Each site automatically becomes an inventory destination for GRN, transfers and material issues.</p></div>
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]"><form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-black">Create project</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">{field('projectCode','Project code','text',true)}{field('name','Project name','text',true)}{field('clientName','Client / developer')}{field('budget','Approved budget','number')}{field('startDate','Start date','date')}{field('expectedEndDate','Expected completion','date')}{field('address','Project address')}<div className="my-1 border-t border-slate-100" />{field('siteCode','First site code')}{field('siteName','First site / store name')}{field('siteAddress','Site address')}</div>{message && <p className="mt-3 text-sm text-amber-700">{message}</p>}<button disabled={saving} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">{saving ? 'Creating…' : 'Create Project & Site'}</button></form>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-black">Project register</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-3">Code / Project</th><th className="p-3">Client</th><th className="p-3">Sites</th><th className="p-3">Budget</th><th className="p-3">Status</th></tr></thead><tbody>{records.map(p => <tr key={p.id} className="border-b border-slate-100"><td className="p-3"><b>{p.project_code}</b><div className="text-slate-500">{p.name}</div></td><td className="p-3">{p.client_name || '-'}</td><td className="p-3">{p.site_count}</td><td className="p-3">₹{Number(p.budget || 0).toLocaleString('en-IN')}</td><td className="p-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold uppercase text-amber-800">{p.status}</span></td></tr>)}{!records.length && <tr><td colSpan="5" className="p-12 text-center text-slate-400">No construction projects yet.</td></tr>}</tbody></table></div></div></div></MainLayout>;
}
