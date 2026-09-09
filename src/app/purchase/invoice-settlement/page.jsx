"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import MainLayout from "@/components/MainLayout";
import { fetchLookup, normalizeVendors } from "@/lib/purchaseLookups";
import { formatIndianDate } from "@/lib/dateUtils";

const tableHeaders = [
  "Invoice ID",
  "Vendor Name",
  "Brand",
  "Transferred Store",
  "Invoice Number",
  "Amount Due",
  "Amount Paid",
  "Amount Left",
  "Source Type",
  "Source Transaction",
  "Source Date",
  "Invoice Date",
  "Invoice Due Date",
  "Days Left",
  "Invoice Status",
  "Bill Verified & Submitted",
  "Payment Approval Date",
  "Calendar",
  "Settle",
  "View Payment Details",
];

const REQUIRED_TABLE_HEADERS = new Set([
  "Invoice ID",
  "Vendor Name",
  "Amount Due",
  "Amount Left",
  "Settle",
  "View Payment Details",
]);
const TABLE_PREFERENCES_KEY = "invoice-settlement-table-preferences-v1";

function getSavedTablePreferences() {
  if (typeof window === "undefined") {
    return { hiddenColumns: [], compactMode: false };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(TABLE_PREFERENCES_KEY) || "{}");
    return {
      hiddenColumns: Array.isArray(saved.hiddenColumns)
        ? saved.hiddenColumns.filter((header) => tableHeaders.includes(header))
        : [],
      compactMode: Boolean(saved.compactMode),
    };
  } catch {
    return { hiddenColumns: [], compactMode: false };
  }
}

function formatDate(value) {
  return formatIndianDate(value, "—");
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function getDaysLeftValue(row) {
  const status = String(row?.status || "").toLowerCase();
  if (status === "paid" || Number(row?.amountLeft || 0) <= 0) return null;
  const dueDate = parseDateOnly(row?.dueDate);
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((dueDate.getTime() - today.getTime()) / 86400000);
}

function formatDaysLeft(row) {
  const status = String(row?.status || "").toLowerCase();
  if (status === "paid" || Number(row?.amountLeft || 0) <= 0) return "Paid";
  const days = getDaysLeftValue(row);
  if (days === null) return "No due date";
  if (days < 0) {
    const overdueDays = Math.abs(days);
    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function getSettlementSortValue(row) {
  const status = String(row?.status || "").toLowerCase();
  const isPaid = status === "paid" || Number(row?.amountLeft || 0) <= 0;
  if (isPaid) return [1, Number.POSITIVE_INFINITY, 0];
  const days = getDaysLeftValue(row);
  return [
    0,
    days === null ? Number.POSITIVE_INFINITY : days,
    -(Number(row?.amountLeft || 0) || 0),
  ];
}

function mapRecordsToTable(records) {
  return (records || []).map((row) => ({
    "Invoice ID": row.transactionId
      ? `#${row.transactionId}`
      : `#INV-${String(row.id).padStart(4, "0")}`,
    "Vendor Name": row.vendorName || "—",
    Brand: row.brandNames || "—",
    "Transferred Store": row.transferredStores || "Not transferred",
    "Invoice Number": row.invoiceNumber || "—",
    "Amount Due": formatCurrency(row.totalAmount),
    "Amount Paid": formatCurrency(row.amountPaid),
    "Amount Left": formatCurrency(row.amountLeft),
    "Source Type": row.sourceType || "Manual Invoice",
    "Source Transaction": row.sourceTransactionId
      ? `#${row.sourceTransactionId}`
      : row.grnId
        ? `#${row.grnId}`
        : row.poId
          ? `#${row.poId}`
          : "—",
    "Source Date": formatDate(row.sourceDate || row.createdAt),
    "Invoice Date": formatDate(row.invoiceDate),
    "Invoice Due Date": formatDate(row.dueDate),
    "Days Left": formatDaysLeft(row),
    "Invoice Status": row.status || "Pending",
    "Bill Verified & Submitted": row.billVerifiedSubmitted ? "Yes" : "No",
    "Payment Approval Date": row.billVerifiedSubmittedAt
      ? formatDate(row.billVerifiedSubmittedAt)
      : "Not approved",
    "View Payment Details": "View",
  }));
}

async function fetchVendorInvoices() {
  const res = await fetch("/api/vendor-invoices", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch vendor invoices");
  return res.json();
}

async function settleVendorInvoice(payload) {
  const res = await fetch("/api/vendor-invoices", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to settle invoice");
  return data;
}

async function updateVendorPayment(payload) {
  const res = await fetch("/api/vendor-invoices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update payment");
  return data;
}

async function updateBillVerification(invoiceId, billVerifiedSubmitted) {
  const res = await fetch("/api/vendor-invoices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "bill-verification",
      invoiceId,
      billVerifiedSubmitted,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to update bill verification status");
  }
  return data;
}

async function fetchCalendarStatus() {
  const res = await fetch("/api/integrations/google-calendar", {
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to check Google Calendar");
  return data;
}

async function saveCalendarEvent(payload) {
  const res = await fetch("/api/integrations/google-calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create Calendar event");
  return data;
}

function exportCsv(rows) {
  const headers = tableHeaders.filter(
    (header) =>
      !["Calendar", "Settle", "View Payment Details"].includes(header),
  );
  const csv = [
    headers.join(","),
    ...mapRecordsToTable(rows).map((row) =>
      headers
        .map((header) => `"${String(row[header] || "").replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `invoice-settlement-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function InvoiceSettlementPage() {
  const [tablePreferences, setTablePreferences] = useState(getSavedTablePreferences);
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const [records, setRecords] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState({
    vendor: "all",
    status: "all",
  });
  const [filters, setFilters] = useState({
    vendor: "all",
    status: "all",
  });
  const [error, setError] = useState("");
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [detailsInvoice, setDetailsInvoice] = useState(null);
  const [settlement, setSettlement] = useState({
    amount: "",
    paymentMode: "Bank Transfer",
    referenceNo: "",
    settlementDate: new Date().toISOString().slice(0, 10),
    remarks: "",
  });
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentEdit, setPaymentEdit] = useState({
    amount: "",
    paymentMode: "Bank Transfer",
    referenceNo: "",
    settlementDate: "",
    remarks: "",
  });
  const [savingPaymentEdit, setSavingPaymentEdit] = useState(false);
  const [updatingBillId, setUpdatingBillId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortMode, setSortMode] = useState("due");
  const [calendarStatus, setCalendarStatus] = useState({
    loading: true,
    connected: false,
    email: null,
  });
  const [calendarInvoice, setCalendarInvoice] = useState(null);
  const [calendarForm, setCalendarForm] = useState({
    attendees: "",
    reminderMinutes: "1440",
  });
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");

  const visibleTableHeaders = useMemo(
    () =>
      tableHeaders.filter(
        (header) =>
          REQUIRED_TABLE_HEADERS.has(header) ||
          !tablePreferences.hiddenColumns.includes(header),
      ),
    [tablePreferences.hiddenColumns],
  );

  useEffect(() => {
    localStorage.setItem(TABLE_PREFERENCES_KEY, JSON.stringify(tablePreferences));
  }, [tablePreferences]);

  const toggleColumnVisibility = (header) => {
    if (REQUIRED_TABLE_HEADERS.has(header)) return;
    setTablePreferences((current) => ({
      ...current,
      hiddenColumns: current.hiddenColumns.includes(header)
        ? current.hiddenColumns.filter((item) => item !== header)
        : [...current.hiddenColumns, header],
    }));
  };

  const loadData = () => {
    setLoading(true);
    setError("");
    Promise.allSettled([fetchVendorInvoices(), fetchLookup("/api/vendors")])
      .then(([invoiceResult, vendorResult]) => {
        if (invoiceResult.status === "fulfilled") {
          setRecords(
            Array.isArray(invoiceResult.value) ? invoiceResult.value : [],
          );
        } else {
          setError(
            invoiceResult.reason?.message ||
              "Failed to load invoice settlements",
          );
          setRecords([]);
        }

        if (vendorResult.status === "fulfilled") {
          setVendors(normalizeVendors(vendorResult.value));
        } else {
          setError(
            (current) =>
              current ||
              vendorResult.reason?.message ||
              "Failed to load vendors",
          );
          setVendors([]);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    fetchCalendarStatus()
      .then((data) => setCalendarStatus({ loading: false, ...data }))
      .catch((err) =>
        setCalendarStatus({
          loading: false,
          connected: false,
          email: null,
          error: err.message,
        }),
      );
    const params = new URLSearchParams(window.location.search);
    const result = params.get("calendar");
    const message = params.get("message");
    if (result) {
      setCalendarMessage(
        message ||
          (result === "connected"
            ? "Google Calendar connected successfully."
            : "Google Calendar could not be connected."),
      );
      params.delete("calendar");
      params.delete("message");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
  }, []);

  const submitCalendarEvent = async () => {
    if (!calendarInvoice) return;
    setSavingCalendar(true);
    try {
      const attendees = calendarForm.attendees
        .split(/[;,\n]/)
        .map((email) => email.trim())
        .filter(Boolean);
      const result = await saveCalendarEvent({
        invoiceId: calendarInvoice.id,
        attendees,
        reminderMinutes: Number(calendarForm.reminderMinutes),
      });
      setCalendarInvoice(null);
      setCalendarMessage(
        result.eventLink
          ? "Calendar event saved and email invitations sent."
          : "Calendar event saved successfully.",
      );
    } catch (err) {
      alert(err.message || "Failed to create Calendar event");
    } finally {
      setSavingCalendar(false);
    }
  };

  const handleApplyFilters = () => {
    setFilters(draftFilters);
    setPage(1);
  };

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((row) => {
      const vendorMatch =
        filters.vendor === "all" ||
        String(row.vendorId) === String(filters.vendor);
      const statusMatch =
        filters.status === "all" ||
        String(row.status || "").toLowerCase() === filters.status.toLowerCase();
      const searchMatch =
        !q ||
        [
          row.transactionId,
          row.vendorName,
          row.brandNames,
          row.transferredStores,
          row.invoiceNumber,
          row.status,
          row.remarks,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      return vendorMatch && statusMatch && searchMatch;
    });
  }, [records, search, filters]);

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      if (sortMode === "latest") {
        const aDate = new Date(
          a.sourceDate || a.invoiceDate || a.createdAt || 0,
        ).getTime();
        const bDate = new Date(
          b.sourceDate || b.invoiceDate || b.createdAt || 0,
        ).getTime();
        if (aDate !== bDate) return bDate - aDate;
        return Number(b.id || 0) - Number(a.id || 0);
      }
      const aSort = getSettlementSortValue(a);
      const bSort = getSettlementSortValue(b);
      for (let index = 0; index < aSort.length; index += 1) {
        if (aSort[index] !== bSort[index]) return aSort[index] - bSort[index];
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [filteredRecords, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startRecord = sortedRecords.length ? (safePage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(safePage * pageSize, sortedRecords.length);

  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [safePage, sortedRecords]);

  const tableData = useMemo(
    () => mapRecordsToTable(paginatedRecords),
    [paginatedRecords],
  );

  useEffect(() => {
    setPage(1);
  }, [search, filters]);

  const openSettlement = (invoice) => {
    setActiveInvoice(invoice);
    setSettlement({
      amount: invoice.amountLeft ? String(invoice.amountLeft) : "",
      paymentMode: "Bank Transfer",
      referenceNo: "",
      settlementDate: new Date().toISOString().slice(0, 10),
      remarks: "",
    });
  };

  const submitSettlement = async () => {
    if (!activeInvoice) return;
    const amount = Number(settlement.amount || 0);
    if (!amount || amount <= 0) return alert("Enter settlement amount");
    setSavingSettlement(true);
    try {
      const result = await settleVendorInvoice({
        invoiceId: activeInvoice.id,
        ...settlement,
        amount,
      });
      setRecords((current) =>
        current.map((invoice) =>
          Number(invoice.id) === Number(activeInvoice.id)
            ? {
                ...invoice,
                amountPaid: Number(result.amountPaid || 0),
                amountLeft: Number(result.amountLeft || 0),
                status: result.status || invoice.status,
              }
            : invoice,
        ),
      );
      setActiveInvoice(null);
    } catch (err) {
      alert(err.message || "Failed to settle invoice");
    } finally {
      setSavingSettlement(false);
    }
  };

  const openPaymentEdit = (payment) => {
    setEditingPayment(payment);
    setPaymentEdit({
      amount: String(payment.amount ?? ""),
      paymentMode: payment.paymentMode || "Bank Transfer",
      referenceNo: payment.referenceNo || "",
      settlementDate: String(payment.settlementDate || "").slice(0, 10),
      remarks: payment.remarks || "",
    });
  };

  const savePaymentEdit = async () => {
    if (!editingPayment) return;
    const amount = Number(paymentEdit.amount || 0);
    if (!amount || amount <= 0) return alert("Enter a valid payment amount");
    setSavingPaymentEdit(true);
    try {
      await updateVendorPayment({
        settlementId: editingPayment.id,
        ...paymentEdit,
        amount,
      });
      setEditingPayment(null);
      setDetailsInvoice(null);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to update payment");
    } finally {
      setSavingPaymentEdit(false);
    }
  };

  const handleBillVerificationChange = async (invoice, value) => {
    const billVerifiedSubmitted = value === "yes";
    if (billVerifiedSubmitted === Boolean(invoice.billVerifiedSubmitted)) return;
    setUpdatingBillId(invoice.id);
    try {
      const result = await updateBillVerification(invoice.id, billVerifiedSubmitted);
      setRecords((current) =>
        current.map((row) =>
          Number(row.id) === Number(invoice.id)
            ? {
                ...row,
                billVerifiedSubmitted: result.billVerifiedSubmitted,
                billVerifiedSubmittedBy: result.billVerifiedSubmittedBy,
                billVerifiedSubmittedAt: result.billVerifiedSubmittedAt,
              }
            : row,
        ),
      );
    } catch (err) {
      alert(err.message || "Failed to update bill verification status");
    } finally {
      setUpdatingBillId(null);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Purchase</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">Invoice Settlement</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">
            Vendor Invoice Credit Settlement
          </h1>
          <p className="text-[12.5px] text-gray-400 mt-1">
            Detail report for the vendor invoice credit settlement according to
            vendor and invoice status. Need Help?
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-gray-800">
              Vendor:
            </label>
            <select
              value={draftFilters.vendor}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, vendor: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-[12px] bg-white text-gray-800"
            >
              <option value="all">ALL</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-gray-800">
              Invoice Status:
            </label>
            <select
              value={draftFilters.status}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, status: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-[12px] bg-white text-gray-800"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <button
            onClick={handleApplyFilters}
            className="px-4 py-2 rounded-lg bg-blue-600 text-[12px] font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div>
          <p className="text-[13px] font-bold text-gray-900">Google Calendar reminders</p>
          <p className="mt-1 text-[12px] text-gray-500">
            {calendarStatus.loading
              ? "Checking connection..."
              : calendarStatus.connected
                ? `Connected${calendarStatus.email ? ` as ${calendarStatus.email}` : ""}. Due-date events can notify selected team members.`
                : "Connect a Google account to create vendor payable due-date events."}
          </p>
          {calendarMessage && (
            <p className="mt-2 text-[12px] font-semibold text-emerald-700">
              {calendarMessage}
            </p>
          )}
        </div>
        {calendarStatus.connected ? (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Disconnect Google Calendar? Existing events will remain in Google Calendar.")) return;
              const res = await fetch("/api/integrations/google-calendar", { method: "DELETE" });
              if (res.ok) setCalendarStatus({ loading: false, connected: false, email: null });
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Disconnect
          </button>
        ) : (
          <a
            href="/api/integrations/google-calendar/connect"
            className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-blue-700"
          >
            Connect Google Calendar
          </a>
        )}
      </div>

      <div className="flex max-h-[calc(100dvh-320px)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex flex-none items-center gap-3 px-4 py-3 border-b border-gray-200 justify-between flex-wrap bg-white">
          <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-[340px] bg-gray-50 rounded-lg px-3 py-2">
            <i className="ti ti-search text-gray-400 text-[16px]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-700"
              aria-label="Sort invoice settlements"
            >
              <option value="due">Payment due priority</option>
              <option value="latest">Latest GRN first</option>
            </select>
            <button
              onClick={() => exportCsv(sortedRecords)}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              title="Download CSV"
            >
              <i className="ti ti-download text-gray-500 text-[16px]" />
            </button>
            <button
              type="button"
              onClick={() => setColumnsPanelOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
              title="Show, hide, or compact table columns"
            >
              <i className="ti ti-columns-3 text-[16px] text-gray-500" />
              Columns
            </button>
          </div>
        </div>
        {error && (
          <div className="px-4 py-3 border-b border-red-100 bg-red-50 text-[12px] font-semibold text-red-600">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <table
            className={`w-full ${
              tablePreferences.compactMode ? "min-w-[1080px]" : "min-w-[1620px]"
            }`}
          >
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_rgba(226,232,240,1)]">
              <tr className="border-b border-gray-100">
                {visibleTableHeaders.map((header) => (
                  <th
                    key={header}
                    className={`${tablePreferences.compactMode ? "px-2.5 py-2 text-[10px]" : "px-4 py-3 text-[11px]"} text-left font-bold text-gray-500 tracking-wide uppercase`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={visibleTableHeaders.length}
                    className="px-4 py-14 text-center text-[14px] text-gray-500"
                  >
                    Loading records...
                  </td>
                </tr>
              ) : tableData.length > 0 ? (
                tableData.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors"
                  >
                    {visibleTableHeaders.map((header, colIdx) => (
                      <td
                        key={colIdx}
                        className={`${tablePreferences.compactMode ? "px-2.5 py-2 text-[11px]" : "px-4 py-3 text-[13px]"} text-gray-700`}
                      >
                        {header === "View Payment Details" ? (
                          <button
                            onClick={() => {
                              setDetailsInvoice(paginatedRecords[rowIdx]);
                            }}
                            className="text-blue-600 font-medium hover:underline"
                          >
                            View
                          </button>
                        ) : header === "Settle" ? (
                          <button
                            onClick={() =>
                              openSettlement(paginatedRecords[rowIdx])
                            }
                            disabled={
                              Number(
                                paginatedRecords[rowIdx]?.amountLeft || 0,
                              ) <= 0
                            }
                            className="rounded-lg border border-blue-200 px-3 py-1.5 text-[12px] font-semibold text-blue-600 hover:bg-blue-50 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
                          >
                            Pay
                          </button>
                        ) : header === "Calendar" ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!calendarStatus.connected) {
                                window.location.href = "/api/integrations/google-calendar/connect";
                                return;
                              }
                              setCalendarInvoice(paginatedRecords[rowIdx]);
                              setCalendarForm({ attendees: "", reminderMinutes: "1440" });
                            }}
                            disabled={
                              !paginatedRecords[rowIdx]?.dueDate ||
                              Number(paginatedRecords[rowIdx]?.amountLeft || 0) <= 0
                            }
                            className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-1.5 text-[12px] font-semibold text-blue-600 hover:bg-blue-50 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
                          >
                            {calendarStatus.connected ? "Add reminder" : "Connect"}
                          </button>
                        ) : header === "Days Left" ? (
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                              String(row[header]).includes("overdue")
                                ? "bg-rose-50 text-rose-700"
                                : row[header] === "Due today"
                                  ? "bg-amber-50 text-amber-700"
                                  : row[header] === "Paid"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : row[header] === "No due date"
                                      ? "bg-gray-100 text-gray-600"
                                      : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {row[header] || "-"}
                          </span>
                        ) : header === "Invoice Status" ? (
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                              String(row[header]).toLowerCase() === "paid"
                                ? "bg-emerald-50 text-emerald-700"
                                : String(row[header]).toLowerCase() ===
                                    "partial"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {row[header] || "-"}
                          </span>
                        ) : header === "Bill Verified & Submitted" ? (
                          <select
                            value={row[header] === "Yes" ? "yes" : "no"}
                            onChange={(event) =>
                              handleBillVerificationChange(
                                paginatedRecords[rowIdx],
                                event.target.value,
                              )
                            }
                            disabled={
                              updatingBillId === paginatedRecords[rowIdx]?.id
                            }
                            title={
                              paginatedRecords[rowIdx]?.billVerifiedSubmittedAt
                                ? `Updated ${formatDate(paginatedRecords[rowIdx].billVerifiedSubmittedAt)}`
                                : "Mark whether this bill has been verified and submitted"
                            }
                            className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold outline-none disabled:cursor-wait disabled:opacity-60 ${
                              row[header] === "Yes"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                            aria-label={`Bill verified and submitted status for ${paginatedRecords[rowIdx]?.invoiceNumber || "invoice"}`}
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        ) : (
                          row[header] || "-"
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={visibleTableHeaders.length}
                    className="px-4 py-14 text-center text-[14px] text-blue-700 font-medium"
                  >
                    No Records Found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-white px-4 py-3 text-[12px] text-gray-500">
          <div className="flex items-center gap-3">
            <select
              value={pageSize === Number.MAX_SAFE_INTEGER ? "all" : pageSize}
              onChange={(event) => {
                const value = event.target.value;
                setPageSize(
                  value === "all" ? Number.MAX_SAFE_INTEGER : Number(value),
                );
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-700"
              aria-label="Rows per page"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="all">All</option>
            </select>
            <span>
              Showing {startRecord} to {endRecord} of {sortedRecords.length}{" "}
              Results
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-2 text-[12px] font-semibold text-gray-600">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={safePage >= totalPages}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {columnsPanelOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999]">
            <button
              type="button"
              aria-label="Close table settings"
              onClick={() => setColumnsPanelOpen(false)}
              className="absolute inset-0 h-full w-full bg-slate-900/30"
            />
            <aside
              className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Invoice settlement table settings"
            >
              <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <h2 className="text-[16px] font-bold text-gray-900">Table settings</h2>
                  <p className="mt-1 text-[12px] text-gray-500">
                    Choose columns and a comfortable table size.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setColumnsPanelOpen(false)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <span>
                    <span className="block text-[13px] font-bold text-gray-800">Compact view</span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">
                      Smaller text and spacing, so more columns fit on screen.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={tablePreferences.compactMode}
                    onChange={(event) =>
                      setTablePreferences((current) => ({
                        ...current,
                        compactMode: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>

                <div className="mt-6 flex items-center justify-between">
                  <h3 className="text-[12px] font-bold uppercase tracking-wide text-gray-500">
                    Visible columns
                  </h3>
                  <span className="text-[11px] text-gray-400">
                    {visibleTableHeaders.length} of {tableHeaders.length}
                  </span>
                </div>
                <div className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {tableHeaders.map((header) => {
                    const required = REQUIRED_TABLE_HEADERS.has(header);
                    const visible = required || !tablePreferences.hiddenColumns.includes(header);
                    return (
                      <label
                        key={header}
                        className={`flex items-center justify-between gap-4 px-4 py-3 ${
                          required ? "cursor-not-allowed bg-gray-50" : "cursor-pointer hover:bg-blue-50/50"
                        }`}
                      >
                        <span>
                          <span className="block text-[13px] font-medium text-gray-800">{header}</span>
                          {required && (
                            <span className="block text-[10px] text-gray-400">Always visible</span>
                          )}
                        </span>
                        <input
                          type="checkbox"
                          checked={visible}
                          disabled={required}
                          onChange={() => toggleColumnVisibility(header)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between border-t border-gray-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() =>
                    setTablePreferences({ hiddenColumns: [], compactMode: false })
                  }
                  className="rounded-lg border border-gray-300 px-4 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Reset default
                </button>
                <button
                  type="button"
                  onClick={() => setColumnsPanelOpen(false)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </aside>
          </div>,
          document.body,
        )}

      {activeInvoice &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-6">
            <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 className="text-[16px] font-bold text-gray-900">
                    Record Vendor Payment
                  </h3>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {activeInvoice.invoiceNumber} · Balance{" "}
                    {formatCurrency(activeInvoice.amountLeft)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveInvoice(null);
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600"
                >
                  Close
                </button>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto p-5">
                <div>
                  <label className="text-[12px] font-medium text-gray-700">
                    Amount *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settlement.amount}
                    onChange={(e) =>
                      setSettlement({ ...settlement, amount: e.target.value })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-700">
                    Payment Mode
                  </label>
                  <select
                    value={settlement.paymentMode}
                    onChange={(e) =>
                      setSettlement({
                        ...settlement,
                        paymentMode: e.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white"
                  >
                    <option>Bank Transfer</option>
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Card</option>
                    <option>Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-700">
                    Reference No.
                  </label>
                  <input
                    value={settlement.referenceNo}
                    onChange={(e) =>
                      setSettlement({
                        ...settlement,
                        referenceNo: e.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-700">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={settlement.settlementDate}
                    onChange={(e) =>
                      setSettlement({
                        ...settlement,
                        settlementDate: e.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[12px] font-medium text-gray-700">
                    Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={settlement.remarks}
                    onChange={(e) =>
                      setSettlement({ ...settlement, remarks: e.target.value })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
                <button
                  onClick={() => {
                    setActiveInvoice(null);
                  }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={submitSettlement}
                  disabled={savingSettlement}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingSettlement ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {calendarInvoice &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-6">
            <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 className="text-[16px] font-bold text-gray-900">Vendor payable Calendar reminder</h3>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {calendarInvoice.vendorName} · Due {formatDate(calendarInvoice.dueDate)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarInvoice(null)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600"
                >
                  Close
                </button>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-lg bg-gray-50 px-4 py-3 text-[12px] text-gray-600">
                  Invoice {calendarInvoice.invoiceNumber || calendarInvoice.transactionId} · Pending {formatCurrency(calendarInvoice.amountLeft)}
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-gray-700">Team member emails</label>
                  <textarea
                    rows={3}
                    value={calendarForm.attendees}
                    onChange={(event) => setCalendarForm({ ...calendarForm, attendees: event.target.value })}
                    placeholder="accounts@example.com, manager@example.com"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">Comma-separated emails. Google will send event invitations to them.</p>
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-gray-700">Email reminder</label>
                  <select
                    value={calendarForm.reminderMinutes}
                    onChange={(event) => setCalendarForm({ ...calendarForm, reminderMinutes: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800"
                  >
                    <option value="0">On due date</option>
                    <option value="1440">1 day before</option>
                    <option value="4320">3 days before</option>
                    <option value="10080">7 days before</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
                <button type="button" onClick={() => setCalendarInvoice(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-[12px] font-semibold text-gray-700">Cancel</button>
                <button type="button" onClick={submitCalendarEvent} disabled={savingCalendar} className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60">
                  {savingCalendar ? "Saving..." : "Save & notify"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {detailsInvoice &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-6">
            <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 className="text-[16px] font-bold text-gray-900">
                    Payment Details
                  </h3>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {detailsInvoice.invoiceNumber} · {detailsInvoice.vendorName}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setDetailsInvoice(null);
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600"
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="mb-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[11px] text-gray-500">Amount Due</p>
                    <p className="font-bold text-gray-900">
                      {formatCurrency(detailsInvoice.totalAmount)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[11px] text-gray-500">Paid</p>
                    <p className="font-bold text-gray-900">
                      {formatCurrency(detailsInvoice.amountPaid)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[11px] text-gray-500">Left</p>
                    <p className="font-bold text-gray-900">
                      {formatCurrency(detailsInvoice.amountLeft)}
                    </p>
                  </div>
                </div>
                {detailsInvoice.payments?.length ? (
                  <div className="rounded-lg border border-gray-200">
                    <div className="grid grid-cols-[1fr_1fr_1.3fr_1fr_auto] border-b border-gray-100 px-3 py-2 text-[11px] font-bold uppercase text-gray-500">
                      <span>Date</span>
                      <span>Mode</span>
                      <span>Reference</span>
                      <span className="text-right">Amount</span>
                      <span className="pl-3">Action</span>
                    </div>
                    <div className="max-h-72 overflow-auto divide-y divide-gray-100">
                      {detailsInvoice.payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="grid grid-cols-[1fr_1fr_1.3fr_1fr_auto] items-center px-3 py-2 text-[12px] text-gray-700"
                        >
                          <span>{formatDate(payment.settlementDate)}</span>
                          <span>{payment.paymentMode}</span>
                          <span>{payment.referenceNo || "-"}</span>
                          <strong className="text-right text-gray-900">
                            {formatCurrency(payment.amount)}
                          </strong>
                          <button
                            type="button"
                            onClick={() => openPaymentEdit(payment)}
                            className="ml-3 rounded-lg border border-blue-200 px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                          >
                            Edit
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-200 px-4 py-8 text-center text-[13px] font-semibold text-gray-500">
                    No payments recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {editingPayment &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4 sm:p-6">
            <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 className="text-[16px] font-bold text-gray-900">
                    Edit Payment Record
                  </h3>
                  <p className="mt-1 text-[12px] text-gray-500">
                    Changes automatically recalculate the invoice balance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600"
                >
                  Close
                </button>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto p-5">
                <div>
                  <label className="text-[12px] font-medium text-gray-700">
                    Amount *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentEdit.amount}
                    onChange={(e) =>
                      setPaymentEdit({ ...paymentEdit, amount: e.target.value })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-700">
                    Payment Mode
                  </label>
                  <select
                    value={paymentEdit.paymentMode}
                    onChange={(e) =>
                      setPaymentEdit({
                        ...paymentEdit,
                        paymentMode: e.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800"
                  >
                    <option>Bank Transfer</option>
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Card</option>
                    <option>Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-700">
                    Reference No.
                  </label>
                  <input
                    value={paymentEdit.referenceNo}
                    onChange={(e) =>
                      setPaymentEdit({
                        ...paymentEdit,
                        referenceNo: e.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-700">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentEdit.settlementDate}
                    onChange={(e) =>
                      setPaymentEdit({
                        ...paymentEdit,
                        settlementDate: e.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[12px] font-medium text-gray-700">
                    Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={paymentEdit.remarks}
                    onChange={(e) =>
                      setPaymentEdit({
                        ...paymentEdit,
                        remarks: e.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={savePaymentEdit}
                  disabled={savingPaymentEdit}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingPaymentEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </MainLayout>
  );
}
