'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import CustomerSearchModal from '@/components/CustomerSearchModal';
import { extractStores } from '@/lib/clientResponse';

const columns = [
  { key: 'customerId', label: 'Customer ID' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'mobileNumber', label: 'Mobile Number' },
  { key: 'emailAddress', label: 'Email Address' },
  { key: 'customerType', label: 'Customer Type' },
  { key: 'customerBalance', label: 'Customer Balance' },
  { key: 'action', label: 'Action' },
];

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateInput(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function AddMoneyModal({ open, customer, onClose, onSubmit, submitting, onPickCustomer }) {
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setPaymentMode('Cash');
  }, [open]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      customerId: customer?.id,
      amount: Number(amount || 0),
      paymentMode,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[760px] bg-white rounded-xl border border-gray-300 shadow-xl overflow-hidden my-6">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-[18px] font-semibold text-gray-900">Add Money</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <i className="ti ti-x text-[20px]" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] text-gray-700 mb-1">Customer</label>
            <div className="flex gap-2">
              <input
                value={customer?.name || ''}
                readOnly
                placeholder="Select customer"
                className="h-10 flex-1 border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white cursor-pointer"
                onClick={onPickCustomer}
              />
              <button
                type="button"
                onClick={onPickCustomer}
                className="h-10 px-4 rounded bg-blue-700 text-white text-[13px] font-medium hover:bg-blue-800"
              >
                Search
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-10 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-[12px] text-gray-700 mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(event) => setPaymentMode(event.target.value)}
                className="h-10 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded border border-gray-200 text-[13px] text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !customer?.id}
              className="h-10 px-4 rounded bg-blue-700 text-white text-[13px] font-medium disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-800"
            >
              {submitting ? 'Saving...' : 'Save Money'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CustomerAdvancePaymentPage() {
  const today = useMemo(() => new Date(), []);

  const [stores, setStores] = useState([]);
  const [store, setStore] = useState('all');
  const [customerType, setCustomerType] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [showAddMoneyModal, setShowAddMoneyModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  const initialLoadRef = useRef(false);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/stores');
      const data = await res.json();
      setStores(extractStores(data));
    } catch (err) {
      console.error(err);
      setStores([]);
    }
  }, []);

  const fetchRows = useCallback(async ({ nextPage = 1, nextPageSize = pageSize } = {}) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const qs = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
      });

      if (store && store !== 'all') qs.set('store', store);
      if (customerType && customerType !== 'all') qs.set('customerType', customerType);
      if (search.trim()) qs.set('search', search.trim());

      const res = await fetch(`/api/customer-advance-payments?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch customer advance payments');

      const listRows = Array.isArray(data.rows) ? data.rows : [];
      const pagination = data.pagination || {};

      setRows(listRows);
      setPage(Number(pagination.page || nextPage));
      setPageSize(Number(pagination.pageSize || nextPageSize));
      setTotal(Number(pagination.total || 0));
      setTotalPages(Number(pagination.totalPages || 1));
    } catch (err) {
      console.error(err);
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setErrorMessage(err.message || 'Failed to fetch customer advance payments');
    } finally {
      setLoading(false);
    }
  }, [customerType, pageSize, search, store]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    fetchRows({ nextPage: 1 });
  }, [fetchRows]);

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total);

  const exportCsv = () => {
    const header = columns.filter((col) => col.key !== 'action').map((col) => col.label);
    const dataRows = rows.map((row) => [
      row.customerId,
      row.customerName,
      row.mobileNumber,
      row.emailAddress,
      row.customerType,
      formatMoney(row.customerBalance),
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`));

    const blob = new Blob([[header.join(','), ...dataRows.map((r) => r.join(','))].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `customer-advance-payment-${formatDateInput(today)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openAddMoney = () => {
    setShowAddMoneyModal(true);
  };

  const handleSaveMoney = async (payload) => {
    setSaving(true);
    try {
      const res = await fetch('/api/customer-advance-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          createdBy: 'System',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add money');

      setShowAddMoneyModal(false);
      await fetchRows({ nextPage: 1 });
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Unable to save money');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-4 flex-wrap">
          <Link href="/customer/dashboard" className="hover:text-blue-600 transition-colors">Customer</Link>
          <i className="ti ti-chevron-right text-[11px] text-gray-400" />
          <span className="text-blue-600 font-medium">Customer Advance Payment</span>
        </nav>

        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">Customer Advance Payment</h1>
            <p className="text-[12.5px] text-gray-500 mt-1">
              Customer Advance Payment Description will be updated later.{' '}
              <span className="text-blue-600 cursor-pointer hover:underline">Need Help?</span>
            </p>
          </div>

          <button
            type="button"
            onClick={openAddMoney}
            className="h-10 px-5 inline-flex items-center justify-center bg-blue-700 text-white rounded text-[13px] font-medium hover:bg-blue-800"
          >
            Add Money
          </button>
        </div>

        <div className="flex justify-end mb-4">
          <div className="w-full max-w-[340px]">
            <div className="relative">
              <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setPage(1);
                    fetchRows({ nextPage: 1 });
                  }
                }}
                placeholder="Search"
                className="h-10 w-full rounded border border-gray-300 bg-white pl-10 pr-3 text-[13px] text-gray-700"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded border border-gray-200 overflow-hidden">
          <div className="px-5 pt-4 pb-4 border-b border-gray-100">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_220px_120px_44px] xl:items-start">
              <div>
                <label className="block text-[13px] text-gray-800 mb-2">Regions & Stores</label>
                <div className="relative">
                  <select
                    value={store}
                    onChange={(event) => setStore(event.target.value)}
                    className="h-10 w-full appearance-none border border-gray-200 rounded px-3 pr-9 text-[13px] text-gray-700 bg-white"
                  >
                    <option value="all">0 Regions & 0 Stores</option>
                    {stores.map((storeOption) => (
                      <option key={storeOption.id} value={String(storeOption.id)}>{storeOption.name}</option>
                    ))}
                  </select>
                  <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]" />
                </div>
              </div>

              <div>
                <label className="block text-[13px] text-gray-800 mb-2">Customer Type</label>
                <div className="relative">
                  <select
                    value={customerType}
                    onChange={(event) => setCustomerType(event.target.value)}
                    className="h-10 w-full appearance-none border border-gray-200 rounded px-3 pr-9 text-[13px] text-gray-700 bg-white"
                  >
                    <option value="all">ALL</option>
                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                    <option value="COMPANY">COMPANY</option>
                    <option value="WHOLESALE">WHOLESALE</option>
                  </select>
                  <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]" />
                </div>
              </div>

              <div className="xl:pt-[28px]">
                <button
                  type="button"
                  onClick={() => { setPage(1); fetchRows({ nextPage: 1 }); }}
                  className="h-10 px-5 inline-flex items-center justify-center bg-blue-700 text-white rounded text-[13px] font-medium hover:bg-blue-800"
                >
                  Apply
                </button>
              </div>

              <div className="xl:pt-[28px] xl:justify-self-end">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="h-10 w-10 inline-flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                  title="Download CSV"
                >
                  <i className="ti ti-download text-[15px]" />
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {columns.map((column) => (
                    <th key={column.key} className="px-4 py-3 text-left text-[12px] font-semibold text-gray-700 whitespace-nowrap">
                      {column.label} <span className="text-gray-400">↑↓</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-8 text-[13px] text-gray-500 text-center">
                      Loading records...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-[13px] text-center text-gray-500">
                      {errorMessage || 'No Data Found'}
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.customerId}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.customerName}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.mobileNumber}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.emailAddress}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.customerType}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{formatMoney(row.customerBalance)}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(row);
                          setShowAddMoneyModal(true);
                        }}
                        className="px-3 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        Add Money
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-gray-100 text-[12px] text-gray-500">
            <select
              value={pageSize}
              onChange={(event) => {
                const nextPageSize = Number(event.target.value);
                setPage(1);
                fetchRows({ nextPage: 1, nextPageSize });
              }}
              className="border border-gray-200 rounded px-3 py-2 bg-white text-[12px] text-gray-700"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>

            <span>Showing {showingFrom} to {showingTo} of {total} Results</span>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => fetchRows({ nextPage: page - 1 })}
                className="px-3 py-1.5 rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Prev
              </button>
              <span className="text-[12px] text-gray-600">Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => fetchRows({ nextPage: page + 1 })}
                className="px-3 py-1.5 rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {showCustomerModal ? (
          <CustomerSearchModal
            open={showCustomerModal}
            onClose={() => setShowCustomerModal(false)}
            onSelect={(customer) => {
              setSelectedCustomer(customer ? {
                id: customer.id,
                name: customer.name,
                customerBalance: selectedCustomer?.customerBalance || 0,
              } : null);
              setShowCustomerModal(false);
            }}
          />
        ) : null}

        <AddMoneyModal
          open={showAddMoneyModal}
          customer={selectedCustomer}
          onClose={() => setShowAddMoneyModal(false)}
          onPickCustomer={() => setShowCustomerModal(true)}
          onSubmit={handleSaveMoney}
          submitting={saving}
        />
      </div>
    </MainLayout>
  );
}
