'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CreateServiceGroupPage() {
  const router = useRouter();
  const fileRef = useRef();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [services, setServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [searchServices, setSearchServices] = useState('');
  const [loadingServices, setLoadingServices] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    sort_sequence: 0,
    image_url: '',
    description: '',
    is_active: true,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      const res = await fetch('/api/catalog/services?pageSize=100');
      const json = await res.json();
      if (json.success) setServices(json.data.records);
    } catch (err) {
      console.error('Error fetching services:', err);
    } finally {
      setLoadingServices(false);
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
    if (!form.name.trim()) errs.name = 'Service Group name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => { if (validateStep1()) setStep(2); };
  const handleBack = () => { if (step === 1) router.push('/catalog/service-group'); else setStep(1); };

  const handleSubmit = async () => {
    if (!validateStep1()) { setStep(1); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/catalog/service-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Service Group created successfully!');
        setTimeout(() => router.push('/catalog/service-group'), 1000);
      } else {
        showToast(json.message || 'Failed to create service group', 'error');
        if (json.errors) setErrors(json.errors);
      }
    } catch { showToast('Something went wrong', 'error'); }
    finally { setLoading(false); }
  };

  const toggleService = (serviceId) => {
    setSelectedServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const filteredServices = services.filter(service =>
    (service.name?.toLowerCase() || '').includes(searchServices.toLowerCase()) ||
    (service.code?.toLowerCase() || '').includes(searchServices.toLowerCase())
  );

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
        <Link href="/catalog/service-group" className="text-blue-500 hover:underline">Service Group</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">Create Service Group</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Create Service Group</h1>
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
              {loading ? 'Saving...' : 'Save Service Group'}
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
          <h2 className="text-base font-bold text-blue-600 mb-6">Service Group Info</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Upload Service Group Image</p>
              <p className="text-xs text-gray-400 mb-3">Upload image for service group (Max-size: 1.0 Mb)</p>
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
                    Service Group Name <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Enter Service Group Name"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Sequence</label>
                <input type="number" value={form.sort_sequence}
                  onChange={e => set('sort_sequence', Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" min={0}/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Group Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Add a descriptive text for the service group."
                  rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-bold text-blue-600 mb-6">Select Applicable Services</h2>
          
          <div className="mb-4">
            <input type="text" value={searchServices} onChange={e => setSearchServices(e.target.value)}
              placeholder="Search"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"/>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 w-10">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300" onChange={e => {
                      if (e.target.checked) {
                        setSelectedServices(filteredServices.map(s => s.id));
                      } else {
                        setSelectedServices([]);
                      }
                    }} checked={filteredServices.length > 0 && selectedServices.length === filteredServices.length}/>
                  </th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600">S. No.</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600">Service Name</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600">HSN/SAC Code</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600">Price</th>
                </tr>
              </thead>
              <tbody>
                {loadingServices ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-sm text-gray-500">Loading services...</td>
                  </tr>
                ) : filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-sm text-gray-500">No matching record found</td>
                  </tr>
                ) : (
                  filteredServices.map((service, index) => (
                    <tr key={service.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300"
                          checked={selectedServices.includes(service.id)}
                          onChange={() => toggleService(service.id)}/>
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-700">{index + 1}</td>
                      <td className="py-3 px-3 text-sm text-gray-700">{service.name}</td>
                      <td className="py-3 px-3 text-sm text-gray-700">{service.hsn_code || '—'}</td>
                      <td className="py-3 px-3 text-sm text-gray-700">{service.price || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredServices.length > 0 && (
            <div className="mt-4 text-xs text-gray-500">
              Showing {filteredServices.length} of {services.length} Service(s)
            </div>
          )}

          {/* Status Section */}
          <div className="mt-8 border-t border-gray-200 pt-6">
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
                    ['Sort Seq.', form.sort_sequence],
                    ['Services', `${selectedServices.length} selected`],
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
        </div>
      )}

    </div>
  );
}
