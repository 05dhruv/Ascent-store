'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

function PageShell({ children }) {
  return <div className="min-h-screen bg-[#f7f8fc] p-6 text-sm text-gray-900">{children}</div>;
}

export default function ChargesPage() {
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

      const res = await fetch(`/api/catalog/charges?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load charges');
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
    }, 250);

    return () => window.clearTimeout(timer);
  }, [search]);

  const rows = useMemo(() => records.map((record, index) => ({
    ...record,
    sno: (page - 1) * pageSize + index + 1,
    appliedOn: record.charge_applied_on || 'Product',
    value: String(record.charge_type || '').toUpperCase() === 'PERCENTAGE' ? `${Number(record.amount || 0)}%` : `₹ ${Number(record.amount || 0).toFixed(2)}`,
  })), [records, page, pageSize]);

  return (
    <PageShell>
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/catalog" className="text-blue-500 hover:underline">Catalog</Link>
        <span>›</span>
        <Link href="/catalog/taxes" className="text-blue-500 hover:underline">Taxes & Charges</Link>
        <span>›</span>
        <span className="font-medium text-gray-700">Charges</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">Charges</h1>
          <p className="mt-1 text-sm text-gray-500">It shows all the list of charges <a href="#" className="text-blue-500 hover:underline">Need Help?</a></p>
        </div>
        <Link href="/catalog/charges/create" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Create Charge</Link>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex justify-end">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            className="w-full max-w-[260px] rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={fetchData} className="sr-only">Search Charges</button>
        </div>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-3 text-left font-medium">S. No.</th>
                <th className="px-3 py-3 text-left font-medium">Charge Name</th>
                <th className="px-3 py-3 text-left font-medium">Charge Applied On</th>
                <th className="px-3 py-3 text-left font-medium">Charge Type</th>
                <th className="px-3 py-3 text-left font-medium">Charge Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-500">Loading charges...</td></tr>
              ) : rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/70">
                    <td className="px-3 py-3 text-gray-700">{row.sno}</td>
                    <td className="px-3 py-3 text-gray-800">{row.name}</td>
                    <td className="px-3 py-3 text-gray-700">{row.appliedOn}</td>
                    <td className="px-3 py-3 text-gray-700">{row.charge_type}</td>
                    <td className="px-3 py-3 text-gray-700">{row.value}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-500">No matching record found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm">
              {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>Showing {total ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, total)} of {total} Charge(s)</span>
          </div>

          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md border border-gray-300 bg-white px-3 py-1 disabled:opacity-40">&lt;</button>
            <button className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1 text-white">{page}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-md border border-gray-300 bg-white px-3 py-1 disabled:opacity-40">&gt;</button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}