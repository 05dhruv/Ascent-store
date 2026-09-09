'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { fetchLookup, normalizeVendors } from '@/lib/purchaseLookups';
import { addCalendarDays } from '@/lib/vendorCreditTerms';

async function createVendorInvoice(payload) {
  const res = await fetch('/api/vendor-invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create vendor invoice');
  return data;
}

export default function CreateVendorInvoicePage() {
  const router = useRouter();
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    invoice_number: '',
    total_amount: '',
    amount_paid: '',
    vendor: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    payment_mode: 'Bank Transfer',
    reference_no: '',
    remarks: '',
  });
  const selectedVendor = vendors.find((vendor) => String(vendor.id) === String(form.vendor));
  const vendorCreditDays = Number(selectedVendor?.credit_days || 0);
  const maximumDueDate = form.invoice_date && vendorCreditDays > 0
    ? addCalendarDays(form.invoice_date, vendorCreditDays)
    : '';
  const dueDateInvalid = Boolean(form.due_date && maximumDueDate && form.due_date > maximumDueDate);

  useEffect(() => {
    setLoadingVendors(true);
    fetchLookup('/api/vendors')
      .then((data) => setVendors(normalizeVendors(data)))
      .catch((err) => {
        console.error(err);
        setVendors([]);
      })
      .finally(() => setLoadingVendors(false));
  }, []);

  const handleSave = async () => {
    if (!form.total_amount || Number(form.total_amount) < 0) return alert('Amount is required');
    if (!form.vendor) return alert('Vendor is required');
    if (!form.due_date) return alert('Invoice due date is required');
    if (dueDateInvalid) return alert(`Invoice due date cannot be after ${maximumDueDate}`);

    setSaving(true);
    try {
      await createVendorInvoice({
        invoice_number: form.invoice_number,
        total_amount: Number(form.total_amount),
        amount_paid: Number(form.amount_paid || 0),
        vendor: form.vendor,
        invoice_date: form.invoice_date,
        due_date: form.due_date,
        payment_mode: form.payment_mode,
        reference_no: form.reference_no,
        remarks: form.remarks,
      });
      router.push('/purchase/vendor-invoices');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save vendor invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Purchase</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">Vendor Invoices</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">Create Vendor Invoices</h1>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => router.back()} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 text-[13px] font-medium text-blue-600 hover:bg-blue-50 transition-colors">
            <i className="ti ti-chevron-left text-[16px]" />
            Back
          </button>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6">
        <section className="border border-gray-300 rounded p-6 bg-white">
          <h4 className="text-sm text-blue-700 font-semibold mb-8">Basic Information</h4>
          <div className="grid grid-cols-2 gap-x-12 gap-y-8">
            <div>
              <label className="text-[12px] text-gray-700 font-medium">Invoice Number</label>
              <input
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                placeholder="Auto-generated if blank"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
              />
              <p className="mt-1 text-[11px] text-gray-400">Leave blank to generate automatically.</p>
            </div>

            <div>
              <label className="text-[12px] text-gray-700 font-medium">Amount *</label>
              <input
                type="number"
                value={form.total_amount}
                onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                placeholder="Enter Amount"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[12px] text-gray-700 font-medium">Amount Paid</label>
              <input
                type="number"
                value={form.amount_paid}
                onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
                placeholder="Enter paid amount"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[12px] text-gray-700 font-medium">Vendor</label>
              <select
                value={form.vendor}
                onChange={(e) => {
                  const vendorId = e.target.value;
                  const vendor = vendors.find((item) => String(item.id) === String(vendorId));
                  const creditDays = Number(vendor?.credit_days || 0);
                  setForm({
                    ...form,
                    vendor: vendorId,
                    due_date: form.invoice_date && creditDays > 0
                      ? addCalendarDays(form.invoice_date, creditDays)
                      : '',
                  });
                }}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Select Vendor</option>
                {loadingVendors ? (
                  <option>Loading...</option>
                ) : (
                  vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="text-[12px] text-gray-700 font-medium">Invoice Date</label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={(e) => {
                  const invoiceDate = e.target.value;
                  setForm({
                    ...form,
                    invoice_date: invoiceDate,
                    due_date: invoiceDate && vendorCreditDays > 0
                      ? addCalendarDays(invoiceDate, vendorCreditDays)
                      : form.due_date,
                  });
                }}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[12px] text-gray-700 font-medium">Invoice Due Date *</label>
              <input
                type="date"
                min={form.invoice_date || undefined}
                max={maximumDueDate || undefined}
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className={`mt-2 w-full rounded-lg border px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none ${dueDateInvalid ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'}`}
              />
              {vendorCreditDays > 0 && (
                <p className={`mt-1 text-[11px] ${dueDateInvalid ? 'text-red-600' : 'text-gray-500'}`}>
                  {vendorCreditDays}-day vendor term. Latest allowed: {maximumDueDate}.
                </p>
              )}
            </div>

            {Number(form.amount_paid || 0) > 0 && (
              <>
                <div>
                  <label className="text-[12px] text-gray-700 font-medium">Payment Mode</label>
                  <select
                    value={form.payment_mode}
                    onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                  >
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Card</option>
                  <option>Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] text-gray-700 font-medium">Reference No.</label>
                  <input
                    value={form.reference_no}
                    onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
                    placeholder="Payment reference"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}

            <div className="col-span-2">
              <label className="text-[12px] text-gray-700 font-medium">Remarks</label>
              <textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="remarks"
                rows={5}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
