'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';

async function fetchUsers() {
  const res = await fetch('/api/auth/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

async function createDepartment(payload) {
  const res = await fetch('/api/employee/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create department');
  return data;
}

function UserMultiSelect({ users, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const labels = useMemo(() => {
    const selected = users.filter((user) => value.includes(user.id));
    if (selected.length === 0) return 'select';
    if (selected.length <= 2) return selected.map((user) => user.name).join(', ');
    return `${selected.slice(0, 2).map((user) => user.name).join(', ')} +${selected.length - 2}`;
  }, [users, value]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-700 bg-white flex items-center justify-between gap-3"
      >
        <span className="truncate text-left">{labels}</span>
        <i className={`ti ti-chevron-down text-[12px] text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-auto">
          {users.length === 0 ? (
            <div className="px-3 py-2 text-[12.5px] text-gray-400">No users available</div>
          ) : users.map((user) => {
            const checked = value.includes(user.id);
            return (
              <label key={user.id} className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    onChange(
                      event.target.checked
                        ? [...value, user.id]
                        : value.filter((selectedId) => selectedId !== user.id)
                    );
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="flex-1 text-gray-700">{user.name}</span>
                <span className="text-[11px] text-gray-400">{user.role}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CreateEmployeeDepartmentPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    departmentName: '',
    userIds: [],
    description: '',
  });

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((data) => {
        if (!cancelled) setUsers(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!form.departmentName.trim()) return alert('Department name is required');

    setSaving(true);
    try {
      await createDepartment({
        department_name: form.departmentName,
        user_ids: form.userIds,
        description: form.description,
      });
      router.push('/employee/staffdepartments');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Employee</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="text-blue-600">Employee Departments</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">Create Employee Departments</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">Create Employee Department</h1>
          <p className="text-[12.5px] text-gray-400 mt-1">
            Create department &amp; select users{' '}
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
              <label className="text-[12px] text-gray-700 font-medium">Department Name <span className="text-red-500">*</span></label>
              <input
                value={form.departmentName}
                onChange={(e) => setForm({ ...form, departmentName: e.target.value })}
                placeholder="Enter Department Name"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[12px] text-gray-700 font-medium">Users</label>
              <UserMultiSelect
                users={users}
                value={form.userIds}
                onChange={(userIds) => setForm({ ...form, userIds })}
              />
              <p className="mt-2 text-[11.5px] text-gray-400">
                {loadingUsers ? 'Loading users...' : 'Select one or more users for this department'}
              </p>
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
