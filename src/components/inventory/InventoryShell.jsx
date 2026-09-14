'use client';

import MainLayout from '@/components/MainLayout';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\u20b9/g, '')
    .replace(/[,\s]/g, '');
}

export default function InventoryShell({
  title,
  subtitle,
  breadcrumb,
  actions = [],
  searchPlaceholder,
  filters = [],
  stats = [],
  insights = [],
  cards = [],
  tableHeaders = [],
  tableData = [],
  searchValue,
  onSearchChange,
  onDownload,
  emptyMessage = 'No Records Found',
  showTable = true,
  rowActions = null,
  compactMobile = false,
  children,
}) {
  const [localSearch, setLocalSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const activeSearch = typeof onSearchChange === 'function' ? (searchValue || '') : localSearch;
  const visibleTableData = useMemo(() => {
    const q = String(activeSearch || '').trim().toLowerCase();
    if (!q) return tableData;
    const normalizedQuery = normalizeSearchText(q);
    return tableData.filter((row) =>
      Object.values(row || {}).some((value) => {
        const text = String(value ?? '').toLowerCase();
        return text.includes(q) || normalizeSearchText(text).includes(normalizedQuery);
      })
    );
  }, [activeSearch, tableData]);
  const totalResults = visibleTableData.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = totalResults ? (safeCurrentPage - 1) * pageSize : 0;
  const pageEnd = Math.min(pageStart + pageSize, totalResults);
  const paginatedTableData = visibleTableData.slice(pageStart, pageEnd);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeSearch, pageSize, tableData]);

  const renderActionElement = (item, className, content) => {
    if (item.href) {
      return (
        <Link href={item.href} className={className}>
          {content}
        </Link>
      );
    }

    return (
      <button type="button" onClick={item.onClick} className={className}>
        {content}
      </button>
    );
  };

  return (
    <MainLayout>
      <div className={`${compactMobile ? 'mb-2 text-[10px] sm:mb-4 sm:text-[12px]' : 'mb-4 text-[12px]'} flex flex-wrap items-center gap-2 text-slate-500`}>
        {breadcrumb.map((item, index) => (
          <span key={item.label} className="flex items-center gap-2">
            <span className={index === breadcrumb.length - 1 ? 'font-semibold text-slate-900' : 'text-indigo-600'}>
              {item.label}
            </span>
            {index < breadcrumb.length - 1 && <i className="ti ti-chevron-right text-[11px] text-slate-400" />}
          </span>
        ))}
      </div>

      <div className={`${compactMobile ? 'mb-3 rounded-2xl p-3 sm:mb-4 sm:rounded-2xl sm:p-4' : 'mb-5 rounded-2xl p-4 sm:p-5'} border border-slate-200/90 bg-white shadow-sm`}>
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <h1 className={`${compactMobile ? 'text-[17px] sm:text-[20px]' : 'text-[20px] sm:text-[24px]'} font-bold leading-tight tracking-tight text-slate-900`}>{title}</h1>
            {subtitle && (
              <p className={`${compactMobile ? 'mt-0.5 text-[11px] sm:text-[12px]' : 'mt-1 text-[13px]'} text-slate-500 leading-normal`}>{subtitle}</p>
            )}
          </div>

          {actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              {actions.map((action, index) => {
                const isPrimary = action.primary !== undefined ? Boolean(action.primary) : (index === actions.length - 1 && action.primary !== false);
                const className = `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[12.5px] font-medium transition-all duration-150 ${
                  isPrimary
                    ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm active:scale-[0.99]'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 shadow-sm active:scale-[0.99]'
                }`;
                if (action.href) {
                  return (
                    <Link key={action.label} href={action.href} className={className}>
                      {action.icon && <i className={action.icon} />}
                      <span>{action.label}</span>
                    </Link>
                  );
                }
                return (
                  <button
                    key={action.label}
                    type={action.type || 'button'}
                    onClick={action.onClick}
                    disabled={Boolean(action.disabled)}
                    className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {action.icon && <i className={action.icon} />}
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <div className={`${compactMobile ? 'mb-3 grid-cols-2 gap-2 sm:mb-5 sm:gap-4' : 'mb-5 grid-cols-1 gap-4'} grid sm:grid-cols-2 xl:grid-cols-4`}>
          {stats.map((stat) => (
            <div key={stat.label} className={`${compactMobile ? 'min-h-[72px] rounded-2xl p-2.5 sm:min-h-[98px] sm:rounded-3xl sm:p-4' : 'min-h-[98px] rounded-3xl p-4'} flex flex-col justify-between border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]`}>
              <p className={`${compactMobile ? 'text-[9px] sm:text-[12px]' : 'text-[12px]'} font-medium uppercase tracking-wide text-slate-400`}>{stat.label}</p>
              {stat.value ? (
                <div className={`${compactMobile ? 'text-[19px] sm:text-[28px]' : 'text-[28px]'} font-black leading-none text-indigo-600`}>{stat.value}</div>
              ) : (
                <div className="h-1 w-8 rounded-full bg-indigo-600/80" />
              )}
              <p className={`${compactMobile ? 'text-[9.5px] leading-tight sm:text-[12.5px]' : 'text-[12.5px]'} text-slate-400`}>{stat.note}</p>
            </div>
          ))}
        </div>
      )}

      {insights.length > 0 && (
        <>
          <div className="mb-2 inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[12px] font-semibold text-amber-600">
            AI INSIGHTS
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            {insights.map((insight) => (
              <div key={insight.title} className="min-h-[130px] rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <h3 className="text-[13px] font-semibold text-amber-900">{insight.title}</h3>
                <p className="mt-2 text-[12px] leading-5 text-amber-900/85">{insight.text}</p>
                {renderActionElement(
                  insight,
                  'mt-4 inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white',
                  insight.button
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {cards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {cards.map((card) => (
            <div key={card.title} className="min-h-[78px] rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              {renderActionElement(
                card,
                'flex h-full w-full items-center justify-between rounded-2xl p-4 text-left transition-colors hover:bg-indigo-50/50',
                <>
                  <span>
                    <span className="block text-[13px] font-semibold text-slate-900">{card.title}</span>
                    <span className="mt-1 block text-[12px] text-slate-400">{card.text}</span>
                  </span>
                  <i className="ti ti-chevron-right text-slate-400 text-[16px]" />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showTable && tableHeaders.length > 0 && (
      <div className="flex h-[calc(100vh-250px)] min-h-[480px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:px-4">
          <div className="flex min-w-0 max-w-full flex-[1_1_260px] items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 sm:max-w-[340px]">
            <i className="ti ti-search text-slate-400 text-[16px]" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={activeSearch}
              onChange={(e) => {
                if (typeof onSearchChange === 'function') onSearchChange(e.target.value);
                else setLocalSearch(e.target.value);
              }}
              className="flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {Array.isArray(filters) ? filters.map((filter) => (
              <button key={filter} type="button" className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600 transition-colors hover:bg-slate-50">
                <i className="ti ti-filter text-[14px] text-indigo-500" />
                {filter}
                <i className="ti ti-chevron-down text-[11px]" />
              </button>
            )) : filters}
            {typeof onDownload === 'function' && (
              <button type="button" onClick={onDownload} className="rounded-xl border border-slate-200 p-2 transition-colors hover:bg-slate-50" title="Download">
                <i className="ti ti-download text-slate-500 text-[16px]" />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[920px] table-auto">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_rgba(226,232,240,1)]">
              <tr className="border-b border-slate-100">
                {tableHeaders.map((header) => (
                  <th key={header} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {header}
                  </th>
                ))}
                {rowActions && (
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedTableData.length > 0 ? (
                  paginatedTableData.map((row, rowIdx) => (
                  <tr key={row._id || `${safeCurrentPage}-${rowIdx}`} className="border-b border-slate-100 transition-colors hover:bg-indigo-50/50">
                    {tableHeaders.map((header, colIdx) => (
                      <td key={colIdx} className="max-w-[240px] whitespace-nowrap px-4 py-3 text-[13px] text-slate-700" title={String(row[header] ?? '')}>
                        <span className="inline-block max-w-[240px] overflow-hidden text-ellipsis align-bottom">
                          {row[header] ?? '-'}
                        </span>
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-4 py-3 text-right">
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={tableHeaders.length + (rowActions ? 1 : 0)} className="px-4 py-14 text-center text-[14px] font-medium text-indigo-700">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="z-20 flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-100 bg-white px-4 py-3 text-[12px] text-slate-400">
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600"
            aria-label="Rows per page"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <span>
            Showing {totalResults ? `${pageStart + 1} to ${pageEnd}` : '0 to 0'} of {totalResults} Results
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage <= 1}
              className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="min-w-20 text-center text-slate-500">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      )}

      {children}
    </MainLayout>
  );
}
