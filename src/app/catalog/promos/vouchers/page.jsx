'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const VOUCHER_TYPES = ['ABSOLUTE', 'PERCENTAGE'];

const emptyForm = {
  code: '',
  value: '',
  valid_from: '',
  valid_to: '',
  voucher_count: '',
  voucher_type: 'ABSOLUTE',
  description: '',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function VouchersPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/catalog/vouchers?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load vouchers');
      setRecords(json.data?.records || []);
      setTotal(json.data?.total || 0);
      setTotalPages(json.data?.totalPages || 1);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      fetchData();
    }, 280);
    return () => window.clearTimeout(timer);
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
    const today = todayIso();
    setForm({ ...emptyForm, valid_from: today, valid_to: today });
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormError('');
  };

  const onSave = async () => {
    setFormError('');
    if (!form.code.trim()) {
      setFormError('Voucher code is required');
      return;
    }
    if (form.value === '') {
      setFormError('Voucher value is required');
      return;
    }
    if (!form.valid_from || !form.valid_to) {
      setFormError('Date range is required');
      return;
    }
    if (!form.voucher_count) {
      setFormError('Voucher count to distribute is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/catalog/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.trim(),
          value: Number(form.value),
          valid_from: form.valid_from,
          valid_to: form.valid_to,
          voucher_count: Number(form.voucher_count),
          voucher_type: form.voucher_type,
          description: form.description.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        const msg =
          json.errors?.code ||
          json.errors?.value ||
          json.errors?.voucher_count ||
          json.errors?.valid_from ||
          json.message ||
          'Failed to save voucher';
        throw new Error(msg);
      }
      closeModal();
      fetchData();
    } catch (err) {
      setFormError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const onUnblock = async (id) => {
    try {
      const res = await fetch(`/api/catalog/vouchers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unblock' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Unblock failed');
      fetchData();
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const onExport = async () => {
    const XLSX = await import('xlsx');
    const exportRows = rows.map((row) => ({
      'S.No.': row.sno,
      'Voucher Code': row.code,
      Description: row.description || '',
      'Valid From': row.valid_from_label,
      'Valid To': row.valid_to_label,
      'Voucher Type': row.voucher_type || 'ABSOLUTE',
      Value: row.value_label,
      'Max. Voucher Value': row.max_voucher_value_label,
      Allocated: row.allocated,
      Available: row.available,
      Redeemed: row.redeemed,
      'Is Used?': row.is_used_label,
      Customer: row.customer_label,
      Store: row.store_label,
      'Device ID': row.device_id_label,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vouchers');
    XLSX.writeFile(workbook, 'vouchers.xlsx');
    setBulkOpen(false);
  };

  const inputCls =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  return (
    <div className="min-h-screen bg-[#f7f8fc] p-6 text-sm text-gray-900">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/catalog" className="text-blue-600 hover:underline">
          Catalog
        </Link>
        <span>›</span>
        <span className="font-medium text-gray-700">Promotional Products</span>
        <span>›</span>
        <span className="font-medium text-gray-700">Vouchers</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">Vouchers</h1>
          <p className="mt-1 text-sm text-gray-500">
            List of all Vouchers
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Bulk Operations ▾
            </button>
            {bulkOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                  onClick={onExport}
                >
                  Export
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Create Voucher
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex justify-end">
          <div className="relative w-full max-w-[280px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[1400px] border-collapse text-sm">
            <thead className="bg-slate-50 text-slate-800">
              <tr>
                <th className="px-2 py-3 text-left font-semibold">S.No. ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Voucher Code ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Description ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Valid From ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Valid To ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Voucher Type ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Value ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Max. Voucher Value ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Allocated ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Available ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Redeemed ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Is Used? ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Customer ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Store ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Device ID ⇅</th>
                <th className="px-2 py-3 text-left font-semibold">Unblock</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={16} className="px-3 py-12 text-center text-gray-500">
                    Loading vouchers…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-slate-50/60">
                    <td className="px-2 py-3 text-gray-700">{row.sno}</td>
                    <td className="px-2 py-3 font-medium text-gray-900">{row.code}</td>
                    <td className="max-w-[160px] truncate px-2 py-3 text-gray-700" title={row.description || ''}>
                      {row.description || '—'}
                    </td>
                    <td className="px-2 py-3 text-gray-700">{row.valid_from_label}</td>
                    <td className="px-2 py-3 text-gray-700">{row.valid_to_label}</td>
                    <td className="px-2 py-3 text-gray-700">{row.voucher_type || 'ABSOLUTE'}</td>
                    <td className="px-2 py-3 text-gray-800">{row.value_label}</td>
                    <td className="px-2 py-3 text-gray-700">{row.max_voucher_value_label}</td>
                    <td className="px-2 py-3 text-gray-700">{row.allocated}</td>
                    <td className="px-2 py-3 text-gray-700">{row.available}</td>
                    <td className="px-2 py-3 text-gray-700">{row.redeemed}</td>
                    <td className="px-2 py-3 text-gray-700">{row.is_used_label}</td>
                    <td className="px-2 py-3 text-gray-700">{row.customer_label}</td>
                    <td className="px-2 py-3 text-gray-700">{row.store_label}</td>
                    <td className="px-2 py-3 text-gray-700">{row.device_id_label}</td>
                    <td className="px-2 py-3">
                      {row.is_blocked ? (
                        <button
                          type="button"
                          onClick={() => onUnblock(row.id)}
                          className="text-blue-600 hover:underline"
                        >
                          Unblock
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={16} className="px-3 py-12 text-center text-gray-500">
                    No Records Found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>
              Showing {total ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, total)} of {total}{' '}
              Voucher(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((v) => Math.max(1, v - 1))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              &lt;
            </button>
            <span className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-white">{page}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              &gt;
            </button>
          </div>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
          <div className="relative z-[1000] w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Create Voucher</h2>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">
                  Voucher Code <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  placeholder="Voucher Code"
                  value={form.code}
                  onChange={(e) => set('code', e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">
                    Voucher Value <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    placeholder="Voucher Value"
                    value={form.value}
                    onChange={(e) => set('value', e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">Voucher Type</label>
                  <select
                    className={inputCls}
                    value={form.voucher_type}
                    onChange={(e) => set('voucher_type', e.target.value)}
                  >
                    {VOUCHER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Date Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.valid_from}
                    onChange={(e) => set('valid_from', e.target.value)}
                  />
                  <input
                    type="date"
                    className={inputCls}
                    value={form.valid_to}
                    min={form.valid_from}
                    onChange={(e) => set('valid_to', e.target.value)}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {form.valid_from && form.valid_to
                    ? `${form.valid_from} — ${form.valid_to}`
                    : 'Select start and end dates'}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">
                  Voucher Count To Distribute <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  className={inputCls}
                  placeholder="Voucher Count"
                  value={form.voucher_count}
                  onChange={(e) => set('voucher_count', e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Description</label>
                <textarea
                  className={`${inputCls} min-h-[100px]`}
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-blue-600 bg-white px-5 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
