'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { formatIndianDateTime } from '@/lib/dateUtils';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatDate(value) {
  return formatIndianDateTime(value, String(value || '-'));
}

function StatusPill({ status }) {
  const normalized = String(status || 'pending').toLowerCase();
  const cls = normalized === 'approved'
    ? 'bg-emerald-100 text-emerald-700'
    : normalized === 'rejected'
      ? 'bg-rose-100 text-rose-700'
      : 'bg-amber-100 text-amber-700';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${cls}`}>{normalized}</span>;
}

function Delta({ current, requested, suffix = '' }) {
  const diff = toNumber(requested) - toNumber(current);
  const color = diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-slate-500';
  return (
    <span className={`text-xs font-bold ${color}`}>
      {diff > 0 ? '+' : ''}{suffix ? `${diff.toFixed(2)}${suffix}` : money(diff)}
    </span>
  );
}

export default function MarginApprovalsPage() {
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [canApprove, setCanApprove] = useState(false);
  const [toast, setToast] = useState(null);

  // New States for Grouped/Average Margin approvals
  const [viewType, setViewType] = useState('grouped'); // 'grouped' or 'individual'
  const [expandedKeys, setExpandedKeys] = useState({});
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status });
      if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/purchase/margin-approvals?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load margin approvals');
      setCanApprove(Boolean(json.canApprove));
      setRecords(Array.isArray(json.records) ? json.records : []);
    } catch (err) {
      setRecords([]);
      showToast(err.message || 'Failed to load margin approvals', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const filteredRecords = useMemo(() => records, [records]);

  // Aggregate records for Grouped View
  const groupedRecords = useMemo(() => {
    const groups = {};
    for (const row of filteredRecords) {
      const key = `${row.storeId}-${row.sourceReference || 'none'}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          storeId: row.storeId,
          storeName: row.storeName || 'Unknown Store',
          sourceReference: row.sourceReference || 'No Reference',
          sourceType: row.sourceType || 'grn',
          createdAt: row.createdAt,
          items: [],
        };
      }
      groups[key].items.push(row);
    }

    return Object.values(groups).map(g => {
      const count = g.items.length;
      const sumCurrent = g.items.reduce((sum, item) => sum + item.currentMarginPercent, 0);
      const sumRequested = g.items.reduce((sum, item) => sum + item.requestedMarginPercent, 0);
      return {
        ...g,
        avgCurrentMargin: sumCurrent / count,
        avgRequestedMargin: sumRequested / count,
        pendingCount: g.items.filter(item => item.status === 'pending').length,
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [filteredRecords]);

  const toggleGroupExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateApproval = async (row, action) => {
    const reason = action === 'reject' ? window.prompt('Reason for rejection?') || '' : '';
    if (action === 'reject' && !reason.trim()) return;

    setActionId(row.id);
    try {
      const res = await fetch('/api/purchase/margin-approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to update approval');
      const autoCount = Array.isArray(json.autoConfirmed) ? json.autoConfirmed.length : 0;
      const autoErrors = Array.isArray(json.autoConfirmErrors) ? json.autoConfirmErrors : [];
      showToast(
        action === 'approve' && autoErrors.length
          ? `Price approved, but ${autoErrors.length} held transaction(s) could not confirm: ${autoErrors[0].error || 'please review the transaction.'}`
          : action === 'approve'
          ? autoCount
            ? `Margin change approved and ${autoCount} GRN auto-confirmed`
            : 'Margin change approved and prices updated'
          : 'Margin change rejected'
      );
      await loadRecords();
    } catch (err) {
      showToast(err.message || 'Unable to update approval', 'error');
    } finally {
      setActionId(null);
    }
  };

  const updateBulkApproval = async (ids, action) => {
    if (ids.length === 0) return;
    const reason = action === 'reject' ? window.prompt('Reason for rejecting these requests?') || '' : '';
    if (action === 'reject' && !reason.trim()) return;

    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/purchase/margin-approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to update approvals');
      const autoCount = Array.isArray(json.autoConfirmed) ? json.autoConfirmed.length : 0;
      const autoErrors = Array.isArray(json.autoConfirmErrors) ? json.autoConfirmErrors : [];
      showToast(
        action === 'approve' && autoErrors.length
          ? `Approved prices, but ${autoErrors.length} held transaction(s) could not confirm: ${autoErrors[0].error || 'please review the transaction.'}`
          : action === 'approve'
          ? autoCount
            ? `Approved ${ids.length} margin changes and auto-confirmed ${autoCount} GRN`
            : `Approved ${ids.length} margin changes`
          : `Rejected ${ids.length} margin changes`
      );
      await loadRecords();
    } catch (err) {
      showToast(err.message || 'Unable to update approvals', 'error');
    } finally {
      setBulkActionLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-5 lg:px-7">
        {toast && (
          <div className={`fixed right-4 top-16 z-[1000] max-w-sm rounded-lg px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
          }`}>
            {toast.message}
          </div>
        )}

        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="text-blue-600">Purchase</span>
                <i className="ti ti-chevron-right text-[11px]" />
                <span className="text-slate-900">Margin Approvals</span>
              </div>
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Margin Approvals</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Review GRN price changes before CP, MRP and SP go live.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex rounded-lg border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setViewType('grouped')}
                  className={`rounded-md px-3 py-1.5 text-xs font-black ${
                    viewType === 'grouped' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Grouped by GRN
                </button>
                <button
                  type="button"
                  onClick={() => setViewType('individual')}
                  className={`rounded-md px-3 py-1.5 text-xs font-black ${
                    viewType === 'individual' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Individual SKUs
                </button>
              </div>

              <div className="flex rounded-lg border border-slate-200 bg-white p-1">
                {['pending', 'approved', 'rejected', 'all'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStatus(option)}
                    className={`rounded-md px-3 py-1.5 text-xs font-black capitalize ${
                      status === option ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setDebouncedSearch(search.trim());
                }}
                className="flex h-10 min-w-0 rounded-lg border border-slate-200 bg-white"
              >
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 rounded-l-lg px-3 text-sm outline-none"
                  placeholder="Search product, store, GRN, user, status"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setDebouncedSearch('');
                    }}
                    className="px-2 text-slate-400 hover:text-slate-700"
                    aria-label="Clear search"
                  >
                    <i className="ti ti-x text-[16px]" />
                  </button>
                )}
                <button type="submit" className="px-3 text-slate-500 hover:text-blue-700" aria-label="Search">
                  <i className="ti ti-search text-[18px]" />
                </button>
              </form>
            </div>
          </div>

          {viewType === 'grouped' ? (
            <div className="space-y-4">
              {loading ? (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-12 text-center font-semibold text-slate-400">Loading approvals...</div>
              ) : groupedRecords.length ? groupedRecords.map((group) => {
                const isExpanded = !!expandedKeys[group.key];
                const pendingItems = group.items.filter(item => item.status === 'pending');
                const hasPending = pendingItems.length > 0;

                return (
                  <div key={group.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm transition-all hover:shadow-md">
                    {/* Group Header */}
                    <div
                      onClick={() => toggleGroupExpand(group.key)}
                      role="button"
                      className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50 hover:bg-slate-50 cursor-pointer border-b border-slate-100 select-none"
                    >
                      <div className="flex flex-1 items-start gap-3 min-w-0">
                        <span className="mt-1 text-slate-400 transition-transform">
                          <i className={`ti ${isExpanded ? 'ti-chevron-down' : 'ti-chevron-right'} text-base font-bold`} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm md:text-base">
                              {group.sourceReference || 'No Reference'}
                            </span>
                            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                              {group.sourceType}
                            </span>
                            <span className="text-xs font-semibold text-slate-500">
                              {group.storeName}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            Created: {formatDate(group.createdAt)} · {group.items.length} SKU{group.items.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                        {/* Margins summary */}
                        <div className="text-left sm:text-right whitespace-nowrap mr-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Margin</span>
                          <p className="text-sm font-bold text-slate-800">
                            {group.avgCurrentMargin.toFixed(2)}% <span className="text-slate-400 text-xs">→</span> <span className="text-slate-900 font-extrabold">{group.avgRequestedMargin.toFixed(2)}%</span>
                          </p>
                          <Delta current={group.avgCurrentMargin} requested={group.avgRequestedMargin} suffix="%" />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {status === 'pending' && hasPending && canApprove ? (
                            <>
                              <button
                                type="button"
                                onClick={() => updateBulkApproval(pendingItems.map(item => item.id), 'approve')}
                                disabled={bulkActionLoading}
                                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50"
                              >
                                Approve All
                              </button>
                              <button
                                type="button"
                                onClick={() => updateBulkApproval(pendingItems.map(item => item.id), 'reject')}
                                disabled={bulkActionLoading}
                                className="rounded-lg border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-rose-700 hover:bg-rose-50 transition-all disabled:opacity-50"
                              >
                                Reject All
                              </button>
                            </>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">
                              {status === 'pending' ? 'No pending items' : status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Items Table */}
                    {isExpanded && (
                      <div className="overflow-x-auto border-t border-slate-100 bg-white">
                        <table className="min-w-full text-left text-xs md:text-sm">
                          <thead className="bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            <tr>
                              <th className="px-4 py-2.5">Product</th>
                              <th className="px-4 py-2.5">CP</th>
                              <th className="px-4 py-2.5">MRP</th>
                              <th className="px-4 py-2.5">SP</th>
                              <th className="px-4 py-2.5">Margin</th>
                              <th className="px-4 py-2.5">Status</th>
                              <th className="px-4 py-2.5">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.items.map((row) => (
                              <tr key={row.id} className="hover:bg-slate-50/40 text-slate-700">
                                <td className="px-4 py-2.5">
                                  <p className="font-bold text-slate-900">{row.productName}</p>
                                  <p className="text-[10px] text-slate-400">{row.sku || row.barcode || `Product ${row.productId}`}</p>
                                </td>
                                {[
                                  ['currentCostPrice', 'requestedCostPrice'],
                                  ['currentMrp', 'requestedMrp'],
                                  ['currentSellingPrice', 'requestedSellingPrice'],
                                ].map(([currentKey, requestedKey]) => (
                                  <td key={currentKey} className="whitespace-nowrap px-4 py-2.5">
                                    <p>{money(row[currentKey])} <span className="text-slate-400">→</span> <span className="font-bold text-slate-900">{money(row[requestedKey])}</span></p>
                                    <Delta current={row[currentKey]} requested={row[requestedKey]} />
                                  </td>
                                ))}
                                <td className="whitespace-nowrap px-4 py-2.5">
                                  <p>{row.currentMarginPercent.toFixed(2)}% <span className="text-slate-400">→</span> <span className="font-bold text-slate-900">{row.requestedMarginPercent.toFixed(2)}%</span></p>
                                  <Delta current={row.currentMarginPercent} requested={row.requestedMarginPercent} suffix="%" />
                                </td>
                                <td className="px-4 py-2.5"><StatusPill status={row.status} /></td>
                                <td className="px-4 py-2.5">
                                  {row.status === 'pending' && canApprove ? (
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => updateApproval(row, 'approve')}
                                        disabled={actionId === row.id || bulkActionLoading}
                                        className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateApproval(row, 'reject')}
                                        disabled={actionId === row.id || bulkActionLoading}
                                        className="rounded border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-slate-400">No action</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              }) : (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-12 text-center font-semibold text-slate-400">No margin approvals found.</div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="hidden overflow-x-auto xl:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Store / Source</th>
                      <th className="px-4 py-3">CP</th>
                      <th className="px-4 py-3">MRP</th>
                      <th className="px-4 py-3">SP</th>
                      <th className="px-4 py-3">Margin</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan="8" className="px-4 py-12 text-center font-semibold text-slate-400">Loading approvals...</td></tr>
                    ) : filteredRecords.length ? filteredRecords.map((row) => (
                      <tr key={row.id} className="text-slate-700">
                        <td className="min-w-[240px] px-4 py-3">
                          <p className="font-bold text-slate-900">{row.productName}</p>
                          <p className="text-xs text-slate-500">{row.sku || row.barcode || `Product ${row.productId}`}</p>
                        </td>
                        <td className="min-w-[180px] px-4 py-3">
                          <p className="font-semibold">{row.storeName || '-'}</p>
                          <p className="text-xs text-slate-500">{row.sourceReference || row.sourceType || '-'} - {formatDate(row.createdAt)}</p>
                        </td>
                        {[
                          ['currentCostPrice', 'requestedCostPrice'],
                          ['currentMrp', 'requestedMrp'],
                          ['currentSellingPrice', 'requestedSellingPrice'],
                        ].map(([currentKey, requestedKey]) => (
                          <td key={currentKey} className="whitespace-nowrap px-4 py-3">
                            <p>{money(row[currentKey])} <span aria-hidden="true">-&gt;</span> <span className="font-bold text-slate-900">{money(row[requestedKey])}</span></p>
                            <Delta current={row[currentKey]} requested={row[requestedKey]} />
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-4 py-3">
                          <p>{row.currentMarginPercent.toFixed(2)}% <span aria-hidden="true">-&gt;</span> <span className="font-bold text-slate-900">{row.requestedMarginPercent.toFixed(2)}%</span></p>
                          <Delta current={row.currentMarginPercent} requested={row.requestedMarginPercent} suffix="%" />
                        </td>
                        <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                        <td className="px-4 py-3">
                          {row.status === 'pending' && canApprove ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => updateApproval(row, 'approve')}
                                disabled={actionId === row.id || bulkActionLoading}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => updateApproval(row, 'reject')}
                                disabled={actionId === row.id || bulkActionLoading}
                                className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">No action</span>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="8" className="px-4 py-12 text-center font-semibold text-slate-400">No margin approvals found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-3 xl:hidden">
                {loading ? (
                  <div className="rounded-lg border border-slate-200 px-4 py-10 text-center font-semibold text-slate-400">Loading approvals...</div>
                ) : filteredRecords.length ? filteredRecords.map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{row.productName}</p>
                        <p className="text-xs text-slate-500">{row.storeName || '-'} - {row.sourceReference || '-'}</p>
                      </div>
                      <StatusPill status={row.status} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ['CP', 'currentCostPrice', 'requestedCostPrice'],
                        ['MRP', 'currentMrp', 'requestedMrp'],
                        ['SP', 'currentSellingPrice', 'requestedSellingPrice'],
                      ].map(([label, currentKey, requestedKey]) => (
                        <div key={label} className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
                          <p className="mt-1 text-sm font-bold">{money(row[currentKey])} <span aria-hidden="true">-&gt;</span> {money(row[requestedKey])}</p>
                          <Delta current={row[currentKey]} requested={row[requestedKey]} />
                        </div>
                      ))}
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Margin</p>
                        <p className="mt-1 text-sm font-bold">{row.currentMarginPercent.toFixed(2)}% <span aria-hidden="true">-&gt;</span> {row.requestedMarginPercent.toFixed(2)}%</p>
                        <Delta current={row.currentMarginPercent} requested={row.requestedMarginPercent} suffix="%" />
                      </div>
                    </div>
                    {row.status === 'pending' && canApprove && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateApproval(row, 'approve')}
                          disabled={actionId === row.id || bulkActionLoading}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => updateApproval(row, 'reject')}
                          disabled={actionId === row.id || bulkActionLoading}
                          className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="rounded-lg border border-slate-200 px-4 py-10 text-center font-semibold text-slate-400">No margin approvals found.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
