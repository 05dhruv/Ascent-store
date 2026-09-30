"use client";
import Icon from "@/components/Icon";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProjectCreateDialog from "@/components/construction/ProjectCreateDialog";
import { MetricCard, StatusBadge } from "@/components/ui/WorkspaceUI";
import ConstructionShell from "@/components/construction/ConstructionShell";
import FilterBar, { FilterSelect } from "@/components/ui/FilterBar";
import Pagination from "@/components/ui/Pagination";
import { downloadFromUrl, usePagedList } from "@/hooks/usePagedList";

const emptyForm = {
  projectCode: "",
  name: "",
  clientName: "",
  budget: "",
  status: "planning",
  startDate: "",
  expectedEndDate: "",
  address: "",
  siteCode: "",
  siteName: "",
  siteAddress: "",
  siteEngineerId: "",
};

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function projectTimeline(project) {
  const start = new Date(project.start_date || project.created_at).getTime();
  const end = new Date(project.expected_end_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  if (project.status === "completed") return { percent: 100, overdue: false };
  const ratio = (Date.now() - start) / (end - start);
  return {
    percent: Math.max(0, Math.min(100, Math.round(ratio * 100))),
    overdue: ratio > 1,
  };
}

export default function ProjectsPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const list = usePagedList("/api/construction/projects", {
    pageSize: 10,
    params: {
      search: debouncedSearch,
      status: statusFilter === "all" ? "" : statusFilter,
      client: clientFilter === "all" ? "" : clientFilter,
    },
  });
  const records = list.records;
  const loading = list.loading && !records.length;
  const loadError = list.error;
  const summary = list.extra.summary || {};
  const stats = {
    totalProjects: summary.totalProjects || 0,
    totalSites: summary.totalSites || 0,
    totalStock: Number(summary.totalStock || 0),
    totalInTransit: summary.totalInTransit || 0,
  };
  const clientOptions = summary.clients || [];

  useEffect(() => {
    fetch("/api/auth/users", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, []);

  // Helpful auto-fill for site store when project details are entered
  const handleProjectNameChange = (val) => {
    setForm((prev) => {
      const next = { ...prev, name: val };
      if (
        !prev.siteName ||
        prev.siteName === `${prev.name} Site Store`.trim()
      ) {
        next.siteName = val ? `${val} Site Store` : "";
      }
      return next;
    });
  };

  const handleProjectCodeChange = (val) => {
    const upper = val.toUpperCase();
    setForm((prev) => {
      const next = { ...prev, projectCode: upper };
      if (
        !prev.siteCode ||
        prev.siteCode === `SITE-${prev.projectCode}`.trim()
      ) {
        next.siteCode = upper ? `SITE-${upper}` : "";
      }
      return next;
    });
  };

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/construction/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.message || "Unable to create project");
      setForm(emptyForm);
      setCreateOpen(false);
      setMessage(
        "Project and Site Store created successfully! Site Store is active for stock transfers.",
      );
      await list.refresh();
    } catch (error) {
      setErrorMessage(error.message || "Unable to create project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConstructionShell
      title="Projects & Site Stores"
      subtitle="Manage construction projects, site stores, warehouse dispatch, and field activity."
      breadcrumb={[{ label: "Projects" }]}
      actions={[
        {
          label: "Download",
          icon: "ti ti-download",
          onClick: () => downloadFromUrl(list.exportUrl()),
        },
        {
          label: "New Project",
          icon: "ti ti-plus",
          accent: true,
          onClick: () => setCreateOpen(true),
        },
      ]}
    >
      <div className="space-y-6">
        {message && (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {message}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Projects"
            value={stats.totalProjects}
            note="Construction projects"
            icon="ti-building"
          />
          <MetricCard
            label="Linked Site Stores"
            value={stats.totalSites}
            note="Field storage locations"
            icon="ti-building-warehouse"
          />
          <MetricCard
            label="On-Site Inventory"
            value={stats.totalStock.toLocaleString("en-IN")}
            note="Total units stored on sites"
            icon="ti-packages"
            tone="emerald"
          />
          <MetricCard
            label="Active Transits"
            value={stats.totalInTransit}
            note="Dispatches in transit"
            icon="ti-truck-delivery"
          />
        </div>
        {createOpen && (
          <ProjectCreateDialog
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            form={form}
            setForm={setForm}
            users={users}
            saving={saving}
            errorMessage={errorMessage}
            submit={submit}
            onNameChange={handleProjectNameChange}
            onCodeChange={handleProjectCodeChange}
          />
        )}
        <div>
          {/* Right Portfolio & Site Tracker Column */}
          <div className="space-y-4">
            {/* Filter / Search Bar */}
            <FilterBar
              search={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search projects by name, code, client, or site store..."
              searchLabel="Search projects"
              count={list.total}
              countLabel="Project"
            >
              <FilterSelect
                ariaLabel="Project status"
                value={statusFilter}
                onChange={setStatusFilter}
                allLabel="All Statuses"
                options={[
                  { value: "planning", label: "Planning" },
                  { value: "active", label: "Active" },
                  { value: "on_hold", label: "On Hold" },
                  { value: "completed", label: "Completed" },
                ]}
              />
              <FilterSelect
                ariaLabel="Filter by client"
                value={clientFilter}
                onChange={setClientFilter}
                allLabel="All Clients"
                options={clientOptions}
              />
            </FilterBar>

            {/* Project List Cards */}
            {loadError ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {loadError}
              </p>
            ) : null}
            {loading ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading projects">
                {[0, 1].map((key) => (
                  <div key={key} className="ui-card animate-pulse">
                    <div className="flex gap-4">
                      <div className="hidden h-20 w-24 rounded-xl bg-slate-100 sm:block" />
                      <div className="flex-1 space-y-3">
                        <div className="h-4 w-1/3 rounded bg-slate-100" />
                        <div className="h-3 w-1/2 rounded bg-slate-100" />
                        <div className="h-2 w-full rounded bg-slate-100" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-400 shadow-xs">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Icon name="ti ti-folder-off text-2xl" />
                </div>
                <p className="mt-3 font-bold text-slate-700">
                  No construction projects found
                </p>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Select New Project to create your first project to initialize
                  linked site stores and inventory tracking.
                </p>
              </div>
            ) : (
              records.map((project) => {
                const sites = project.sites || [];
                const budgetNum = Number(project.budget || 0);

                return (
                  <div key={project.id} className="ui-card project-card">
                    {/* Project Header Row */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-4">
                      <div className="flex min-w-0 items-start gap-4">
                        <div
                          className="hidden h-20 w-24 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#1e3a5f,#0f2740)] text-white/80 sm:grid"
                          aria-hidden="true"
                        >
                          <Icon name="ti ti-building-skyscraper text-[34px]" />
                        </div>
                        <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black tracking-wider text-white">
                            {project.project_code}
                          </span>
                          <h3 className="text-lg font-black text-slate-900">
                            {project.name}
                          </h3>
                          <StatusBadge status={project.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Client:{" "}
                          <span className="font-semibold text-slate-700">
                            {project.client_name || "Direct / Self"}
                          </span>
                          {project.address ? ` · ${project.address}` : ""}
                        </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-[11px] font-medium text-slate-400">
                            Approved Budget
                          </p>
                          <p className="text-sm font-black text-slate-900">
                            ₹{budgetNum.toLocaleString("en-IN")}
                          </p>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="text-right">
                          <p className="text-[11px] font-medium text-slate-400">
                            Site Stores
                          </p>
                          <p className="text-sm font-black text-amber-700">
                            {project.site_count || sites.length} Site(s)
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Summary Metric Pills for Project Progress */}
                    <div className="project-inline-stats">
                      <div className="px-1">
                        <p className="text-[11px] font-medium text-slate-400">
                          <Icon name="ti ti-package mr-1" aria-hidden="true" />
                          On-Site Stock
                        </p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {Number(project.total_site_stock || 0).toLocaleString(
                            "en-IN",
                          )}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            qty
                          </span>
                        </p>
                      </div>

                      <div className="px-1">
                        <p className="text-[11px] font-medium text-blue-700">
                          <Icon name="ti ti-truck mr-1" aria-hidden="true" />
                          Transferred In
                        </p>
                        <p className="mt-0.5 text-base font-black text-blue-900">
                          {Number(
                            project.total_transferred_in || 0,
                          ).toLocaleString("en-IN")}{" "}
                          <span className="text-xs font-normal text-blue-600">
                            qty
                          </span>
                        </p>
                      </div>

                      <div className="px-1">
                        <p className="text-[11px] font-medium text-emerald-700">
                          <Icon name="ti ti-hammer mr-1" aria-hidden="true" />
                          Material Consumed
                        </p>
                        <p className="mt-0.5 text-base font-black text-emerald-900">
                          {Number(project.total_consumed || 0).toLocaleString(
                            "en-IN",
                          )}{" "}
                          <span className="text-xs font-normal text-emerald-600">
                            qty
                          </span>
                        </p>
                      </div>

                      <div className="px-1">
                        <p className="text-[11px] font-medium text-amber-700">
                          <Icon name="ti ti-hourglass mr-1" aria-hidden="true" />
                          In Transit
                        </p>
                        <p className="mt-0.5 text-base font-black text-amber-900">
                          {Number(project.total_in_transit || 0)}{" "}
                          <span className="text-xs font-normal text-amber-600">
                            shipment(s)
                          </span>
                        </p>
                      </div>
                    </div>

                    {(() => {
                      const timeline = projectTimeline(project);
                      return (
                        <div className="mb-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                            <span>
                              <Icon name="ti ti-calendar mr-1" aria-hidden="true" />
                              {formatDate(project.start_date || project.created_at) || "—"}
                              {" → "}
                              {formatDate(project.expected_end_date) || "End date not set"}
                            </span>
                            {timeline && (
                              <span
                                className={`font-semibold ${timeline.overdue ? "text-red-600" : "text-slate-700"}`}
                              >
                                {timeline.overdue
                                  ? "Past expected completion"
                                  : `${timeline.percent}% of timeline elapsed`}
                              </span>
                            )}
                          </div>
                          {timeline && (
                            <div
                              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                              role="progressbar"
                              aria-valuenow={timeline.percent}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label="Timeline elapsed"
                            >
                              <div
                                className={`h-full rounded-full ${timeline.overdue ? "bg-red-500" : project.status === "completed" ? "bg-emerald-500" : "bg-orange-500"}`}
                                style={{ width: `${timeline.percent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* Linked Site Stores Breakdown */}
                    <details className="project-sites">
                      <summary>
                        View site stores & operations · {sites.length} store(s)
                      </summary>

                      {sites.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          No site stores are linked to this project yet.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {sites.map((site) => (
                            <div
                              key={site.id}
                              className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:border-slate-300"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-900">
                                      {site.site_code}
                                    </span>
                                    <span className="font-bold text-slate-900 text-sm">
                                      {site.name}
                                    </span>
                                    {site.store_id && (
                                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200/60">
                                        Store #{site.store_id}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">
                                    In-Charge:{" "}
                                    <span className="font-semibold text-slate-700">
                                      {site.site_engineer_name || "Unassigned"}
                                    </span>
                                    {site.site_engineer_email
                                      ? ` (${site.site_engineer_email})`
                                      : ""}
                                    {site.address ? ` · ${site.address}` : ""}
                                  </p>
                                </div>
                              </div>

                              {/* Action Buttons for this Site Store in clean responsive grid */}
                              <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {site.store_id ? (
                                  <Link
                                    href={`/reports/inventory/stock-movement?store=${site.store_id}`}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 text-center"
                                    title="View Material Movement and Stock Balance Report"
                                  >
                                    <Icon name="ti ti-chart-bar text-amber-700" />
                                    <span>Stock Report</span>
                                  </Link>
                                ) : (
                                  <div />
                                )}

                                <Link
                                  href="/inventory/stocktransfer"
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-2 text-xs font-bold text-blue-800 transition hover:bg-blue-100 text-center"
                                  title="Transfer material from Central Warehouse to this Site Store"
                                >
                                  <Icon name="ti ti-truck text-blue-700" />
                                  <span>Transfer Stock</span>
                                </Link>

                                <Link
                                  href="/inventory/stockrequisition"
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 text-center"
                                  title="Raise Material Requisition for this Site"
                                >
                                  <Icon name="ti ti-clipboard-text text-slate-600" />
                                  <span>Requisition</span>
                                </Link>

                                <Link
                                  href="/inventory/stockout"
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 text-center"
                                  title="Record Material Consumption at this Site"
                                >
                                  <Icon name="ti ti-hammer text-emerald-700" />
                                  <span>Issue Material</span>
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  </div>
                );
              })
            )}
            {!loading && list.total > 0 && (
              <Pagination
                {...list.pagination}
                className="rounded-2xl border border-slate-200/90 bg-white"
              />
            )}
          </div>
        </div>
      </div>
    </ConstructionShell>
  );
}
