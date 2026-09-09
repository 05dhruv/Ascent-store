'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';

function formatDateInput(value) {
  return value.toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (!value) return '';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function ManageCreditAdvancedConfigsPage() {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);

  const [region, setRegion] = useState('');
  const [regions, setRegions] = useState([]);
  const [customerGroup, setCustomerGroup] = useState('none');
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialLoadRef = useRef(false);

  const fetchRegions = useCallback(async () => {
    try {
      const res = await fetch('/api/regions', { cache: 'no-store', credentials: 'include' });
      const data = await res.json();
      const records = Array.isArray(data?.data?.records) ? data.data.records : [];
      setRegions(records);
    } catch (err) {
      console.error(err);
      setRegions([]);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/customer-groups');
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setGroups([]);
    }
  }, []);

  const fetchRows = useCallback(async ({ nextPage = 1, nextPageSize = pageSize } = {}) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (search.trim()) qs.set('search', search.trim());

      const res = await fetch(`/api/customer-credit-advanced-configs-manage?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch customer rows');

      const data = await res.json();
      const listRows = Array.isArray(data.rows) ? data.rows : [];
      const pagination = data.pagination || {};

      setRows(
        listRows.map((row) => ({
          ...row,
          selected: row.selected !== false,
          fromDate: normalizeDate(row.fromDate) || formatDateInput(today),
          toDate: normalizeDate(row.toDate) || formatDateInput(today),
          creditLimit: Number(row.creditLimit || 0),
        }))
      );
      setTotal(Number(pagination.total || 0));
      setTotalPages(Number(pagination.totalPages || 1));
      setPage(Number(pagination.page || nextPage));
      setPageSize(Number(pagination.pageSize || nextPageSize));
    } catch (err) {
      console.error(err);
      setRows([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [pageSize, search, today]);

  useEffect(() => {
    fetchRegions();
    fetchGroups();
  }, [fetchRegions, fetchGroups]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    fetchRows({ nextPage: 1 });
  }, [fetchRows]);

  useEffect(() => {
    if (!initialLoadRef.current) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      fetchRows({ nextPage: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, fetchRows]);

  const updateRow = (id, key, value) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  };

  const handleSave = async () => {
    if (!region) {
      alert('Region is required');
      return;
    }

    const regionObj = regions.find((item) => String(item.id) === String(region));
    const selectedRows = rows.filter((row) => row.selected);

    if (!selectedRows.length) {
      alert('Select at least one customer row');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        region: regionObj?.name || 'All',
        storeId: region,
        customerGroup: customerGroup === 'none' ? null : customerGroup,
        items: selectedRows.map((row) => ({
          customerId: row.id,
          startDate: row.fromDate,
          endDate: row.toDate,
          creditLimit: Number(row.creditLimit || 0),
        })),
      };

      const res = await fetch('/api/customer-credit-advanced-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save configurations');

      alert(`Saved ${data.savedCount || 0} configuration(s)`);
      router.push('/customer/credit-advanced-configs');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save configurations');
    } finally {
      setSaving(false);
    }
  };

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <MainLayout>
      <div className="min-h-screen">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-4 flex-wrap">
          <Link href="/customer/dashboard" className="hover:text-blue-600 transition-colors">Customer</Link>
          <i className="ti ti-chevron-right text-[11px] text-gray-400" />
          <Link href="/customer/credit-advanced-configs" className="hover:text-blue-600 transition-colors">Credit Advanced Configurations</Link>
          <i className="ti ti-chevron-right text-[11px] text-gray-400" />
          <span className="text-gray-900 font-semibold">Manage Configurations</span>
        </nav>

        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div>
            <h1 className="text-[36px] font-semibold text-gray-900 leading-tight">Manage Credit Advanced Configuration</h1>
            <p className="text-[12.5px] text-gray-500 mt-1">Desc Text for Manage Credit Advanced Configuration! <span className="text-blue-600 cursor-pointer hover:underline">Need Help?</span></p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/customer/credit-advanced-configs')}
              className="h-11 px-5 inline-flex items-center justify-center rounded-lg border border-blue-300 text-blue-700 text-[13px] font-medium hover:bg-blue-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-11 px-5 inline-flex items-center justify-center rounded-lg bg-blue-700 text-white text-[13px] font-medium hover:bg-blue-800 disabled:opacity-70"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-blue-700 font-semibold text-[22px] mb-5">Basic Information</h2>

            <div className="max-w-[430px]">
              <label className="block text-[13px] text-gray-800 mb-2">Region <span className="text-red-500">*</span></label>
              <div className="relative">
                <select
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  className="h-11 w-full appearance-none border border-gray-200 rounded-lg px-3 pr-9 text-[13px] text-gray-700 bg-white outline-none focus:border-blue-400"
                >
                  <option value="">Select Region</option>
                  {regions.map((regionOption) => (
                    <option key={regionOption.id} value={String(regionOption.id)}>
                      {regionOption.name}
                    </option>
                  ))}
                </select>
                <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]" />
              </div>
            </div>
          </div>

          <div className="px-5 pt-5 pb-4 border-b border-gray-100">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr_320px] xl:items-end">
              <div>
                <label className="block text-[13px] text-gray-800 mb-2">Customer Groups</label>
                <div className="relative">
                  <select
                    value={customerGroup}
                    onChange={(event) => setCustomerGroup(event.target.value)}
                    className="h-11 w-full appearance-none border border-gray-200 rounded-lg px-3 pr-9 text-[13px] text-gray-700 bg-white outline-none focus:border-blue-400"
                  >
                    <option value="none">None</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.group_name || group.name}>
                        {group.group_name || group.name}
                      </option>
                    ))}
                  </select>
                  <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]" />
                </div>
              </div>

              <div />

              <div>
                <div className="relative">
                  <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search"
                    className="h-11 w-full rounded-md border border-gray-300 bg-white pl-10 pr-3 text-[13px] text-gray-700 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600 whitespace-nowrap">Select</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600 whitespace-nowrap">Customer ID</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600 whitespace-nowrap">Customer Name</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600 whitespace-nowrap">Mobile Number</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600 whitespace-nowrap">From Date</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600 whitespace-nowrap">To Date</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600 whitespace-nowrap">Credit Limit</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-[13px] text-gray-500 text-center">Loading records...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-[13px] text-center text-gray-500">No Records Found</td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={Boolean(row.selected)}
                        onChange={(event) => updateRow(row.id, 'selected', event.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.customerId}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.customerName}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.mobileNumber}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">
                      <input
                        type="date"
                        value={row.fromDate || ''}
                        onChange={(event) => updateRow(row.id, 'fromDate', event.target.value)}
                        className="h-10 border border-gray-200 rounded-lg px-2 text-[13px]"
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">
                      <input
                        type="date"
                        min={row.fromDate || ''}
                        value={row.toDate || ''}
                        onChange={(event) => updateRow(row.id, 'toDate', event.target.value)}
                        className="h-10 border border-gray-200 rounded-lg px-2 text-[13px]"
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.creditLimit}
                        onChange={(event) => updateRow(row.id, 'creditLimit', event.target.value)}
                        className="h-10 border border-gray-200 rounded-lg px-2 text-[13px]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-gray-100 text-[12px] text-gray-500">
            <select
              value={pageSize}
              onChange={(event) => {
                const nextPageSize = Number(event.target.value);
                setPage(1);
                fetchRows({ nextPage: 1, nextPageSize });
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-[12px] text-gray-700"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>

            <span>Showing {showingFrom} to {showingTo} of {total} Results</span>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => fetchRows({ nextPage: page - 1 })}
                className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Prev
              </button>
              <span className="text-[12px] text-gray-600">Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => fetchRows({ nextPage: page + 1 })}
                className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
