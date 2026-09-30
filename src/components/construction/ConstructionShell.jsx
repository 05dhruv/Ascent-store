"use client";
import Icon from "@/components/Icon";

import { createContext, useContext } from "react";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";
import Button from "@/components/ui/Button";
import DataTable, { TableEmpty } from "@/components/ui/DataTable";
import FormField from "@/components/ui/FormField";

export const constructionInput =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-200";

export const constructionBtnPrimary = "ui-button";

export const constructionBtnSecondary = "ui-button ui-button--secondary";

export function ConstructionField(props) {
  return <FormField {...props} />;
}

export function ConstructionSection({ title, description, action, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[14px] font-semibold text-slate-900">
                {title}
              </h2>
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

export function ConstructionTable(props) {
  return <DataTable {...props} />;
}

const ShellLoadingContext = createContext(false);

export function ConstructionEmpty(props) {
  const loading = useContext(ShellLoadingContext);
  return <TableEmpty {...props} message={loading ? "Loading…" : props.message} />;
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
  loading = false,
  children,
}) {
  return (
    <MainLayout>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
        {breadcrumb.map((item, index) => (
          <span
            key={`${item.label}-${index}`}
            className="flex items-center gap-2"
          >
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
              <Icon name="ti ti-chevron-right text-[11px] text-slate-400" />
            )}
          </span>
        ))}
      </div>

      <div className="mb-6">
        <div className="workspace-page-header">
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
            <div className="flex flex-wrap items-center gap-2">
              {actions.map((action, index) => {
                const isPrimary =
                  action.primary !== undefined
                    ? Boolean(action.primary)
                    : index === actions.length - 1;
                return (
                  <Button
                    key={action.label}
                    variant={
                      action.accent
                        ? "accent"
                        : isPrimary
                          ? "primary"
                          : "secondary"
                    }
                    href={action.href}
                    type={action.type || "button"}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    icon={action.icon}
                  >
                    <span>{action.label}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ShellLoadingContext.Provider value={loading}>
        <div className="space-y-5 pb-10">{children}</div>
      </ShellLoadingContext.Provider>
    </MainLayout>
  );
}
