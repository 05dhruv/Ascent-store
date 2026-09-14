"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { validatePhoneNumber } from '@/lib/phoneValidator';

const initialForm = {
  name: '',
  userIds: [],
  mobileNumber: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: 'Uttar Pradesh',
  pincode: '',
  country: 'India',
  gstNumber: '',
  notificationEmails: [],
};

const inputClassName = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600';

async function parseJsonResponse(response, contextMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const preview = text.replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(
      `${contextMessage}: expected JSON response, received ${contentType || 'unknown content type'}${preview ? ` (${preview})` : ''}`
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${contextMessage}: invalid JSON response`);
  }
}

async function fetchWarehouses() {
  const res = await fetch('/api/warehouses', {
    cache: 'no-store',
    credentials: 'include',
  });
  const json = await parseJsonResponse(res, 'Failed to load warehouses');
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Failed to load warehouses');
  }
  return json.data?.records || [];
}

async function fetchUsers() {
  const res = await fetch('/api/auth/users', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load users');
  return parseJsonResponse(res, 'Failed to load users');
}

function parseMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta);
    } catch {
      return {};
    }
  }
  return meta;
}

function normalizeWarehouse(row) {
  const meta = parseMeta(row.meta);
  const notificationEmails = Array.isArray(meta.notificationEmails)
    ? meta.notificationEmails
    : Array.isArray(row.notificationEmails)
      ? row.notificationEmails
      : [];

  return {
    id: row.id,
    name: row.name || '',
    userIds: Array.isArray(meta.users) ? meta.users.map(String) : [],
    mobileNumber: row.manager_mobile || '',
    email: row.manager_email || '',
    addressLine1: row.address_line1 || '',
    addressLine2: row.address_line2 || '',
    city: row.city || '',
    state: row.state || '',
    pincode: row.pincode || '',
    country: row.country || '',
    gstNumber: meta.gstNumber || '',
    notificationEmails,
    isActive: row.is_active !== false,
    createdAt: row.created_at || null,
  };
}

function toFormValues(warehouse) {
  return {
    name: warehouse?.name || '',
    userIds: Array.isArray(warehouse?.userIds) ? warehouse.userIds.map(String) : [],
    mobileNumber: warehouse?.mobileNumber || '',
    email: warehouse?.email || '',
    addressLine1: warehouse?.addressLine1 || '',
    addressLine2: warehouse?.addressLine2 || '',
    city: warehouse?.city || '',
    state: warehouse?.state || 'Uttar Pradesh',
    pincode: warehouse?.pincode || '',
    country: warehouse?.country || 'India',
    gstNumber: warehouse?.gstNumber || '',
    notificationEmails: Array.isArray(warehouse?.notificationEmails) ? warehouse.notificationEmails : [],
  };
}

function UserPicker({ users, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const label = useMemo(() => {
    const selected = users.filter((user) => value.includes(String(user.id)));
    if (!selected.length) return 'Select employees';
    if (selected.length <= 2) return selected.map((user) => user.name).join(', ');
    return `${selected.slice(0, 2).map((user) => user.name).join(', ')} +${selected.length - 2}`;
  }, [users, value]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-2 flex w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-[13px] text-gray-700"
      >
        <span className="truncate">{label}</span>
        <i className={`ti ti-chevron-down text-[12px] text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {users.length === 0 ? (
            <div className="px-3 py-2 text-[12.5px] text-gray-400">No employees available</div>
          ) : users.map((user) => {
            const userId = String(user.id);
            const checked = value.includes(userId);
            return (
              <label key={userId} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    onChange(
                      event.target.checked
                        ? [...value, userId]
                        : value.filter((selectedId) => selectedId !== userId)
                    );
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="flex-1 text-gray-700">{user.name}</span>
                <span className="text-[11px] text-gray-400">{user.role || 'user'}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotificationEmailInput({ value, onChange }) {
  const [draft, setDraft] = useState('');

  const addEmail = () => {
    const email = draft.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (value.includes(email)) {
      setDraft('');
      return;
    }
    onChange([...value, email]);
    setDraft('');
  };

  return (
    <div>
      <div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
        {value.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-[12px] text-blue-700">
            {email}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== email))}
              className="text-blue-400 hover:text-blue-700"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addEmail();
            }
          }}
          onBlur={addEmail}
          placeholder="Press ENTER to add multiple emails"
          className="min-w-[220px] flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
        />
      </div>
      <p className="mt-1 text-[11.5px] text-gray-400">Separate multiple recipients with Enter.</p>
    </div>
  );
}

function formatAddress(warehouse) {
  return [warehouse.addressLine1, warehouse.addressLine2, warehouse.city, warehouse.state, warehouse.pincode, warehouse.country]
    .filter(Boolean)
    .join(', ') || '—';
}

function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

export default function Page() {
  const [warehouses, setWarehouses] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingWarehouseId, setEditingWarehouseId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const [warehouseResult, userResult] = await Promise.allSettled([fetchWarehouses(), fetchUsers()]);
        if (cancelled) return;

        if (warehouseResult.status === 'fulfilled') {
          setWarehouses(Array.isArray(warehouseResult.value) ? warehouseResult.value.map(normalizeWarehouse) : []);
        } else {
          console.error('[warehouses] Failed to load warehouses:', warehouseResult.reason);
          setWarehouses([]);
        }

        if (userResult.status === 'fulfilled') {
          setUsers(Array.isArray(userResult.value) ? userResult.value : []);
        } else {
          console.error('[warehouses] Failed to load users:', userResult.reason);
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredWarehouses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return warehouses;

    return warehouses.filter((warehouse) => {
      const userNames = warehouse.userIds
        .map((userId) => users.find((user) => String(user.id) === String(userId))?.name || '')
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return [
        warehouse.name,
        warehouse.mobileNumber,
        warehouse.email,
        warehouse.city,
        warehouse.state,
        warehouse.gstNumber,
        userNames,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [search, users, warehouses]);

  const resetForm = () => {
    setForm(initialForm);
    setError('');
    setEditingWarehouseId(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (warehouse) => {
    setEditingWarehouseId(warehouse.id);
    setForm(toFormValues(warehouse));
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Warehouse name is required');
      return;
    }
    if (!form.mobileNumber.trim()) {
      setError('Mobile number is required');
      return;
    }
    if (!/^\d{10}$/.test(form.mobileNumber)) {
      setError('Mobile number must be exactly 10 digits');
      return;
    }
    if (!form.email.trim()) {
      setError('Warehouse email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Enter a valid warehouse email');
      return;
    }

    setSaving(true);
    try {
      const editingId = String(editingWarehouseId ?? '').trim();
      const isEditing = /^\d+$/.test(editingId) && editingId !== '0';
      const res = await fetch('/api/warehouses', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isEditing ? editingId : undefined,
          name: form.name,
          users: form.userIds,
          mobileNumber: form.mobileNumber,
          email: form.email,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          country: form.country,
          gstNumber: form.gstNumber,
          notificationEmails: form.notificationEmails,
        }),
      });
      const json = await parseJsonResponse(res, 'Failed to save warehouse');

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to save warehouse');
      }

      const savedWarehouse = normalizeWarehouse(json.data?.warehouse || {});
      setWarehouses((current) => {
        if (isEditing) {
          return current.map((warehouse) => (String(warehouse.id) === String(savedWarehouse.id) ? savedWarehouse : warehouse));
        }
        return [savedWarehouse, ...current];
      });
      setShowForm(false);
      resetForm();
    } catch (err) {
      setError(err.message || 'Failed to save warehouse');
    } finally {
      setSaving(false);
    }
  };

  const selectedUserLabels = useMemo(() => {
    return form.userIds
      .map((userId) => users.find((user) => String(user.id) === String(userId))?.name)
      .filter(Boolean);
  }, [form.userIds, users]);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/warehouses?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const json = await parseJsonResponse(res, 'Failed to delete warehouse');

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to delete warehouse');
      }

      setWarehouses((current) => current.filter((warehouse) => String(warehouse.id) !== String(deleteTarget.id)));
      setDeleteTarget(null);
      if (String(editingWarehouseId) === String(deleteTarget.id)) {
        setShowForm(false);
        resetForm();
      }
    } catch (err) {
      setError(err.message || 'Failed to delete warehouse');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
            <span className="text-blue-500 hover:underline cursor-pointer">Home</span>
            <span>›</span>
            <span className="text-blue-500 hover:underline cursor-pointer">Settings</span>
            <span>›</span>
            <span className="text-gray-700 font-medium">Warehouses</span>
          </nav>
          <h1 className="text-3xl font-bold text-gray-900">Warehouses</h1>
          <p className="text-sm text-gray-500 mt-1">Central warehouses and storage rules. Need Help?</p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <span className="text-lg leading-none">+</span>
          Add Warehouse
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Warehouses are saved to the database and listed below.</p>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search warehouses"
          className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">Warehouse List</h2>
              <p className="text-xs text-gray-500 mt-1">Loaded from the stores table where location type is Warehouse.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {filteredWarehouses.length} warehouse{filteredWarehouses.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Assigned employees</th>
                <th className="px-5 py-3 font-semibold">Mobile</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Address</th>
                <th className="px-5 py-3 font-semibold">GST</th>
                <th className="px-5 py-3 font-semibold">Notification Emails</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-gray-400">Loading warehouses...</td>
                </tr>
              ) : filteredWarehouses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-gray-400">No warehouses found.</td>
                </tr>
              ) : filteredWarehouses.map((warehouse) => {
                const userNames = warehouse.userIds
                  .map((userId) => users.find((user) => String(user.id) === String(userId))?.name)
                  .filter(Boolean);

                return (
                  <tr key={warehouse.id} className="border-t border-gray-100 align-top hover:bg-gray-50/70">
                    <td className="px-5 py-4 font-medium text-gray-900">{warehouse.name}</td>
                    <td className="px-5 py-4 text-gray-700">
                      {userNames.length ? `${userNames.length} selected` : '—'}
                      {userNames.length > 0 && (
                        <div className="mt-1 text-xs text-gray-500">{userNames.join(', ')}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-700">{warehouse.mobileNumber || '—'}</td>
                    <td className="px-5 py-4 text-gray-700">{warehouse.email || '—'}</td>
                    <td className="px-5 py-4 text-gray-700">{formatAddress(warehouse)}</td>
                    <td className="px-5 py-4 text-gray-700">{warehouse.gstNumber || '—'}</td>
                    <td className="px-5 py-4 text-gray-700">
                      {warehouse.notificationEmails.length ? warehouse.notificationEmails.join(', ') : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(warehouse)}
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(warehouse)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[100] bg-slate-50">
          <div className="flex h-full flex-col">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingWarehouseId ? 'Edit Warehouse' : 'Add Warehouse'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">Warehouse information</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
            <form onSubmit={handleSubmit} className="mx-auto w-full max-w-7xl space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
              <section className="rounded-xl border border-gray-200 p-5">
                <h3 className="mb-4 text-[15px] font-semibold text-blue-700">Warehouse information</h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Warehouse Name">
                    <input
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      className={inputClassName}
                      placeholder="Central Warehouse"
                      required
                    />
                  </Field>

                  <Field label="Assigned employees">
                    <UserPicker
                      users={users}
                      value={form.userIds}
                      onChange={(userIds) => setForm({ ...form, userIds })}
                    />
                    <p className="mt-1 text-[11.5px] text-gray-400">
                      {selectedUserLabels.length ? `${selectedUserLabels.length} employee(s) assigned` : 'Select employees who can access and manage this warehouse'}
                    </p>
                  </Field>

                  <Field label="Mobile Number">
                    <div className="mt-2 flex overflow-hidden rounded-lg border border-gray-300 bg-white">
                      <span className="flex items-center border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">+91</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        value={form.mobileNumber}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
                          setForm({ ...form, mobileNumber: digits });
                        }}
                        className="w-full px-3 py-2 text-[13px] text-gray-800 outline-none"
                        placeholder="10 digits"
                        maxLength="10"
                        required
                      />
                    </div>
                    {form.mobileNumber && !validatePhoneNumber(form.mobileNumber).isValid && (
                      <p className="text-[12px] text-red-600 mt-1 ml-0.5">{validatePhoneNumber(form.mobileNumber).error}</p>
                    )}
                  </Field>

                  <Field label="Warehouse Email">
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      className={inputClassName}
                      placeholder="warehouse@ascentlimited.com"
                      required
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 p-5">
                <h3 className="mb-4 text-[15px] font-semibold text-blue-700">Address</h3>
                <div className="space-y-4">
                  <Field label="Address Line 1">
                    <input
                      value={form.addressLine1}
                      onChange={(event) => setForm({ ...form, addressLine1: event.target.value })}
                      className={inputClassName}
                      placeholder="Warehouse location / logistics gate"
                    />
                  </Field>
                  <Field label="Address Line 2">
                    <input
                      value={form.addressLine2}
                      onChange={(event) => setForm({ ...form, addressLine2: event.target.value })}
                      className={inputClassName}
                      placeholder="Project / industrial area"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="City">
                      <input
                        value={form.city}
                        onChange={(event) => setForm({ ...form, city: event.target.value })}
                        className={inputClassName}
                        placeholder="Noida"
                      />
                    </Field>
                    <Field label="State">
                      <input
                        value={form.state}
                        onChange={(event) => setForm({ ...form, state: event.target.value })}
                        className={inputClassName}
                        placeholder="Uttar Pradesh"
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Pincode">
                      <input
                        value={form.pincode}
                        onChange={(event) => setForm({ ...form, pincode: event.target.value })}
                        className={inputClassName}
                        placeholder="201309"
                      />
                    </Field>
                    <Field label="Country">
                      <input
                        value={form.country}
                        onChange={(event) => setForm({ ...form, country: event.target.value })}
                        className={inputClassName}
                        placeholder="India"
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 p-5">
                <h3 className="mb-4 text-[15px] font-semibold text-blue-700">Compliance & notifications</h3>
                <div className="space-y-4">
                  <Field label="GST Number">
                    <input
                      value={form.gstNumber}
                      onChange={(event) => setForm({ ...form, gstNumber: event.target.value })}
                      className={inputClassName}
                      placeholder="09ABCDE1234F1Z5"
                    />
                  </Field>

                  <Field label="Notification Emails">
                    <NotificationEmailInput
                      value={form.notificationEmails}
                      onChange={(notificationEmails) => setForm({ ...form, notificationEmails })}
                    />
                  </Field>
                </div>
              </section>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {saving ? 'Saving...' : editingWarehouseId ? 'Update Warehouse' : 'Save Warehouse'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-5">
              <h3 className="text-lg font-bold text-gray-900">Delete Warehouse?</h3>
              <p className="mt-1 text-sm text-gray-500">This will permanently remove {deleteTarget.name} from the list.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
