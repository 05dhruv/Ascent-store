'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';

function Card({ label, value }) {
  return (
    <div className="border border-gray-200 rounded-md bg-white px-5 py-6 min-h-[64px] flex items-center justify-between shadow-sm">
      <span className="text-[13px] text-gray-700">{label}</span>
      <span className="text-[15px] font-semibold text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

function ModalField({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

const initialForm = {
  creditsPurchased: '',
  ratePerCredit: '',
  amountPaid: '',
  purchasedAt: '',
  remarks: '',
};

export default function CreditPurchasePage({
  creditLabel,
  pageTitle,
  description,
  apiBase,
  buttonLabel,
  modalTitle,
}) {
  const [summary, setSummary] = useState({ purchased: 0, consumed: 0, left: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);

  const computedAmount = useMemo(() => {
    const credits = Number(form.creditsPurchased || 0);
    const rate = Number(form.ratePerCredit || 0);
    if (!Number.isFinite(credits) || !Number.isFinite(rate)) return 0;
    return credits * rate;
  }, [form.creditsPurchased, form.ratePerCredit]);

  useEffect(() => {
    if (form.amountPaid === '') {
      setForm((prev) => ({ ...prev, amountPaid: String(computedAmount || '') }));
    }
  }, [computedAmount, form.amountPaid]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiBase);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to load ${creditLabel} credits`);
      setSummary(data.summary || { purchased: 0, consumed: 0, left: 0 });
    } catch (err) {
      console.error(err);
      setError(err.message || `Failed to load ${creditLabel} credits`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openModal = () => {
    const now = new Date();
    setForm({ ...initialForm, purchasedAt: now.toISOString().slice(0, 16) });
    setOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        creditsPurchased: form.creditsPurchased,
        ratePerCredit: form.ratePerCredit,
        amountPaid: form.amountPaid === '' ? computedAmount : form.amountPaid,
        purchasedAt: form.purchasedAt,
        remarks: form.remarks,
        createdBy: 'System',
      };

      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to buy ${creditLabel} credits`);
      setSummary(data.summary || summary);
      setOpen(false);
      setForm(initialForm);
    } catch (err) {
      console.error(err);
      setError(err.message || `Failed to buy ${creditLabel} credits`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-[#f5f7fb]">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-2 flex-wrap">
          <Link href="/customer/dashboard" className="hover:text-blue-600 transition-colors">Customer</Link>
          <span className="text-gray-400">›</span>
          <span className="text-blue-600 font-medium">{creditLabel} Credit</span>
        </nav>

        <div className="mb-8">
          <h1 className="text-[24px] leading-tight font-semibold text-gray-900">{pageTitle}</h1>
          <p className="mt-2 text-[13px] text-gray-500">
            {description} <span className="text-blue-600 cursor-pointer hover:underline">Need Help?</span>
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[1080px]">
          <Card label={`${creditLabel} Purchased`} value={loading ? '...' : Number(summary.purchased || 0).toLocaleString()} />
          <Card label={`${creditLabel} Consumed`} value={loading ? '...' : Number(summary.consumed || 0).toLocaleString()} />
          <Card label={`${creditLabel} Left`} value={loading ? '...' : Number(summary.left || 0).toLocaleString()} />
        </section>

        <div className="mt-8">
          <button
            type="button"
            onClick={openModal}
            className="h-10 px-5 rounded bg-[#B00000] text-white text-[13px] font-medium shadow-sm hover:bg-[#920000]"
          >
            {buttonLabel}
          </button>
        </div>

        {open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-[520px] rounded-lg bg-white shadow-2xl border border-gray-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-[16px] font-semibold text-gray-900">{modalTitle}</h2>
                <button type="button" onClick={closeModal} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField label={`${creditLabel} Credits`}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.creditsPurchased}
                      onChange={(e) => setForm((prev) => ({ ...prev, creditsPurchased: e.target.value }))}
                      className="h-10 w-full rounded border border-gray-300 px-3 text-[13px] text-gray-700 outline-none"
                    />
                  </ModalField>
                  <ModalField label="Rate Per Credit">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.ratePerCredit}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        ratePerCredit: e.target.value,
                        amountPaid: prev.amountPaid === '' ? '' : String(Number(e.target.value || 0) * Number(prev.creditsPurchased || 0)),
                      }))}
                      className="h-10 w-full rounded border border-gray-300 px-3 text-[13px] text-gray-700 outline-none"
                    />
                  </ModalField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField label="Amount Paid">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.amountPaid}
                      onChange={(e) => setForm((prev) => ({ ...prev, amountPaid: e.target.value }))}
                      className="h-10 w-full rounded border border-gray-300 px-3 text-[13px] text-gray-700 outline-none"
                    />
                  </ModalField>
                  <ModalField label="Purchase Date & Time">
                    <input
                      type="datetime-local"
                      value={form.purchasedAt}
                      onChange={(e) => setForm((prev) => ({ ...prev, purchasedAt: e.target.value }))}
                      className="h-10 w-full rounded border border-gray-300 px-3 text-[13px] text-gray-700 outline-none"
                    />
                  </ModalField>
                </div>

                <ModalField label="Remarks">
                  <textarea
                    rows="3"
                    value={form.remarks}
                    onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-[13px] text-gray-700 outline-none resize-none"
                    placeholder="Optional notes"
                  />
                </ModalField>

                <div className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-[12.5px] text-blue-800">
                  Computed amount: {Number(computedAmount || 0).toFixed(2)}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-9 px-4 rounded border border-gray-300 text-[13px] text-gray-700 hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-9 px-4 rounded bg-[#B00000] text-white text-[13px] font-medium hover:bg-[#920000] disabled:opacity-60"
                >
                  {saving ? 'Saving...' : buttonLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
}
