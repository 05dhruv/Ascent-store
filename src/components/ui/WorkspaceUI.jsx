"use client";
import Icon from "@/components/Icon";

import { useEffect, useRef } from "react";
import Button from "./Button";

export function StatusBadge({ status, children }) {
  const value = String(status || "unknown")
    .toLowerCase()
    .replaceAll(" ", "_");
  const tone =
    {
      planning: "warning",
      low_stock: "warning",
      pending: "warning",
      active: "info",
      available: "info",
      completed: "success",
      on_track: "success",
      in_stock: "success",
      delayed: "danger",
      out_of_stock: "danger",
      inactive: "neutral",
      on_hold: "neutral",
    }[value] || "neutral";
  return (
    <span className={`ui-badge ui-badge--${tone}`}>
      {children || value.replaceAll("_", " ")}
    </span>
  );
}

/**
 * trend: { label, direction: "up" | "down" | "flat", tone?: "good" | "bad" | "neutral" }
 */
export function MetricCard({ label, value, note, icon, tone = "blue", trend }) {
  const trendTone = trend
    ? trend.tone ||
      (trend.direction === "up" ? "good" : trend.direction === "down" ? "bad" : "neutral")
    : null;
  const trendClass = {
    good: "text-emerald-600",
    bad: "text-red-600",
    neutral: "text-slate-500",
  }[trendTone];
  const trendIcon = {
    up: "ti-trending-up",
    down: "ti-trending-down",
    flat: "ti-minus",
  }[trend?.direction || "flat"];
  return (
    <div className="ui-card ui-metric">
      <div className="ui-metric-heading">
        <span className={`ui-icon ui-icon--${tone}`}>
          <Icon aria-hidden="true" name={`ti ${icon}`} />
        </span>
        <p>{label}</p>
      </div>
      <p className="ui-metric-value">{value}</p>
      {trend ? (
        <p className={`mt-1 flex items-center gap-1 text-[12px] font-semibold ${trendClass}`}>
          <Icon aria-hidden="true" name={`ti ${trendIcon} text-[14px]`} />
          <span>{trend.label}</span>
        </p>
      ) : null}
      <p className="ui-metric-note">{note}</p>
    </div>
  );
}

// Native modal provides focus containment, Escape support and an inert background.
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  busy = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    ref.current.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      ref.current?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="ui-modal"
      aria-labelledby="workspace-modal-title"
      aria-describedby="workspace-modal-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="ui-modal-header">
        <div>
          <h2 id="workspace-modal-title">{title}</h2>
          <p id="workspace-modal-description">{subtitle}</p>
        </div>
        <Button
          variant="secondary"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
          icon="ti ti-x"
        />
      </header>
      {open && children}
    </dialog>
  );
}
