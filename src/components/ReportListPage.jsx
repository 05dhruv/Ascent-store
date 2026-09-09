"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MainLayout from "@/components/MainLayout";

const PAGE_SIZES = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000];
const EMPTY_ARRAY = [];
const MONTHS = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d))
    return false;
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

function optionListsEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every(
    (item, index) =>
      item.value === b[index]?.value && item.label === b[index]?.label,
  );
}

function getTodayInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateInputValue(value) {
  if (!value) return "";
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch)
    return isValidDateParts(isoMatch[1], isoMatch[2], isoMatch[3]) ? text : "";

  const indianMatch = text.match(
    /^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2}|\d{4})$/,
  );
  if (indianMatch) {
    const year =
      indianMatch[3].length === 2 ? `20${indianMatch[3]}` : indianMatch[3];
    return isValidDateParts(year, indianMatch[2], indianMatch[1])
      ? `${year}-${indianMatch[2].padStart(2, "0")}-${indianMatch[1].padStart(2, "0")}`
      : "";
  }

  const displayMatch = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (displayMatch) {
    const month = MONTHS[displayMatch[2].toLowerCase()];
    if (month)
      return `${displayMatch[3]}-${month}-${displayMatch[1].padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return "";
}

function parseDateRangeInput(value) {
  const today = getTodayInputValue();
  if (!value) return { from: today, to: today };

  const parts = String(value).split(/\s+-\s+/);
  const from = parseDateInputValue(parts[0]) || today;
  const to = parseDateInputValue(parts[1] || parts[0]) || from;
  return from <= to ? { from, to } : { from: to, to: from };
}

function formatDateForReport(value) {
  const normalized = parseDateInputValue(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateRangeForReport(from, to) {
  const safeFrom = parseDateInputValue(from) || getTodayInputValue();
  const safeTo = parseDateInputValue(to) || safeFrom;
  const ordered = safeFrom <= safeTo ? [safeFrom, safeTo] : [safeTo, safeFrom];
  return `${formatDateForReport(ordered[0])} - ${formatDateForReport(ordered[1])}`;
}

function DateRangeFilter({ value, onChange }) {
  const range = useMemo(() => parseDateRangeInput(value), [value]);
  const dateInputRefs = useRef({});
  const [draft, setDraft] = useState(() => ({
    from: formatDateForReport(range.from),
    to: formatDateForReport(range.to),
  }));

  useEffect(() => {
    setDraft({
      from: formatDateForReport(range.from),
      to: formatDateForReport(range.to),
    });
  }, [range.from, range.to]);

  const updateRange = (nextPart) => {
    const nextFrom = nextPart.from || range.from;
    const nextTo = nextPart.to || range.to;
    onChange(formatDateRangeForReport(nextFrom, nextTo));
  };

  const commitDraft = (key) => {
    const parsed = parseDateInputValue(draft[key]);
    if (!parsed) {
      setDraft((current) => ({
        ...current,
        [key]: formatDateForReport(range[key]),
      }));
      return;
    }
    updateRange({ [key]: parsed });
  };

  const openCalendar = (key) => {
    const input = dateInputRefs.current[key];
    if (!input) return;
    try {
      input.showPicker?.();
    } catch {
      input.click();
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {[
        { key: "from", label: "From" },
        { key: "to", label: "To" },
      ].map((field) => (
        <label key={field.key} className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-500">
            {field.label}
          </span>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              value={draft[field.key]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
              onBlur={() => commitDraft(field.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <input
              ref={(node) => {
                dateInputRefs.current[field.key] = node;
              }}
              type="date"
              value={range[field.key]}
              onChange={(event) =>
                updateRange({ [field.key]: event.target.value })
              }
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-0"
            />
            <button
              type="button"
              onClick={() => openCalendar(field.key)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              title={`Select ${field.label.toLowerCase()} date`}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="4"
                  width="14"
                  height="14"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M3 8h14M7 2v3M13 2v3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </label>
      ))}
    </div>
  );
}

/**
 * ReportsListPage — shared layout for all individual report pages.
 *
 * Props:
 *  breadcrumbs   [{ label, href? }]
 *  title         string
 *  description   string
 *  filters       [{ key, label, type: 'date-range'|'select'|'text', options?: [] }]
 *  columns       [{ key, label }]
 *  rows          array of objects
 *  onApply       (filterValues) => void
 *  totalLabel    string
 *  emptyMessage  string
 *  extraActions  ReactNode   — e.g. "Convert B2B to B2C" button
 *  summaryCards  [{ key, label, type?: 'money'|'number' }]
 */
export default function ReportsListPage({
  breadcrumbs = EMPTY_ARRAY,
  title = "",
  description = "",
  filters = EMPTY_ARRAY,
  columns = EMPTY_ARRAY,
  rows = EMPTY_ARRAY,
  reportKey = "",
  apiPath = "",
  onApply,
  totalLabel = "Results",
  emptyMessage = "No Rows To Show",
  extraActions = null,
  summaryCards = EMPTY_ARRAY,
  detailReports = EMPTY_ARRAY,
  renderCell,
  stickyFilters = false,
}) {
  const pathname = usePathname();
  const today = formatDateForReport(getTodayInputValue());
  const todayStr = `${today} - ${today}`;

  const [regionOptions, setRegionOptions] = useState([]);
  const [storeOptions, setStoreOptions] = useState([]);
  const [remoteRows, setRemoteRows] = useState(EMPTY_ARRAY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [billModal, setBillModal] = useState({
    open: false,
    loading: false,
    error: "",
    title: "",
    rows: EMPTY_ARRAY,
  });
  const [detailRows, setDetailRows] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [activeDetailKey, setActiveDetailKey] = useState(
    detailReports[0]?.key || "",
  );
  const filterSignature = useMemo(
    () =>
      filters
        .map((filter) => `${filter.key}:${filter.label}:${filter.type}`)
        .join("|"),
    [filters],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadFilterOptions() {
      const hasRegionFilter = filters.some(
        (filter) =>
          filter.key === "region" || /region/i.test(filter.label || ""),
      );
      const hasStoreFilter = filters.some(
        (filter) => filter.key === "store" || /store/i.test(filter.label || ""),
      );

      try {
        if (hasRegionFilter) {
          const res = await fetch("/api/regions", {
            cache: "no-store",
            credentials: "include",
          });
          const json = await res.json().catch(() => ({}));

          if (res.ok && json?.success && !cancelled) {
            const records = Array.isArray(json?.data?.records)
              ? json.data.records
              : [];
            const nextOptions = records.map((region) => ({
              value: String(region.id),
              label: region.name,
            }));
            setRegionOptions((prev) =>
              optionListsEqual(prev, nextOptions) ? prev : nextOptions,
            );
          }
        }

        if (hasStoreFilter) {
          const res = await fetch("/api/reports/dashboard?scope=stores", {
            cache: "no-store",
            credentials: "include",
          });
          const json = await res.json().catch(() => ({}));

          if (res.ok && json?.success && !cancelled) {
            const stores = Array.isArray(json?.data?.stores)
              ? json.data.stores
              : [];
            const nextOptions = stores.map((store) => ({
              value: String(store.id),
              label: store.name,
            }));
            setStoreOptions((prev) =>
              optionListsEqual(prev, nextOptions) ? prev : nextOptions,
            );
          }
        }
      } catch (err) {
        console.error("[ReportListPage] Failed to fetch filter options", err);
        if (!cancelled) {
          setRegionOptions([]);
          setStoreOptions([]);
        }
      }
    }

    loadFilterOptions();
    return () => {
      cancelled = true;
    };
  }, [filterSignature]);

  const resolvedFilters = useMemo(
    () =>
      filters.map((filter) => {
        const isRegionFilter =
          filter.key === "region" || /region/i.test(filter.label || "");
        if (!isRegionFilter) return filter;

        return {
          ...filter,
          type: "select",
          options:
            regionOptions.length > 0
              ? [{ value: "all", label: "All Regions" }, ...regionOptions]
              : Array.isArray(filter.options)
                ? filter.options
                : [],
        };
      }),
    [filters, regionOptions],
  );

  const resolvedFiltersWithStores = useMemo(
    () =>
      resolvedFilters.map((filter) => {
        const isStoreFilter =
          filter.key === "store" || /store/i.test(filter.label || "");
        if (!isStoreFilter) return filter;

        return {
          ...filter,
          type: "select",
          options:
            storeOptions.length > 0
              ? [{ value: "all", label: "All Stores" }, ...storeOptions]
              : Array.isArray(filter.options)
                ? filter.options
                : [],
        };
      }),
    [resolvedFilters, storeOptions],
  );

  const defaultFilterValues = useMemo(() => {
    const v = {};
    resolvedFiltersWithStores.forEach((f) => {
      if (f.type === "date-range" || f.type === "daterange")
        v[f.key] = todayStr;
      else v[f.key] = "";
    });
    return v;
  }, [resolvedFiltersWithStores, todayStr]);

  const [filterValues, setFilterValues] = useState(defaultFilterValues);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedRows, setCheckedRows] = useState([]);
  const [allChecked, setAllChecked] = useState(false);

  const set = (key, val) =>
    setFilterValues((prev) => ({ ...prev, [key]: val }));
  const filterValuesSignature = JSON.stringify(filterValues);

  const inferredReportKey = useMemo(() => {
    if (reportKey) return reportKey;
    const prefix = "/reports/";
    if (!pathname?.startsWith(prefix)) return "";
    return pathname.slice(prefix.length).replace(/^\/+|\/+$/g, "");
  }, [pathname, reportKey]);

  const effectiveApiPath =
    apiPath || (inferredReportKey ? `/api/reports/${inferredReportKey}` : "");

  const buildQuery = (values, extra = {}) => {
    const params = new URLSearchParams();
    Object.entries(values || {}).forEach(([key, value]) => {
      if (
        !value ||
        value === "all" ||
        value === "All" ||
        value === "Select" ||
        value === "Select..."
      )
        return;
      params.set(key, value);
    });
    Object.entries(extra).forEach(([key, value]) => params.set(key, value));
    return params.toString();
  };

  const fetchReportRows = async (values = filterValues) => {
    if (!effectiveApiPath) return;
    setLoading(true);
    setError("");

    try {
      const queryString = buildQuery(values);
      const res = await fetch(
        `${effectiveApiPath}${queryString ? `?${queryString}` : ""}`,
        {
          cache: "no-store",
          credentials: "include",
        },
      );
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Unable to load report");
      }

      setRemoteRows(Array.isArray(json?.data?.rows) ? json.data.rows : []);
    } catch (err) {
      console.error("[ReportListPage] report fetch failed", err);
      setError(err.message || "Unable to load report");
      setRemoteRows([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailReports = async (values = filterValues) => {
    if (!detailReports.length) return;
    setDetailLoading(true);
    setDetailError("");

    try {
      const entries = await Promise.all(
        detailReports.map(async (detail) => {
          const detailApiPath =
            detail.apiPath ||
            (detail.reportKey ? `/api/reports/${detail.reportKey}` : "");
          if (!detailApiPath) return [detail.key, EMPTY_ARRAY];
          const queryString = buildQuery({
            ...values,
            ...(detail.extraFilters || {}),
          });
          const res = await fetch(
            `${detailApiPath}${queryString ? `?${queryString}` : ""}`,
            {
              cache: "no-store",
              credentials: "include",
            },
          );
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.success) {
            throw new Error(json?.message || `Unable to load ${detail.title}`);
          }
          return [
            detail.key,
            Array.isArray(json?.data?.rows) ? json.data.rows : EMPTY_ARRAY,
          ];
        }),
      );
      setDetailRows(Object.fromEntries(entries));
    } catch (err) {
      console.error("[ReportListPage] detail report fetch failed", err);
      setDetailError(err.message || "Unable to load detail reports");
      setDetailRows({});
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchReportRows(defaultFilterValues);
    fetchDetailReports(defaultFilterValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveApiPath]);

  const handleApply = () => {
    onApply?.(filterValues);
    fetchReportRows(filterValues);
    fetchDetailReports(filterValues);
  };

  const handleDownload = () => {
    if (!effectiveApiPath) return;
    const exportColumns = columns.filter(
      (column) => column.type !== "view-bills",
    );
    const queryString = buildQuery(filterValues, {
      export: "xlsx",
      columns: JSON.stringify(exportColumns),
    });
    window.location.href = `${effectiveApiPath}?${queryString}`;
  };

  const handleDetailDownload = () => {
    if (!activeDetail) return;
    const detailApiPath =
      activeDetail.apiPath ||
      (activeDetail.reportKey ? `/api/reports/${activeDetail.reportKey}` : "");
    if (!detailApiPath) return;
    const queryString = buildQuery(
      {
        ...filterValues,
        ...(activeDetail.extraFilters || {}),
      },
      {
        export: "xlsx",
        columns: JSON.stringify(activeDetail.columns || []),
      },
    );
    window.location.href = `${detailApiPath}?${queryString}`;
  };

  const openBillModal = async (row) => {
    const date = row.date || "";
    const store = row.store || "Store";
    const params = new URLSearchParams();
    params.set("date_range", `${date} - ${date}`);
    params.set("sales_scope", "closed");
    if (row.store_id) params.set("store", row.store_id);

    setBillModal({
      open: true,
      loading: true,
      error: "",
      title: `${store} bills on ${date}`,
      rows: EMPTY_ARRAY,
    });

    try {
      const res = await fetch(
        `/api/reports/orders/list-of-orders?${params.toString()}`,
        {
          cache: "no-store",
          credentials: "include",
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success)
        throw new Error(json?.message || "Unable to load bills");

      setBillModal((current) => ({
        ...current,
        loading: false,
        rows: Array.isArray(json?.data?.rows) ? json.data.rows : EMPTY_ARRAY,
      }));
    } catch (err) {
      console.error("[ReportListPage] bill view failed", err);
      setBillModal((current) => ({
        ...current,
        loading: false,
        error: err.message || "Unable to load bills",
        rows: EMPTY_ARRAY,
      }));
    }
  };

  const closeBillModal = () => {
    setBillModal({
      open: false,
      loading: false,
      error: "",
      title: "",
      rows: EMPTY_ARRAY,
    });
  };

  const handleAllCheck = () => {
    if (allChecked) {
      setCheckedRows([]);
      setAllChecked(false);
    } else {
      setCheckedRows(effectiveRows.map((r) => r.id));
      setAllChecked(true);
    }
  };

  // Reset page to 1 when search or filter values change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterValuesSignature]);

  const effectiveRows =
    remoteRows.length || effectiveApiPath ? remoteRows : rows;
  const filtered = effectiveRows.filter((row) =>
    Object.values(row).some((v) =>
      String(v).toLowerCase().includes(search.toLowerCase()),
    ),
  );

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages));

  const pagedRows = filtered.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );
  const showingFrom =
    filtered.length > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(safeCurrentPage * pageSize, filtered.length);
  const summaryValues = useMemo(() => {
    const parseReportNumber = (value) => {
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return summaryCards.map((card) => {
      const value = effectiveRows.reduce(
        (sum, row) => sum + parseReportNumber(row[card.key]),
        0,
      );
      const formatted =
        card.type === "number"
          ? value.toLocaleString("en-IN")
          : value.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
      return { ...card, value, formatted };
    });
  }, [effectiveRows, summaryCards]);
  const activeDetail =
    detailReports.find((detail) => detail.key === activeDetailKey) ||
    detailReports[0];
  const activeDetailRows = activeDetail
    ? detailRows[activeDetail.key] || EMPTY_ARRAY
    : EMPTY_ARRAY;

  return (
    <MainLayout>
      <div className="min-h-screen bg-transparent text-sm text-slate-800">
        {/* Breadcrumb */}
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-400">›</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-indigo-600 hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-semibold text-slate-700">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Title */}
        <h1 className="mb-0.5 text-[22px] font-black tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mb-4 text-xs text-slate-500">
            {description.replace("Need Help?", "")}
            {description.includes("Need Help?") && (
              <a href="#" className="text-indigo-600 hover:underline">
                Need Help?
              </a>
            )}
          </p>
        )}

        {/* Filter Card */}
        {resolvedFiltersWithStores.length > 0 && (
          <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_1px_12px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {resolvedFiltersWithStores.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {f.label}
                  </label>

                  {(f.type === "date-range" || f.type === "daterange") && (
                    <DateRangeFilter
                      value={filterValues[f.key]}
                      onChange={(value) => set(f.key, value)}
                    />
                  )}

                  {f.type === "select" && (
                    <div className="relative">
                      <select
                        value={filterValues[f.key]}
                        onChange={(e) => set(f.key, e.target.value)}
                        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                      >
                        <option value="">Select</option>
                        {(f.options || []).map((o) => (
                          <option key={o.value ?? o} value={o.value ?? o}>
                            {o.label ?? o}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M4 6l4 4 4-4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    </div>
                  )}

                  {f.type === "text" && (
                    <input
                      type="text"
                      placeholder={
                        f.placeholder || `Search for ${f.label.toLowerCase()}`
                      }
                      value={filterValues[f.key]}
                      onChange={(e) => set(f.key, e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Filter Actions */}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={handleDownload}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50"
                title="Download"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 3v10m0 0l-3-3m3 3l3-3M4 17h12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                onClick={handleApply}
                disabled={loading}
                className="flex-1 rounded-xl bg-indigo-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 sm:flex-none"
              >
                {loading ? "Loading..." : "Apply"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Extra actions (e.g. Convert B2B to B2C) */}
        {extraActions && <div className="mb-3">{extraActions}</div>}

        {summaryValues.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summaryValues.map((card) => (
              <div
                key={card.key}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_12px_rgba(15,23,42,0.04)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {card.label}
                </p>
                <p className="mt-1 text-lg font-black text-slate-900">
                  {card.formatted}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="mb-2 flex justify-end">
          <div className="relative w-full sm:w-auto">
            <svg
              className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 20 20"
            >
              <circle
                cx="9"
                cy="9"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M15 15l-3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:w-56"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_1px_12px_rgba(15,23,42,0.04)]">
          <div
            className={`overflow-x-auto ${
              stickyFilters ? "max-h-[calc(100vh-360px)] overflow-y-auto" : ""
            }`}
          >
            <table className="w-full text-sm border-collapse">
              <thead className={stickyFilters ? "sticky top-0 z-20 bg-slate-50 shadow-sm" : ""}>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={handleAllCheck}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                    />
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-600"
                    >
                      {col.label}
                      <span className="ml-1 text-xs text-slate-300">▼ ⋮</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      className="py-20 text-center text-slate-400"
                    >
                      Loading report...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      className="py-20 text-center text-slate-400"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-50 transition-colors hover:bg-indigo-50/50"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checkedRows.includes(row.id)}
                          onChange={() =>
                            setCheckedRows((prev) =>
                              prev.includes(row.id)
                                ? prev.filter((r) => r !== row.id)
                                : [...prev, row.id],
                            )
                          }
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                        />
                      </td>
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className="whitespace-nowrap px-4 py-3 text-slate-700"
                        >
                          {renderCell ? (
                            renderCell(row, col)
                          ) : col.type === "view-bills" ? (
                            <button
                              type="button"
                              onClick={() => openBillModal(row)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-50"
                            >
                              View
                            </button>
                          ) : (
                            (row[col.key] ?? "-")
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="appearance-none rounded-xl border border-slate-200 bg-white px-3 py-1.5 pr-7 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              ▼
            </span>
          </div>
          <span className="text-xs text-slate-500">
            Showing {showingFrom} to {showingTo} of {filtered.length}{" "}
            {totalLabel}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500 px-1">
                Page {safeCurrentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {detailReports.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_1px_12px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {detailReports.map((detail) => (
                  <button
                    key={detail.key}
                    type="button"
                    onClick={() => setActiveDetailKey(detail.key)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      (activeDetail?.key || "") === detail.key
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {detail.title}
                  </button>
                ))}
              </div>
              {activeDetail && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {activeDetailRows.length} rows
                  </span>
                  <button
                    type="button"
                    onClick={handleDetailDownload}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    title={`Download ${activeDetail.title}`}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M10 3v10m0 0l-3-3m3 3l3-3M4 17h12"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Download Sheet
                  </button>
                </div>
              )}
            </div>

            {detailError && (
              <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {detailError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    {(activeDetail?.columns || []).map((column) => (
                      <th
                        key={column.key}
                        className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-600"
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detailLoading ? (
                    <tr>
                      <td
                        colSpan={(activeDetail?.columns || []).length || 1}
                        className="py-16 text-center text-slate-400"
                      >
                        Loading details...
                      </td>
                    </tr>
                  ) : activeDetailRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={(activeDetail?.columns || []).length || 1}
                        className="py-16 text-center text-slate-400"
                      >
                        No detail rows found
                      </td>
                    </tr>
                  ) : (
                    activeDetailRows.map((row, index) => (
                      <tr
                        key={row.id || `${activeDetail.key}-${index}`}
                        className="border-t border-slate-50"
                      >
                        {(activeDetail?.columns || []).map((column) => (
                          <td
                            key={column.key}
                            className="whitespace-nowrap px-4 py-3 text-slate-700"
                          >
                            {row[column.key] ?? "-"}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {billModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
            <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {billModal.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {billModal.rows.length} bills
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeBillModal}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              {billModal.error && (
                <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {billModal.error}
                </div>
              )}

              <div className="max-h-[65vh] overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-100">
                      {[
                        "Bill No",
                        "Time",
                        "Customer",
                        "Quantity",
                        "Category",
                        "Sales",
                        "Discount",
                        "Taxes",
                        "Round Off",
                        "Gross Bill",
                        "Payment Mode",
                        "Paid",
                        "Status",
                      ].map((label) => (
                        <th
                          key={label}
                          className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-600"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {billModal.loading ? (
                      <tr>
                        <td
                          colSpan={13}
                          className="py-14 text-center text-slate-400"
                        >
                          Loading bills...
                        </td>
                      </tr>
                    ) : billModal.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={13}
                          className="py-14 text-center text-slate-400"
                        >
                          No bills found
                        </td>
                      </tr>
                    ) : (
                      billModal.rows.map((bill) => (
                        <tr key={bill.id} className="border-t border-slate-50">
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.invoice_number || bill.sales_order_id || "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.order_time || "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.invoiced_customer || bill.customer || "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.quantity ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.category || "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.sales ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.discount ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.taxes_product ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.round_off ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.gross_bill ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.payment_mode ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.paid_amount ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {bill.payment_status ?? "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
