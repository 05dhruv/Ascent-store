'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import { validatePhoneNumber } from '@/lib/phoneValidator';

const PAGE_SIZES = [10, 25, 50, 100];

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  username: '',
  gender: 'Male',
  password: '',
  confirmPassword: '',
  mobileNumber: '',
  emailAddress: '',
  roleId: '',
  roleName: '',
  permissions: [],
  regionStore: [],
  warehouse: [],
  departmentId: '',
  customerName: '',
  userType: 'Regular',
  dateOfBirth: '',
  dateOfJoining: '',
  dateOfLeaving: '',
  employeeCode: '',
  createCustomerSameDetails: false,
  employmentType: 'Payroll',
  address: '',
  employmentStatus: 'Active',
  contractorName: '',
  discountLimitType: 'Percentage',
  discountLimitValue: '',
  maximumDiscountAmount: '',
};

const columns = [
  { key: 'sno', label: 'S.No' },
  { key: 'username', label: 'Username' },
  { key: 'name', label: 'Name' },
  { key: 'employeeCode', label: 'Employee Code' },
  { key: 'role', label: 'Role' },
  { key: 'department', label: 'Department' },
  { key: 'employeeType', label: 'Employee Type' },
  { key: 'contractorName', label: 'Contractor Name' },
  { key: 'mobileNumber', label: 'Mobile Number' },
  { key: 'emailAddress', label: 'Email Address' },
  { key: 'employmentStatus', label: 'Employment Status' },
  { key: 'actions', label: 'Actions' },
];

function mapEmployeeRow(row) {
  return {
    id: row.id,
    username: row.username || '',
    name: row.name || [row.firstName, row.lastName].filter(Boolean).join(' ').trim(),
    employeeCode: row.employeeCode || '',
    roleId: row.roleId || row.role_id || null,
    role: row.role || '',
    department: row.department || '',
    employeeType: row.employeeType || '',
    contractorName: row.contractorName || '',
    mobileNumber: row.mobileNumber || '',
    emailAddress: row.emailAddress || '',
    employmentStatus: row.employmentStatus || 'Active',
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    gender: row.gender || '',
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    regionStore: row.regionStore || '',
    warehouse: row.warehouse || '',
    userType: row.userType || '',
    dateOfBirth: row.dateOfBirth || null,
    dateOfJoining: row.dateOfJoining || null,
    dateOfLeaving: row.dateOfLeaving || null,
    customerName: row.customerName || '',
    address: row.address || '',
    discountLimitType: row.discountLimitType || '',
    discountLimitValue: row.discountLimitValue ?? null,
    maximumDiscountAmount: row.maximumDiscountAmount ?? null,
    createCustomerSameDetails: Boolean(row.createCustomerSameDetails),
    createdAt: row.createdAt || null,
  };
}

async function fetchEmployees() {
  try {
    const res = await fetch('/api/employee/staff');
    if (!res.ok) throw new Error('Failed to fetch employees');
    return res.json();
  } catch (err) {
    console.error('Fetch employees error:', err);
    return [];
  }
}

async function fetchRoles() {
  try {
    const res = await fetch('/api/employee/roles');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchPermissions() {
  try {
    const res = await fetch('/api/employee/permissions');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchDepartments() {
  try {
    const res = await fetch('/api/employee/departments');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function extractRecords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data?.stores)) return data.data.stores;
  if (Array.isArray(data?.data?.records)) return data.data.records;
  if (Array.isArray(data?.stores)) return data.stores;
  if (Array.isArray(data?.records)) return data.records;
  if (data?.success && Array.isArray(data.data)) return data.data;
  return [];
}

async function fetchStores() {
  try {
    const res = await fetch('/api/stores');
    if (!res.ok) {
      console.warn('Stores API returned status:', res.status);
      return [];
    }
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      console.warn('Invalid content type:', contentType);
      return [];
    }
    return extractRecords(await res.json());
  } catch (err) {
    console.error('Failed to fetch stores:', err.message);
    return [];
  }
}

async function fetchWarehouses() {
  try {
    const res = await fetch('/api/warehouses');
    if (!res.ok) {
      console.warn('Warehouses API returned status:', res.status);
      return [];
    }

    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      console.warn('Invalid content type:', contentType);
      return [];
    }

    return extractRecords(await res.json());
  } catch (err) {
    console.error('Failed to fetch warehouses:', err.message);
    return [];
  }
}

async function createEmployee(payload) {
  const res = await fetch('/api/employee/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create employee');
  return data;
}

async function updateEmployee(id, payload) {
  const res = await fetch(`/api/employee/staff/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update employee');
  return data;
}

async function deleteEmployee(id) {
  const res = await fetch(`/api/employee/staff/${id}`, {
    method: 'DELETE',
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete employee');
  return data;
}

async function fetchPasswordChangeRequests() {
  const res = await fetch('/api/auth/password-change-requests?status=pending');
  if (res.status === 401 || res.status === 403) return [];

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch password requests');
  }

  return Array.isArray(data.data?.requests) ? data.data.requests : [];
}

async function updatePasswordChangeRequest(id, action) {
  const res = await fetch(`/api/auth/password-change-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || `Failed to ${action} request`);
  }

  return data;
}

function randomPassword() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `Emp${Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')}`;
}

function normalizeMobileInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function parseMultiValue(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const str = String(value || '').trim();
  if (!str) return [];
  return str.split(',').map((item) => item.trim()).filter(Boolean);
}

function MultiSelect({ label, options, value, onChange, placeholder = 'Select', required = false, showSelectAll = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selectAllRef = useRef(null);

  const selectableOptions = useMemo(
    () => options.filter((option) => option.value),
    [options]
  );

  const allValues = useMemo(
    () => selectableOptions.map((option) => option.value),
    [selectableOptions]
  );

  const allSelected = allValues.length > 0 && allValues.every((optionValue) => value.includes(optionValue));
  const someSelected = allValues.some((optionValue) => value.includes(optionValue));

  useEffect(() => {
    const onDoc = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected, open]);

  const labels = useMemo(() => {
    const selected = selectableOptions.filter((option) => value.includes(option.value));
    if (selected.length === 0) return placeholder;
    if (selected.length <= 2) return selected.map((option) => option.label).join(', ');
    return `${selected.slice(0, 2).map((option) => option.label).join(', ')} +${selected.length - 2}`;
  }, [selectableOptions, placeholder, value]);

  return (
    <div ref={ref}>
      <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">{label}{required ? <span className="text-red-500"> *</span> : null}</label>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-[13px] text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all bg-white flex items-center justify-between gap-3"
      >
        <span className="truncate text-left">{labels}</span>
        <i className={`ti ti-chevron-down text-[12px] text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="relative z-30">
          <div className="absolute mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-56 overflow-auto">
            {selectableOptions.length === 0 ? (
              <div className="px-3 py-2 text-[12.5px] text-gray-400">No options available</div>
            ) : (
              <>
                {showSelectAll && (
                  <label className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer hover:bg-gray-50 border-b border-gray-100 font-medium">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => onChange(allSelected ? [] : allValues)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-gray-700">Select All</span>
                  </label>
                )}
                {selectableOptions.map((option) => {
                  const checked = value.includes(option.value);
                  return (
                    <label key={option.value} className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          onChange(
                            event.target.checked
                              ? [...value, option.value]
                              : value.filter((selected) => selected !== option.value)
                          );
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="flex-1 text-gray-700">{option.label}</span>
                    </label>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">{label}{required ? <span className="text-red-500"> *</span> : null}</label>
      <div className="relative">
        <select
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-[13px] text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all bg-white"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
          <i className="ti ti-chevron-down text-[12px]" />
        </span>
      </div>
    </div>
  );
}

export default function EmployeeStaffPage() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [checkedRows, setCheckedRows] = useState([]);
  const [allChecked, setAllChecked] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [stores, setStores] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [passwordRequests, setPasswordRequests] = useState([]);
  const [passwordRequestsLoading, setPasswordRequestsLoading] = useState(false);
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM }));
  const bulkRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.title = 'Ascent Sync | Team & Access';
  }, []);

  const loadPasswordRequests = useCallback(async () => {
    setPasswordRequestsLoading(true);
    try {
      const requests = await fetchPasswordChangeRequests();
      setPasswordRequests(requests);
    } catch (err) {
      console.error('Failed to load password requests', err);
      setPasswordRequests([]);
    } finally {
      setPasswordRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPasswordRequests();
  }, [loadPasswordRequests]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    fetchEmployees()
      .then((data) => {
        if (!cancelled) setEmployees(Array.isArray(data) ? data.map(mapEmployeeRow) : []);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load employees', err);
          setEmployees([]);
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
    let cancelled = false;

    Promise.all([fetchRoles(), fetchPermissions(), fetchDepartments(), fetchStores(), fetchWarehouses()])
      .then(([roleData, permissionData, departmentData, storeData, warehouseData]) => {
        if (cancelled) return;
        setRoles(Array.isArray(roleData) ? roleData : []);
        setPermissions(Array.isArray(permissionData) ? permissionData : []);
        setDepartments(Array.isArray(departmentData) ? departmentData : []);
        setStores(Array.isArray(storeData) ? storeData : []);
        setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load employee lookups', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (bulkRef.current && !bulkRef.current.contains(event.target)) setBulkOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const permissionOptions = useMemo(
    () => permissions.map((permission) => ({
      value: permission.permissionName || permission.permission_name,
      label: permission.displayName || permission.display_name || permission.permissionName || permission.permission_name,
    })).filter((permission) => permission.value),
    [permissions]
  );

  const roleOptions = useMemo(
    () => [
      { value: '', label: 'Select role' },
      ...roles.map((role) => ({
        value: String(role.id),
        label: role.roleName || role.role_name || `Role ${role.id}`,
      })),
    ],
    [roles]
  );

  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'Select department' },
      ...departments.map((department) => ({
        value: String(department.id),
        label: department.departmentName || department.department_name || `Department ${department.id}`,
      })),
    ],
    [departments]
  );

  const storeOptions = useMemo(
    () => stores.map((store) => ({
      value: String(store.id),
      label: `${store.name}${store.city ? ` (${store.city}, ${store.state || ''})` : ''}`.trim(),
    })),
    [stores]
  );

  const warehouseOptions = useMemo(
    () => warehouses.map((warehouse) => ({
      value: String(warehouse.id),
      label: `${warehouse.name}${warehouse.manager_name ? ` - Mgr: ${warehouse.manager_name}` : ''}`,
    })),
    [warehouses]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q))
    );
  }, [employees, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalCount = filtered.length;
  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalCount);

  useEffect(() => {
    setAllChecked(paginated.length > 0 && paginated.every((row) => checkedRows.includes(row.id)));
  }, [checkedRows, paginated]);

  const handleAllCheck = () => {
    if (allChecked) {
      setCheckedRows([]);
      setAllChecked(false);
    } else {
      setCheckedRows(paginated.map((row) => row.id));
      setAllChecked(true);
    }
  };

  const handleRowCheck = (id) => {
    setCheckedRows((prev) => (
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    ));
  };

  const resetForm = () => {
    setForm({ ...INITIAL_FORM });
    setEditingId(null);
  };

  const handleEdit = (employee) => {
    fetchRoles().then((data) => { if (Array.isArray(data) && data.length) setRoles(data); });
    const matchedRole = roles.find((role) => String(role.id) === String(employee.roleId) || (role.roleName || role.role_name)?.toLowerCase() === employee.role?.toLowerCase());
    setForm({
      ...INITIAL_FORM,
      firstName: employee.firstName ?? '',
      lastName: employee.lastName ?? '',
      username: employee.username ?? '',
      gender: employee.gender || 'Male',
      password: '',
      confirmPassword: '',
      mobileNumber: employee.mobileNumber ?? '',
      emailAddress: employee.emailAddress ?? '',
      roleId: String(matchedRole?.id || employee.roleId || ''),
      roleName: matchedRole?.roleName || matchedRole?.role_name || employee.role || '',
      permissions: Array.isArray(employee.permissions) && employee.permissions.length ? employee.permissions : (Array.isArray(matchedRole?.permissions) ? matchedRole.permissions : []),
      regionStore: parseMultiValue(employee.regionStore),
      warehouse: parseMultiValue(employee.warehouse),
      departmentId: employee.department ? String(departments.find((d) => (d.departmentName || d.department_name) === employee.department)?.id || '') : '',
      customerName: employee.customerName ?? '',
      userType: employee.userType || 'Regular',
      dateOfBirth: employee.dateOfBirth || '',
      dateOfJoining: employee.dateOfJoining || '',
      dateOfLeaving: employee.dateOfLeaving || '',
      employeeCode: employee.employeeCode ?? '',
      createCustomerSameDetails: Boolean(employee.createCustomerSameDetails),
      employmentType: employee.employmentType || 'Payroll',
      address: employee.address ?? '',
      employmentStatus: employee.employmentStatus || 'Active',
      contractorName: employee.contractorName ?? '',
      discountLimitType: employee.discountLimitType || 'Percentage',
      discountLimitValue: employee.discountLimitValue ?? '',
      maximumDiscountAmount: employee.maximumDiscountAmount ?? '',
    });
    setEditingId(employee.id);
    setShowCreate(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteEmployee(deleteConfirm);
      setEmployees((current) => current.filter((emp) => emp.id !== deleteConfirm));
      setDeleteConfirm(null);
      alert('Employee deleted successfully!');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to delete employee');
    }
  };

  const handlePasswordRequestAction = async (requestId, action) => {
    try {
      await updatePasswordChangeRequest(requestId, action);
      await loadPasswordRequests();
      alert(
        action === 'approve'
          ? 'Password request approved. Employee will be logged out in 5 minutes.'
          : 'Password request rejected.'
      );
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to update password request');
    }
  };

  const handleSave = async (event) => {
    if (event?.preventDefault) event.preventDefault();

    if (!form.firstName.trim()) return alert('First name is required');
    if (!form.lastName.trim()) return alert('Last name is required');
    if (!form.username.trim()) return alert('Username is required');
    if (!form.mobileNumber.trim()) return alert('Mobile number is required');
    if (!/^\d{10}$/.test(form.mobileNumber)) return alert('Mobile number must be exactly 10 digits');
    if (!form.emailAddress.trim()) return alert('Email address is required');
    if (!isValidEmail(form.emailAddress)) return alert('Enter a valid email address');
    if (!form.roleId || !form.roleName.trim()) return alert('Select an admin-defined role');

    setSaving(true);
    try {
      const payload = {
        first_name: form.firstName,
        last_name: form.lastName,
        username: form.username,
        gender: form.gender,
        mobile_number: form.mobileNumber.trim(),
        email_address: form.emailAddress.trim(),
        role_id: Number(form.roleId),
        role_name: form.roleName.trim(),
        assigned_stores: [...new Set([...form.regionStore, ...form.warehouse].map(Number).filter(Number.isFinite))],
        permissions: form.permissions,
        region_store: form.regionStore.join(','),
        warehouse: form.warehouse.join(','),
        department_id: form.departmentId ? Number(form.departmentId) : null,
        department_name: departments.find((department) => String(department.id) === String(form.departmentId))?.departmentName || '',
        customer_name: form.customerName,
        user_type: form.userType,
        date_of_birth: form.dateOfBirth || null,
        date_of_joining: form.dateOfJoining || null,
        date_of_leaving: form.dateOfLeaving || null,
        employee_code: form.employeeCode,
        create_customer_same_details: form.createCustomerSameDetails,
        employment_type: form.employmentType,
        address: form.address,
        employment_status: form.employmentStatus,
        contractor_name: form.contractorName,
        discount_limit_type: form.discountLimitType,
        discount_limit_value: form.discountLimitValue === '' ? null : Number(form.discountLimitValue),
        maximum_discount_amount: form.maximumDiscountAmount === '' ? null : Number(form.maximumDiscountAmount),
      };

      if (form.password) {
        payload.password = form.password;
        payload.confirm_password = form.confirmPassword;
      }

      if (editingId) {
        const updated = await updateEmployee(editingId, payload);
        setEmployees((current) => current.map((emp) => (emp.id === editingId ? mapEmployeeRow(updated.employee || updated) : emp)));
      } else {
        const created = await createEmployee(payload);
        setEmployees((current) => [mapEmployeeRow(created), ...current]);
      }

      setShowCreate(false);
      resetForm();
      setPage(1);
      alert(editingId ? 'Employee updated successfully!' : 'Employee created successfully!');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save employee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        {showCreate ? (
          /* Inline Create / Edit Employee Page matching standard app layout */
          <div className="pb-12 animate-in fade-in duration-200">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-5">
              <Link href="/employee" className="text-blue-600 hover:underline font-medium">Employee</Link>
              <i className="ti ti-chevron-right text-[11px] text-gray-400" />
              <button
                type="button"
                onClick={() => { setShowCreate(false); resetForm(); }}
                className="text-blue-600 hover:underline font-medium"
              >
                Employees
              </button>
              <i className="ti ti-chevron-right text-[11px] text-gray-400" />
              <span className="text-slate-700 font-semibold">{editingId ? 'Edit Employee' : 'Create Employee'}</span>
            </nav>

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[22px] font-bold text-gray-900">{editingId ? 'Edit Employee' : 'Create Employee'}</h1>
                <p className="text-[12.5px] text-gray-500 mt-1">
                  Admin controls employee ID, login credentials, role permissions, site store access, and warehouse access.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); resetForm(); }}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-800 transition shadow-sm disabled:opacity-50"
                >
                  <i className="ti ti-check text-sm" />
                  {saving ? 'Saving...' : editingId ? 'Update Employee' : 'Save Employee'}
                </button>
              </div>
            </div>

            {/* Form Body Card */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
              <h4 className="text-sm font-bold text-blue-700 mb-6 flex items-center gap-2">
                <i className="ti ti-user-circle text-lg" />
                Staff Information
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">First Name <span className="text-red-500">*</span></label>
                  <input
                    required
                    value={form.firstName}
                    onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                    placeholder="First Name"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Last Name</label>
                  <input
                    value={form.lastName}
                    onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                    placeholder="Last Name"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Username <span className="text-red-500">*</span></label>
                  <input
                    required
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    placeholder="Username"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <SelectField
                  label="Gender"
                  value={form.gender}
                  onChange={(gender) => setForm({ ...form, gender })}
                  options={[
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Password {editingId ? '(leave blank to keep current)' : <span className="text-red-500">*</span>}</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      required={!editingId}
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                      placeholder="Password"
                      className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                    />
                    {!editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          const password = randomPassword();
                          setForm((current) => ({ ...current, password, confirmPassword: password }));
                        }}
                        className="px-3.5 py-2.5 border border-blue-300 rounded-xl text-[12px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap"
                      >
                        Auto Generate
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Confirm Password {editingId ? '(if changing)' : <span className="text-red-500">*</span>}</label>
                  <input
                    type="password"
                    required={!editingId || !!form.password}
                    value={form.confirmPassword}
                    onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                    placeholder="Confirm Password"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Mobile Number <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    required
                    value={form.mobileNumber}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, '').slice(0, 10);
                      setForm({ ...form, mobileNumber: value });
                    }}
                    placeholder="Mobile Number (10 digits)"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                  {form.mobileNumber && !validatePhoneNumber(form.mobileNumber).isValid && (
                    <p className="text-[11px] text-red-600 mt-1">{validatePhoneNumber(form.mobileNumber).error}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    required
                    value={form.emailAddress}
                    onChange={(event) => setForm({ ...form, emailAddress: event.target.value })}
                    placeholder="Email Address"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <SelectField
                  label="Admin-defined Role"
                  value={form.roleId}
                  onChange={(roleId) => {
                    const selectedRole = roles.find((role) => String(role.id) === String(roleId));
                    setForm({
                      ...form,
                      roleId,
                      roleName: selectedRole?.roleName || selectedRole?.role_name || '',
                      permissions: Array.isArray(selectedRole?.permissions) ? selectedRole.permissions : [],
                    });
                  }}
                  options={roleOptions}
                />

                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-gray-600">Role permissions</label>
                  <div className="min-h-[42px] rounded-xl border border-gray-200 bg-slate-50 px-3.5 py-2.5">
                    {form.permissions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {form.permissions.map((perm) => (
                          <span key={perm} className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                            {perm}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-gray-400">Select an admin-defined role to view its permissions.</p>
                    )}
                  </div>
                </div>

                <MultiSelect
                  label="Assigned Sites & Site Stores"
                  options={storeOptions}
                  value={form.regionStore}
                  onChange={(regionStore) => setForm({ ...form, regionStore })}
                  placeholder="Select sites / site stores"
                  showSelectAll
                />

                <MultiSelect
                  label="Assigned Warehouses"
                  options={warehouseOptions}
                  value={form.warehouse}
                  onChange={(warehouse) => setForm({ ...form, warehouse })}
                  placeholder="Select warehouses"
                  showSelectAll
                />

                <SelectField
                  label="Department"
                  value={form.departmentId}
                  onChange={(departmentId) => setForm({ ...form, departmentId })}
                  options={departmentOptions}
                />

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Employee Code</label>
                  <input
                    value={form.employeeCode}
                    onChange={(event) => setForm({ ...form, employeeCode: event.target.value.toUpperCase() })}
                    placeholder="e.g. ASC-EMP-001"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Date of Birth</label>
                  <input
                    type="date"
                    value={form.dateOfBirth ? String(form.dateOfBirth).slice(0, 10) : ''}
                    onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Date of Joining</label>
                  <input
                    type="date"
                    value={form.dateOfJoining ? String(form.dateOfJoining).slice(0, 10) : ''}
                    onChange={(event) => setForm({ ...form, dateOfJoining: event.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Date of Leaving</label>
                  <input
                    type="date"
                    value={form.dateOfLeaving ? String(form.dateOfLeaving).slice(0, 10) : ''}
                    onChange={(event) => setForm({ ...form, dateOfLeaving: event.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <SelectField
                  label="Employment Type"
                  value={form.employmentType}
                  onChange={(employmentType) => setForm({ ...form, employmentType })}
                  options={[
                    { value: 'Payroll', label: 'Payroll' },
                    { value: 'Contractor', label: 'Contractor' },
                    { value: 'Temporary', label: 'Temporary' },
                  ]}
                />

                <SelectField
                  label="User Type"
                  value={form.userType}
                  onChange={(userType) => setForm({ ...form, userType })}
                  options={[
                    { value: 'Regular', label: 'Regular' },
                    { value: 'Field User', label: 'Field User' },
                  ]}
                />

                <div className="md:col-span-2">
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Address</label>
                  <textarea
                    rows={2}
                    value={form.address}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                    placeholder="Employee Address"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Contractor Name</label>
                  <input
                    value={form.contractorName}
                    onChange={(event) => setForm({ ...form, contractorName: event.target.value })}
                    placeholder="Contractor Name"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>

                <SelectField
                  label="Employment Status"
                  value={form.employmentStatus}
                  onChange={(employmentStatus) => setForm({ ...form, employmentStatus })}
                  options={[
                    { value: 'Active', label: 'Active' },
                    { value: 'Inactive', label: 'Inactive' },
                  ]}
                />
              </div>

              {/* Bottom Action Buttons */}
              <div className="mt-8 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); resetForm(); }}
                  className="rounded-xl border border-gray-200 px-6 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-xl bg-blue-700 px-7 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-800 transition-colors shadow-sm disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingId ? 'Update Employee' : 'Save Employee'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Table View */
          <>
            <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-5">
              <Link href="/employee" className="text-blue-600 hover:underline font-medium">Employee</Link>
              <i className="ti ti-chevron-right text-[11px] text-gray-400" />
              <span className="text-blue-600 font-semibold">Employees</span>
            </nav>

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-[22px] font-bold text-gray-900">Employees</h1>
                <p className="text-[12.5px] text-gray-500 mt-1">
                  List of all the users and respective stores.{' '}
                  <span className="text-blue-600 cursor-pointer hover:underline font-medium">Need Help?</span>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="relative" ref={bulkRef}>
                  <button
                    onClick={() => setBulkOpen((current) => !current)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-blue-600 text-blue-600 bg-white rounded-lg text-[12.5px] font-semibold hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    Bulk Operations
                    <i className={`ti ti-chevron-down text-[12px] transition-transform ${bulkOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {bulkOpen && (
                    <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                      {['Export', 'Deactivate Selected', 'Delete Selected'].map((operation) => (
                        <button
                          key={operation}
                          onClick={() => setBulkOpen(false)}
                          className="block w-full text-left px-4 py-2 text-[12.5px] text-gray-700 hover:bg-gray-50 transition"
                        >
                          {operation}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => { setEditingId(null); setShowCreate(true); resetForm(); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-lg text-[12.5px] font-semibold hover:bg-blue-800 transition-colors shadow-sm"
                >
                  <i className="ti ti-plus text-[14px]" />
                  Create Employee
                </button>
              </div>
            </div>

            {(passwordRequestsLoading || passwordRequests.length > 0) && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[14px] font-bold text-amber-950">Password Change Requests</h2>
                    <p className="mt-0.5 text-[12px] text-amber-800">
                      Approving a request activates the new password after 5 minutes.
                    </p>
                  </div>
                  <button
                    onClick={loadPasswordRequests}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Refresh
                  </button>
                </div>

                {passwordRequestsLoading ? (
                  <div className="text-[12.5px] text-amber-800">Loading password requests...</div>
                ) : (
                  <div className="space-y-2">
                    {passwordRequests.map((request) => {
                      const employeeName =
                        [request.first_name, request.last_name].filter(Boolean).join(' ').trim() ||
                        request.user_name ||
                        request.username ||
                        request.user_email;

                      return (
                        <div
                          key={request.id}
                          className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-gray-900">{employeeName}</div>
                            <div className="mt-0.5 text-[12px] text-gray-500">
                              {request.user_email} {request.role_name ? `- ${request.role_name}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePasswordRequestAction(request.id, 'reject')}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handlePasswordRequestAction(request.id, 'approve')}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end mb-4">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 w-full sm:w-[280px] shadow-sm">
                <i className="ti ti-search text-gray-400 text-[15px]" />
                <input
                  type="text"
                  placeholder="Search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  className="bg-transparent text-[13px] text-gray-700 outline-none flex-1 placeholder-gray-400 min-w-0"
                />
                {search && (
                  <button onClick={() => setSearch('')}>
                    <i className="ti ti-x text-gray-400 text-[13px]" />
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-white">
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={handleAllCheck}
                          className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600 cursor-pointer"
                        />
                      </th>
                      {columns.map((column) => (
                        <th key={column.key} className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={columns.length + 1} className="text-center py-16 text-gray-400">
                          <i className="ti ti-loader animate-spin text-[24px] block mb-2" />
                          Loading employees...
                        </td>
                      </tr>
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length + 1} className="text-center py-16 text-gray-400">
                          <i className="ti ti-users-minus text-[32px] block mb-2 text-gray-300" />
                          No employees found
                        </td>
                      </tr>
                    ) : (
                      paginated.map((employee, index) => {
                        const isChecked = checkedRows.includes(employee.id);
                        const serialNumber = (page - 1) * pageSize + index + 1;

                        return (
                          <tr
                            key={employee.id}
                            className={`border-b border-gray-50 hover:bg-gray-50/70 transition ${isChecked ? 'bg-blue-50/40' : ''}`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleRowCheck(employee.id)}
                                className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 text-gray-500 font-mono text-[11.5px]">{serialNumber}</td>
                            <td className="px-4 py-3 text-gray-900 font-medium">{employee.username || '-'}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{employee.name || '-'}</td>
                            <td className="px-4 py-3 text-gray-600">{employee.employeeCode || '-'}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">
                                {employee.role || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{employee.department || '-'}</td>
                            <td className="px-4 py-3 text-gray-600">{employee.employeeType || '-'}</td>
                            <td className="px-4 py-3 text-gray-600">{employee.contractorName || '-'}</td>
                            <td className="px-4 py-3 text-gray-600">{employee.mobileNumber || '-'}</td>
                            <td className="px-4 py-3 text-gray-600">{employee.emailAddress || '-'}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                  employee.employmentStatus === 'Active'
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-red-50 text-red-600'
                                }`}
                              >
                                {employee.employmentStatus || 'Active'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleEdit(employee)}
                                  className="p-1 rounded hover:bg-blue-50 text-blue-600 transition"
                                  title="Edit Employee"
                                >
                                  <i className="ti ti-edit text-[15px]" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(employee.id)}
                                  className="p-1 rounded hover:bg-red-50 text-red-600 transition"
                                  title="Delete Employee"
                                >
                                  <i className="ti ti-trash text-[15px]" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-gray-100 gap-3 text-[12.5px] text-gray-500">
                <div className="flex items-center gap-2">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                    className="border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 outline-none"
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                  <span>entries</span>
                </div>

                <div className="flex items-center gap-4">
                  <span>Showing {startIndex} to {endIndex} of {totalCount} entries</span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <i className="ti ti-chevron-left text-gray-600 text-[14px]" />
                    </button>
                    <span className="font-semibold text-gray-700 px-1">{page} / {totalPages}</span>
                    <button
                      disabled={page === totalPages || totalPages === 0}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <i className="ti ti-chevron-right text-gray-600 text-[14px]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {mounted && deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
             onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100/80">
                <i className="ti ti-alert-triangle text-[22px]" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-gray-900">Delete Employee?</h2>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-[13px] text-gray-600 mb-6 leading-relaxed">
              Are you sure you want to delete this employee? This action cannot be undone.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-[13px] font-semibold hover:bg-red-700 transition shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </MainLayout>
  );
}
