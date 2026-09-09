"use client";

import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { fetchLookup, normalizeStores } from "@/lib/purchaseLookups";
import { formatIndianDateTime } from "@/lib/dateUtils";

async function fetchDemands(filters) {
  const params = new URLSearchParams();
  if (filters.storeId && filters.storeId !== "all")
    params.set("storeId", filters.storeId);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  const res = await fetch(`/api/customer-demand?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load customer demands");
  return Array.isArray(data.records) ? data.records : [];
}

export default function CustomerDemandPage() {
  const [records, setRecords] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("open");
  const [storeId, setStoreId] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchDemands({ storeId, status, search });
      setRecords(data);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLookup("/api/stores")
      .then((data) => setStores(normalizeStores(data)))
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [storeId, status, search]);

  const counts = useMemo(
    () => ({
      total: records.length,
      pending: records.filter((row) =>
        ["new", "reviewed"].includes(String(row.status || "").toLowerCase()),
      ).length,
    }),
    [records],
  );

  const updateStatus = async (id, nextStatus) => {
    try {
      const res = await fetch("/api/customer-demand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update demand");
      await load();
    } catch (err) {
      alert(err.message || "Failed to update demand");
    }
  };

  const downloadSheet = async () => {
    if (!records.length) {
      alert("No customer demand records available to download");
      return;
    }
    const XLSX = await import("xlsx");
    const rows = records.map((row) => ({
      ID: row.transactionId || row.id,
      Store: row.storeName || "-",
      Product: row.productName || "-",
      SKU: row.sku || "-",
      Barcode: row.barcode || "-",
      Qty: row.requestedQty ?? "",
      Customer: row.customerName || "Walk-in",
      Mobile: row.customerMobile || "",
      Remarks: row.remarks || "-",
      Status: row.status || "-",
      Created: formatIndianDateTime(row.createdAt, "-"),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customer Demand");
    XLSX.writeFile(
      workbook,
      `customer-demand-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  return (
    <MainLayout>
      <div className="mb-4 flex items-center gap-2 text-[12px] text-gray-500">
        <span className="text-blue-600">Purchase</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">Customer Demand</span>
      </div>

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight text-gray-900">
            Customer Demand
          </h1>
          <p className="mt-1 text-[12.5px] text-gray-400">
            Store-wise customer product requests entered from POS.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Open: {counts.pending} / Total: {counts.total}
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All assigned stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="open">Open</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="added_to_po">Added to PO</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product/customer/barcode"
            className="min-w-[260px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={downloadSheet}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            Download
          </button>
          <button
            onClick={load}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    Loading demands...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm font-semibold text-blue-700"
                  >
                    No customer demand found
                  </td>
                </tr>
              ) : (
                records.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-gray-100 text-sm text-gray-700 hover:bg-blue-50/40"
                  >
                    <td className="px-4 py-3 font-semibold">
                      {row.transactionId}
                    </td>
                    <td className="px-4 py-3">{row.storeName || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">
                        {row.productName}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        SKU: {row.sku || "-"} · Barcode: {row.barcode || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.requestedQty}</td>
                    <td className="px-4 py-3">
                      {row.customerName || "Walk-in"}
                      {row.customerMobile ? ` · ${row.customerMobile}` : ""}
                    </td>
                    <td className="px-4 py-3">{row.remarks || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {formatIndianDateTime(row.createdAt, "-")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatus(row.id, "reviewed")}
                          className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600"
                        >
                          Review
                        </button>
                        <button
                          onClick={() => updateStatus(row.id, "rejected")}
                          className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
