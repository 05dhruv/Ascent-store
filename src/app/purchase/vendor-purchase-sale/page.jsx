"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import MainLayout from "@/components/MainLayout";
import { formatIndianDate } from "@/lib/dateUtils";

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatMonth(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("en-IN", {
        month: "long",
        year: "numeric",
      }).format(date);
}

export default function VendorPurchaseSalePage() {
  const [records, setRecords] = useState([]);
  const [monthlySales, setMonthlySales] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/purchase/vendor-purchase-sale?search=${encodeURIComponent(search)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load vendor report");
      setRecords(Array.isArray(data.records) ? data.records : []);
      setMonthlySales(Array.isArray(data.monthlySales) ? data.monthlySales : []);
    } catch (err) { setError(err.message); setRecords([]); setMonthlySales([]); } finally { setLoading(false); }
  };

  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [search]);

  const totals = useMemo(() => records.reduce((sum, row) => ({ purchase: sum.purchase + Number(row.totalPurchaseAmount || 0), sale: sum.sale + Number(row.totalSaleAmount || 0) }), { purchase: 0, sale: 0 }), [records]);

  const consolidatedSaleTotal = useMemo(
    () => monthlySales.reduce((sum, row) => sum + Number(row.totalSaleAmount || 0), 0),
    [monthlySales],
  );

  const openDetails = async (vendorId) => {
    setDetailsLoading(true); setDetails({ vendor: { name: "Loading..." }, purchases: [], sales: [] });
    try {
      const res = await fetch(`/api/purchase/vendor-purchase-sale?vendorId=${vendorId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load vendor details");
      setDetails(data);
    } catch (err) { alert(err.message); setDetails(null); } finally { setDetailsLoading(false); }
  };

  return <MainLayout>
    <div className="mb-4 flex items-center gap-2 text-[12px] text-gray-500"><span className="text-blue-600">Purchase</span><i className="ti ti-chevron-right text-[11px] text-gray-400" /><span className="font-semibold text-gray-900">Vendor Purchase & Sale</span></div>
    <div className="mb-5 flex items-start justify-between gap-4"><div><h1 className="text-[28px] font-semibold leading-tight text-gray-900">Vendor Purchase & Sale</h1><p className="mt-1 text-[12.5px] text-gray-400">Vendor-wise confirmed purchase value and batch-traceable POS sale value.</p></div></div>
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor" className="min-w-[260px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" /><button onClick={load} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Refresh</button></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-blue-600">Total Purchase Amount</p><p className="mt-1 text-2xl font-bold text-blue-950">{money(totals.purchase)}</p></div><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase text-emerald-600">Vendor-Traceable Sale Amount</p><p className="mt-1 text-2xl font-bold text-emerald-950">{money(totals.sale)}</p><p className="mt-1 text-[11px] text-emerald-700">Sales linked to vendor batches only</p></div><div className="rounded-xl border border-violet-100 bg-violet-50 p-4"><p className="text-xs font-semibold uppercase text-violet-600">Consolidated Sale Amount</p><p className="mt-1 text-2xl font-bold text-violet-950">{money(consolidatedSaleTotal)}</p><p className="mt-1 text-[11px] text-violet-700">All stores, valid POS bills, last 24 months</p></div></div>
    <section className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4"><div><h2 className="text-base font-bold text-gray-900">Month-wise Consolidated Sales</h2><p className="mt-1 text-xs text-gray-500">Total POS bill amount across all permitted stores. Void, cancelled, and refunded bills are excluded.</p></div><span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">{money(consolidatedSaleTotal)}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Month</th><th className="px-5 py-3 text-right">Bills</th><th className="px-5 py-3 text-right">Consolidated Sale Amount</th></tr></thead><tbody>{loading ? <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-500">Loading monthly sales...</td></tr> : !monthlySales.length ? <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-500">No sales recorded yet.</td></tr> : monthlySales.map((row) => <tr key={row.monthStart} className="border-t border-gray-100 hover:bg-violet-50/40"><td className="px-5 py-3 font-semibold text-gray-900">{formatMonth(row.monthStart)}</td><td className="px-5 py-3 text-right text-gray-600">{row.billCount}</td><td className="px-5 py-3 text-right font-bold text-violet-700">{money(row.totalSaleAmount)}</td></tr>)}</tbody></table></div></section>
    {error && <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[780px]"><thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Vendor</th><th className="px-4 py-3 text-right">Confirmed GRNs</th><th className="px-4 py-3 text-right">Total Purchase Amount</th><th className="px-4 py-3 text-right">Total Sale Amount</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">Loading vendor report...</td></tr> : !records.length ? <tr><td colSpan={5} className="px-4 py-12 text-center text-sm font-semibold text-blue-700">No vendor records found</td></tr> : records.map((row) => <tr key={row.vendorId} className="border-t border-gray-100 text-sm text-gray-700 hover:bg-blue-50/40"><td className="px-4 py-3 font-semibold text-gray-900">{row.vendorName}</td><td className="px-4 py-3 text-right">{row.grnCount}</td><td className="px-4 py-3 text-right font-semibold">{money(row.totalPurchaseAmount)}</td><td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(row.totalSaleAmount)}</td><td className="px-4 py-3"><button onClick={() => openDetails(row.vendorId)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50">View details</button></td></tr>)}</tbody></table></div></div>
    {details && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"><div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="text-lg font-bold text-gray-900">{details.vendor?.name}</h2><p className="mt-1 text-xs text-gray-500">Purchase GRNs and sales by products traced to this vendor's batches.</p></div><button onClick={() => setDetails(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600">Close</button></div><div className="min-h-0 flex-1 overflow-y-auto p-5">{detailsLoading ? <p className="py-12 text-center text-sm text-gray-500">Loading details...</p> : <div className="grid gap-6 lg:grid-cols-2"><section><h3 className="mb-3 text-sm font-bold text-gray-900">Confirmed Purchases</h3><div className="overflow-hidden rounded-lg border border-gray-200"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-[11px] uppercase text-gray-500"><tr><th className="px-3 py-2">GRN</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody>{details.purchases?.length ? details.purchases.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2">{row.transaction_id || row.invoice_number || `#${row.id}`}</td><td className="px-3 py-2">{formatIndianDate(row.confirmed_at || row.invoice_date, "-")}</td><td className="px-3 py-2 text-right font-semibold">{money(row.amount)}</td></tr>) : <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-500">No confirmed GRNs</td></tr>}</tbody></table></div></section><section><h3 className="mb-3 text-sm font-bold text-gray-900">Sales by Product</h3><div className="overflow-hidden rounded-lg border border-gray-200"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-[11px] uppercase text-gray-500"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Sale Amount</th></tr></thead><tbody>{details.sales?.length ? details.sales.map((row, index) => <tr key={`${row.product_id}-${index}`} className="border-t"><td className="px-3 py-2">{row.product_name || "-"}</td><td className="px-3 py-2 text-right">{row.sold_qty}</td><td className="px-3 py-2 text-right font-semibold text-emerald-700">{money(row.sale_amount)}</td></tr>) : <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-500">No batch-traceable sales</td></tr>}</tbody></table></div></section></div>}</div></div></div>, document.body)}
  </MainLayout>;
}
