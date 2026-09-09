'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

function PageShell({ children }) {
  return <div className="min-h-screen bg-[#f7f8fc] p-6 text-sm text-gray-900">{children}</div>;
}

export default function CombosListPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/catalog/combos?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load combos');
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
        comboPrice: `₹${Number(record.price || 0).toFixed(2)}`,
        sku: record.sku || '—',
        barcode: record.barcode || '—',
        sortSequence: record.sort_sequence ?? 0,
      })),
    [records, page, pageSize]
  );

  return (
    <PageShell>
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/catalog" className="text-blue-600 hover:underline">
          Catalog
        </Link>
        <span>›</span>
        <span className="font-medium text-gray-700">Promotional Products</span>
        <span>›</span>
        <span className="font-medium text-gray-700">Combos</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">List of Combos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Add/Update combos for your brand.{' '}
            <a href="#" className="text-blue-600 hover:underline">
              Need Help?
            </a>
          </p>
        </div>
        <Link
          href="/catalog/promos/combos/create"
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Create Combo
        </Link>
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
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-slate-50 text-slate-800">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">S. No. ⇅</th>
                <th className="px-3 py-3 text-left font-semibold">Combo Name ⇅</th>
                <th className="px-3 py-3 text-left font-semibold">Combo Price ⇅</th>
                <th className="px-3 py-3 text-left font-semibold">SKU ⇅</th>
                <th className="px-3 py-3 text-left font-semibold">Barcode ⇅</th>
                <th className="px-3 py-3 text-left font-semibold">Sort Sequence ⇅</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-gray-500">
                    Loading combos…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-slate-50/60">
                    <td className="px-3 py-3 text-gray-700">{row.sno}</td>
                    <td className="px-3 py-3 font-medium text-gray-900">{row.name}</td>
                    <td className="px-3 py-3 text-gray-800">{row.comboPrice}</td>
                    <td className="px-3 py-3 text-gray-700">{row.sku}</td>
                    <td className="px-3 py-3 text-gray-700">{row.barcode}</td>
                    <td className="px-3 py-3 text-gray-700">{row.sortSequence}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-gray-500">
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
              Results
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
    </PageShell>
  );
}
