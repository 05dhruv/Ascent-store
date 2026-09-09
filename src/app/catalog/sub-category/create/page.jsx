'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SearchableSelect from '@/components/SearchableSelect';
import { fetchAllCatalogProducts } from '@/lib/productPagination';

export default function CreateSubCategoryPage() {
  const router = useRouter();

  const [step, setStep]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState({});
  const [toast, setToast]         = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts]   = useState([]);
  const [prodSearch, setProdSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const [form, setForm] = useState({
    name:          '',
    category_id:   '',
    sort_sequence: 0,
    description:   '',
    is_active:     true,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch('/api/catalog/categories?pageSize=200')
      .then(r => r.json())
      .then(json => { if (json.success) setCategories(json.data.records); });
  }, []);

  useEffect(() => {
    fetchAllCatalogProducts({
      params: { search: prodSearch },
      pageSize: 500,
    })
      .then((records) => setProducts(records))
      .catch(() => setProducts([]));
  }, [prodSearch]);

  const set = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: null }));
  };

  const validateStep1 = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Sub Category Name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => { if (validateStep1()) setStep(2); };
  const handleBack = () => { if (step === 1) router.push('/catalog/sub-category'); else setStep(1); };

  const toggleProduct = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    const visible = filteredProducts.map(p => p.id);
    const allSelected = visible.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visible.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...visible])]);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(prodSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!validateStep1()) { setStep(1); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/catalog/sub-categories', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, product_ids: selectedIds }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Sub Category created successfully!');
        setTimeout(() => router.push('/catalog/sub-category'), 1000);
      } else {
        showToast(json.message || 'Failed to create', 'error');
        if (json.errors) setErrors(json.errors);
      }
    } catch { showToast('Something went wrong', 'error'); }
    finally { setLoading(false); }
  };

  const visibleAll = filteredProducts.every(p => selectedIds.includes(p.id));

  return (
    <div className="font-sans text-sm">

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium
          ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Link href="/catalog/category" className="text-blue-500 hover:underline">Catalog</Link>
        <span>›</span>
        <Link href="/catalog/category" className="text-blue-500 hover:underline">Product Classification</Link>
        <span>›</span>
        <Link href="/catalog/sub-category" className="text-blue-500 hover:underline">Sub Category</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">Create Sub Category</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {step === 1 ? 'Create Sub Category' : 'Select Applicable Products'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Step {step} of 2</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleBack}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Back
          </button>
          {step === 1 ? (
            <button onClick={handleNext}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
              Next
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60">
              {loading ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {s}
            </div>
            {s < 2 && <div className={`h-0.5 w-12 rounded ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`}/>}
          </div>
        ))}
      </div>

      {/* Step 1 — Sub Category Info */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-bold text-blue-600 mb-6">Sub Category Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sub Category Name <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Enter Sub Category Name"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500
                  ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}/>
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Category</label>
              <SearchableSelect value={form.category_id} onChange={(value) => set('category_id', value)} placeholder="Select Category" searchPlaceholder="Search category..." options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Sequence</label>
              <input type="number" value={form.sort_sequence}
                onChange={e => set('sort_sequence', Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" min={0}/>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sub Category Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Add a descriptive text for the sub category."
              rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"/>
          </div>
        </div>
      )}

      {/* Step 2 — Select Products */}
      {step === 2 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Brand</label>
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Select Brand</option>
              </select>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10.5 10.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <input type="text" placeholder="Search" value={prodSearch}
                onChange={e => setProdSearch(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"/>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <p className="text-xs text-blue-600 font-medium mb-3">{selectedIds.length} product(s) selected</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-3 px-3 text-left w-10">
                    <input type="checkbox" checked={visibleAll && filteredProducts.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                  </th>
                  {['Product ID','Product Name','Unit','Barcode','SKUS','Brand','Category','M.R.P'].map(h => (
                    <th key={h} className="py-3 px-3 text-left font-semibold text-gray-700 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-gray-400">No products found</td></tr>
                ) : filteredProducts.map((p, i) => (
                  <tr key={p.id} className={`border-b border-gray-100 hover:bg-gray-50 transition
                    ${selectedIds.includes(p.id) ? 'bg-blue-50' : ''}`}>
                    <td className="py-2.5 px-3">
                      <input type="checkbox" checked={selectedIds.includes(p.id)}
                        onChange={() => toggleProduct(p.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">{i + 1}</td>
                    <td className="py-2.5 px-3 font-medium text-gray-800">{p.name}</td>
                    <td className="py-2.5 px-3 text-gray-500">{p.unit || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500">{p.barcode || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500">{p.skus || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500">{p.brand_name || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500">{p.category_name || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-700 font-medium">
                      {p.mrp ? `₹ ${parseFloat(p.mrp).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
