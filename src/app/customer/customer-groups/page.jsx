'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import MainLayout from '@/components/MainLayout';

const initialForm = {
  id: null,
  groupName: '',
  groupCode: '',
  description: '',
  isDefault: false,
  templateFileName: '',
};

function SectionCard({ title, children }) {
  return (
    <section className="bg-white border border-gray-300 rounded-lg p-4 md:p-6 shadow-sm">
      <h2 className="text-[13px] font-semibold text-blue-700 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, placeholder = '', required = false, multiline = false }) {
  return (
    <div>
      <label className="block text-[12px] text-gray-700 mb-1.5">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
        />
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div>
      <label className="block text-[12px] text-blue-700 font-semibold mb-2">{label}</label>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${checked ? 'bg-amber-400' : 'bg-gray-300'}`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

export default function CustomerGroupsPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const isEditing = Boolean(form.id);

  const fetchGroups = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/customer-groups${params.toString() ? `?${params}` : ''}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch customer groups');
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setGroups([]);
      setError(err.message || 'Failed to fetch customer groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchGroups, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filteredGroups = groups;

  const downloadTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['group_name', 'group_code', 'description', 'is_default'],
      ['Retail VIP', 'VIP-001', 'Preferred high-value customers', 'true'],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'CustomerGroups');
    XLSX.writeFile(workbook, 'customer-groups-template.xlsx');
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setSelectedFileName(file ? file.name : '');
    setForm((current) => ({
      ...current,
      templateFileName: file ? file.name : '',
    }));
  };

  const handleSave = async () => {
    if (!form.groupName.trim()) {
      alert('Customer group name is required');
      return;
    }

    if (!form.groupCode.trim()) {
      alert('Customer group code is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/customer-groups', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save customer group');

      setForm(initialForm);
      setSelectedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowModal(false);
      await fetchGroups();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save customer group');
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setForm(initialForm);
    setSelectedFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowModal(true);
  };

  const openEdit = (group) => {
    setForm({
      id: group.id,
      groupName: group.group_name || '',
      groupCode: group.group_code || '',
      description: group.description || '',
      isDefault: Boolean(group.is_default),
      templateFileName: group.template_filename || '',
    });
    setSelectedFileName(group.template_filename || '');
    setShowModal(true);
  };

  const updateGroupAction = async (group, action, status = '') => {
    try {
      const res = await fetch('/api/customer-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: group.id, action, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update customer group');
      await fetchGroups();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to update customer group');
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-[20px] md:text-[22px] font-bold text-gray-900">Customer Groups</h1>
          <p className="text-[12.5px] text-gray-500 mt-1">Manage customer groups</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-3 py-2 border border-blue-400 rounded-lg text-[12.5px] font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
          >
            <i className="ti ti-chevron-left text-[12px]" />
            Back
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[12.5px] font-semibold hover:bg-blue-700 disabled:opacity-70"
          >
            Create Customer Group
          </button>
        </div>
      </div>

      <div className="space-y-5">
        <SectionCard title="Customer Group List">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 w-full sm:w-[320px] mb-4">
            <i className="ti ti-search text-gray-400 text-[16px]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">S. No.</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Group Name</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Group Code</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Description</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Default</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Total Customers</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-[13px] text-gray-500">Loading...</td>
                  </tr>
                ) : filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-[13px] text-gray-500">
                      {error || 'No customer groups found'}
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((group, index) => (
                    <tr key={group.id} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3 text-[13px] text-gray-700">{index + 1}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{group.group_name || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{group.group_code || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{group.description || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{group.is_default ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{group.total_customers ?? 0}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{group.status || 'Active'}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openEdit(group)}
                            className="px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50 text-[12px]"
                          >
                            Edit
                          </button>
                          {!group.is_default && (
                            <button
                              type="button"
                              onClick={() => updateGroupAction(group, 'set_default')}
                              className="px-2 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 text-[12px]"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => updateGroupAction(group, 'toggle_status', group.status === 'Active' ? 'Inactive' : 'Active')}
                            className="px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50 text-[12px]"
                          >
                            {group.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-[1200px] bg-white rounded-xl border border-gray-300 shadow-xl overflow-hidden my-4">
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{isEditing ? 'Edit Customer Group' : 'Create Customer Group'}</h3>
                <p className="text-[12px] text-gray-400 mt-1">Groups classify customers for default assignment, credit rules, offers, and reporting.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[calc(100vh-160px)] overflow-y-auto">
              <SectionCard title="Basic Information">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Field
                    label="Enter Customer Group Name"
                    value={form.groupName}
                    onChange={(value) => setForm({ ...form, groupName: value })}
                    placeholder="Customer group name"
                    required
                  />
                  <Field
                    label="Enter Customer Group Code"
                    value={form.groupCode}
                    onChange={(value) => setForm({ ...form, groupCode: value })}
                    placeholder="Customer group Code"
                    required
                  />
                  <div className="lg:col-span-1">
                    <Field
                      label="Enter description"
                      value={form.description}
                      onChange={(value) => setForm({ ...form, description: value })}
                      placeholder="Customer group description"
                      multiline
                    />
                  </div>
                  <div className="flex items-start justify-start lg:justify-center pt-2">
                    <Toggle
                      label="Set as Default ?"
                      checked={form.isDefault}
                      onChange={(value) => setForm({ ...form, isDefault: value })}
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Customer Config">
                <div className="space-y-5">
                  <div>
                    <p className="text-[12px] text-gray-700 mb-3">1. Download Template</p>
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="w-full rounded-lg bg-amber-100 border border-amber-200 px-4 py-8 text-center hover:bg-amber-200 transition-colors"
                    >
                      <p className="text-[13px] font-medium text-blue-700">Download Template</p>
                      <p className="text-[12px] text-gray-700 mt-1">Click here to download excel template & upload</p>
                    </button>
                  </div>

                  <div>
                    <p className="text-[12px] text-gray-700 mb-3">2. Upload Template</p>
                    <button
                      type="button"
                      onClick={handleUploadClick}
                      className="w-full rounded-lg bg-amber-100 border border-amber-200 px-4 py-8 text-center hover:bg-amber-200 transition-colors"
                    >
                      <p className="text-[13px] font-medium text-blue-700">Upload Template</p>
                      <p className="text-[12px] text-gray-700 mt-1">Click To Upload</p>
                      {selectedFileName && <p className="text-[11px] text-gray-500 mt-2">Selected: {selectedFileName}</p>}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
