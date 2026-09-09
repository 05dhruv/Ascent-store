'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';

const PAGE_SIZES = [10, 25, 50, 100];

async function fetchDepartments() {
  const res = await fetch('/api/employee/departments');
  if (!res.ok) throw new Error('Failed to fetch departments');
  return res.json();
}

async function fetchUsers() {
  const res = await fetch('/api/auth/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

async function updateDepartment(payload) {
  const res = await fetch('/api/employee/departments', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update department');
  return data;
}

async function deleteDepartment(id) {
  const res = await fetch(`/api/employee/departments?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete department');
  return data;
}

function normalizeDepartmentRow(row) {
  return {
    id: row.id,
    departmentId: row.departmentId ?? row.id,
    departmentName: row.departmentName ?? row.department_name ?? '',
    userIds: row.userIds ?? row.user_ids ?? [],
    description: row.description ?? '',
    createdAt: row.createdAt ?? row.created_at ?? null,
  };
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

export default function EmployeeDepartmentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null); // { id, top, right }
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [deletingDepartment, setDeletingDepartment] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    Promise.all([fetchDepartments(), fetchUsers()])
      .then(([deptData, userData]) => {
        if (cancelled) return;
        setDepartments(Array.isArray(deptData) ? deptData.map(normalizeDepartmentRow) : []);
        setUsers(Array.isArray(userData) ? userData : []);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load departments', err);
          setDepartments([]);
          setUsers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((department) =>
      String(department.departmentName).toLowerCase().includes(q) ||
      String(department.departmentId).includes(q) ||
      String(department.description || '').toLowerCase().includes(q)
    );
  }, [departments, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalCount = filtered.length;
  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex   = Math.min(page * pageSize, totalCount);

  const refreshDepartments = async () => {
    const data = await fetchDepartments();
    setDepartments(Array.isArray(data) ? data.map(normalizeDepartmentRow) : []);
  };

  const closeEditors = () => {
    setEditingDepartment(null);
    setDeleteTarget(null);
  };

  const handleEditSave = async (draft) => {
    if (!draft.departmentName.trim()) return alert('Department name is required');

    setSavingDepartment(true);
    try {
      await updateDepartment({
        id: draft.id,
        department_name: draft.departmentName,
        user_ids: draft.userIds,
        description: draft.description,
      });
      await refreshDepartments();
      closeEditors();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to update department');
    } finally {
      setSavingDepartment(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeletingDepartment(true);
    try {
      await deleteDepartment(deleteTarget.id);
      setDepartments((current) => current.filter((department) => department.id !== deleteTarget.id));
      setPage(1);
      closeEditors();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to delete department');
    } finally {
      setDeletingDepartment(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[12.5px] mb-5">
          <Link href="/employee" className="text-blue-600 hover:underline font-medium">
            Employee
          </Link>
          <i className="ti ti-chevron-right text-[11px] text-gray-400" />
          <span className="text-blue-600 font-semibold">Employee Departments</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900">Employee Department</h1>
            <p className="text-[12.5px] text-gray-500 mt-1">
              List of all the departments{' '}
              <span className="text-blue-600 cursor-pointer hover:underline font-medium">Need Help?</span>
            </p>
          </div>
          <button
            onClick={() => router.push('/employee/staffdepartments/create')}
            className="self-start flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-lg text-[12.5px] font-semibold hover:bg-blue-800 transition-colors shadow-sm flex-shrink-0"
          >
            <i className="ti ti-plus text-[14px]" />
            Create Employee Department
          </button>
        </div>

        {/* Search — top right */}
        <div className="flex justify-end mb-4">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 w-full sm:w-[280px] shadow-sm">
            <i className="ti ti-search text-gray-400 text-[15px]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-transparent text-[13px] text-gray-700 outline-none flex-1 placeholder-gray-400 min-w-0"
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <i className="ti ti-x text-gray-400 text-[13px]" />
              </button>
            )}
          </div>
        </div>

        {/* Table Card */}
        <div className="relative z-10 bg-white border border-gray-200 rounded-xl shadow-sm overflow-visible">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-5 py-3.5 text-left font-semibold text-gray-600 w-1/2">
                    Department ID
                  </th>
                  <th className="px-5 py-3.5 text-left font-semibold text-gray-600 w-1/2">
                    Department Name
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="text-center text-gray-400 py-16 text-[13px]">
                      Loading departments...
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center text-gray-400 py-16 text-[13px]">
                      <i className="ti ti-building-off text-[32px] mb-2 block" />
                      No departments found
                    </td>
                  </tr>
                ) : (
                  paginated.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-gray-700">
                        {row.departmentId}
                      </td>
                      <td className="px-5 py-3.5 text-gray-700">
                        {row.departmentName}
                      </td>
                      <td className="px-4 py-3.5 relative z-20">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (openMenu?.id === row.id) return setOpenMenu(null);
                            setOpenMenu({ id: row.id, top: rect.bottom + window.scrollY, right: window.innerWidth - rect.right });
                          }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <i className="ti ti-dots-vertical text-gray-400 text-[14px]" />
                        </button>
                        {openMenu?.id === row.id && (
                          <div
                            ref={menuRef}
                            style={{ position: 'fixed', top: openMenu.top + 'px', right: openMenu.right + 'px', zIndex: 99999 }}
                            className="w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
                          >
                            <button
                              className="block w-full text-left px-4 py-2 text-[12.5px] text-gray-700 hover:bg-gray-50 transition"
                              onClick={() => {
                                setOpenMenu(null);
                                setEditingDepartment({
                                  id: row.id,
                                  departmentName: row.departmentName,
                                  userIds: Array.isArray(row.userIds) ? row.userIds : [],
                                  description: row.description || '',
                                });
                              }}
                            >
                              <i className="ti ti-edit text-[13px] mr-2 text-blue-500" />
                              Edit
                            </button>
                            <button
                              className="block w-full text-left px-4 py-2 text-[12.5px] text-red-600 hover:bg-red-50 transition"
                              onClick={() => {
                                setOpenMenu(null);
                                setDeleteTarget(row);
                              }}
                            >
                              <i className="ti ti-trash text-[13px] mr-2" />
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="appearance-none border border-gray-300 rounded-lg px-3 py-1.5 pr-7 bg-white text-[12.5px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 shadow-sm"
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                <i className="ti ti-chevron-down text-[11px]" />
              </span>
            </div>
            <span className="text-[12.5px] text-gray-400">
              Showing {startIndex} to {endIndex} of {totalCount} Results
            </span>
          </div>

          {/* Page number buttons — right side */}
          <div className="flex items-center gap-1">
            {page > 1 && (
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <i className="ti ti-chevron-left text-gray-600 text-[14px]" />
              </button>
            )}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pg = totalPages <= 5 ? i + 1
                : page <= 3 ? i + 1
                : page >= totalPages - 2 ? totalPages - 4 + i
                : page - 2 + i;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-8 h-8 rounded-lg text-[12.5px] font-semibold transition-colors
                    ${page === pg ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {pg}
                </button>
              );
            })}
            {page < totalPages && (
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <i className="ti ti-chevron-right text-gray-600 text-[14px]" />
              </button>
            )}
          </div>
        </div>

        {editingDepartment && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[16px] font-bold text-gray-900">Edit Employee Department</h2>
                <button onClick={closeEditors} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <i className="ti ti-x text-gray-500 text-[16px]" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                <div>
                  <label className="text-[12px] text-gray-700 font-medium">Department Name <span className="text-red-500">*</span></label>
                  <input
                    value={editingDepartment.departmentName}
                    onChange={(e) => setEditingDepartment({ ...editingDepartment, departmentName: e.target.value })}
                    placeholder="Enter Department Name"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[12px] text-gray-700 font-medium">Users</label>
                  <UserMultiSelect
                    users={users}
                    value={editingDepartment.userIds}
                    onChange={(userIds) => setEditingDepartment({ ...editingDepartment, userIds })}
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[12px] text-gray-700 font-medium">Description</label>
                  <textarea
                    value={editingDepartment.description}
                    onChange={(e) => setEditingDepartment({ ...editingDepartment, description: e.target.value })}
                    placeholder="Description"
                    rows={5}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={closeEditors}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleEditSave(editingDepartment)}
                  className="flex-1 py-2.5 bg-blue-700 text-white rounded-lg text-[13px] font-semibold hover:bg-blue-800 transition-colors"
                  disabled={savingDepartment}
                >
                  {savingDepartment ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] font-bold text-gray-900">Delete Department</h2>
                <button onClick={closeEditors} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <i className="ti ti-x text-gray-500 text-[16px]" />
                </button>
              </div>
              <p className="text-[13px] text-gray-600">
                Delete <span className="font-semibold text-gray-900">{deleteTarget.departmentName}</span>? This action cannot be undone.
              </p>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={closeEditors}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-[13px] font-semibold hover:bg-red-700 transition-colors"
                  disabled={deletingDepartment}
                >
                  {deletingDepartment ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </MainLayout>
  );
}
