"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { fetchLookup, normalizeStores } from '@/lib/purchaseLookups';

async function fetchStores() {
  return normalizeStores(await fetchLookup('/api/stores'));
}

async function fetchPurchaseOrders() {
  const res = await fetch('/api/purchase-orders', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch purchase orders');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function postGrn(payload) {
  const res = await fetch('/api/purchase/grns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create GRN');
  return res.json();
}

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CreateGrnPage() {
  const [stores, setStores] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [error, setError] = useState('');
  const [poId, setPoId] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [destination, setDestination] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setLoadingStores(true);
    setError('');
    Promise.allSettled([fetchStores(), fetchPurchaseOrders()])
      .then(([storeResult, poResult]) => {
        if (storeResult.status === 'fulfilled') {
          setStores(storeResult.value || []);
        } else {
          setStores([]);
          setError(storeResult.reason?.message || 'Failed to load stores');
        }

        if (poResult.status === 'fulfilled') {
          setPurchaseOrders(poResult.value || []);
        } else {
          setPurchaseOrders([]);
          setError((current) => current || poResult.reason?.message || 'Failed to load purchase orders');
        }
      })
      .finally(() => setLoadingStores(false));
  }, []);

  const filteredPurchaseOrders = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return purchaseOrders;
    return purchaseOrders.filter((po) =>
      [po.id, po.transactionId, po.destinationName, po.vendorName, po.invoiceNumber, po.status]
        .some((value) => String(value ?? '').toLowerCase().includes(q))
    );
  }, [poSearch, purchaseOrders]);

  const selectedPo = purchaseOrders.find((po) => String(po.id) === String(poId) || String(po.transactionId) === String(poId));
  const selectedPoLabel = selectedPo
    ? `${selectedPo.transactionId || `PO-${selectedPo.id}`} - ${selectedPo.destinationName || 'Destination'} - ${selectedPo.vendorName || 'Vendor'}`
    : '';
  useEffect(() => {
    if (!selectedPo) return;
    setDestination(selectedPo.destinationId ? String(selectedPo.destinationId) : '');
    setVendorName(selectedPo.vendorName || '');
    setInvoiceNumber(selectedPo.invoiceNumber === '—' ? '' : selectedPo.invoiceNumber || '');
    setInvoiceDate(normalizeDate(selectedPo.invoiceDate));
    setPoSearch(selectedPoLabel);
  }, [selectedPo]);

  const handleSubmit = async () => {
    if (!poId) return alert('Please enter Purchase Order ID');
    setSubmitting(true);
    try {
      const payload = {
        poId,
        destination,
        vendorName,
        invoiceNumber,
        invoiceDate,
      };
      const created = await postGrn(payload);
      router.push(`/inventory/stockin/line-items?id=${encodeURIComponent(created.id)}`);
    } catch (err) {
      console.error(err);
      alert('Failed to create GRN');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Purchase</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">Create GRN</span>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">Create Purchase GRN</h1>
          {error && <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600">{error}</div>}

          <div className="mb-4">
            <label className="block text-sm text-gray-700 font-medium mb-1">Purchase Order ID <span className="text-red-500">*</span></label>
            <div className="relative">
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 focus-within:border-blue-500">
                <i className="ti ti-search text-[16px] text-gray-400" />
                <input
                  value={poSearch}
                  onChange={(event) => {
                    setPoSearch(event.target.value);
                    setPoId('');
                    setDestination('');
                    setVendorName('');
                    setInvoiceNumber('');
                    setInvoiceDate('');
                  }}
                  placeholder="Search PO ID, destination, vendor, invoice"
                  className="w-full bg-transparent text-[13px] text-gray-800 outline-none placeholder:text-gray-400"
                />
              </div>
              {(!poId || poSearch !== selectedPoLabel) && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {filteredPurchaseOrders.length > 0 ? (
                    filteredPurchaseOrders.slice(0, 50).map((po) => (
                      <button
                        key={po.id}
                        type="button"
                        onClick={() => setPoId(String(po.id))}
                        className="block w-full px-3 py-2 text-left text-[13px] text-gray-800 hover:bg-blue-50"
                      >
                        <span className="font-semibold">{po.transactionId || `PO-${po.id}`}</span>
                        <span className="text-gray-500"> - {po.destinationName || 'Destination'} - {po.vendorName || 'Vendor'}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-[13px] text-gray-500">No purchase orders found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-700 font-medium mb-1">Destination</label>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
              >
              <option value="">Select Destination</option>
              {loadingStores ? (
                <option>Loading...</option>
              ) : (
                stores
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
              )}
            </select>
            <p className="mt-1.5 text-xs text-amber-600 font-medium">
              Note: Store destinations are allowed when this GRN is linked to a Purchase Order.
            </p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 font-medium mb-1">Vendor Name</label>
                <input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                />
            </div>
            <div>
              <label className="block text-sm text-gray-700 font-medium mb-1">Invoice Number</label>
                <input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm text-gray-700 font-medium mb-1">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
              />
          </div>

          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50" onClick={() => router.back()}>Back</button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700" onClick={handleSubmit} disabled={submitting}>{submitting ? '...' : 'Create GRN'}</button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
