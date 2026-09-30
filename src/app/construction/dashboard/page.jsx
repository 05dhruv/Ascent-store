'use client';

import Button from "@/components/ui/Button";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ConstructionShell, {
  ConstructionAlert,
  ConstructionSection,
  constructionInput,
} from '@/components/construction/ConstructionShell';

const links = [
  ['Material Receipt / GRN', '/inventory/stockin', 'ti-package-import'],
  ['Material Requisition', '/inventory/stockrequisition', 'ti-clipboard-text'],
  ['Site Transfer Tracker', '/inventory/stocktransfer', 'ti-truck-delivery'],
  ['Material Issue', '/inventory/stockout', 'ti-building-warehouse'],
  ['Physical Stock Check', '/inventory/stockvalidation', 'ti-checklist'],
  ['Movement Ledger', '/reports/inventory/stock-ledger-summary', 'ti-list-details'],
  ['Quarantine releases', '/construction/quarantine', 'ti-shield-check'],
  ['Evidence & limits', '/construction/evidence', 'ti-file-certificate'],
];

export default function ConstructionDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transferId, setTransferId] = useState('');
  const [qr, setQr] = useState(null);
  const [qrError, setQrError] = useState('');

  const loadDashboard = () => {
    setLoading(true);
    setError('');
    fetch('/api/construction/dashboard', { cache: 'no-store', credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = '/login?next=/construction/dashboard';
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Unable to load dashboard');
        setData(json.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const cards = [
    ['Active Projects', data?.active_projects || 0, 'Projects currently under execution', 'ti-building'],
    ['Project Budget', `₹${Number(data?.project_budget || 0).toLocaleString('en-IN')}`, 'Planning and active projects', 'ti-currency-rupee'],
    ['In Transit', data?.in_transit || 0, 'Dispatched, awaiting site receipt', 'ti-truck'],
    ['Open Discrepancies', data?.open_discrepancies || 0, 'Short, damaged or rejected material', 'ti-alert-triangle'],
  ];

  return (
    <ConstructionShell
      title="Projects, sites & material movement"
      subtitle="Track material from vendor receipt to warehouse, transit, site acceptance and work consumption."
      breadcrumb={[{ label: 'Projects', href: '/construction/projects' }, { label: 'Dashboard' }]}
      actions={[
        {
          label: 'New Project',
          href: '/construction/projects',
          icon: 'ti ti-plus',
          primary: true,
        },
      ]}
    >
      {error && (
        <ConstructionAlert>
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" onClick={loadDashboard}>
              Retry
            </Button>
          </div>
        </ConstructionAlert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, note, icon]) => (
          <div key={label} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </span>
              <i className={`ti ${icon} text-xl text-blue-600`} />
            </div>
            <p className="mt-3 text-3xl font-black text-slate-900">
              {loading ? '…' : value}
            </p>
            <p className="mt-1 text-xs text-slate-400">{note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <ConstructionSection
          title="Active project portfolio"
          action={
            <Link href="/construction/projects" className="text-[12.5px] font-medium text-blue-700 hover:underline">
              Manage projects
            </Link>
          }
        >
          <div className="space-y-2">
            {(data?.projects || []).map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-slate-900">{project.name}</p>
                  <p className="text-xs text-slate-500">
                    {project.project_code} · {project.client_name || 'No client'} ·{' '}
                    {project.site_count} site(s)
                  </p>
                </div>
                <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[11px] font-semibold uppercase text-slate-700">
                  {project.status}
                </span>
              </div>
            ))}
            {data && !data.projects?.length && (
              <p className="py-8 text-center text-sm text-slate-400">
                Create your first project and site to begin.
              </p>
            )}
          </div>
        </ConstructionSection>

        <ConstructionSection title="Quick operations">
          <div className="grid gap-2">
            {links.map(([label, href, icon]) => (
              <Link
                key={label}
                href={href}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <i className={`ti ${icon} text-lg text-blue-600`} />
                  {label}
                </span>
                <i className="ti ti-chevron-right text-slate-400" />
              </Link>
            ))}
          </div>
        </ConstructionSection>
      </div>

      <ConstructionSection
        title="Transfer QR"
        description="Generate a QR for site scan-to-receive on the movement tracker."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Transfer ID
            <input
              className={`${constructionInput} mt-1 w-40`}
              value={transferId}
              onChange={(e) => setTransferId(e.target.value)}
              placeholder="e.g. 12"
            />
          </label>
          <Button
            onClick={async () => {
              setQrError('');
              setQr(null);
              try {
                const r = await fetch(
                  `/api/construction/transfer-qr?transferId=${encodeURIComponent(transferId)}`,
                );
                const j = await r.json();
                if (!r.ok) throw new Error(j.message || j.error || 'QR failed');
                setQr(j.data || j);
              } catch (e) {
                setQrError(e.message);
              }
            }}
          >
            Generate QR
          </Button>
        </div>
        {qrError && (
          <p className="mt-3 text-sm text-red-600">{qrError}</p>
        )}
        {qr?.qrDataUrl && (
          <div className="mt-4 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr.qrDataUrl}
              alt="Transfer QR"
              className="h-36 w-36 rounded-xl border border-slate-200 bg-white p-2"
            />
            <p className="text-xs text-slate-500">
              Transfer #{qr.transferId}
              {qr.transferNumber ? ` · ${qr.transferNumber}` : ''}
            </p>
          </div>
        )}
      </ConstructionSection>
    </ConstructionShell>
  );
}
