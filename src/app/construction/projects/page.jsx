'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';

const emptyForm = {
  projectCode: '', name: '', clientName: '', budget: '', status: 'planning',
  startDate: '', expectedEndDate: '', address: '', siteCode: '', siteName: '',
  siteAddress: '', siteEngineerId: '',
};

export default function ProjectsPage() {
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => fetch('/api/construction/projects', { cache: 'no-store' })
    .then((response) => response.json())
    .then((json) => setRecords(json.data?.records || []));

  useEffect(() => {
    load();
    fetch('/api/auth/users', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/construction/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message);
      setForm(emptyForm);
      setMessage('Project and site store created successfully. The selected in-charge has been mapped to the site store.');
      await load();
    } catch (error) {
      setMessage(error.message || 'Unable to create project');
    } finally {
      setSaving(false);
    }
  }

  const field = (key, label, type = 'text', required = false) => (
    <label className="grid gap-1 text-xs font-semibold text-slate-600">
      <span>{label}{required ? ' *' : ''}</span>
      <input required={required} type={type} value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
    </label>
  );

  return (
    <MainLayout>
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-700">Project setup</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">Projects & Construction Sites</h1>
        <p className="mt-1 text-sm text-slate-500">Each site creates a site store for receipts, transfers and material issues. Selecting an in-charge automatically maps that employee to the site store.</p>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[420px_1fr]">
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-black">Create project and first site</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {field('projectCode', 'Project code', 'text', true)}
            {field('name', 'Project name', 'text', true)}
            {field('clientName', 'Client / developer')}
            {field('budget', 'Approved budget', 'number')}
            {field('startDate', 'Start date', 'date')}
            {field('expectedEndDate', 'Expected completion', 'date')}
            {field('address', 'Project address')}
            <div className="my-1 border-t border-slate-100" />
            {field('siteCode', 'First site code')}
            {field('siteName', 'First site / site store name')}
            {field('siteAddress', 'Site address')}
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              <span>Site engineer / in-charge</span>
              <select value={form.siteEngineerId} onChange={(event) => setForm({ ...form, siteEngineerId: event.target.value })}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600">
                <option value="">Assign later</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}{user.role ? ` (${user.role})` : ''}</option>)}
              </select>
              <span className="font-normal text-slate-400">This employee gets site-store access automatically. Roles and permissions remain under Team & Access.</span>
            </label>
          </div>
          {message && <p className="mt-3 text-sm text-blue-700">{message}</p>}
          <button disabled={saving} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Project & Site'}
          </button>
        </form>
        <div className="self-start rounded-2xl border border-slate-200 bg-white p-5 xl:sticky xl:top-[80px] xl:flex xl:max-h-[calc(100vh-96px)] xl:flex-col">
          <h2 className="mb-4 shrink-0 font-black">Project register</h2>
          <div className="min-h-0 overflow-auto xl:flex-1"><table className="min-w-[620px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white"><tr className="border-b text-xs uppercase text-slate-400"><th className="p-3">Code / Project</th><th className="p-3">Client</th><th className="p-3">Sites</th><th className="p-3">Budget</th><th className="p-3">Status</th></tr></thead>
            <tbody>{records.map((project) => <tr key={project.id} className="border-b border-slate-100"><td className="p-3"><b>{project.project_code}</b><div className="text-slate-500">{project.name}</div></td><td className="p-3">{project.client_name || '-'}</td><td className="p-3">{project.site_count}</td><td className="p-3">₹{Number(project.budget || 0).toLocaleString('en-IN')}</td><td className="p-3"><span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold uppercase text-orange-800">{project.status}</span></td></tr>)}{!records.length && <tr><td colSpan="5" className="p-12 text-center text-slate-400">No construction projects yet.</td></tr>}</tbody>
          </table></div>
        </div>
      </div>
    </MainLayout>
  );
}
