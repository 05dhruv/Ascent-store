'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateTaxStep1() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', rate: 0, tax_type: 'GST', hsn_code: '', is_active: true, parent_tax_id: '', store_id: '' });
  const [taxes, setTaxes] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [taxRes, storeRes] = await Promise.all([
          fetch('/api/catalog/taxes?pageSize=200'),
          fetch('/api/stores'),
        ]);
        const taxJson = await taxRes.json();
        const storeJson = await storeRes.json();
        if (taxJson.success) setTaxes(taxJson.data?.records || []);
        if (Array.isArray(storeJson)) {
          setStores(storeJson);
        } else if (storeJson.success) {
          setStores(storeJson.data?.records || []);
        } else if (storeJson.data?.records) {
          setStores(storeJson.data.records);
        }
      } catch (err) {
        console.error('tax dropdown load failed', err);
      }
    })();
  }, []);

  const onNext = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/catalog/taxes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Create failed');
      const id = json.data?.id;
      if (!id) throw new Error('Missing tax id');
      router.push(`/catalog/taxes/create/step2?taxId=${id}`);
    } catch (err) {
      setError(err?.message || String(err));
    } finally { setLoading(false); }
  };

  return (
    <div className="p-6">
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <a href="/catalog" className="text-blue-500 hover:underline">Catalog</a>
        <span>›</span>
        <a href="/catalog/taxes" className="text-blue-500 hover:underline">Taxes</a>
        <span>›</span>
        <span className="text-gray-700 font-medium">Create Tax</span>
      </nav>

      <div className="bg-white border rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Create Taxes</h2>
        <p className="text-xs text-gray-500 mb-4">Step 1 of 2</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Tax Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Tax Percentage *</label>
            <input type="number" value={form.rate} onChange={e => set('rate', Number(e.target.value || 0))} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Parent Tax</label>
            <select value={form.parent_tax_id} onChange={e => set('parent_tax_id', e.target.value)} className="w-full rounded-lg border px-3 py-2 bg-white">
              <option value="">Select parent tax</option>
              {taxes.map((tax) => (
                <option key={tax.id} value={tax.id}>{tax.name} ({tax.rate}%)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Store(s)</label>
            <select value={form.store_id} onChange={e => set('store_id', e.target.value)} className="w-full rounded-lg border px-3 py-2 bg-white">
              <option value="">Select store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 mb-1">Name on Bill</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="w-full rounded-lg border px-3 py-2" />
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={form.is_igst} onChange={e => set('is_igst', e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-gray-600">is IGST?</span>
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => window.history.back()} className="px-4 py-2 border rounded">Back</button>
          <button onClick={onNext} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">{loading ? 'Saving...' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
