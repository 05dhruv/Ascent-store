'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';

const links = [
  ['Material Receipt / GRN', '/inventory/stockin', 'ti-package-import'],
  ['Material Requisition', '/inventory/stockrequisition', 'ti-clipboard-text'],
  ['Site Transfer Tracker', '/inventory/stocktransfer', 'ti-truck-delivery'],
  ['Material Issue', '/inventory/stockout', 'ti-building-warehouse'],
  ['Physical Stock Check', '/inventory/stockvalidation', 'ti-checklist'],
  ['Movement Ledger', '/reports/inventory/stock-ledger-summary', 'ti-list-details'],
];

export default function ConstructionDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/construction/dashboard', { cache: 'no-store', credentials: 'include' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Unable to load dashboard');
        setData(json.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  const cards = [
    ['Active Projects', data?.active_projects || 0, 'Projects currently under execution', 'ti-building'],
    ['Project Budget', `₹${Number(data?.project_budget || 0).toLocaleString('en-IN')}`, 'Planning and active projects', 'ti-currency-rupee'],
    ['In Transit', data?.in_transit || 0, 'Dispatched, awaiting site receipt', 'ti-truck'],
    ['Open Discrepancies', data?.open_discrepancies || 0, 'Short, damaged or rejected material', 'ti-alert-triangle'],
  ];

  return (
    <MainLayout>
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.25em] text-amber-400">Construction Control Centre</p>
            <h1 className="mt-2 text-3xl font-black">Projects, sites and material movement</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">Track every material from vendor receipt to warehouse, transit, site acceptance and final work consumption.</p>
          </div>
          <Link href="/construction/projects" className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400">+ New Project</Link>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, note, icon]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span><i className={`ti ${icon} text-xl text-amber-600`} /></div>
          <p className="mt-3 text-3xl font-black text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p>
        </div>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-black text-slate-900">Active project portfolio</h2><Link href="/construction/projects" className="text-sm font-semibold text-amber-700">Manage projects</Link></div>
          <div className="space-y-2">{(data?.projects || []).map((project) => <div key={project.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
            <div><p className="font-bold text-slate-900">{project.name}</p><p className="text-xs text-slate-500">{project.project_code} · {project.client_name || 'No client'} · {project.site_count} site(s)</p></div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase text-amber-800">{project.status}</span>
          </div>)}{data && !data.projects?.length && <p className="py-10 text-center text-sm text-slate-400">Create your first project and site to begin.</p>}</div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-black text-slate-900">Quick operations</h2>
          <div className="grid gap-2">{links.map(([label, href, icon]) => <Link key={label} href={href} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 hover:border-amber-300 hover:bg-amber-50"><span className="flex items-center gap-3 text-sm font-semibold text-slate-700"><i className={`ti ${icon} text-lg text-amber-600`} />{label}</span><i className="ti ti-chevron-right text-slate-400" /></Link>)}</div>
        </section>
      </div>
    </MainLayout>
  );
}
