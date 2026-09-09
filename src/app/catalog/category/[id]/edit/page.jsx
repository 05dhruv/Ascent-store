'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import SearchableSelect from '@/components/SearchableSelect';

export default function EditCategoryPage() {
  const router   = useRouter();
  const { id }   = useParams();
  const fileRef  = useRef();

  const [step, setStep]               = useState(1);
  const [loading, setLoading]         = useState(false);
  const [fetching, setFetching]       = useState(true);
  const [errors, setErrors]           = useState({});
  const [toast, setToast]             = useState(null);
  const [departments, setDepartments] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);

  const [form, setForm] = useState({
    name:          '',
    sort_sequence: 0,
    department_id: '',
    description:   '',
    image_url:     '',
    category_type: 'OTHER',
    is_active:     true,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load existing category
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/catalog/categories/${id}`).then(r => r.json()),
      fetch('/api/catalog/departments?pageSize=100').then(r => r.json()),
    ]).then(([catJson, deptJson]) => {
      if (catJson.success) {
        const c = catJson.data;
        setForm({
          name:          c.name          || '',
          sort_sequence: c.sort_sequence ?? 0,
          department_id: c.department_id || '',
          description:   c.description  || '',
          image_url:     c.image_url    || '',
          category_type: c.category_type || 'OTHER',
          is_active:     c.is_active    ?? true,
        });
        if (c.image_url) setImagePreview(c.image_url);
      }
      if (deptJson.success) setDepartments(deptJson.data.records);
    }).catch(() => showToast('Failed to load data', 'error'))
      .finally(() => setFetching(false));
  }, [id]);

  const set = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: null }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    set('image_url', file.name); // replace with real upload URL
  };

  const validateStep1 = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Category Name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => { if (validateStep1()) setStep(2); };
  const handleBack = () => { if (step === 1) router.push('/catalog/category'); else setStep(1); };

  const handleSubmit = async () => {
    if (!validateStep1()) { setStep(1); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/catalog/categories/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Category updated successfully!');
        setTimeout(() => router.push('/catalog/category'), 1000);
      } else {
        showToast(json.message || 'Update failed', 'error');
        if (json.errors) setErrors(json.errors);
      }
    } catch { showToast('Something went wrong', 'error'); }
    finally { setLoading(false); }
  };

  if (fetching) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-sm">

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium
          ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="px-6 pt-5 pb-1">
        <nav className="flex items-center gap-1.5 text-xs text-gray-500">
          <Link href="/catalog" className="text-blue-500 hover:underline">Catalog</Link>
          <span>›</span>
          <Link href="/catalog/category" className="text-blue-500 hover:underline">Product Classification</Link>
          <span>›</span>
          <Link href="/catalog/category" className="text-blue-500 hover:underline">Category</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium">Edit Category</span>
        </nav>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Category</h1>
          <p className="text-xs text-gray-500 mt-0.5">Step {step} of 2</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleBack}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Back
          </button>
          {step === 1 ? (
            <button onClick={handleNext}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
              Next
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {loading ? 'Saving...' : 'Update Category'}
            </button>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="px-6 mb-4 flex items-center gap-2">
        {[1,2].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
            {s < 2 && <div className={`h-0.5 w-12 rounded ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`}/>}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="mx-6 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-bold text-blue-600 mb-6">Category Information</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Upload Category Image</p>
              <p className="text-xs text-gray-400 mb-3">This image will be displayed in the app and eStore</p>
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl w-48 h-48 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition overflow-hidden">
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover"/>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
                      <rect x="4" y="4" width="32" height="32" rx="6" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M20 13v14M13 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span className="text-xs">Upload Image</span>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange}/>
            </div>

            <div className="lg:col-span-2 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Enter Category Name"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500
                      ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}/>
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Sequence</label>
                  <input type="number" value={form.sort_sequence}
                    onChange={e => set('sort_sequence', Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" min={0}/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <SearchableSelect value={form.department_id} onChange={(value) => set('department_id', value)} placeholder="Default Department" searchPlaceholder="Search department..." options={departments.map((d) => ({ value: d.id, label: d.name }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Add a descriptive text for the category."
                  rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="mx-6 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-bold text-blue-600 mb-6">Additional Settings</h2>
          <div className="max-w-lg space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category Type</label>
              <div className="relative">
                <select value={form.category_type} onChange={e => set('category_type', e.target.value)}
                  className="w-full appearance-none border border-gray-300 rounded-lg px-3 py-2.5 pr-9 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  {['OTHER','FOOD','BEVERAGE','ELECTRONICS','CLOTHING'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <div className="flex gap-3">
                {[true, false].map(val => (
                  <button key={String(val)} onClick={() => set('is_active', val)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition
                      ${form.is_active === val
                        ? val ? 'bg-green-50 border-green-400 text-green-700' : 'bg-red-50 border-red-400 text-red-600'
                        : 'bg-white border-gray-300 text-gray-500'}`}>
                    {val ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-gray-100 rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">Review</p>
              <div className="space-y-2 text-sm">
                {[
                  ['Name', form.name || '—'],
                  ['Sort Seq.', form.sort_sequence],
                  ['Department', departments.find(d => d.id == form.department_id)?.name || 'Default Department'],
                  ['Type', form.category_type],
                  ['Status', form.is_active ? 'Active' : 'Inactive'],
                  ['Description', form.description || '—'],
                ].map(([label, val]) => (
                  <div key={label} className="flex gap-2">
                    <span className="text-gray-400 w-28 shrink-0">{label}</span>
                    <span className="text-gray-700 font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
