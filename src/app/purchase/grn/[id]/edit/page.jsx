"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';

function normalizeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function EditGrnPage() {
  const params = useParams();
  const id = params?.id;
  const [loading, setLoading] = useState(true);
  const [grn, setGrn] = useState(null);
  const [destination, setDestination] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/purchase/grns/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) return setGrn(null);
        setGrn(data);
        setDestination(data.destination_id || data.destination || '');
        setVendorName(data.vendor_name || '');
        setInvoiceNumber(data.invoice_number || '');
        setInvoiceDate(normalizeDate(data.invoice_date));
      })
      .catch(() => setGrn(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    if (!id) return alert('Missing GRN id');
    setSubmitting(true);
    try {
      const payload = {
        destination: destination || null,
        vendorName: vendorName || null,
        invoiceNumber: invoiceNumber || null,
        invoiceDate: invoiceDate || null,
      };
      const res = await fetch(`/api/purchase/grns/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'Failed to update GRN');
      router.push('/purchase/grn');
    } catch (err) {
      console.error(err);
      alert('Failed to update GRN');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <MainLayout><div className="p-6">Loading...</div></MainLayout>;
  if (!grn) return <MainLayout><div className="p-6">GRN not found</div></MainLayout>;

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl border border-gray-200">
        <h1 className="text-2xl font-semibold mb-4">Edit GRN</h1>
        <div className="mb-4">
          <label className="block text-sm text-gray-700 mb-1">Destination (Store)</label>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </div>
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Vendor Name</label>
            <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Invoice Number</label>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-1">Invoice Date</label>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </div>
        <div className="flex gap-3">
          <button onClick={() => router.back()} className="px-4 py-2 rounded-lg border">Back</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-lg bg-blue-600 text-white">{submitting ? '...' : 'Save Changes'}</button>
        </div>
      </div>
    </MainLayout>
  );
}
