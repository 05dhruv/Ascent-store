'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import SearchableSelect from '@/components/SearchableSelect';

export default function EditCategoryPage() {
  const router   = useRouter();
  const { id }   = useParams();
  const fileRef  = useRef();

  const [step, setStep]                 = useState(1);
  const [loading, setLoading]           = useState(false);
  const [fetching, setFetching]         = useState(true);
  const [errors, setErrors]             = useState({});
  const [toast, setToast]               = useState(null);
  const [departments, setDepartments]   = useState([]);
  const [categoryTypes, setCategoryTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [mounted, setMounted]           = useState(false);

  // Modals for dynamic category types
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [showManageTypesModal, setShowManageTypesModal] = useState(false);
  const [newTypeName, setNewTypeName]   = useState('');
  const [newTypeCode, setNewTypeCode]   = useState('');
  const [newTypeDesc, setNewTypeDesc]   = useState('');
  const [savingType, setSavingType]     = useState(false);
  const [deletingTypeId, setDeletingTypeId] = useState(null);

  const [form, setForm] = useState({
    name:          '',
    sort_sequence: 0,
    department_id: '',
    description:   '',
    image_url:     '',
    category_type: '',
    is_active:     true,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadCategoryTypes = async () => {
    setLoadingTypes(true);
    try {
      const res = await fetch('/api/settings/category-types?pageSize=100');
      const json = await res.json();
      const records = Array.isArray(json?.data?.records) ? json.data.records : [];
      setCategoryTypes(records);
    } catch (err) {
      console.error('Failed to load category types:', err);
    } finally {
      setLoadingTypes(false);
    }
  };

  // Load existing category and lookups
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/catalog/categories/${id}`).then(r => r.json()),
      fetch('/api/catalog/departments?pageSize=100').then(r => r.json()),
      fetch('/api/settings/category-types?pageSize=100').then(r => r.json()),
    ]).then(([catJson, deptJson, typesJson]) => {
      const types = Array.isArray(typesJson?.data?.records) ? typesJson.data.records : [];
      setCategoryTypes(types);

      if (catJson.success) {
        const c = catJson.data;
        setForm({
          name:          c.name          || '',
          sort_sequence: c.sort_sequence ?? 0,
          department_id: c.department_id || '',
          description:   c.description  || '',
          image_url:     c.image_url    || '',
          category_type: c.category_type || (types[0]?.code || types[0]?.name || 'RAW_MATERIALS'),
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
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    set('image_url', url);
  };

  const validateStep1 = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Category Name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => { if (validateStep1()) setStep(2); };
  const handleBack = () => { if (step === 1) router.push('/catalog/category'); else setStep(1); };

  const handleCreateCategoryType = async (e) => {
    if (e) e.preventDefault();
    if (!newTypeName.trim()) {
      alert('Category type name is required');
      return;
    }

    const code = (newTypeCode.trim() || newTypeName.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')).slice(0, 50);

    setSavingType(true);
    try {
      const res = await fetch('/api/settings/category-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTypeName.trim(),
          code,
          description: newTypeDesc.trim(),
          config: { categoryType: code, label: newTypeName.trim() },
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to create category type');
      }

      await loadCategoryTypes();
      set('category_type', code);
      setNewTypeName('');
      setNewTypeCode('');
      setNewTypeDesc('');
      setShowAddTypeModal(false);
      showToast('Category type created successfully!');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to create category type');
    } finally {
      setSavingType(false);
    }
  };

  const handleDeleteCategoryType = async (typeId) => {
    if (!typeId) return;
    setDeletingTypeId(typeId);
    try {
      const res = await fetch(`/api/settings/category-types?id=${typeId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to delete category type');
      }

      setCategoryTypes((current) => current.filter((item) => item.id !== typeId));
      showToast('Category type deleted');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to delete category type');
    } finally {
      setDeletingTypeId(null);
    }
  };

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
    } catch {
      showToast('Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="inline-flex items-center gap-2 text-gray-500 text-sm">
          <i className="ti ti-loader-2 animate-spin text-[22px] text-blue-600" />
          <span>Loading category details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans text-sm pb-16">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[10000] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-in fade-in duration-150
          ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Link href="/catalog/category" className="text-blue-600 hover:underline">Catalog</Link>
        <span>›</span>
        <Link href="/catalog/category" className="text-blue-600 hover:underline">Product Classification</Link>
        <span>›</span>
        <Link href="/catalog/category" className="text-blue-600 hover:underline">Category</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">Edit Category</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Category</h1>
          <p className="text-xs text-gray-500 mt-0.5">Step {step} of 2</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Back
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60"
            >
              {loading ? 'Updating...' : 'Update Category'}
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
          <h2 className="text-base font-bold text-blue-600 mb-6">Category Information</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Upload Category Image</p>
              <p className="text-xs text-gray-400 mb-3">This image will be displayed in the material catalog</p>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl w-48 h-48 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition overflow-hidden"
              >
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
                <button
                  type="button"
                  onClick={() => { setImagePreview(null); set('image_url', ''); }}
                  className="mt-2 text-xs text-red-500 hover:underline"
                >
                  Remove image
                </button>
              )}
            </div>

            <div className="lg:col-span-2 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="e.g. Structural Steel, Cement, Electrical"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500
                      ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                  />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Sequence</label>
                  <input
                    type="number"
                    value={form.sort_sequence}
                    onChange={e => set('sort_sequence', Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min={0}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <SearchableSelect
                  value={form.department_id}
                  onChange={(value) => set('department_id', value)}
                  placeholder="Default Department"
                  searchPlaceholder="Search department..."
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Description</label>
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Add a descriptive text for the category."
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                />
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Category Type <span className="text-xs text-gray-400 font-normal">(Dynamic from DB)</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddTypeModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    <i className="ti ti-plus text-[12px]" /> + Add Type
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setShowManageTypesModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:underline"
                  >
                    <i className="ti ti-settings text-[12px]" /> Manage
                  </button>
                </div>
              </div>

              <div className="relative">
                <select
                  value={form.category_type}
                  onChange={e => set('category_type', e.target.value)}
                  className="w-full appearance-none border border-gray-300 rounded-lg px-3 py-2.5 pr-9 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
                >
                  {categoryTypes.length === 0 ? (
                    <option value="">{loadingTypes ? 'Loading types...' : 'No category types available'}</option>
                  ) : (
                    categoryTypes.map((t) => {
                      const codeVal = t.code || t.name;
                      return (
                        <option key={t.id || codeVal} value={codeVal}>
                          {t.name} {t.description ? `— ${t.description}` : ''}
                        </option>
                      );
                    })
                  )}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-gray-400">
                Admin can create or delete category types anytime using &quot;+ Add Type&quot; and &quot;Manage&quot;.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <div className="flex gap-3">
                {[true, false].map(val => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => set('is_active', val)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition
                      ${form.is_active === val
                        ? val ? 'bg-green-50 border-green-400 text-green-700' : 'bg-red-50 border-red-400 text-red-600'
                        : 'bg-white border-gray-300 text-gray-500'}`}
                  >
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
                  ['Type', categoryTypes.find(t => (t.code || t.name) === form.category_type)?.name || form.category_type || '—'],
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

      {/* Full-Screen Portal Modal: Add New Category Type */}
      {mounted && showAddTypeModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddTypeModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Add New Category Type</h3>
                <p className="text-xs text-gray-500">Create a dynamic category type in database</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTypeModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
              >
                <i className="ti ti-x text-[16px]" />
              </button>
            </div>

            <form onSubmit={handleCreateCategoryType} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Type Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g. HVAC & Ducting, Timber & Woodwork"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Code / Identifier <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={newTypeCode}
                  onChange={(e) => setNewTypeCode(e.target.value.toUpperCase())}
                  placeholder="e.g. HVAC_DUCTING"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newTypeDesc}
                  onChange={(e) => setNewTypeDesc(e.target.value)}
                  placeholder="Brief details about materials under this type"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTypeModal(false)}
                  disabled={savingType}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingType}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
                >
                  {savingType ? 'Saving...' : 'Add Type'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Full-Screen Portal Modal: Manage Category Types (Delete / View) */}
      {mounted && showManageTypesModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => { if (e.target === e.currentTarget) setShowManageTypesModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-gray-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Manage Category Types</h3>
                <p className="text-xs text-gray-500">View or delete dynamic category types in database</p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageTypesModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
              >
                <i className="ti ti-x text-[16px]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-2">
              {categoryTypes.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400">
                  No category types found. Add your first category type.
                </div>
              ) : (
                categoryTypes.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-slate-50/50 transition"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-gray-900">{t.name}</span>
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-mono text-blue-800">
                          {t.code || t.name}
                        </span>
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{t.description}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={deletingTypeId === t.id}
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete category type "${t.name}"?`)) {
                          handleDeleteCategoryType(t.id);
                        }
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                      title="Delete category type"
                    >
                      <i className="ti ti-trash text-[15px]" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-gray-100 pt-3 flex justify-between items-center mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowManageTypesModal(false);
                  setShowAddTypeModal(true);
                }}
                className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                + Add Another Type
              </button>
              <button
                type="button"
                onClick={() => setShowManageTypesModal(false)}
                className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
