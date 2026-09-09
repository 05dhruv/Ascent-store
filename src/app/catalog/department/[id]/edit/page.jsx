'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

export default function EditDepartmentPage() {
  const router = useRouter();
  const params = useParams();
  const fileRef = useRef();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [searchCategories, setSearchCategories] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);
  const dropdownRef = useRef();
  const [showDropdown, setShowDropdown] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    image_url: '',
    description: '',
    is_active: true,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      setLoadingData(true);
      setLoadingCategories(true);
      try {
        const [deptRes, catRes] = await Promise.all([
          fetch(`/api/catalog/departments/${params.id}`),
          fetch('/api/catalog/categories?pageSize=200'),
        ]);
        const deptJson = await deptRes.json();
        const catJson = await catRes.json();

        if (catJson.success) setCategories(catJson.data.records);
        if (deptJson.success) {
          const dept = deptJson.data;
          setForm({
            name: dept.name || '',
            code: dept.code || '',
            image_url: dept.image_url || '',
            description: dept.description || '',
            is_active: dept.is_active ?? true,
          });
          if (dept.image_url) setImagePreview(dept.image_url);
          // set selected categories based on department_id in categories
          if (catJson.success) {
            const selected = (catJson.data.records || []).filter(c => c.department_id == params.id).map(c => c.id);
            setSelectedCategories(selected);
          }
        } else {
          showToast(deptJson.message || 'Failed to load department', 'error');
        }
      } catch (err) {
        console.error('Error loading data:', err);
        showToast('Something went wrong', 'error');
      } finally {
        setLoadingCategories(false);
        setLoadingData(false);
      }
    })();
  }, [params.id]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const loadDepartmentData = async () => {
    setLoadingData(true);
    try {
      const res = await fetch(`/api/catalog/departments/${params.id}`);
      const json = await res.json();
      if (json.success) {
        const dept = json.data;
        setForm({
          name: dept.name || '',
          code: dept.code || '',
          image_url: dept.image_url || '',
          description: dept.description || '',
          is_active: dept.is_active ?? true,
        });
        if (dept.image_url) {
          setImagePreview(dept.image_url);
        }
      } else {
        showToast(json.message || 'Failed to load department', 'error');
      }
    } catch (err) {
      console.error('Error loading department:', err);
      showToast('Something went wrong', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  const set = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: null }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    set('image_url', url);
  };

  const validateStep1 = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Department name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => { if (validateStep1()) setStep(2); };
  const handleBack = () => { if (step === 1) router.push('/catalog/department'); else setStep(1); };

  const handleSubmit = async () => {
    if (!validateStep1()) { setStep(1); return; }
    setLoading(true);
    try {
      const payload = { ...form, category_ids: selectedCategories };
      const res = await fetch(`/api/catalog/departments/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Department updated successfully!');
        setTimeout(() => router.push('/catalog/department'), 1000);
      } else {
        showToast(json.message || 'Failed to update department', 'error');
        if (json.errors) setErrors(json.errors);
      }
    } catch { showToast('Something went wrong', 'error'); }
    finally { setLoading(false); }
  };

  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans text-sm">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium
          ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Link href="/catalog" className="text-blue-500 hover:underline">Catalog</Link>
        <span>›</span>
        <Link href="/catalog/category" className="text-blue-500 hover:underline">Product Classification</Link>
        <span>›</span>
        <Link href="/catalog/department" className="text-blue-500 hover:underline">Department</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">Edit Department</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Department</h1>
          <p className="text-xs text-gray-500 mt-0.5">Step {step} of 2 <Link href="#" className="text-blue-500 hover:underline">Need Help?</Link></p>
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
              {loading ? 'Saving...' : 'Update Department'}
            </button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition
              ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {s}
            </div>
            {s < 2 && <div className={`h-0.5 w-12 rounded ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`}/>}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-bold text-blue-600 mb-6">Department Info</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Upload Department Image</p>
              <p className="text-xs text-gray-400 mb-3">Upload image for department (Max-size: 1.0 Mb)</p>
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl w-48 h-48 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition overflow-hidden">
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
              {imagePreview && (
                <button onClick={() => { setImagePreview(null); set('image_url', ''); }}
                  className="mt-2 text-xs text-red-500 hover:underline">Remove image</button>
              )}
            </div>

            <div className="lg:col-span-2 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department Name <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Enter Department Name"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition
                      ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}/>
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                  <input type="text" value={form.code} onChange={e => set('code', e.target.value)}
                    placeholder="Enter Code"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <div className="relative">
                  <div>
                    <button type="button" onClick={() => setShowDropdown(s => !s)}
                      className="w-full text-left border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white flex items-center justify-between">
                      <span className="text-sm text-gray-700">{selectedCategories.length ? `${selectedCategories.length} selected` : 'Select categories'}</span>
                      <svg className="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>

                    {showDropdown && (
                      <div ref={dropdownRef} className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                          <input value={searchCategories} onChange={e => setSearchCategories(e.target.value)}
                            placeholder="Search categories" className="w-full border border-gray-100 rounded px-2 py-1 text-sm focus:outline-none text-gray-700 placeholder-gray-400" />
                        <div className="mt-2 max-h-48 overflow-y-auto">
                          {loadingCategories ? (
                            <div className="text-xs text-gray-500">Loading...</div>
                          ) : categories.length === 0 ? (
                            <div className="text-xs text-gray-500">No categories</div>
                          ) : (
                            categories.filter(c => (c.name || '').toLowerCase().includes(searchCategories.toLowerCase()))
                              .map(cat => (
                                <label key={cat.id} className="flex items-center gap-2 text-sm py-1 hover:bg-gray-50 rounded px-1">
                                  <input type="checkbox" className="w-4 h-4" checked={selectedCategories.includes(cat.id)}
                                    onChange={() => {
                                      setSelectedCategories(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]);
                                    }} />
                                  <span className="text-gray-700 select-none">{cat.name}</span>
                                </label>
                              ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Add a descriptive text for the department."
                  rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-bold text-blue-600 mb-6">Additional Settings</h2>
          <div className="max-w-lg space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <div className="flex items-center gap-3">
                <button onClick={() => set('is_active', true)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition
                    ${form.is_active ? 'bg-green-50 border-green-400 text-green-700' : 'bg-white border-gray-300 text-gray-500'}`}>
                  Active
                </button>
                <button onClick={() => set('is_active', false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition
                    ${!form.is_active ? 'bg-red-50 border-red-400 text-red-600' : 'bg-white border-gray-300 text-gray-500'}`}>
                  Inactive
                </button>
              </div>
            </div>

            <div className="border border-gray-100 rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">Review</p>
              <div className="space-y-2 text-sm">
                {[
                  ['Name', form.name || '—'],
                  ['Code', form.code || '—'],
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
