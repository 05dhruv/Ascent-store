'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { validatePhoneNumber } from '@/lib/phoneValidator';

const initialForm = {
  name: '',
  contact: '',
  email: '',
  phone: '',
  address: '',
  is_active: true,
};

export default function EditManufacturerPage() {
  const router = useRouter();
  const { id } = useParams();

  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!id) return;

    fetch(`/api/catalog/manufacturers/${id}`)
      .then((response) => response.json())
      .then((json) => {
        if (json.success) {
          const record = json.data;
          setForm({
            name: record.name || '',
            contact: record.contact || '',
            email: record.email || '',
            phone: record.phone || '',
            address: record.address || '',
            is_active: record.is_active ?? true,
          });
        } else {
          showToast(json.message || 'Failed to load manufacturer', 'error');
        }
      })
      .catch(() => showToast('Failed to load manufacturer', 'error'))
      .finally(() => setFetching(false));
  }, [id]);

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: null }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = 'Manufacturer name is required';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/manufacturers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (json.success) {
        showToast('Manufacturer updated successfully');
        setTimeout(() => router.push('/catalog/manufacturer'), 900);
      } else {
        showToast(json.message || 'Failed to update manufacturer', 'error');
        if (json.errors) {
          setErrors(json.errors);
        }
      }
    } catch {
      showToast('Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-sm">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="px-6 pt-5 pb-1">
        <nav className="flex items-center gap-1.5 text-xs text-gray-500">
          <Link href="/catalog" className="text-blue-500 hover:underline">Catalog</Link>
          <span>›</span>
          <Link href="/catalog/category" className="text-blue-500 hover:underline">Product Classification</Link>
          <span>›</span>
          <Link href="/catalog/manufacturer" className="text-blue-500 hover:underline">Manufacturer</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium">Edit Manufacturer</span>
        </nav>
      </div>

      <div className="flex items-start justify-between px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Manufacturer</h1>
          <p className="text-xs text-gray-500 mt-0.5">Update the existing manufacturer record.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/catalog/manufacturer')}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Update Manufacturer'}
          </button>
        </div>
      </div>

      <div className="mx-6 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h2 className="text-base font-bold text-blue-600 mb-6">Manufacturer Information</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Manufacturer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Enter Manufacturer Name"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
            <input
              type="text"
              value={form.contact}
              onChange={(event) => set('contact', event.target.value)}
              placeholder="Enter Contact Person"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              placeholder="Enter Email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
                set('phone', digits);
              }}
              placeholder="Enter Phone Number (10 digits)"
              maxLength="10"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {form.phone && !validatePhoneNumber(form.phone).isValid && (
              <p className="text-xs text-red-600 mt-1">{validatePhoneNumber(form.phone).error}</p>
            )}
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              value={form.address}
              onChange={(event) => set('address', event.target.value)}
              placeholder="Enter Address"
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => set('is_active', true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  form.is_active
                    ? 'bg-green-50 border-green-400 text-green-700'
                    : 'bg-white border-gray-300 text-gray-500'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => set('is_active', false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  !form.is_active
                    ? 'bg-red-50 border-red-400 text-red-600'
                    : 'bg-white border-gray-300 text-gray-500'
                }`}
              >
                Inactive
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}