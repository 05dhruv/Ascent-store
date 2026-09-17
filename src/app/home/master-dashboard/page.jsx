"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const labels = {
  stock_in: "Stock In",
  reserve: "Reserved",
  dispatch: "Dispatched",
  receipt: "Received",
  material_issue: "Issued to Work",
  material_return: "Returned",
  vendor_return: "Vendor Return",
  adjustment: "Adjustment",
  reversal: "Reversal",
};
const colors = {
  stock_in: "bg-emerald-500",
  reserve: "bg-violet-500",
  dispatch: "bg-blue-500",
  receipt: "bg-cyan-500",
  material_issue: "bg-amber-500",
  material_return: "bg-lime-500",
  vendor_return: "bg-rose-500",
  adjustment: "bg-slate-500",
  reversal: "bg-red-600",
};

function Metric({ label, value, note, icon, tone = "amber" }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    red: "border-red-200 bg-red-50 text-red-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[.18em] opacity-65">
          {label}
        </p>
        <i className={`ti ${icon} text-lg`} />
      </div>
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="mt-1 text-[11px] opacity-70">{note}</p>
    </div>
  );
}

export default function ConstructionMasterDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/construction/dashboard", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.message || "Dashboard could not be loaded");
      setData(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const movements = data?.movements || [];
  const totalMovementValue = useMemo(
    () => movements.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [movements],
  );
  const maxQty = Math.max(
    1,
    ...movements.map((item) => Number(item.quantity || 0)),
  );
  const alerts = [
    data?.in_transit > 0 && [
      `${data.in_transit} transfer(s) awaiting destination receipt`,
      "/inventory/stocktransfer",
      "ti-truck-delivery",
      "text-blue-700 bg-blue-50",
    ],
    data?.open_discrepancies > 0 && [
      `${data.open_discrepancies} open material discrepancy case(s)`,
      "/inventory/stocktransfer",
      "ti-alert-triangle",
      "text-red-700 bg-red-50",
    ],
    data?.awaiting_dispatch > 0 && [
      `${data.awaiting_dispatch} approved transfer(s) ready for dispatch`,
      "/inventory/stocktransfer",
      "ti-package-export",
      "text-amber-700 bg-amber-50",
    ],
  ].filter(Boolean);

  return (
    <MainLayout>
      <div className="min-h-screen bg-[#f7f4ef] p-1 sm:p-3">
        <header className="mb-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950 px-5 py-4 text-white shadow-lg">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/20 text-2xl">
                🏗️
              </span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.3em] text-amber-400">
                  Analytics overview
                </p>
                <h1 className="text-2xl font-black">
                  Construction Master Dashboard
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="bg-transparent font-bold outline-none"
                />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="bg-transparent font-bold outline-none"
                />
              </label>
              <button
                onClick={load}
                className="rounded-xl bg-amber-500 px-4 py-2 font-black text-slate-950"
              >
                {refreshing ? "Refreshing…" : "● LIVE"}
              </button>
            </div>
          </div>
        </header>
        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              onClick={load}
              disabled={refreshing}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700"
            >
              Retry
            </button>
          </div>
        )}
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Project Budget"
            value={money(data?.project_budget)}
            note={`${data?.total_projects || 0} total projects`}
            icon="ti-currency-rupee"
          />
          <Metric
            label="Active Projects"
            value={data?.active_projects || 0}
            note={`${data?.active_sites || 0} active sites`}
            icon="ti-building"
            tone="emerald"
          />
          <Metric
            label="Material Movement"
            value={money(totalMovementValue)}
            note={`${movements.reduce((s, x) => s + Number(x.transactions || 0), 0)} ledger transactions`}
            icon="ti-package"
            tone="blue"
          />
          <Metric
            label="In Transit"
            value={data?.in_transit || 0}
            note="Awaiting site acknowledgement"
            icon="ti-truck"
            tone="violet"
          />
          <Metric
            label="Exceptions"
            value={data?.open_discrepancies || 0}
            note={`${data?.partial_receipts || 0} partial receipts`}
            icon="ti-alert-triangle"
            tone="red"
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-black text-slate-900">
                🏢 Project Portfolio
              </h2>
              <Link
                href="/construction/projects"
                className="text-xs font-bold text-amber-700"
              >
                Manage Projects →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="pb-3">Project</th>
                    <th className="pb-3">Sites</th>
                    <th className="pb-3 text-right">Budget</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.projects || []).map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-3">
                        <b>{p.name}</b>
                        <div className="text-xs text-slate-400">
                          {p.project_code} · {p.client_name || "No client"}
                        </div>
                      </td>
                      <td>{p.site_count}</td>
                      <td className="text-right font-bold">
                        {money(p.budget)}
                      </td>
                      <td className="text-right">
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data && !data.projects?.length && (
                    <tr>
                      <td
                        colSpan="4"
                        className="py-12 text-center text-slate-400"
                      >
                        No project data yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-5 font-black text-slate-900">
              📦 Material Movement Mix
            </h2>
            <div className="space-y-4">
              {movements.map((item) => (
                <div key={item.movement_type}>
                  <div className="mb-1 flex justify-between text-xs">
                    <b>{labels[item.movement_type] || item.movement_type}</b>
                    <span>
                      {Number(item.quantity).toLocaleString("en-IN")} qty ·{" "}
                      {money(item.value)}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${colors[item.movement_type] || "bg-slate-500"}`}
                      style={{
                        width: `${Math.max(4, (Number(item.quantity) / maxQty) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {data && !movements.length && (
                <p className="py-16 text-center text-sm text-slate-400">
                  Movement graph will appear after transactions are posted.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-black text-slate-900">
              ⚠️ Operational Alerts
            </h2>
            <div className="space-y-2">
              {alerts.map(([text, href, icon, style]) => (
                <Link
                  key={text}
                  href={href}
                  className={`flex items-center justify-between rounded-xl p-3 text-sm font-semibold ${style}`}
                >
                  <span className="flex items-center gap-3">
                    <i className={`ti ${icon} text-lg`} />
                    {text}
                  </span>
                  <i className="ti ti-chevron-right" />
                </Link>
              ))}
              {!alerts.length && (
                <div className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                  ✓ No pending movement exceptions.
                </div>
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-black text-slate-900">
              🔧 Control Summary
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Materials", data?.materials || 0, "/catalog/products"],
                [
                  "Active Vendors",
                  data?.active_vendors || 0,
                  "/purchase/vendors",
                ],
                [
                  "Ready to Dispatch",
                  data?.awaiting_dispatch || 0,
                  "/inventory/stocktransfer",
                ],
                [
                  "All Transfers",
                  data?.total_transfers || 0,
                  "/inventory/stocktransfer",
                ],
              ].map(([l, v, h]) => (
                <Link
                  href={h}
                  key={l}
                  className="rounded-xl bg-slate-50 p-4 text-center hover:bg-amber-50"
                >
                  <p className="text-2xl font-black text-slate-900">{v}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                    {l}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
