"use client";
import Icon from "@/components/Icon";

export function FilterSearch({
  value,
  onChange,
  placeholder = "Search...",
  ariaLabel = "Search",
  className = "",
}) {
  return (
    <div className={`relative min-w-[200px] flex-1 ${className}`}>
      <Icon name="ti ti-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white"
      />
    </div>
  );
}

/**
 * options: [{ value, label }] or plain strings.
 */
export function FilterSelect({
  value,
  onChange,
  options = [],
  allLabel,
  ariaLabel,
  className = "",
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`max-w-[220px] rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 ${className}`}
    >
      {allLabel ? <option value="all">{allLabel}</option> : null}
      {options.map((option) => {
        const item =
          typeof option === "object" ? option : { value: option, label: option };
        return (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        );
      })}
    </select>
  );
}

/**
 * Card-style toolbar: optional search on the left, filter controls and a result count on the right.
 */
export default function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  count,
  countLabel = "Result",
  children,
  className = "",
}) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm lg:flex-row lg:items-center ${className}`}>
      {onSearchChange ? (
        <FilterSearch
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          ariaLabel={searchLabel || searchPlaceholder}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {children}
        {count !== undefined ? (
          <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-600">
            {count} {countLabel}
            {count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
