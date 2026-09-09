'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-gray-700 select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
      <span>{label}</span>
    </label>
  );
}

const defaults = {
  loyaltyName: 'Loyalty',
  status: 'Active',
  rewardType: 'Bill Amount',
  purchasePointsRate: 1,
  minimumPurchaseAmount: 0,
  maxPointsPerBill: 0,
  redemptionType: 'Percentage',
  redeemRate: 1,
  minimumRedeemPoints: 0,
  maximumRedeemPoints: 0,
  maximumRedeemPercentage: 100,
  showPointsOnInvoice: true,
  showPointsOnPos: true,
  enableSmsOnEarn: false,
  enableSmsOnRedeem: false,
  registrationPoints: 0,
  birthdayPoints: 0,
  anniversaryPoints: 0,
  pointsValue: 1,
  expiryDays: 365,
};

export default function LoyaltySettingsPage() {
  const [form, setForm] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/customer-loyalty-settings');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load loyalty settings');
        setForm({ ...defaults, ...data });
      } catch (err) {
        console.error(err);
        setMessage(err.message || 'Failed to load loyalty settings');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const sectionCard = (title, children) => (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-[12px] font-semibold text-blue-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/customer-loyalty-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save loyalty settings');
      setForm({ ...defaults, ...data.settings });
      setMessage('Saved successfully');
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'Failed to save loyalty settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-2 flex-wrap">
              <Link href="/customer/dashboard" className="hover:text-blue-600 transition-colors">Customer</Link>
              <i className="ti ti-chevron-right text-[11px] text-gray-400" />
              <span className="text-blue-600 font-medium">Loyalty Settings</span>
            </nav>
            <h1 className="text-[18px] font-semibold text-gray-900">Loyalty Settings</h1>
            <p className="text-[12px] text-gray-500 mt-1">Configure loyalty program settings. <span className="text-blue-600 cursor-pointer hover:underline">Need Help?</span></p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="h-10 px-5 inline-flex items-center justify-center bg-blue-700 text-white rounded text-[13px] font-medium disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-800"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {message ? (
          <div className={`mb-4 rounded border px-4 py-3 text-[12.5px] ${message === 'Saved successfully' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {message}
          </div>
        ) : null}

        {sectionCard('Basic Settings', (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <Field label="Loyalty Name">
              <input
                value={form.loyaltyName}
                onChange={(e) => update('loyaltyName', e.target.value)}
                className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
              />
            </Field>
            <Field label="Loyalty Status">
              <div className="flex items-center gap-5 h-9">
                <label className="flex items-center gap-2 text-[12px] text-gray-700">
                  <input type="radio" name="status" checked={form.status === 'Active'} onChange={() => update('status', 'Active')} />
                  Active
                </label>
                <label className="flex items-center gap-2 text-[12px] text-gray-700">
                  <input type="radio" name="status" checked={form.status === 'Inactive'} onChange={() => update('status', 'Inactive')} />
                  Inactive
                </label>
              </div>
            </Field>
          </div>
        ))}

        {sectionCard('General Points Settings', (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Field label="Reward Type">
                <div className="flex items-center gap-5 h-9">
                  <label className="flex items-center gap-2 text-[12px] text-gray-700">
                    <input type="radio" name="rewardType" checked={form.rewardType === 'Bill Amount'} onChange={() => update('rewardType', 'Bill Amount')} />
                    Bill Amount
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-gray-700">
                    <input type="radio" name="rewardType" checked={form.rewardType === 'Product'} onChange={() => update('rewardType', 'Product')} />
                    Product
                  </label>
                </div>
              </Field>

              <Field label="Purchase Points Rate">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchasePointsRate}
                  onChange={(e) => update('purchasePointsRate', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>

              <Field label="Minimum Purchase Amount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumPurchaseAmount}
                  onChange={(e) => update('minimumPurchaseAmount', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>
            </div>

            <div className="space-y-4">
              <ToggleRow label="Show loyalty points on invoice" checked={form.showPointsOnInvoice} onChange={(value) => update('showPointsOnInvoice', value)} />
              <ToggleRow label="Show loyalty points on POS" checked={form.showPointsOnPos} onChange={(value) => update('showPointsOnPos', value)} />

              <Field label="Maximum Points Per Bill">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maxPointsPerBill}
                  onChange={(e) => update('maxPointsPerBill', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>

              <Field label="Points Value">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pointsValue}
                  onChange={(e) => update('pointsValue', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>
            </div>
          </div>
        ))}

        {sectionCard('Redemption Points Settings', (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-4">
              <ToggleRow label="Send SMS on points redemption" checked={form.enableSmsOnRedeem} onChange={(value) => update('enableSmsOnRedeem', value)} />

              <Field label="Redemption Type">
                <div className="flex items-center gap-5 h-9">
                  <label className="flex items-center gap-2 text-[12px] text-gray-700">
                    <input type="radio" name="redemptionType" checked={form.redemptionType === 'Percentage'} onChange={() => update('redemptionType', 'Percentage')} />
                    Percentage
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-gray-700">
                    <input type="radio" name="redemptionType" checked={form.redemptionType === 'Fixed'} onChange={() => update('redemptionType', 'Fixed')} />
                    Fixed
                  </label>
                </div>
              </Field>

              <Field label="Redeem Rate">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.redeemRate}
                  onChange={(e) => update('redeemRate', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label="Minimum Redeem Points">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumRedeemPoints}
                  onChange={(e) => update('minimumRedeemPoints', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>

              <Field label="Maximum Redeem Points">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maximumRedeemPoints}
                  onChange={(e) => update('maximumRedeemPoints', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>

              <Field label="Maximum Redeem Percentage">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maximumRedeemPercentage}
                  onChange={(e) => update('maximumRedeemPercentage', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>
            </div>
          </div>
        ))}

        {sectionCard('Display Rules Settings', (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-3">
              <ToggleRow label="Send SMS on points earned" checked={form.enableSmsOnEarn} onChange={(value) => update('enableSmsOnEarn', value)} />
              <ToggleRow label="Send SMS on points redemption" checked={form.enableSmsOnRedeem} onChange={(value) => update('enableSmsOnRedeem', value)} />
              <ToggleRow label="Show points on POS screen" checked={form.showPointsOnPos} onChange={(value) => update('showPointsOnPos', value)} />
            </div>

            <div className="space-y-4">
              <Field label="Loyalty Point Expiry Days">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.expiryDays}
                  onChange={(e) => update('expiryDays', e.target.value)}
                  className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                />
              </Field>
            </div>
          </div>
        ))}

        {sectionCard('Registration Settings', (
          <Field label="Registration Points">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.registrationPoints}
              onChange={(e) => update('registrationPoints', e.target.value)}
              className="h-9 w-full max-w-[420px] border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
            />
          </Field>
        ))}

        {sectionCard('Birthday and Anniversary Settings', (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Birthday Points">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.birthdayPoints}
                onChange={(e) => update('birthdayPoints', e.target.value)}
                className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
              />
            </Field>
            <Field label="Anniversary Points">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.anniversaryPoints}
                onChange={(e) => update('anniversaryPoints', e.target.value)}
                className="h-9 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
              />
            </Field>
          </div>
        ))}
      </div>
    </MainLayout>
  );
}