'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import CustomerSearchModal from '@/components/CustomerSearchModal';
import { extractStores } from '@/lib/clientResponse';

const columns = [
  { key: 'orderId', label: 'Order ID' },
  { key: 'customerId', label: 'Customer ID' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'customerType', label: 'Customer Type' },
  { key: 'orderAmount', label: 'Order Amount' },
  { key: 'amountDue', label: 'Amount Due' },
  { key: 'action', label: 'Action' },
];

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function SettleOrderModal({ open, rows, onClose, onSubmit, submitting }) {
  const totalDue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amountDue || 0), 0),
    [rows]
  );

  const [settlementAmount, setSettlementAmount] = useState('');
  const [paymentType, setPaymentType] = useState('Cash');
  const [referenceId, setReferenceId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!open) return;
    setSettlementAmount(totalDue > 0 ? String(totalDue.toFixed(2)) : '');
    setPaymentType('Cash');
    setReferenceId('');
    setRemarks('');
    setSettlementDate(new Date().toISOString().slice(0, 10));
  }, [open, totalDue]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      settlementAmount: Number(settlementAmount || 0),
      paymentType,
      referenceId,
      remarks,
      settlementDate,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[640px] bg-white rounded-xl border border-gray-300 shadow-xl overflow-hidden my-6">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-[18px] font-semibold text-gray-900">Settle Selected Orders</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <i className="ti ti-x text-[20px]" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded border border-gray-200 p-3 bg-gray-50">
              <p className="text-[12px] text-gray-500">Selected Orders</p>
              <p className="text-[16px] font-semibold text-gray-900">{rows.length}</p>
            </div>
            <div className="rounded border border-gray-200 p-3 bg-gray-50">
              <p className="text-[12px] text-gray-500">Total Due Amount</p>
              <p className="text-[16px] font-semibold text-gray-900">{formatMoney(totalDue)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-gray-700 mb-1">Settlement Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={totalDue}
                value={settlementAmount}
                onChange={(event) => setSettlementAmount(event.target.value)}
                className="h-10 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-[12px] text-gray-700 mb-1">Settlement Date</label>
              <input
                type="date"
                value={settlementDate}
                onChange={(event) => setSettlementDate(event.target.value)}
                className="h-10 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-gray-700 mb-1">Payment Type</label>
              <select
                value={paymentType}
                onChange={(event) => setPaymentType(event.target.value)}
                className="h-10 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-gray-700 mb-1">Reference ID</label>
              <input
                type="text"
                value={referenceId}
                onChange={(event) => setReferenceId(event.target.value)}
                placeholder="Txn/Ref Number"
                className="h-10 w-full border border-gray-200 rounded px-3 text-[13px] text-gray-700 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] text-gray-700 mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded px-3 py-2 text-[13px] text-gray-700 bg-white"
              placeholder="Optional notes"
            />
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
              disabled={submitting}
              className="h-10 px-4 rounded bg-blue-700 text-white text-[13px] font-medium disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-800"
            >
              {submitting ? 'Settling...' : 'Confirm Settlement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UnsettledOrdersPage() {
  const [stores, setStores] = useState([]);
  const [store, setStore] = useState('all');
  const [orderType, setOrderType] = useState('Sales Order');
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState([]);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [submittingSettlement, setSubmittingSettlement] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
      if (orderType && orderType !== 'all') qs.set('orderType', orderType);
      if (customerId) qs.set('customerId', String(customerId));
      if (search.trim()) qs.set('search', search.trim());

      const res = await fetch(`/api/customer-unsettled-orders?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch unsettled orders');

      const listRows = Array.isArray(data.rows) ? data.rows : [];
      const pagination = data.pagination || {};

      setRows(listRows);
      setPage(Number(pagination.page || nextPage));
      setPageSize(Number(pagination.pageSize || nextPageSize));
      setTotal(Number(pagination.total || 0));
      setTotalPages(Number(pagination.totalPages || 1));
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setErrorMessage(err.message || 'Unable to load unsettled orders');
    } finally {
      setLoading(false);
    }
  }, [customerId, orderType, pageSize, search, store]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    fetchRows({ nextPage: 1 });
  }, [fetchRows]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );

  const allChecked = rows.length > 0 && selectedIds.length === rows.length;
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total);

  const toggleRow = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (allChecked) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(rows.map((row) => row.id));
  };

  const applyFilters = () => {
    setPage(1);
    fetchRows({ nextPage: 1 });
  };

  const openSettleModal = (ids = selectedIds) => {
    if (!ids.length) {
      window.alert('Please select at least one order');
      return;
    }

    const selectable = rows.filter((row) => ids.includes(row.id)).map((row) => row.id);
    setSelectedIds(selectable);
    setShowSettleModal(true);
  };

  const submitSettlement = async ({ settlementAmount, paymentType, referenceId, remarks, settlementDate }) => {
    setSubmittingSettlement(true);
    try {
      const res = await fetch('/api/customer-unsettled-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          settlementAmount,
          paymentType,
          referenceId,
          remarks,
          settlementDate,
          store,
          orderType,
          customerId,
          search,
          pageSize,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to settle selected orders');

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setPage(Number(data.pagination?.page || 1));
      setPageSize(Number(data.pagination?.pageSize || pageSize));
      setTotal(Number(data.pagination?.total || 0));
      setTotalPages(Number(data.pagination?.totalPages || 1));

      setShowSettleModal(false);
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Unable to settle orders');
    } finally {
      setSubmittingSettlement(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-4 flex-wrap">
          <Link href="/customer/dashboard" className="hover:text-blue-600 transition-colors">Customer</Link>
          <i className="ti ti-chevron-right text-[11px] text-gray-400" />
          <span className="text-blue-600 font-medium">Settle Customer Ledger</span>
        </nav>

        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[36px] font-semibold text-gray-900 leading-tight">Settle Customer Ledger</h1>
            <p className="text-[12.5px] text-gray-500 mt-1">
              Description of Settle Customer Ledger will be updated later!{' '}
              <span className="text-blue-600 cursor-pointer hover:underline">Need Help?</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => openSettleModal()}
            disabled={!selectedIds.length}
            className="h-10 px-5 inline-flex items-center justify-center bg-blue-700 text-white rounded text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-800"
          >
            Settle Order
          </button>
        </div>

        <div className="bg-white rounded border border-gray-200 overflow-hidden">
          <div className="px-5 pt-4 pb-4 border-b border-gray-100">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
              <div>
                <label className="block text-[13px] text-gray-800 mb-2">Select Store</label>
                <div className="relative">
                  <select
                    value={store}
                    onChange={(event) => setStore(event.target.value)}
                    className="h-10 w-full appearance-none border border-gray-200 rounded px-3 pr-9 text-[13px] text-gray-700 bg-white"
                  >
                    <option value="all">All Stores</option>
                    {stores.map((storeOption) => (
                      <option key={storeOption.id} value={String(storeOption.id)}>
                        {storeOption.name}
                      </option>
                    ))}
                  </select>
                  <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]" />
                </div>
              </div>

              <div>
                <label className="block text-[13px] text-gray-800 mb-2">Select Order Type</label>
                <div className="relative">
                  <select
                    value={orderType}
                    onChange={(event) => setOrderType(event.target.value)}
                    className="h-10 w-full appearance-none border border-gray-200 rounded px-3 pr-9 text-[13px] text-gray-700 bg-white"
                  >
                    <option value="Sales Order">Sales Order</option>
                    <option value="Bulk Sales Order">Bulk Sales Order</option>
                    <option value="Online Order">Online Order</option>
                    <option value="all">All</option>
                  </select>
                  <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]" />
                </div>
              </div>

              <div>
                <label className="block text-[13px] text-gray-800 mb-2">Customer</label>
                <div className="relative">
                  <input
                    type="text"
                    value={customer}
                    readOnly
                    onClick={() => setShowCustomerModal(true)}
                    placeholder="None"
                    className="h-10 w-full border border-gray-200 rounded pl-3 pr-10 text-[13px] text-gray-700 bg-white cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-gray-100"
                    aria-label="Search customer"
                  >
                    <i className="ti ti-search text-[15px] text-gray-500" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyFilters}
                  className="h-10 px-4 inline-flex items-center justify-center bg-blue-700 text-white rounded text-[13px] font-medium hover:bg-blue-800"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="w-full max-w-[340px]">
                <div className="relative">
                  <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyFilters();
                    }}
                    placeholder="Search orders"
                    className="h-10 w-full rounded border border-gray-300 bg-white pl-10 pr-3 text-[13px] text-gray-700"
                  />
                </div>
              </div>

              {customerId ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomer('');
                    setCustomerId(null);
                  }}
                  className="h-10 px-3 rounded border border-gray-200 text-[13px] text-gray-700 hover:bg-gray-50"
                >
                  Clear Customer
                </button>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-3 py-3 text-left w-[42px]">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </th>
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
                    <td colSpan={columns.length + 1} className="px-4 py-8 text-[13px] text-gray-500 text-center">
                      Loading records...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-10 text-[13px] text-center text-gray-500">
                      {errorMessage || 'No Data Found'}
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.orderId}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.customerId}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.customerName}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{row.customerType}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{formatMoney(row.orderAmount)}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">{formatMoney(row.amountDue)}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openSettleModal([row.id])}
                        className="px-2.5 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        Settle
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
            onSelect={(selectedCustomer) => {
              setCustomer(selectedCustomer?.name || '');
              setCustomerId(selectedCustomer?.id || null);
            }}
          />
        ) : null}

        <SettleOrderModal
          open={showSettleModal}
          rows={selectedRows}
          onClose={() => setShowSettleModal(false)}
          onSubmit={submitSettlement}
          submitting={submittingSettlement}
        />
      </div>
    </MainLayout>
  );
}
