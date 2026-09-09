 'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CreateServicePage() {
  const router = useRouter();
  const fileRef = useRef();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [groups, setGroups] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [incomeHeads, setIncomeHeads] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [stores, setStores] = useState([]);
  const [subCategories, setSubCategories] = useState([]);

  const [form, setForm] = useState({
    name: '',
    service_group_id: null,
    service_department_id: null,
    income_head_id: null,
    price: 0,
    duration_minutes: 0,
    hsn_code: '',
    sku: '',
    description: '',
    is_active: true,
    show_in_receipt: true,
    tax_id: null,
    image_url: '',
    metadata: {},
    available_for: '',
    sub_category_id: null,
    dynamic_pricing: false,
    variable_pricing: false,
    includes_tax: false,
    barcode: '',
    extra_time_minutes: 0,
    manage_inventory: false,
    security_amount: 0,
    reclaim_type: 'Percentage',
    reclaim_value: 0,
    storePrices: [],
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => { fetchOptions(); }, []);

  const fetchOptions = async () => {
    try {
      const [gRes, dRes, ihRes, tRes] = await Promise.all([
        fetch('/api/catalog/service-groups?pageSize=200'),
        fetch('/api/catalog/service-departments?pageSize=200'),
        fetch('/api/catalog/income-heads?pageSize=200'),
        fetch('/api/catalog/taxes?pageSize=200'),
      ]);
      const [gJson, dJson, ihJson, tJson] = await Promise.all([gRes.json(), dRes.json(), ihRes.json(), tRes.json()]);
      if (gJson.success) setGroups(gJson.data.records || []);
      if (dJson.success) setDepartments(dJson.data.records || []);
      if (ihJson.success) setIncomeHeads(ihJson.data.records || []);
      if (tJson.success) setTaxes(tJson.data.records || []);
      // fetch stores and sub-categories
      try {
        const [storesRes, subCatRes] = await Promise.all([fetch('/api/stores'), fetch('/api/catalog/sub-categories?pageSize=200')]);
        const storesJson = await storesRes.json();
        const subCatJson = await subCatRes.json();
        setStores(Array.isArray(storesJson) ? storesJson : (storesJson.data?.records || []));
        setSubCategories(subCatJson.data?.records || []);
      } catch (err) {
        // ignore
      }
    } catch (err) {
      // ignore
    }
  };

  const set = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: null }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      setImagePreview(data);
      set('image_url', data);
    };
    reader.readAsDataURL(file);
  };

  const hhmmToMinutes = (hhmm) => {
    if (!hhmm) return 0;
    const [hh, mm] = String(hhmm).split(':').map((v) => Number(v || 0));
    return (Number(hh) || 0) * 60 + (Number(mm) || 0);
  };

  const minutesToHHMM = (mins) => {
    const m = Number(mins) || 0;
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      // prepare payload with transformed fields
      const payload = { ...form };
      // ensure durations converted
      payload.duration_minutes = Number(form.duration_minutes) || 0;
      payload.extra_time_minutes = Number(form.extra_time_minutes) || 0;

      // attach storePrices from UI
      payload.storePrices = form.storePrices || [];

      const res = await fetch('/api/catalog/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Service created successfully');
        setTimeout(() => router.push('/catalog/services'), 900);
      } else {
        showToast(json.message || 'Failed to create service', 'error');
        if (json.errors) setErrors(json.errors);
      }
    } catch (err) {
      showToast('Network error', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="font-sans text-sm">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Link href="/catalog" className="text-blue-500 hover:underline">Catalog</Link>
        <span>›</span>
        <Link href="/catalog/products" className="text-blue-500 hover:underline">Product</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">Create Service</span>
      </nav>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Create Service</h1>
          <p className="text-xs text-gray-500 mt-0.5">Add a new service to your catalog</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/catalog/services')}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">Back</button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60">{loading ? 'Saving...' : 'Save Service'}</button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Upload Picture</p>
            <p className="text-xs text-gray-400 mb-3">Upload an image for the service (optional)</p>
            <div onClick={() => fileRef.current?.click()} className="border border-gray-200 rounded-lg w-48 h-36 flex items-center justify-center cursor-pointer bg-gray-50">
              {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover"/> : <span className="text-gray-400">Click to upload</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange}/>
            {imagePreview && <button onClick={() => { setImagePreview(null); set('image_url', ''); }} className="mt-2 text-xs text-red-500">Remove image</button>}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Name <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="Enter service name" className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${errors.name ? 'border-red-400' : 'border-gray-300'}`}/>
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Group</label>
                <select value={form.service_group_id || ''} onChange={e => set('service_group_id', e.target.value || null)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
                  <option value="">Select group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Income Head</label>
                <select value={form.income_head_id || ''} onChange={e => set('income_head_id', e.target.value || null)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
                  <option value="">Select income head</option>
                  {incomeHeads.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select value={form.service_department_id || ''} onChange={e => set('service_department_id', e.target.value || null)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
                  <option value="">Select department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                <input type="number" value={form.price} onChange={e => set('price', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HSN/SAC Code</label>
            <input type="text" value={form.hsn_code} onChange={e => set('hsn_code', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <input type="text" value={form.sku} onChange={e => set('sku', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
            <input type="number" value={form.duration_minutes} onChange={e => set('duration_minutes', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.show_in_receipt} onChange={e => set('show_in_receipt', e.target.checked)} className="w-4 h-4"/>
            <span className="text-sm text-gray-600">Show in receipt</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4"/>
            <span className="text-sm text-gray-600">Active</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Available For</label>
            <select value={form.available_for} onChange={e => set('available_for', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
              <option value="">Select...</option>
              <option value="both">Both</option>
              <option value="online">Online</option>
              <option value="store">In Store</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sub-Category</label>
            <select value={form.sub_category_id || ''} onChange={e => set('sub_category_id', e.target.value || null)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
              <option value="">Select Sub-Category</option>
              {subCategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax</label>
            <select value={form.tax_id || ''} onChange={e => set('tax_id', e.target.value || null)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
              <option value="">select</option>
              {taxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={form.includes_tax} onChange={e => set('includes_tax', e.target.checked)} className="w-4 h-4"/>
              <span className="text-sm text-gray-600">Includes Tax?</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enable Dynamic Pricing</label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.dynamic_pricing} onChange={e => set('dynamic_pricing', e.target.checked)} className="w-4 h-4"/>
              <span className="text-sm text-gray-600">Check this for enabling dynamic pricing</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Allow Variable Pricing</label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.variable_pricing} onChange={e => set('variable_pricing', e.target.checked)} className="w-4 h-4"/>
              <span className="text-sm text-gray-600">Allow product for variable pricing</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (HH:MM)</label>
            <input type="text" value={minutesToHHMM(form.duration_minutes)} onChange={e => set('duration_minutes', hhmmToMinutes(e.target.value))} placeholder="00:30" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
            <input type="text" value={form.barcode} onChange={e => set('barcode', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Extra Time Duration (HH:MM)</label>
            <input type="text" value={minutesToHHMM(form.extra_time_minutes)} onChange={e => set('extra_time_minutes', hhmmToMinutes(e.target.value))} placeholder="00:00" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Manage Inventory</label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.manage_inventory} onChange={e => set('manage_inventory', e.target.checked)} className="w-4 h-4"/>
              <span className="text-sm text-gray-600">Define inventory management for this service</span>
            </label>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Store Price</h3>
          <p className="text-xs text-gray-400 mb-3">Change price for specific store.</p>
          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600 border-b border-gray-100">
                  <th className="px-3 py-2">S. No.</th>
                  <th className="px-3 py-2">Store Name</th>
                  <th className="px-3 py-2">M.R.P</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s, idx) => (
                  <tr key={s.id} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-700">{idx+1}</td>
                    <td className="px-3 py-2 text-gray-700">{s.name}</td>
                    <td className="px-3 py-2">
                      <input type="number" value={(form.storePrices.find(sp => String(sp.store_id) === String(s.id))?.price) ?? ''} onChange={e => {
                        const price = Number(e.target.value) || 0;
                        setForm(prev => {
                          const arr = Array.isArray(prev.storePrices) ? [...prev.storePrices] : [];
                          const existing = arr.find(x => String(x.store_id) === String(s.id));
                          if (existing) existing.price = price; else arr.push({ store_id: s.id, price });
                          return { ...prev, storePrices: arr };
                        });
                      }} className="w-28 border border-slate-200 rounded px-2 py-1 text-sm bg-white"/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Security Amount</label>
            <input type="number" value={form.security_amount} onChange={e => set('security_amount', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reclaim Type</label>
            <select value={form.reclaim_type} onChange={e => set('reclaim_type', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
              <option value="Percentage">Percentage</option>
              <option value="Fixed">Fixed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reclaim Value</label>
            <input type="number" value={form.reclaim_value} onChange={e => set('reclaim_value', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"/>
          </div>
        </div>

      </div>
    </div>
  );
}
