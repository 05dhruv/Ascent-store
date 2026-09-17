'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import InventoryShell from '@/components/inventory/InventoryShell';
import { formatIndianDate } from '@/lib/dateUtils';

const tableHeaders = ['S. No.', 'Material', 'Code', 'Location', 'Batch / Lot No.', 'MFG Date', 'Expiry Date', 'Available Qty', 'Received Qty', 'Status'];

const formatDate = (value) => formatIndianDate(value, '-');

async function fetchBatches(storeId = '') {
  const response = await fetch(`/api/inventory/batches${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`);
  if (!response.ok) throw new Error('Failed to load batches');
  return response.json();
}

export default function BatchesPage() {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchBatches(storeId)
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => {
    fetch('/api/stores?include_locations=all')
      .then((response) => response.json())
      .then((data) => setStores(data?.data?.records || data?.records || data || []))
      .catch(() => setStores([]));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((row) =>
      [row.batchName, row.product, row.sku, row.store, row.locationType, row.expiryStatus]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [records, search]);

  const tableData = useMemo(() => filtered.map((row, index) => ({
    'S. No.': index + 1,
    Material: row.product || '-',
    Code: row.sku || '-',
    Location: row.store ? `${row.store}${row.locationType ? ` (${row.locationType})` : ''}` : '-',
    'Batch / Lot No.': row.batchName || '-',
    'MFG Date': formatDate(row.mfgDate),
    'Expiry Date': formatDate(row.expiryDate),
    'Available Qty': row.items ?? 0,
    'Received Qty': row.receivedItems ?? 0,
    Status: row.expiryStatus || row.status || '-',
  })), [filtered]);

  return (
    <InventoryShell
      breadcrumb={[{ label: 'Material Movement' }, { label: 'Batch & Serial Trace' }]}
      title="Batch & Serial Trace"
      subtitle="View material lot, batch and serial details by warehouse or site. Prices are maintained on the material master."
      actions={[{ label: 'Receive Material', primary: true, onClick: () => router.push('/inventory/stockin') }]}
      searchPlaceholder="Search material, code, batch or location"
      searchValue={search}
      onSearchChange={setSearch}
      filters={<select value={storeId} onChange={(event) => setStoreId(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700"><option value="">All locations</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>}
      tableHeaders={tableHeaders}
      tableData={loading ? [] : tableData}
      emptyMessage={loading ? 'Loading batch records...' : 'No batch records found'}
    />
  );
}
