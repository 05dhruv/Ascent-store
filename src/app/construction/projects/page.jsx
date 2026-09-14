'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';

const emptyForm = {
  projectCode: '',
  name: '',
  clientName: '',
  budget: '',
  status: 'planning',
  startDate: '',
  expectedEndDate: '',
  address: '',
  siteCode: '',
  siteName: '',
  siteAddress: '',
  siteEngineerId: '',
};

export default function ProjectsPage() {
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () =>
    fetch('/api/construction/projects', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        const list = json.data?.records || [];
        setRecords(list);
      })
      .catch((err) => console.error('[projects load]', err));

  useEffect(() => {
    load();
    fetch('/api/auth/users', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, []);

  // Helpful auto-fill for site store when project details are entered
  const handleProjectNameChange = (val) => {
    setForm((prev) => {
      const next = { ...prev, name: val };
      if (!prev.siteName || prev.siteName === `${prev.name} Site Store`.trim()) {
        next.siteName = val ? `${val} Site Store` : '';
      }
      return next;
    });
  };

  const handleProjectCodeChange = (val) => {
    const upper = val.toUpperCase();
    setForm((prev) => {
      const next = { ...prev, projectCode: upper };
      if (!prev.siteCode || prev.siteCode === `SITE-${prev.projectCode}`.trim()) {
        next.siteCode = upper ? `SITE-${upper}` : '';
      }
      return next;
    });
  };

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      const response = await fetch('/api/construction/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || 'Unable to create project');
      setForm(emptyForm);
      setMessage('Project and Site Store created successfully! Site Store is active for stock transfers.');
      await load();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to create project');
    } finally {
      setSaving(false);
    }
  }

  const filteredRecords = useMemo(() => {
    return records.filter((proj) => {
      const matchesSearch =
        !searchQuery ||
        proj.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        proj.project_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        proj.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        proj.sites?.some((s) => s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.site_code?.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || proj.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [records, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const totalProjects = records.length;
    let totalSites = 0;
    let totalStock = 0;
    let totalInTransit = 0;

    records.forEach((p) => {
      totalSites += (p.sites?.length || p.site_count || 0);
      totalStock += Number(p.total_site_stock || 0);
      totalInTransit += Number(p.total_in_transit || 0);
    });

    return { totalProjects, totalSites, totalStock, totalInTransit };
  }, [records]);

  return (
    <MainLayout>
      <div className="space-y-6 pb-12">
        {/* Header Section */}
        <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 p-6 text-white shadow-lg lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300 backdrop-blur-sm border border-amber-500/30">
                <i className="ti ti-building" /> Construction ERP Suite
              </span>
              <span className="text-xs text-slate-400">/</span>
              <span className="text-xs font-medium text-slate-300">Project Portfolio & Site Stores</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl text-white">
              Projects & Site Stores
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-300 sm:text-sm leading-relaxed">
              Every project automatically provisions a dedicated site store. Track material dispatches from the central warehouse, on-site receipts, transit balances, and field consumption in real time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/inventory/stocktransfer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-sm border border-white/20 shadow-sm transition hover:bg-white hover:text-slate-900"
            >
              <i className="ti ti-truck text-amber-400 text-sm" /> Stock Transfer
            </Link>
            <Link
              href="/reports/inventory/stock-movement"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md transition hover:bg-amber-400 hover:shadow-lg"
            >
              <i className="ti ti-chart-bar text-sm" /> Material Movement Report
            </Link>
          </div>
        </div>

        {/* Top Summary Metric Strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Projects</p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <i className="ti ti-building text-base" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{stats.totalProjects}</p>
            <p className="text-[11px] text-slate-500">Active construction works</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Linked Site Stores</p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <i className="ti ti-building-warehouse text-base" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{stats.totalSites}</p>
            <p className="text-[11px] text-slate-500">Field storage locations</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">On-Site Inventory</p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <i className="ti ti-packages text-base" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-700">{stats.totalStock.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-500">Total units stored on sites</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Transits</p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <i className="ti ti-truck-delivery text-base" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-blue-700">{stats.totalInTransit}</p>
            <p className="text-[11px] text-slate-500">Dispatches in transit</p>
          </div>
        </div>

        {/* Main 2-Column Layout: Form (Left) & Projects List (Right) */}
        <div className="grid items-start gap-6 lg:grid-cols-[460px_1fr]">
          
          {/* Left Form Card */}
          <div className="sticky top-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Create Project & Site Store</h2>
                <p className="text-xs text-slate-500">Setup project details and initialize its first site store</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60 shadow-xs">
                <i className="ti ti-plus text-base font-bold" />
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {/* Section 1: Project Details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] text-white">1</span>
                    Project Information
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    <span>Project Code <span className="text-rose-500">*</span></span>
                    <input
                      required
                      type="text"
                      placeholder="e.g. PRJ-001"
                      value={form.projectCode}
                      onChange={(e) => handleProjectCodeChange(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-slate-700">
                    <span>Status</span>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-700">
                  <span>Project Name <span className="text-rose-500">*</span></span>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Skyline Residency Phase 2"
                    value={form.name}
                    onChange={(e) => handleProjectNameChange(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    <span>Client / Developer</span>
                    <input
                      type="text"
                      placeholder="e.g. Apex Infra Corp"
                      value={form.clientName}
                      onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-slate-700">
                    <span>Budget (₹)</span>
                    <input
                      type="number"
                      placeholder="e.g. 5000000"
                      value={form.budget}
                      onChange={(e) => setForm({ ...form, budget: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    <span>Start Date</span>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-slate-700">
                    <span>Expected Completion</span>
                    <input
                      type="date"
                      value={form.expectedEndDate}
                      onChange={(e) => setForm({ ...form, expectedEndDate: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-700">
                  <span>Project Location / Site Address</span>
                  <input
                    type="text"
                    placeholder="e.g. Sector 62, Noida, Uttar Pradesh"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </label>
              </div>

              {/* Section 2: Site Store Setup */}
              <div className="border-t border-slate-200/80 pt-4 space-y-3">
                <div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-700 text-[9px] text-white">2</span>
                    First Site Store Details
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    A physical store record is created automatically to receive material transfers.
                  </p>
                </div>

                {/* Site Store Name - Full Width for comfortable typing */}
                <label className="block text-xs font-semibold text-slate-700">
                  <span>Site Store Name</span>
                  <input
                    type="text"
                    placeholder="e.g. Noida Sector 62 Site Store"
                    value={form.siteName}
                    onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    <span>Site Code</span>
                    <input
                      type="text"
                      placeholder="e.g. SITE-01"
                      value={form.siteCode}
                      onChange={(e) => setForm({ ...form, siteCode: e.target.value.toUpperCase() })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-slate-700">
                    <span>Site Engineer / In-Charge</span>
                    <select
                      value={form.siteEngineerId}
                      onChange={(e) => setForm({ ...form, siteEngineerId: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="">Assign later</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name || user.email} {user.role ? `(${user.role})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-700">
                  <span>Site Store Address</span>
                  <input
                    type="text"
                    placeholder="e.g. Plot 4B, Sector 62 Site, Noida"
                    value={form.siteAddress}
                    onChange={(e) => setForm({ ...form, siteAddress: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-slate-400">
                    The assigned engineer will automatically receive live site store inventory access.
                  </span>
                </label>
              </div>

              {message && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                  <i className="ti ti-circle-check text-base shrink-0 text-emerald-600" />
                  <span>{message}</span>
                </div>
              )}

              {errorMessage && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                  <i className="ti ti-alert-circle text-base shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-amber-600 disabled:opacity-50"
              >
                <i className="ti ti-building-warehouse text-base" />
                {saving ? 'Creating Project & Store...' : 'Create Project & Site Store'}
              </button>
            </form>
          </div>

          {/* Right Portfolio & Site Tracker Column */}
          <div className="space-y-4">
            {/* Filter / Search Bar */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <i className="ti ti-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search projects by name, code, client, or site store..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-2.5">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-amber-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                </select>
                <span className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600 shrink-0">
                  {filteredRecords.length} Project{filteredRecords.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* Project List Cards */}
            {filteredRecords.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-400 shadow-xs">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <i className="ti ti-folder-off text-2xl" />
                </div>
                <p className="mt-3 font-bold text-slate-700">No construction projects found</p>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Create your first project using the form on the left to initialize linked site stores and inventory tracking.
                </p>
              </div>
            ) : (
              filteredRecords.map((project) => {
                const sites = project.sites || [];
                const budgetNum = Number(project.budget || 0);

                const getStatusBadge = (status) => {
                  switch (status) {
                    case 'active':
                      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    case 'planning':
                      return 'bg-amber-50 text-amber-700 border-amber-200';
                    case 'on_hold':
                      return 'bg-rose-50 text-rose-700 border-rose-200';
                    case 'completed':
                      return 'bg-blue-50 text-blue-700 border-blue-200';
                    default:
                      return 'bg-slate-100 text-slate-700 border-slate-200';
                  }
                };

                return (
                  <div
                    key={project.id}
                    className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    {/* Project Header Row */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black tracking-wider text-white">
                            {project.project_code}
                          </span>
                          <h3 className="text-lg font-black text-slate-900">{project.name}</h3>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${getStatusBadge(project.status)}`}>
                            {project.status?.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Client: <span className="font-semibold text-slate-700">{project.client_name || 'Direct / Self'}</span>
                          {project.address ? ` · ${project.address}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Approved Budget
                          </p>
                          <p className="text-sm font-black text-slate-900">
                            ₹{budgetNum.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Site Stores
                          </p>
                          <p className="text-sm font-black text-amber-700">
                            {project.site_count || sites.length} Site(s)
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Summary Metric Pills for Project Progress */}
                    <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          📦 On-Site Stock
                        </p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {Number(project.total_site_stock || 0).toLocaleString('en-IN')}{' '}
                          <span className="text-xs font-normal text-slate-500">qty</span>
                        </p>
                      </div>

                      <div className="rounded-xl border border-blue-100/80 bg-blue-50/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                          🚚 Transferred In
                        </p>
                        <p className="mt-0.5 text-base font-black text-blue-900">
                          {Number(project.total_transferred_in || 0).toLocaleString('en-IN')}{' '}
                          <span className="text-xs font-normal text-blue-600">qty</span>
                        </p>
                      </div>

                      <div className="rounded-xl border border-emerald-100/80 bg-emerald-50/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          🔨 Material Consumed
                        </p>
                        <p className="mt-0.5 text-base font-black text-emerald-900">
                          {Number(project.total_consumed || 0).toLocaleString('en-IN')}{' '}
                          <span className="text-xs font-normal text-emerald-600">qty</span>
                        </p>
                      </div>

                      <div className="rounded-xl border border-amber-100/80 bg-amber-50/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                          ⏳ In Transit
                        </p>
                        <p className="mt-0.5 text-base font-black text-amber-900">
                          {Number(project.total_in_transit || 0)}{' '}
                          <span className="text-xs font-normal text-amber-600">shipment(s)</span>
                        </p>
                      </div>
                    </div>

                    {/* Linked Site Stores Breakdown */}
                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                      <div className="mb-2.5 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          🏪 Linked Site Store(s) & Live Status
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {sites.length} Active Store(s)
                        </span>
                      </div>

                      {sites.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          No site stores are linked to this project yet.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {sites.map((site) => (
                            <div
                              key={site.id}
                              className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:border-slate-300"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-900">
                                      {site.site_code}
                                    </span>
                                    <span className="font-bold text-slate-900 text-sm">
                                      {site.name}
                                    </span>
                                    {site.store_id && (
                                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200/60">
                                        Store #{site.store_id}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">
                                    In-Charge:{' '}
                                    <span className="font-semibold text-slate-700">
                                      {site.site_engineer_name || 'Unassigned'}
                                    </span>
                                    {site.site_engineer_email ? ` (${site.site_engineer_email})` : ''}
                                    {site.address ? ` · ${site.address}` : ''}
                                  </p>
                                </div>
                              </div>

                              {/* Action Buttons for this Site Store in clean responsive grid */}
                              <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {site.store_id ? (
                                  <Link
                                    href={`/reports/inventory/stock-movement?store=${site.store_id}`}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 text-center"
                                    title="View Material Movement and Stock Balance Report"
                                  >
                                    <i className="ti ti-chart-bar text-amber-700" />
                                    <span>Stock Report</span>
                                  </Link>
                                ) : (
                                  <div />
                                )}

                                <Link
                                  href="/inventory/stocktransfer"
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-2 text-xs font-bold text-blue-800 transition hover:bg-blue-100 text-center"
                                  title="Transfer material from Central Warehouse to this Site Store"
                                >
                                  <i className="ti ti-truck text-blue-700" />
                                  <span>Transfer Stock</span>
                                </Link>

                                <Link
                                  href="/inventory/stockrequisition"
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 text-center"
                                  title="Raise Material Requisition for this Site"
                                >
                                  <i className="ti ti-clipboard-text text-slate-600" />
                                  <span>Requisition</span>
                                </Link>

                                <Link
                                  href="/inventory/stockout"
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 text-center"
                                  title="Record Material Consumption at this Site"
                                >
                                  <i className="ti ti-hammer text-emerald-700" />
                                  <span>Issue Material</span>
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
