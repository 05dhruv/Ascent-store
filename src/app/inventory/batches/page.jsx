'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import InventoryShell from '@/components/inventory/InventoryShell';
import { formatIndianDate } from '@/lib/dateUtils';
import * as XLSX from 'xlsx';

const tableHeaders = [
  'S. No.',
  'Product',
  'SKU',
  'Location',
  'Batch No',
  'MFG Date',
  'Expiry Date',
  'Current Qty',
  'Received Qty',
  'Cost',
  'Status',
];

function formatDate(value) {
  return formatIndianDate(value, '-');
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

async function fetchBatches(storeId = '') {
  const res = await fetch(`/api/inventory/batches${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch batches');
  return res.json();
}

export default function BatchesPage() {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkBrandId, setBulkBrandId] = useState('');
  const [brands, setBrands] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchBatches(storeId)
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => {
    Promise.all([fetch('/api/stores?include_locations=all').then((r) => r.json()), fetch('/api/catalog/brands?pageSize=5000').then((r) => r.json())])
      .then(([storeData, brandData]) => {
        setStores(storeData?.data?.records || storeData?.records || storeData || []);
        setBrands(brandData?.data?.records || brandData?.records || brandData || []);
      }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((row) =>
      [row.batchName, row.product, row.sku, row.store, row.locationType, row.expiryStatus]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [records, search]);

  const tableData = useMemo(() => {
    return filtered.map((row, idx) => ({
      'S. No.': idx + 1,
      Product: row.product || '-',
      SKU: row.sku || '-',
      Location: row.store ? `${row.store}${row.locationType ? ` (${row.locationType})` : ''}` : '-',
      'Batch No': row.batchName || '-',
      'MFG Date': formatDate(row.mfgDate),
      'Expiry Date': formatDate(row.expiryDate),
      'Current Qty': row.items ?? 0,
      'Received Qty': row.receivedItems ?? 0,
      Cost: formatCurrency(row.cost),
      Status: row.expiryStatus || row.status || '-',
    }));
  }, [filtered]);

  const downloadBatchSheet = async () => {
    if (!storeId) return setBulkMessage('Select a store before downloading.');
    setBulkBusy(true); setBulkMessage('');
    try {
      const params = new URLSearchParams({ storeId, ...(bulkBrandId ? { brandId: bulkBrandId } : {}) });
      const response = await fetch(`/api/inventory/batches/bulk-price?${params}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'Unable to download batches.');
      const rows = (json.data?.records || []).map((row) => ({
        'Batch ID': row.batch_id, Store: row.store_name, Brand: row.brand_name,
        Product: row.product_name, Barcode: row.barcode, SKU: row.sku,
        'Batch No': row.batch_no, Expiry: row.expiry_date, 'Current CP': row.costPrice,
        'Current MRP': row.mrp, 'Current SP': row.sellingPrice,
        'New CP': '', 'New MRP': '', 'New SP': '',
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Batch Prices');
      XLSX.writeFile(workbook, `batch-price-update-store-${storeId}.xlsx`);
      setBulkMessage(`${rows.length} active batch(es) downloaded. Fill all three New price columns only for batches you want to change.`);
    } catch (error) { setBulkMessage(error.message || 'Download failed.'); } finally { setBulkBusy(false); }
  };

  const uploadBatchSheet = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !storeId) return setBulkMessage('Select a store and Excel file.');
    setBulkBusy(true); setBulkMessage('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      const changed = sheet.filter((row) => ['New CP', 'New MRP', 'New SP'].some((key) => String(row[key] ?? '').trim() !== ''));
      if (!changed.length) throw new Error('Enter New CP, New MRP and New SP for at least one batch.');
      const incomplete = changed.find((row) => ['New CP', 'New MRP', 'New SP'].some((key) => String(row[key] ?? '').trim() === ''));
      if (incomplete) throw new Error(`Batch ID ${incomplete['Batch ID'] || '-'}: enter all New CP, New MRP and New SP values.`);
      const rows = changed.map((row) => ({ batchId: row['Batch ID'], barcode: row.Barcode, costPrice: Number(row['New CP']), mrp: Number(row['New MRP']), sellingPrice: Number(row['New SP']) }));
      const request = (preview) => fetch('/api/inventory/batches/bulk-price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId, rows, preview }) }).then((res) => res.json());
      const preview = await request(true);
      if (!preview.success) throw new Error(preview.message || 'Preview failed.');
      if (preview.data?.skipped) throw new Error(`Preview rejected ${preview.data.skipped} row(s). No batch was changed.`);
      const applied = await request(false);
      if (!applied.success) throw new Error(applied.message || 'Upload failed.');
      setBulkMessage(`${applied.data?.updated || 0} batch price(s) updated. Only the matched Batch IDs in selected store were changed.`);
      fetchBatches(storeId).then(setRecords).catch(() => {});
    } catch (error) { setBulkMessage(error.message || 'Upload failed.'); } finally { setBulkBusy(false); event.target.value = ''; }
  };

  return (
    <InventoryShell
      breadcrumb={[{ label: 'Inventory' }, { label: 'Batches' }]}
      title="Batches"
      subtitle="List of all batches"
      actions={[
        { label: 'Bulk Batch Prices', onClick: () => { setBulkMessage(''); setShowBulk(true); } },
        { label: 'Add In Bulk (Excel)', primary: true, onClick: () => router.push('/inventory/stockin') },
      ]}
      searchPlaceholder="Search"
      searchValue={search}
      onSearchChange={setSearch}
      filters={<select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700"><option value="">All Stores</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>}
      tableHeaders={tableHeaders}
      tableData={loading ? [] : tableData}
      emptyMessage={loading ? 'Loading records...' : 'No Records Found'}
    >
      {showBulk && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl"><div className="border-b border-slate-100 px-7 py-6"><h2 className="text-xl font-bold text-slate-900">Bulk Edit Batch Prices</h2><p className="mt-1 text-sm text-slate-500">Download batches, edit the Excel, then upload it here. Only selected store’s exact Batch IDs will update.</p></div><div className="space-y-5 p-7"><section className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5"><h3 className="font-semibold">Download edit sheet</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Store<select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3"><option value="">Select store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label className="text-sm">Brand<select value={bulkBrandId} onChange={(e) => setBulkBrandId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3"><option value="">All brands</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label></div><button disabled={!storeId || bulkBusy} onClick={downloadBatchSheet} className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold disabled:opacity-40">{bulkBusy ? 'Processing...' : 'Download Batch Price Excel'}</button></section><section className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5"><h3 className="font-semibold">Upload edited sheet</h3><p className="mt-1 text-sm text-slate-500">Batch ID is mandatory. Leave New CP/MRP/SP blank to keep that batch unchanged.</p><label className="mt-4 block cursor-pointer rounded-xl bg-red-700 px-5 py-3 text-center text-sm font-semibold text-white">{bulkBusy ? 'Processing...' : 'Upload Edited Excel'}<input type="file" accept=".xlsx,.xls" disabled={!storeId || bulkBusy} onChange={uploadBatchSheet} className="hidden" /></label></section>{bulkMessage && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{bulkMessage}</p>}</div><div className="flex justify-end border-t border-slate-100 px-7 py-4"><button onClick={() => setShowBulk(false)} className="rounded-xl border border-slate-300 px-5 py-2 text-sm">Close</button></div></div></div>}
    </InventoryShell>
  );
}
