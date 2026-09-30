'use client';

import { useEffect, useMemo, useState } from 'react';
import InventoryShell from '@/components/inventory/InventoryShell';
import { formatIndianDate } from '@/lib/dateUtils';
import { downloadFromUrl, usePagedList } from '@/hooks/usePagedList';

const tableHeaders = [
  'Priority',
  'Sell Order',
  'Product',
  'Store',
  'Batch',
  'Expiry',
  'Days Left',
  'Risk Score',
  'Qty',
  'Value',
  'Suggested Action',
];

const dayOptions = [7, 15, 30, 60, 90];
const statusOptions = [
  { value: 'all', label: 'All risk stock' },
  { value: 'missing', label: 'Missing expiry' },
  { value: 'expired', label: 'Expired' },
  { value: 'urgent', label: 'Next 7 days' },
  { value: 'upcoming', label: 'Upcoming' },
];

function formatDate(value) {
  return formatIndianDate(value, '-');
}

function formatQty(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function priorityClass(bucket) {
  if (bucket === 'Missing Expiry') return 'Missing Expiry';
  if (bucket === 'Expired') return 'Expired';
  if (bucket === 'Critical') return 'Critical';
  if (bucket === 'Urgent') return 'Urgent';
  if (bucket === 'Soon') return 'Soon';
  return 'Upcoming';
}

function formatCurrencySafe(value) {
  return `\u20b9${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

async function fetchStores() {
  const res = await fetch('/api/stores');
  const json = await res.json().catch(() => ({}));
  return json?.data?.stores || json?.data?.records || [];
}

export default function ExpiryAlertsPage() {
  const [days, setDays] = useState(30);
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stores, setStores] = useState([]);

  useEffect(() => {
    fetchStores().then(setStores).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const list = usePagedList('/api/inventory/expiry-alerts', {
    params: { days, store_id: storeId, status, search: debouncedSearch },
  });
  const records = list.records;
  const summary = list.extra.summary || {};
  const loading = list.loading;

  const stats = useMemo(
    () => [
      {
        label: 'Risk Batches',
        value: String(summary.totalBatches || 0),
        note: `Within ${days} day window`,
      },
      {
        label: 'Missing Expiry',
        value: String(summary.missing || 0),
        note: 'Add dates to track risk',
      },
      {
        label: 'Critical',
        value: String(summary.critical || 0),
        note: '0-3 days left',
      },
      {
        label: 'Top Store Risk',
        value: summary.topStore?.storeName || '-',
        note: summary.topStore
          ? `${summary.topStore.batches} batches - ${formatCurrencySafe(summary.topStore.value)}`
          : 'No store risk in this view',
      },
    ],
    [days, summary],
  );

  const insights = useMemo(() => {
    const missing = Number(summary.missing || 0);
    const expired = Number(summary.expired || 0);
    const critical = Number(summary.critical || 0);
    const urgent = Number(summary.urgent || 0);
    return [
      {
        title: missing ? 'Some batches have no expiry date' : expired ? 'Expired stock needs action' : 'No expired stock in this view',
        text: missing
          ? `${missing} active batch(es) do not have an expiry date. Add expiry dates so the system can warn before stock becomes unsellable.`
          : expired
            ? `${expired} batch(es) are already expired. Remove them from sale and process vendor return or disposal.`
            : 'Current filters do not show expired active stock.',
        button: missing ? 'Missing expiry' : 'View expired',
        onClick: () => setStatus(missing ? 'missing' : 'expired'),
      },
      {
        title: critical ? 'Push critical stock today' : 'Critical window is clear',
        text: critical
          ? `${critical} batch(es) expire within 3 days. Use FEFO shelf placement and sell the nearest-expiry batches first.`
          : 'No active batch is expiring within 3 days for the selected filters.',
        button: 'Next 7 days',
        onClick: () => setStatus('urgent'),
      },
      {
        title: urgent ? 'Plan weekly clearance' : 'Weekly expiry risk is low',
        text: urgent
          ? `${urgent} batch(es) are in the 7-day risk window. Review store-wise quantities and avoid replenishing these items.`
          : 'No urgent weekly risk visible in this selection.',
        button: 'All risk stock',
        onClick: () => setStatus('all'),
      },
    ];
  }, [summary]);

  const tableData = useMemo(
    () =>
      records.map((row) => ({
        Priority: priorityClass(row.bucket),
        'Sell Order': row.sellOrder || '-',
        Product: `${row.productName}${row.sku ? ` (${row.sku})` : ''}`,
        Store: row.storeName ? `${row.storeName}${row.locationType ? ` (${row.locationType})` : ''}` : '-',
        Batch: row.batchNo || '-',
        Expiry: formatDate(row.expiryDate),
        'Days Left': row.daysToExpiry === null ? 'Not set' : row.daysToExpiry < 0 ? `${Math.abs(row.daysToExpiry)} days ago` : String(row.daysToExpiry),
        'Risk Score': row.riskScore ?? '-',
        Qty: formatQty(row.availableQty),
        Value: formatCurrencySafe(row.stockValue),
        'Suggested Action': row.suggestedAction || '-',
      })),
    [records],
  );

  const filters = (
    <>
      <select
        value={days}
        onChange={(event) => setDays(Number(event.target.value))}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-600 outline-none"
      >
        {dayOptions.map((option) => (
          <option key={option} value={option}>
            Next {option} days
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-600 outline-none"
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        value={storeId}
        onChange={(event) => setStoreId(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-600 outline-none"
      >
        <option value="">All stores</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          setDays(30);
          setStatus('all');
          setStoreId('');
          setSearch('');
        }}
        className="rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600 hover:bg-slate-50"
      >
        Clear
      </button>
    </>
  );

  return (
    <InventoryShell
      breadcrumb={[{ label: 'Inventory' }, { label: 'Near Expiry' }]}
      title="Near Expiry Products"
      subtitle="Track expiry risk by batch, product and store before stock becomes unsellable."
      actions={[
        { label: 'Batches', href: '/inventory/batches' },
        { label: 'Stock In', href: '/inventory/stockin', primary: true },
      ]}
      stats={stats}
      insights={insights}
      searchPlaceholder="Search product, SKU, batch or store"
      searchValue={search}
      onSearchChange={setSearch}
      filters={filters}
      tableHeaders={tableHeaders}
      tableData={loading ? [] : tableData}
      emptyMessage={loading ? 'Loading expiry risk...' : 'No near-expiry stock found'}
      onDownload={() => downloadFromUrl(list.exportUrl())}
      pagination={list.pagination}
    />
  );
}
