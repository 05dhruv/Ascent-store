"use client";

export function RequiredMark({ className = "" }) {
  return (
    <span className={`ml-0.5 text-red-500 ${className}`} aria-hidden="true">
      *
    </span>
  );
}

/**
 * Label + control + optional hint/error. Wraps children in a <label> so clicks focus the control.
 */
export default function FormField({
  label,
  required = false,
  hint,
  error,
  className = "",
  labelClassName = "mb-1.5 block text-[12px] font-medium text-slate-600",
  children,
}) {
  return (
    <label className={`block ${className}`}>
      {label ? (
        <span className={labelClassName}>
          {label}
          {required ? <RequiredMark /> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-red-600" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}
