'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const initialForm = {
  name: '',
  charge_applied_on: 'Product',
  apply_on_order_delivery: false,
  charge_type: 'Percentage',
  amount: '',
  max_order_value: '',
  tax_id: '',
  store_id: '',
  apply_only_online_orders: false,
  order_type: '',
  channel: '',
  department_id: '',
  is_active: true,
};

function PageShell({ children }) {
  return <div className="min-h-screen bg-[#f7f8fc] p-6 text-sm text-gray-900">{children}</div>;
}

export default function CreateChargePage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [taxes, setTaxes] = useState([]);
  const [stores, setStores] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    (async () => {
      try {
        const [taxRes, storeRes, deptRes] = await Promise.all([
          fetch('/api/catalog/taxes?pageSize=200'),
          fetch('/api/stores'),
          fetch('/api/catalog/departments?pageSize=200'),
        ]);
        const taxJson = await taxRes.json();
        const storeJson = await storeRes.json();
        const deptJson = await deptRes.json();
        if (taxJson.success) setTaxes(taxJson.data?.records || []);
        if (Array.isArray(storeJson)) setStores(storeJson);
        if (deptJson.success) setDepartments(deptJson.data?.records || []);
      } catch (err) {
        console.error('charge lookup load failed', err);
      }
    })();
  }, []);

  const onNext = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        amount: form.amount === '' ? 0 : Number(form.amount),
        max_order_value: form.max_order_value === '' ? 0 : Number(form.max_order_value),
        tax_id: form.tax_id || null,
        store_id: form.store_id || null,
        department_id: form.department_id || null,
      };

      const res = await fetch('/api/catalog/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create charge');
      router.push('/catalog/charges');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/catalog" className="text-blue-500 hover:underline">Catalog</Link>
        <span>›</span>
        <Link href="/catalog/taxes" className="text-blue-500 hover:underline">Taxes & Charges</Link>
        <span>›</span>
        <Link href="/catalog/charges" className="text-blue-500 hover:underline">Charges</Link>
        <span>›</span>
        <span className="font-medium text-gray-700">Create Charge</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">Create Charge</h1>
          <p className="mt-1 text-sm text-gray-500">Step 1 of 2</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/catalog/charges')} className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm text-blue-600 hover:bg-blue-50">Back</button>
          <button onClick={onNext} disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">{loading ? 'Saving...' : 'Next'}</button>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 text-[15px] font-semibold text-blue-600">Charge Information</div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Charge Name *</label>
            <input value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="New Charge" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Charge Applied On</label>
            <select value={form.charge_applied_on} onChange={(event) => set('charge_applied_on', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="Product">Product</option>
              <option value="Service">Service</option>
              <option value="Both">Both</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Apply on order delivery?</label>
            <div className="flex items-center gap-6 rounded-lg border border-gray-200 px-3 py-2.5">
              <label className="flex items-center gap-2"><input type="radio" checked={form.apply_on_order_delivery === true} onChange={() => set('apply_on_order_delivery', true)} /> Yes</label>
              <label className="flex items-center gap-2"><input type="radio" checked={form.apply_on_order_delivery === false} onChange={() => set('apply_on_order_delivery', false)} /> No</label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Maximum Order Value *</label>
            <input type="number" value={form.max_order_value} onChange={(event) => set('max_order_value', event.target.value)} placeholder="10" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Charge Type *</label>
            <select value={form.charge_type} onChange={(event) => set('charge_type', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="Percentage">Percentage</option>
              <option value="FIXED">Fixed</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Charge Value *</label>
            <input type="number" value={form.amount} onChange={(event) => set('amount', event.target.value)} placeholder="10" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Taxes</label>
            <select value={form.tax_id} onChange={(event) => set('tax_id', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">select</option>
              {taxes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Store(s)</label>
            <select value={form.store_id} onChange={(event) => set('store_id', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">select</option>
              {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Apply Only On Online Orders</label>
            <div className="flex items-center gap-6 rounded-lg border border-gray-200 px-3 py-2.5">
              <label className="flex items-center gap-2"><input type="radio" checked={form.apply_only_online_orders === true} onChange={() => set('apply_only_online_orders', true)} /> Yes</label>
              <label className="flex items-center gap-2"><input type="radio" checked={form.apply_only_online_orders === false} onChange={() => set('apply_only_online_orders', false)} /> No</label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Order Type</label>
            <select value={form.order_type} onChange={(event) => set('order_type', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">select</option>
              <option value="Sale">Sale</option>
              <option value="Return">Return</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Channel</label>
            <select value={form.channel} onChange={(event) => set('channel', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">select</option>
              <option value="POS">POS</option>
              <option value="Online">Online</option>
              <option value="Mobile">Mobile</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
            <select value={form.department_id} onChange={(event) => set('department_id', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">select</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>
    </PageShell>
  );
}