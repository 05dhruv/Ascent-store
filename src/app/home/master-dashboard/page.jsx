"use client";
import Icon from "@/components/Icon";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MetricCard as Metric, StatusBadge } from "@/components/ui/WorkspaceUI";
import MainLayout from "@/components/MainLayout";
import Button from "@/components/ui/Button";
import { useUser } from "@/hooks/useUser";

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
  receipt: "bg-emerald-500",
  material_issue: "bg-amber-500",
  material_return: "bg-lime-500",
  vendor_return: "bg-rose-500",
  adjustment: "bg-slate-500",
  reversal: "bg-red-600",
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function timeAgo(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function percentTrend(current, previous, periodLabel) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev && !cur) return { label: `No change ${periodLabel}`, direction: "flat" };
  if (!prev) return { label: `New ${periodLabel}`, direction: "up" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { label: `No change ${periodLabel}`, direction: "flat" };
  return {
    label: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}% ${periodLabel}`,
    direction: pct > 0 ? "up" : "down",
  };
}

const defaultFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

export default function ConstructionMasterDashboard() {
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/construction/dashboard?${params}`, {
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
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const movements = data?.movements || [];
  const totalQty = useMemo(
    () => movements.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [movements],
  );
  const vsLabel = "vs previous period";

  const alerts = [
    data?.open_discrepancies > 0 && {
      text: `${data.open_discrepancies} open material discrepancy case(s)`,
      href: "/inventory/movement-tracker",
      icon: "ti-alert-octagon",
      tone: "text-red-600 bg-red-50",
      at: data.latest_discrepancy_at,
    },
    data?.in_transit > 0 && {
      text: `${data.in_transit} transfer(s) awaiting site receipt`,
      href: "/inventory/movement-tracker",
      icon: "ti-truck-delivery",
      tone: "text-blue-600 bg-blue-50",
      at: data.oldest_in_transit_at,
    },
    data?.awaiting_dispatch > 0 && {
      text: `${data.awaiting_dispatch} approved transfer(s) ready for dispatch`,
      href: "/inventory/stocktransfer",
      icon: "ti-package-export",
      tone: "text-amber-600 bg-amber-50",
      at: data.latest_ready_at,
    },
    data?.partial_receipts > 0 && {
      text: `${data.partial_receipts} partially received transfer(s)`,
      href: "/inventory/movement-tracker",
      icon: "ti-progress-alert",
      tone: "text-violet-600 bg-violet-50",
      at: null,
    },
  ].filter(Boolean);

  const controls = [
    ["Materials", data?.materials || 0, "/catalog/products", "ti-packages", "text-blue-600 bg-blue-50"],
    ["Active Vendors", data?.active_vendors || 0, "/purchase/vendors", "ti-building-store", "text-emerald-600 bg-emerald-50"],
    ["Ready to Dispatch", data?.awaiting_dispatch || 0, "/inventory/stocktransfer", "ti-truck-loading", "text-amber-600 bg-amber-50"],
    ["All Transfers", data?.total_transfers || 0, "/inventory/stocktransfer", "ti-arrows-exchange", "text-violet-600 bg-violet-50"],
  ];

  const firstName = String(user?.name || "").split(" ")[0] || "there";

  return (
    <MainLayout>
      <div className="space-y-6">
        <header className="dashboard-hero relative overflow-hidden">
          <Icon name="ti ti-building-skyscraper pointer-events-none absolute -bottom-8 right-[18%] hidden text-[190px] text-white/[0.06] xl:block" aria-hidden="true" />
          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-500/20 text-2xl text-orange-300">
                <Icon name="ti ti-building-factory-2" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[13px] font-medium text-slate-300">
                  {greeting()}, {firstName} 👋
                </p>
                <h1 className="text-2xl font-black">
                  Construction Master Dashboard
                </h1>
                <p className="mt-1 text-[13px] text-slate-300">
                  Track your projects, materials, and site operations in real time.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <label className="flex flex-col gap-1 text-slate-300">
                From
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => e.target.value && setFrom(e.target.value)}
                  className="rounded-lg font-semibold outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-slate-300">
                To
                <input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => e.target.value && setTo(e.target.value)}
                  className="rounded-lg font-semibold outline-none"
                />
              </label>
              <Button
                variant="accent"
                onClick={load}
                disabled={refreshing}
                title="Refresh"
                icon={`ti ti-refresh ${refreshing ? "animate-spin" : ""}`}
              >
                {refreshing ? "Refreshing" : "Live"}
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Project Budget"
            value={money(data?.project_budget)}
            note={`${data?.total_projects || 0} total projects`}
            icon="ti-currency-rupee"
            tone="amber"
          />
          <Metric
            label="Active Projects"
            value={data?.active_projects || 0}
            note={`${data?.active_sites || 0} active sites`}
            icon="ti-building"
            tone="emerald"
            trend={
              data
                ? {
                    label: `${data.projects_created || 0} new in period`,
                    direction: (data.projects_created || 0) > (data.projects_created_prev || 0)
                      ? "up"
                      : (data.projects_created || 0) < (data.projects_created_prev || 0)
                        ? "down"
                        : "flat",
                    tone: "neutral",
                  }
                : undefined
            }
          />
          <Metric
            label="Material Movement"
            value={money(data?.movement_value)}
            note={`${data?.movement_count || 0} ledger transactions`}
            icon="ti-package"
            tone="blue"
            trend={data ? percentTrend(data.movement_value, data.movement_value_prev, vsLabel) : undefined}
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
            trend={
              data
                ? data.open_discrepancies > 0
                  ? { label: "Needs attention", direction: "up", tone: "bad" }
                  : { label: "All clear", direction: "flat", tone: "good" }
                : undefined
            }
          />
        </div>

        <div className="dashboard-panels">
          <section className="ui-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center font-black text-slate-900">
                <Icon name="ti ti-building mr-2 text-blue-600" aria-hidden="true" />
                Project Portfolio
              </h2>
              <Link href="/construction/projects" className="text-xs font-bold text-orange-600 hover:text-orange-700">
                View all →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
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
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3">
                        <Link href="/construction/projects" className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                            <Icon name="ti ti-building-skyscraper text-[18px]" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <b className="block truncate text-slate-900">{p.name}</b>
                            <span className="text-xs text-slate-400">
                              {p.project_code} · {p.client_name || "No client"}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td>{p.site_count}</td>
                      <td className="text-right font-bold">{money(p.budget)}</td>
                      <td className="text-right">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                  {data && !data.projects?.length && (
                    <tr>
                      <td colSpan="4" className="py-12 text-center text-slate-400">
                        No project data yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ui-card">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center font-black text-slate-900">
                <Icon name="ti ti-chart-donut mr-2 text-amber-600" aria-hidden="true" />
                Material Movement Mix
              </h2>
              <span className="text-[11px] font-medium text-slate-400">Selected period</span>
            </div>
            <div className="space-y-4">
              {movements.map((item) => {
                const share = totalQty ? (Number(item.quantity || 0) / totalQty) * 100 : 0;
                return (
                  <div key={item.movement_type}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                      <b className="text-slate-800">{labels[item.movement_type] || item.movement_type}</b>
                      <span className="text-slate-500">
                        {Number(item.quantity).toLocaleString("en-IN")} qty · {money(item.value)}
                        <b className="ml-2 text-slate-900">{share.toFixed(0)}%</b>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${colors[item.movement_type] || "bg-slate-500"}`}
                        style={{ width: `${Math.max(3, share)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {data && !movements.length && (
                <p className="py-16 text-center text-sm text-slate-400">
                  No movements in the selected period.
                </p>
              )}
            </div>
          </section>

          <section className="ui-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center font-black text-slate-900">
                <Icon name="ti ti-alert-triangle mr-2 text-amber-600" aria-hidden="true" />
                Operational Alerts
                {alerts.length > 0 && (
                  <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                    {alerts.length}
                  </span>
                )}
              </h2>
              <Link href="/inventory/movement-tracker" className="text-xs font-bold text-orange-600 hover:text-orange-700">
                View all →
              </Link>
            </div>
            <div>
              {alerts.map((alert) => (
                <Link key={alert.text} href={alert.href} className="dashboard-alert rounded-lg px-1">
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon name={`ti ${alert.icon} shrink-0 rounded-lg p-2 text-lg ${alert.tone}`} aria-hidden="true" />
                    <span className="truncate text-slate-700">{alert.text}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                    {timeAgo(alert.at)}
                    <Icon name="ti ti-chevron-right" aria-hidden="true" />
                  </span>
                </Link>
              ))}
              {!alerts.length && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                  <Icon name="ti ti-circle-check text-lg" aria-hidden="true" />
                  No pending movement exceptions.
                </div>
              )}
            </div>
          </section>

          <section className="ui-card">
            <h2 className="mb-4 flex items-center font-black text-slate-900">
              <Icon name="ti ti-adjustments mr-2 text-blue-600" aria-hidden="true" />
              Control Summary
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {controls.map(([label, value, href, icon, tone]) => (
                <Link
                  href={href}
                  key={label}
                  className="flex flex-col items-center rounded-xl border border-slate-100 px-2 py-4 text-center transition hover:border-slate-200 hover:bg-slate-50"
                >
                  <span className={`mb-2 grid h-10 w-10 place-items-center rounded-xl ${tone}`}>
                    <Icon name={`ti ${icon} text-[19px]`} aria-hidden="true" />
                  </span>
                  <p className="text-2xl font-black text-slate-900">{value}</p>
                  <p className="mt-1 text-[12px] font-medium text-slate-500">{label}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
