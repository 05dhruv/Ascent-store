"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';

// fallback options in case API fails
const FALLBACK_PERMISSION_OPTIONS = [
  { value: 'MANAGE_ROLES', label: 'Manage Roles' },
  { value: 'MANAGE_USERS', label: 'Manage Users' },
  { value: 'ACCESS_DASHBOARD', label: 'Access Module' },
  { value: 'MANAGE_DEVICES', label: 'Manage Devices' },
  { value: 'MANAGE_INVENTORY', label: 'Manage Inventory' },
  { value: 'VIEW_STORE_INVENTORY_DASHBOARD', label: 'View Store Inventory Dashboard' },
  { value: 'MANAGE_CATALOG', label: 'Manage Catalog' },
  { value: 'VIEW_REPORTS', label: 'View Reports' },
  { value: 'VIEW_TAX_WISE_REPORTS', label: 'View Tax Wise Reports' },
  { value: 'MANAGE_STORES', label: 'Manage Stores' },
  { value: 'MANAGE_BILLING', label: 'Manage Billing' },
];

async function createRole(payload) {
  const res = await fetch('/api/employee/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create role');
  return data;
}

export default function CreateCustomRolePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [permissionOptions, setPermissionOptions] = useState(FALLBACK_PERMISSION_OPTIONS);
  const [form, setForm] = useState({
    roleName: '',
    permissions: [],
    description: '',
  });

  useEffect(() => {
    // fetch permissions from API and map to option list
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/employee/permissions');
        if (!res.ok) throw new Error('Failed to load permissions');
        const data = await res.json();
        if (!mounted) return;
        const opts = data.map((p) => ({
          value: p.permissionName || p.permission_name,
          label: p.displayName || p.display_name || p.permissionName || p.permission_name,
        }));
        if (opts.length > 0) setPermissionOptions(opts);
      } catch (err) {
        console.error('Failed to fetch permissions', err.message);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.title = 'Create Custom Role';
  }, []);

  const handleSave = async () => {
    if (!form.roleName.trim()) return alert('Role name is required');
    if (form.permissions.length === 0) return alert('At least one permission is required');

    setSaving(true);
    try {
      await createRole({
        role_name: form.roleName,
        permissions: form.permissions,
        description: form.description,
      });
      router.push('/employee');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Employee</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="text-blue-600">Roles</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">Create Role</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">Create Custom Role</h1>
          <p className="text-[12.5px] text-gray-400 mt-1">
            Create custom roles &amp; select permissions{' '}
            <button type="button" className="text-blue-600 hover:underline font-medium">Need Help?</button>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 text-[13px] font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <i className="ti ti-chevron-left text-[16px]" />
            Back
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)] p-6">
        <section className="border border-gray-300 rounded p-6 bg-white">
          <h4 className="text-sm text-blue-700 font-semibold mb-8">Basic Information</h4>

          <div className="grid grid-cols-2 gap-x-12 gap-y-8">
            <div>
              <label className="text-[12px] text-gray-700 font-medium">Role Name <span className="text-red-500">*</span></label>
              <input
                value={form.roleName}
                onChange={(e) => setForm({ ...form, roleName: e.target.value })}
                placeholder="Enter Role Name"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[12px] text-gray-700 font-medium">Permissions <span className="text-red-500">*</span></label>
              <div className="mt-2 rounded-lg border border-gray-300 bg-white p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {permissionOptions.map((option) => {
                    const checked = form.permissions.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] cursor-pointer transition-colors ${
                          checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm((current) => ({
                              ...current,
                              permissions: e.target.checked
                                ? [...current.permissions, option.value]
                                : current.permissions.filter((permission) => permission !== option.value),
                            }));
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {form.permissions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.permissions.map((permission) => {
                    const option = permissionOptions.find((item) => item.value === permission);
                    return (
                      <span
                        key={permission}
                        className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[12px] font-medium text-blue-700 border border-blue-100"
                      >
                        {option?.label || permission}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="text-[12px] text-gray-700 font-medium">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description"
                rows={5}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
