"use client";

import Link from "next/link";
import MainLayout from "@/components/MainLayout";

export const constructionInput =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-200";

export const constructionBtnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-[12.5px] font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

export const constructionBtnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] disabled:opacity-50";

export function ConstructionField({ label, required, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[12px] font-medium text-slate-600">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </span>
      )}
      {children}
    </label>
  );
}

export function ConstructionSection({ title, description, action, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-[12px] text-slate-500">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function ConstructionAlert({ type = "error", children }) {
  const styles =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : type === "info"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : "border-red-200 bg-red-50 text-red-800";
  return (
    <div className={`rounded-xl border px-4 py-3 text-[13px] ${styles}`}>
      {children}
    </div>
  );
}

export function ConstructionTable({ headers, children, empty }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <table className="min-w-full text-left text-[13px]">
        <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function ConstructionEmpty({ colSpan, message = "No records yet." }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-10 text-center text-[13px] text-slate-400"
      >
        {message}
      </td>
    </tr>
  );
}

/**
 * Shared shell for construction pages — matches InventoryShell visual language
 * (white header card, slate primary actions, soft page chrome).
 */
export default function ConstructionShell({
  title,
  subtitle,
  breadcrumb = [
    { label: "Projects", href: "/construction/projects" },
    { label: title },
  ],
  actions = [],
  children,
}) {
  return (
    <MainLayout>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
        {breadcrumb.map((item, index) => (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href && index < breadcrumb.length - 1 ? (
              <Link href={item.href} className="text-blue-600 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  index === breadcrumb.length - 1
                    ? "font-semibold text-slate-900"
                    : "text-blue-600"
                }
              >
                {item.label}
              </span>
            )}
            {index < breadcrumb.length - 1 && (
              <i className="ti ti-chevron-right text-[11px] text-slate-400" />
            )}
          </span>
        ))}
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[24px]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-[13px] leading-normal text-slate-500">
                {subtitle}
              </p>
            )}
          </div>
          {actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {actions.map((action, index) => {
                const isPrimary =
                  action.primary !== undefined
                    ? Boolean(action.primary)
                    : index === actions.length - 1;
                const className = isPrimary
                  ? constructionBtnPrimary
                  : constructionBtnSecondary;
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
                    type={action.type || "button"}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={className}
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

      <div className="space-y-5 pb-10">{children}</div>
    </MainLayout>
  );
}
