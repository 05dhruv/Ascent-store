'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { validatePhoneNumber } from '@/lib/phoneValidator';

const initialForm = {
  firstName: '',
  lastName: '',
  customerType: 'INDIVIDUAL',
  customerGroupId: '',
  customerCode: '',
  emailAddress: '',
  birthday: '',
  mobileNumber: '',
  addressType: 'Billing',
  city: '',
  state: '',
  country: 'India',
  pincode: '',
  address1: '',
  address2: '',
  landmark: '',
  anniversary: '',
  gender: 'MALE',
  gstNumber: '',
  panNumber: '',
  aadharNumber: '',
  contactPersonName: '',
  contactPersonPhone: '',
  registrationPoints: '',
  creditLimit: '',
  enableCrm: false,
  notes: '',
};

const customerTypeOptions = [
  { value: 'INDIVIDUAL', label: 'INDIVIDUAL' },
  { value: 'COMPANY', label: 'COMPANY' },
  { value: 'WHOLESALE', label: 'WHOLESALE' },
  { value: 'RETAIL', label: 'RETAIL' },
];

const addressTypeOptions = [
  { value: 'Billing', label: 'Billing' },
  { value: 'Shipping', label: 'Shipping' },
  { value: 'Billing & Shipping', label: 'Billing & Shipping' },
];

const genderOptions = [
  { value: 'MALE', label: 'MALE' },
  { value: 'FEMALE', label: 'FEMALE' },
  { value: 'OTHER', label: 'OTHER' },
];

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

function CustomerSection({ title, children }) {
  return (
    <section className="border border-gray-300 rounded-lg p-4 bg-white shadow-sm">
      <h4 className="text-[12.5px] font-semibold text-blue-700 mb-3">{title}</h4>
      {children}
    </section>
  );
}

function normalizeMobileInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function TextField({ label, value, onChange, required = false, placeholder = '', type = 'text' }) {
  const lowerLabel = String(label || '').toLowerCase();
  const isPhone = lowerLabel.includes('mobile') || lowerLabel.includes('phone');
  const inputType = isPhone ? 'tel' : type;
  return (
    <div>
      <label className="block text-[12px] text-gray-700 mb-1">{label}{required ? <span className="text-red-500"> *</span> : null}</label>
      <input
        type={inputType}
        inputMode={isPhone ? 'numeric' : undefined}
        pattern={isPhone ? '[0-9]{10}' : undefined}
        maxLength={isPhone ? 10 : undefined}
        required={required}
        value={value}
        onChange={(event) => onChange(isPhone ? normalizeMobileInput(event.target.value) : event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <div>
      <label className="block text-[12px] text-gray-700 mb-1">{label}{required ? <span className="text-red-500"> *</span> : null}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-8 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          <i className="ti ti-chevron-down text-[12px]" />
        </span>
      </div>
    </div>
  );
}

export default function ListOfCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');
  const [stores, setStores] = useState([]);
  const [groups, setGroups] = useState([]);
  const [pageSize, setPageSize] = useState('10');
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);

  const fetchCustomers = async (nextSearch = search, nextStore = selectedStore) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (nextSearch.trim()) params.set('search', nextSearch.trim());
      if (nextStore && nextStore !== 'all') params.set('store', nextStore);

      const res = await fetch(`/api/customers${params.toString() ? `?${params}` : ''}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch customers');
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setCustomers([]);
      setError(err.message || 'Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadStores() {
      try {
        const [storesRes, groupsRes] = await Promise.all([
          fetch('/api/stores', { cache: 'no-store', credentials: 'include' }),
          fetch('/api/customer-groups', { cache: 'no-store', credentials: 'include' }),
        ]);
        const storesJson = await storesRes.json().catch(() => ({}));
        const groupsJson = await groupsRes.json().catch(() => ([]));
        if (!cancelled && storesRes.ok && storesJson?.success) {
          setStores(Array.isArray(storesJson?.data?.stores) ? storesJson.data.stores : []);
        }
        if (!cancelled && groupsRes.ok) {
          setGroups(Array.isArray(groupsJson) ? groupsJson.filter((group) => group.status === 'Active') : []);
        }
      } catch (err) {
        console.error('[ListOfCustomersPage] Failed to load filters', err);
      }
    }

    loadStores();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(search, selectedStore);
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedStore]);

  const effectivePageSize = pageSize === 'all' ? customers.length : Number(pageSize);

  const visibleCustomers = useMemo(
    () => customers.slice(0, effectivePageSize),
    [customers, effectivePageSize]
  );

  const openCreateForm = () => {
    setForm(initialForm);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.firstName.trim()) {
      alert('First name is required');
      return;
    }

    if (!form.mobileNumber.trim()) {
      alert('Mobile number is required');
      return;
    }
    if (!/^\d{10}$/.test(form.mobileNumber)) {
      alert('Mobile number must be exactly 10 digits');
      return;
    }
    if (form.emailAddress.trim() && !isValidEmail(form.emailAddress)) {
      alert('Enter a valid email address');
      return;
    }
    if (form.contactPersonPhone.trim() && !/^\d{10}$/.test(form.contactPersonPhone)) {
      alert('Contact person phone must be exactly 10 digits');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save customer');

      setShowModal(false);
      setForm(initialForm);
      await fetchCustomers();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const headers = ['S. No.', 'Name', 'Phone', 'Email', 'Group', 'Total Sales', 'Status', 'Source', 'Stores'];
    const lines = [
      headers.join(','),
      ...customers.map((customer, index) => [
        index + 1,
        customer.name || '',
        customer.mobile_number || '',
        customer.email_address || '',
        customer.customer_type || '',
        formatMoney(customer.total_sales),
        customer.status || '',
        customer.source || '',
        customer.store_names || '',
      ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4 flex-wrap">
        <span className="text-blue-600">Customer</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">List Of Customers</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">List Of Customers</h1>
          <p className="text-[12.5px] text-gray-400 mt-1">Registered customers plus customers captured from POS bills</p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          <i className="ti ti-plus text-[16px]" />
          Create Customer
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 justify-between flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-[340px] bg-gray-50 rounded-lg px-3 py-2">
            <i className="ti ti-search text-gray-400 text-[16px]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
            />
          </div>
          <select
            value={selectedStore}
            onChange={(event) => setSelectedStore(event.target.value)}
            className="min-w-[190px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleExport}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              title="Export CSV"
            >
              <i className="ti ti-download text-gray-500 text-[16px]" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">S. No.</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">Email</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">Group</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">Total Sales</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">Source</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-[13px] text-gray-500" colSpan={8}>Loading...</td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-[13px] text-gray-500" colSpan={8}>
                    {error || 'No customers found'}
                  </td>
                </tr>
              ) : (
                visibleCustomers.map((customer, index) => (
                  <tr key={customer.id} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-3 text-[13px] text-gray-700">{index + 1}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{customer.name || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{customer.mobile_number || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{customer.email_address || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{customer.customer_group_name || customer.customer_type || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{formatMoney(customer.total_sales)}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      {customer.source === 'billed' ? 'Billed' : 'Registered'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{customer.status || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 text-[12px] text-gray-400">
          <select
            value={pageSize}
            onChange={(event) => setPageSize(event.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-[12px] text-gray-600"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
            <option value="all">All</option>
          </select>
          <span>Showing {Math.min(effectivePageSize, customers.length)} of {customers.length} Results</span>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-[1200px] bg-white rounded-xl border border-gray-300 shadow-xl overflow-hidden my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Create Customer</h3>
                <p className="text-[12px] text-gray-400 mt-1">Save a reusable customer profile for billing, credit, loyalty, and reports.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[calc(100vh-160px)] overflow-y-auto">
              <CustomerSection title="Basic Information">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <TextField label="First Name" value={form.firstName} onChange={(value) => setForm({ ...form, firstName: value })} required />
                  <TextField label="Last Name" value={form.lastName} onChange={(value) => setForm({ ...form, lastName: value })} />
                  <SelectField label="Customer Type" value={form.customerType} onChange={(value) => setForm({ ...form, customerType: value })} options={customerTypeOptions} required />
                  <SelectField
                    label="Customer Group"
                    value={form.customerGroupId}
                    onChange={(value) => setForm({ ...form, customerGroupId: value })}
                    options={[
                      { value: '', label: 'Use Default Group' },
                      ...groups.map((group) => ({ value: String(group.id), label: group.group_name || group.name })),
                    ]}
                  />
                  <TextField label="Customer Code" value={form.customerCode} onChange={(value) => setForm({ ...form, customerCode: value })} />
                  <TextField label="Email Address" value={form.emailAddress} onChange={(value) => setForm({ ...form, emailAddress: value })} type="email" />
                  <TextField label="Birthday" value={form.birthday} onChange={(value) => setForm({ ...form, birthday: value })} type="date" />
                  <div>
                    <TextField 
                      label="Mobile Number" 
                      value={form.mobileNumber} 
                      onChange={(value) => {
                        const digits = String(value).replace(/\D/g, '').slice(0, 10);
                        setForm({ ...form, mobileNumber: digits });
                      }}
                      placeholder="10 digits"
                      maxLength="10"
                      required 
                    />
                    {form.mobileNumber && !validatePhoneNumber(form.mobileNumber).isValid && (
                      <p className="text-[11px] text-red-600 mt-1">{validatePhoneNumber(form.mobileNumber).error}</p>
                    )}
                  </div>
                  <SelectField label="Address Type" value={form.addressType} onChange={(value) => setForm({ ...form, addressType: value })} options={addressTypeOptions} required />
                  <TextField label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
                  <TextField label="State" value={form.state} onChange={(value) => setForm({ ...form, state: value })} />
                  <TextField label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} required />
                  <TextField label="Pincode" value={form.pincode} onChange={(value) => setForm({ ...form, pincode: value })} />
                  <TextField label="Address 1" value={form.address1} onChange={(value) => setForm({ ...form, address1: value })} />
                  <TextField label="Address 2" value={form.address2} onChange={(value) => setForm({ ...form, address2: value })} />
                  <TextField label="Landmark" value={form.landmark} onChange={(value) => setForm({ ...form, landmark: value })} />
                  <TextField label="Anniversary" value={form.anniversary} onChange={(value) => setForm({ ...form, anniversary: value })} type="date" />
                  <SelectField label="Gender" value={form.gender} onChange={(value) => setForm({ ...form, gender: value })} options={genderOptions} required />
                  <TextField label="GST Number" value={form.gstNumber} onChange={(value) => setForm({ ...form, gstNumber: value })} />
                  <TextField label="Aadhar Number" value={form.aadharNumber} onChange={(value) => setForm({ ...form, aadharNumber: value })} />
                  <TextField label="PAN Number" value={form.panNumber} onChange={(value) => setForm({ ...form, panNumber: value })} />
                  <TextField label="Contact Person Name" value={form.contactPersonName} onChange={(value) => setForm({ ...form, contactPersonName: value })} />
                  <TextField label="Contact Person Phone" value={form.contactPersonPhone} onChange={(value) => setForm({ ...form, contactPersonPhone: value })} />
                  <TextField label="Registration Points" value={form.registrationPoints} onChange={(value) => setForm({ ...form, registrationPoints: value })} type="number" />
                  <TextField label="Credit Limit" value={form.creditLimit} onChange={(value) => setForm({ ...form, creditLimit: value })} type="number" />
                  <div className="lg:col-span-2">
                    <label className="block text-[12px] text-gray-700 mb-1">Enable CRM</label>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, enableCrm: !form.enableCrm })}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${form.enableCrm ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700'}`}
                    >
                      <span className={`h-4 w-4 rounded-full border ${form.enableCrm ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`} />
                      {form.enableCrm ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[12px] text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </CustomerSection>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-70"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
