"use client";

import Icon from "@/components/Icon";

const PAGE_SIZES = [10, 25, 50, 100];

export default function Pagination({
  page = 1,
  pageSize = 25,
  total = 0,
  totalPages = 1,
  onPageChange,
  onPageSizeChange,
  loading = false,
  className = "",
}) {
  if (!onPageChange) return null;
  const pages = Math.max(1, totalPages || Math.ceil(total / pageSize) || 1);
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  const go = (next) => {
    const target = Math.min(Math.max(1, next), pages);
    if (target !== page) onPageChange(target);
  };
  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-[12px] text-slate-500 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span>
          {from}–{to} of {total.toLocaleString("en-IN")}
        </span>
        {onPageSizeChange && (
          <select
            aria-label="Rows per page"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-600 outline-none focus:border-blue-500"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[...new Set([...PAGE_SIZES, pageSize])]
              .sort((a, b) => a - b)
              .map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={btn} onClick={() => go(1)} disabled={loading || page <= 1} aria-label="First page">
          <Icon name="ti-chevrons-left" className="text-[13px]" />
        </button>
        <button type="button" className={btn} onClick={() => go(page - 1)} disabled={loading || page <= 1} aria-label="Previous page">
          <Icon name="ti-chevron-left" className="text-[13px]" />
        </button>
        <span className="px-2 text-slate-700">
          Page {page} of {pages}
        </span>
        <button type="button" className={btn} onClick={() => go(page + 1)} disabled={loading || page >= pages} aria-label="Next page">
          <Icon name="ti-chevron-right" className="text-[13px]" />
        </button>
        <button type="button" className={btn} onClick={() => go(pages)} disabled={loading || page >= pages} aria-label="Last page">
          <Icon name="ti-chevrons-right" className="text-[13px]" />
        </button>
      </div>
    </div>
  );
}
