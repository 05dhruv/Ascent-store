"use client";

import MainLayout from '@/components/MainLayout';
import { extractStores } from '@/lib/clientResponse';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const columns = [
  { key: 'sno', label: 'S. No.' },
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'stores', label: 'Stores' },
  { key: 'amount_due', label: 'Amount Due' },
  { key: 'customer_type', label: 'Customer Type' },
];

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toCsv(rows) {
  const header = columns.map((column) => column.label).join(',');
  const body = rows.map((row, index) => [
    index + 1,
    row.name || '',
    row.mobile_number || '',
    row.email_address || '',
    row.stores || '',
    formatMoney(row.amount_due),
    row.customer_type || '',
  ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','));

  return [header, ...body].join('\n');
}

export default function CustomerCreditSalePage() {
  const [store, setStore] = useState('all');
  const [stores, setStores] = useState([]);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const initialLoadRef = useRef(false);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      const data = await res.json();
      setStores(extractStores(data));
    } catch (err) {
      console.error(err);
      setStores([]);
    }
  }, []);

  const fetchData = useCallback(async ({ nextPage = 1, nextPageSize = pageSize } = {}) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
      });

      if (store && store !== 'all') qs.set('store', store);
      if (search.trim()) qs.set('search', search.trim());

      const res = await fetch(`/api/customer-credit?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch customer credit sales');

      const pagination = data.pagination || {};
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setPage(Number(pagination.page || nextPage));
      setPageSize(Number(pagination.pageSize || nextPageSize));
      setTotal(Number(pagination.total || 0));
      setTotalPages(Number(pagination.totalPages || 1));
    } catch (err) {
      console.error(err);
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setError(err.message || 'Failed to fetch customer credit sales');
    } finally {
      setLoading(false);
    }
  }, [pageSize, search, store]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    fetchData({ nextPage: 1 });
  }, [fetchData]);

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total);
  const totalDue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount_due || 0), 0),
    [rows]
  );

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'customer-credit-sales.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-4 flex-wrap">
          <a href="/customer/dashboard" className="hover:text-blue-600 transition-colors">Customer</a>
          <i className="ti ti-chevron-right text-[11px] text-gray-400" />
          <span className="text-gray-900 font-semibold">Customer Credit Sale</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[20px] md:text-[22px] font-bold text-gray-900">Customer Credit Sales</h1>
            <p className="text-[12.5px] text-gray-500 mt-1">Credit balances from sales bills and pending customer invoices <span className="text-blue-600 hover:underline">Need Help?</span></p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-right min-w-[190px]">
            <p className="text-[12px] text-gray-500">Visible Due</p>
            <p className="text-[18px] font-semibold text-gray-900">{formatMoney(totalDue)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-[220px]">
                <label className="text-[12px] text-gray-700 mb-1 block">Select Store</label>
                <select value={store} onChange={(e) => setStore(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white">
                  <option value="all">All Stores</option>
                  {stores.map((storeOption) => (
                    <option key={storeOption.id} value={storeOption.id}>{storeOption.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-[280px]">
                <label className="text-[12px] text-gray-700 mb-1 block">Search</label>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') fetchData({ nextPage: 1 });
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white"
                  placeholder="Name, phone, email or code"
                />
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <button onClick={() => fetchData({ nextPage: 1 })} className="px-4 py-2 bg-blue-700 text-white rounded-lg text-[13px]">Fetch</button>
                <button onClick={exportCsv} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Download CSV"><i className="ti ti-download text-gray-600" /></button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="px-4 py-3 border-b border-red-100 bg-red-50 text-red-700 text-[12.5px]">{error}</div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {columns.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600 whitespace-nowrap">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={columns.length} className="px-4 py-6 text-gray-500">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={columns.length} className="px-4 py-16 text-center text-gray-400">No Records Found</td></tr>
                ) : rows.map((r, idx) => (
                  <tr key={r.id || `${r.name}-${idx}`} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-[13px] text-gray-700">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{r.name || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{r.mobile_number || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{r.email_address || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{r.stores || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-900 font-medium">{formatMoney(r.amount_due)}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{r.customer_type || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-[12px] text-gray-500 flex-wrap">
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(event) => fetchData({ nextPage: 1, nextPageSize: Number(event.target.value) })}
                className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-[12px] text-gray-600"
              >
                {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <span>Showing {showingFrom} to {showingTo} of {total} Results</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchData({ nextPage: Math.max(1, page - 1) })}
                className="h-8 px-3 rounded border border-gray-200 bg-white text-gray-700 disabled:opacity-40"
              >
                Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchData({ nextPage: Math.min(totalPages, page + 1) })}
                className="h-8 px-3 rounded border border-gray-200 bg-white text-gray-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
