'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';

const PAGE_SIZES = [10, 25, 50, 100];

function fieldDefault(field) {
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return '';
  return '';
}

function emptyForm(fields) {
  return {
    id: null,
    name: '',
    code: '',
    description: '',
    storeId: '',
    isActive: true,
    config: fields.reduce((acc, field) => ({ ...acc, [field.key]: field.defaultValue ?? fieldDefault(field) }), {}),
  };
}

function formatValue(field, value) {
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.type === 'select') return field.options?.find((option) => option.value === value)?.label || value || '-';
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function isPhoneField(field) {
  const key = String(field.key || '').toLowerCase();
  const label = String(field.label || '').toLowerCase();
  return key.includes('mobile') || key.includes('phone') || label.includes('mobile') || label.includes('phone');
}

function isEmailField(field) {
  const key = String(field.key || '').toLowerCase();
  const label = String(field.label || '').toLowerCase();
  return field.type === 'email' || key.includes('email') || label.includes('email');
}

function normalizeConfigInput(field, value) {
  if (isPhoneField(field)) return String(value || '').replace(/\D/g, '').slice(0, 10);
  return value;
}

function fieldInputProps(field) {
  if (isPhoneField(field)) {
    return {
      type: 'tel',
      inputMode: 'numeric',
      pattern: '[0-9]{10}',
      maxLength: 10,
      title: 'Enter exactly 10 digits',
    };
  }

  if (isEmailField(field)) {
    return {
      type: 'email',
      title: 'Enter a valid email address',
    };
  }

  return {
    type: field.type || 'text',
  };
}

function isRequiredField(field, index = 0) {
  if (field.required === false) return false;
  return field.required === true || index === 0 || isEmailField(field) || isPhoneField(field);
}

export default function SettingsResourcePage({
  type,
  title,
  description,
  breadcrumbs = [],
  fields = [],
  storeScoped = false,
  codeLabel = 'Code',
}) {
  const endpoint = `/api/settings/${type}`;
  const [records, setRecords] = useState([]);
  const [stores, setStores] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(fields));
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const showToast = useCallback((message, variant = 'success') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`${endpoint}?${params}`, { cache: 'no-store', credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load records');

      setRecords(json.data.records || []);
      setTotal(Number(json.data.total || 0));
      setTotalPages(Number(json.data.totalPages || 1));
    } catch (err) {
      showToast(err.message || 'Failed to load records', 'error');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, pageSize, search, showToast]);

  const fetchStores = useCallback(async () => {
    if (!storeScoped) return;
    try {
      const res = await fetch('/api/stores', { cache: 'no-store', credentials: 'include' });
      const json = await res.json();
      if (json.success) setStores(json.data?.stores || []);
    } catch {
      setStores([]);
    }
  }, [storeScoped]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const rows = useMemo(
    () =>
      records.map((record, index) => ({
        ...record,
        sno: (page - 1) * pageSize + index + 1,
      })),
    [records, page, pageSize]
  );

  const openCreate = () => {
    setForm(emptyForm(fields));
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setForm({
      id: record.id,
      name: record.name || '',
      code: record.code || '',
      description: record.description || '',
      storeId: record.storeId || '',
      isActive: record.isActive !== false,
      config: fields.reduce(
        (acc, field) => ({
          ...acc,
          [field.key]: record.config?.[field.key] ?? field.defaultValue ?? fieldDefault(field),
        }),
        {}
      ),
    });
    setModalOpen(true);
  };

  const setConfig = (key, value) => {
    setForm((current) => ({ ...current, config: { ...current.config, [key]: value } }));
  };

  const saveRecord = async (event) => {
    event.preventDefault();
    for (const [index, field] of fields.entries()) {
      const value = form.config[field.key];
      if (isRequiredField(field, index) && field.type !== 'checkbox' && !String(value ?? '').trim()) {
        showToast(`${field.label} is required`, 'error');
        return;
      }
      if (isPhoneField(field) && value && !/^\d{10}$/.test(String(value))) {
        showToast(`${field.label} must be exactly 10 digits`, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Save failed');

      showToast(form.id ? `${title} updated` : `${title} created`);
      setModalOpen(false);
      fetchRecords();
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`${endpoint}?id=${deleteTarget.id}`, { method: 'DELETE', credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Delete failed');
      showToast(`${title} deleted`);
      setDeleteTarget(null);
      fetchRecords();
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <MainLayout>
      <div className="min-h-screen bg-transparent p-6 text-sm text-slate-800">
        {toast && (
          <div className={`fixed right-4 top-4 z-[999] rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.variant === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
            {toast.message}
          </div>
        )}

        <nav className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-slate-400">›</span>}
              {crumb.href ? (
                <Link href={crumb.href} className="text-indigo-600 hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-slate-700">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-[0_1px_12px_rgba(15,23,42,0.04)]">
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">{title}</h1>
            {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
          </div>
          <button onClick={openCreate} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700">
            Create
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_12px_rgba(15,23,42,0.04)]">
          <div className="flex justify-end border-b border-slate-100 px-4 py-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="w-64 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">S. No.</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">{codeLabel}</th>
                  {storeScoped && <th className="px-4 py-3 text-left font-semibold text-slate-600">Store</th>}
                  {fields.slice(0, 4).map((field) => (
                    <th key={field.key} className="px-4 py-3 text-left font-semibold text-slate-600">
                      {field.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={fields.length + 6} className="py-16 text-center text-slate-400">Loading...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={fields.length + 6} className="py-16 text-center text-slate-400">No records found</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-50 hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-indigo-600">{row.sno}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                      <td className="px-4 py-3 text-slate-700">{row.code || '-'}</td>
                      {storeScoped && <td className="px-4 py-3 text-slate-700">{row.storeName || 'All stores'}</td>}
                      {fields.slice(0, 4).map((field) => (
                        <td key={field.key} className="px-4 py-3 text-slate-700">
                          {formatValue(field, row.config?.[field.key])}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                          {row.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(row)} className="mr-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          Edit
                        </button>
                        <button onClick={() => setDeleteTarget(row)} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <span className="text-xs text-slate-500">Showing {start} to {end} of {total} records</span>
            </div>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40">Prev</button>
              <span className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>

        {modalOpen && (
          <div className="fixed inset-0 z-[998] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
            <form onSubmit={saveRecord} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">{form.id ? 'Edit' : 'Create'} {title}</h2>
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm">Close</button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Name</span>
                  <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">{codeLabel}</span>
                  <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </label>

                {storeScoped && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Store</span>
                    <select value={form.storeId} onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                      <option value="">All stores</option>
                      {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                  </label>
                )}

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Status</span>
                  <select value={form.isActive ? 'true' : 'false'} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === 'true' }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </label>

                {fields.map((field, index) => {
                  const required = isRequiredField(field, index);
                  return (
                  <label key={field.key} className={field.type === 'textarea' ? 'block md:col-span-2' : 'block'}>
                    <span className="mb-1 block text-xs font-semibold text-slate-600">{field.label}{required ? <span className="text-red-500"> *</span> : null}</span>
                    {field.type === 'select' ? (
                      <select required={required} value={form.config[field.key] ?? ''} onChange={(event) => setConfig(field.key, event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                        <option value="">Select</option>
                        {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea required={required} rows={3} value={form.config[field.key] ?? ''} onChange={(event) => setConfig(field.key, event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                    ) : field.type === 'checkbox' ? (
                      <input type="checkbox" checked={!!form.config[field.key]} onChange={(event) => setConfig(field.key, event.target.checked)} className="h-5 w-5 accent-blue-600" />
                    ) : (
                      <input {...fieldInputProps(field)} required={required} value={form.config[field.key] ?? ''} onChange={(event) => setConfig(field.key, normalizeConfigInput(field, event.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                    )}
                  </label>
                );
                })}

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Description</span>
                  <textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                <button disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
              <h3 className="text-base font-black text-slate-900">Delete {deleteTarget.name}?</h3>
              <p className="mt-2 text-sm text-slate-500">This setting will be removed permanently.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                <button onClick={deleteRecord} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
