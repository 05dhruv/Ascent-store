'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

export default function EditIncomeHeadPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id;

  const [form, setForm] = useState({ name: '', code: '', is_active: true });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetch(`/api/catalog/income-heads/${id}`).then(r => r.json()).then(json => { if (json.success) setForm({ name: json.data.name || '', code: json.data.code || '', is_active: json.data.is_active }); }).catch(() => {});
  }, [id]);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const set = (k, v) => { setForm(prev => ({ ...prev, [k]: v })); if (errors[k]) setErrors(prev => ({ ...prev, [k]: null })); };
  const validate = () => { const next = {}; if (!form.name.trim()) next.name = 'Name is required'; setErrors(next); return Object.keys(next).length === 0; };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/income-heads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json();
      if (json.success) { showToast('Income Head updated'); setTimeout(() => router.push('/catalog/income-head'), 800); }
      else { showToast(json.message || 'Failed to update', 'error'); if (json.errors) setErrors(json.errors); }
    } catch { showToast('Something went wrong', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-sm">
      {toast && (<div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-white ${toast.type==='success'?'bg-green-500':'bg-red-500'}`}>{toast.msg}</div>)}

      <div className="px-6 pt-5 pb-1">
        <nav className="flex items-center gap-1.5 text-xs text-gray-500">
          <Link href="/catalog" className="text-blue-500 hover:underline">Catalog</Link>
          <span>›</span>
          <Link href="/catalog/category" className="text-blue-500 hover:underline">Product Classification</Link>
          <span>›</span>
          <Link href="/catalog/income-head" className="text-blue-500 hover:underline">Income Head</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium">Edit Income Head</span>
        </nav>
      </div>

      <div className="flex items-start justify-between px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Income Head</h1>
          <p className="text-xs text-gray-500 mt-0.5">Modify income head details.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/catalog/income-head')} className="px-4 py-2 border rounded bg-white">Back</button>
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">{loading?'Saving...':'Save'}</button>
        </div>
      </div>

      <div className="mx-6 bg-white border rounded-xl shadow-sm p-6">
        <h2 className="text-base font-bold text-blue-600 mb-4">Basic Information</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className={`w-full border rounded px-3 py-2 ${errors.name?'border-red-400':''}`} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input value={form.code} onChange={e => set('code', e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <div className="flex gap-2">
              <button onClick={() => set('is_active', true)} className={`px-3 py-2 rounded ${form.is_active?'bg-green-50 border border-green-300':''}`}>Active</button>
              <button onClick={() => set('is_active', false)} className={`px-3 py-2 rounded ${!form.is_active?'bg-red-50 border border-red-300':''}`}>Inactive</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
