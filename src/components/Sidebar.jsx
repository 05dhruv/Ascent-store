"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SIDEBAR_BG =
  "bg-[linear-gradient(180deg,#0B2239_0%,#0D2A42_55%,#0B2239_100%)]";

function normalize(path) {
  return String(path || "").replace(/\/+$/, "") || "/";
}

function childrenOf(item) {
  return (item.subSidebar?.groups || []).flatMap((group) => group.items || []);
}

function initials(name) {
  return (
    String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function prettyRole(role) {
  return String(role || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Picks the single best-matching link for the current URL so sibling links
 * that share a path prefix (e.g. /construction/projects?view=sites) don't
 * both light up.
 */
function useActiveHref(items, pathname, search) {
  return useMemo(() => {
    const current = normalize(pathname);
    let best = null;
    let bestScore = -1;
    const consider = (href) => {
      if (!href) return;
      const [rawPath, query = ""] = href.split("?");
      const path = normalize(rawPath);
      const depth = path.split("/").filter(Boolean).length;
      const pathMatches =
        current === path || (depth > 1 && current.startsWith(`${path}/`));
      if (!pathMatches) return;
      const currentQuery = search.replace(/^\?/, "");
      if (query && query !== currentQuery) return;
      const score =
        path.length * 10 + (current === path ? 5 : 0) + (query ? 3 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = href;
      }
    };
    items.forEach((item) => {
      consider(item.href);
      childrenOf(item).forEach((child) => consider(child.href));
    });
    return best;
  }, [items, pathname, search]);
}

export default function Sidebar({
  items = [],
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
  user,
}) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [openLabel, setOpenLabel] = useState(null);
  const [flyout, setFlyout] = useState(null);
  const flyoutTimer = useRef(null);

  const openFlyout = (next) => {
    clearTimeout(flyoutTimer.current);
    setFlyout(next);
  };
  const scheduleFlyoutClose = () => {
    clearTimeout(flyoutTimer.current);
    flyoutTimer.current = setTimeout(() => setFlyout(null), 140);
  };

  useEffect(() => () => clearTimeout(flyoutTimer.current), []);

  useEffect(() => {
    setFlyout(null);
    setSearch(typeof window !== "undefined" ? window.location.search : "");
  }, [pathname]);

  const activeHref = useActiveHref(items, pathname, search);

  const activeParent = useMemo(() => {
    if (!activeHref) return null;
    return (
      items.find(
        (item) =>
          item.href === activeHref ||
          childrenOf(item).some((child) => child.href === activeHref),
      ) || null
    );
  }, [items, activeHref]);

  useEffect(() => {
    if (activeParent && childrenOf(activeParent).length) {
      setOpenLabel(activeParent.label);
    }
  }, [activeParent]);

  const renderChildren = (item, { onNavigate } = {}) => {
    const groups = item.subSidebar?.groups || [];
    const showGroupLabels = groups.length > 1;
    return groups.map((group) => (
      <div key={group.label} className="py-0.5">
        {showGroupLabels && (
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6F8BA3]">
            {group.label}
          </p>
        )}
        {(group.items || []).map((child) => {
          const active = child.href === activeHref;
          return (
            <Link
              key={`${child.href}-${child.label}`}
              href={child.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`relative block rounded-lg px-3 py-2 text-[12.5px] leading-snug transition-colors ${
                active
                  ? "bg-white/[0.07] font-semibold text-white"
                  : "text-[#9FB3C6] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute -left-[13px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-orange-500" />
              )}
              {child.label}
            </Link>
          );
        })}
      </div>
    ));
  };

  const renderExpandedNav = ({ onNavigate } = {}) => (
    <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
      {items.map((item) => {
        const hasChildren = childrenOf(item).length > 0;
        const isOpen = openLabel === item.label;
        const isActive = activeParent?.label === item.label;
        const rowClass = `group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
          isActive
            ? "bg-orange-500 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]"
            : "text-[#C9D6E3] hover:bg-white/[0.06] hover:text-white"
        }`;
        const content = (
          <>
            <i
              className={`ti ${item.icon} text-[19px] ${isActive ? "text-white" : "text-[#8FA7BB] group-hover:text-white"}`}
            />
            <span className="flex-1 truncate text-left">{item.label}</span>
            {hasChildren && (
              <i
                className={`ti ti-chevron-down text-[13px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${isActive ? "text-white" : "text-[#6F8BA3]"}`}
              />
            )}
          </>
        );

        return (
          <div key={item.label}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setOpenLabel(isOpen ? null : item.label)}
                aria-expanded={isOpen}
                className={rowClass}
              >
                {content}
              </button>
            ) : (
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={rowClass}
              >
                {content}
              </Link>
            )}
            {hasChildren && (
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <div className="ml-[22px] mt-1 border-l border-white/10 pl-3">
                    {renderChildren(item, { onNavigate })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const brand = (compact) => (
    <Link
      href="/home"
      onClick={onMobileClose}
      className={`flex h-[56px] shrink-0 items-center gap-3 border-b border-white/[0.06] ${compact ? "justify-center px-2" : "px-5"}`}
      aria-label="Ascent Sync home"
    >
      <img
        src="/ascent-sync-icon.svg"
        alt=""
        className="h-9 w-9 shrink-0 rounded-[10px] object-contain"
      />
      {!compact && (
        <span className="leading-none">
          <span className="block text-[15px] font-extrabold tracking-[0.08em] text-white">
            ASCENT
          </span>
          <span className="mt-1 block text-[9.5px] font-semibold tracking-[0.42em] text-[#8FA7BB]">
            SYNC
          </span>
        </span>
      )}
    </Link>
  );

  const userCard = (compact) =>
    user ? (
      <div
        className={`flex items-center gap-3 rounded-xl bg-white/[0.05] ${compact ? "justify-center p-2" : "px-3 py-2.5"}`}
        title={compact ? user.name : undefined}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-500 text-[12px] font-bold text-white">
          {initials(user.name)}
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">
              {user.name || "User"}
            </span>
            <span className="block truncate text-[11px] text-[#8FA7BB]">
              {prettyRole(user.role_name || user.role)}
            </span>
          </span>
        )}
      </div>
    ) : null;

  return (
    <>
      {/* Mobile / tablet drawer */}
      <div
        className={`fixed inset-0 z-[55] bg-slate-900/50 backdrop-blur-[1px] transition-opacity lg:hidden ${
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onMobileClose}
      />
      <aside
        className={`fixed left-0 top-0 z-[60] flex h-full w-[280px] flex-col ${SIDEBAR_BG} shadow-2xl transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between pr-3">
          {brand(false)}
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close navigation"
            className="rounded-lg p-2 text-[#8FA7BB] hover:bg-white/10 hover:text-white"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>
        {renderExpandedNav({ onNavigate: onMobileClose })}
        <div className="border-t border-white/[0.06] p-3">{userCard(false)}</div>
      </aside>

      {/* Desktop */}
      <aside
        className={`fixed left-0 top-0 z-40 hidden h-screen flex-col ${SIDEBAR_BG} shadow-[4px_0_24px_rgba(11,34,57,0.18)] transition-[width] duration-300 lg:flex ${
          collapsed ? "w-[72px]" : "w-[240px]"
        }`}
        aria-label="Main navigation"
      >
        {brand(collapsed)}

        {collapsed ? (
          <nav className="no-scrollbar flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden px-3 py-4">
            {items.map((item) => {
              const isActive = activeParent?.label === item.label;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  onMouseEnter={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    openFlyout({ item, top: rect.top });
                  }}
                  onMouseLeave={scheduleFlyoutClose}
                  className={`flex h-11 w-full items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? "bg-orange-500 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]"
                      : "text-[#8FA7BB] hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <i className={`ti ${item.icon} text-[20px]`} />
                </Link>
              );
            })}
          </nav>
        ) : (
          renderExpandedNav()
        )}

        <div className="space-y-2 border-t border-white/[0.06] p-3">
          {userCard(collapsed)}
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium text-[#8FA7BB] transition-colors hover:bg-white/[0.06] hover:text-white ${collapsed ? "justify-center" : ""}`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i
              className={`ti ${collapsed ? "ti-layout-sidebar-left-expand" : "ti-layout-sidebar-left-collapse"} text-[18px]`}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Collapsed-rail flyout: label + children on hover */}
      {collapsed && flyout?.item && (
        <div
          className="fixed left-[72px] z-[70] hidden pl-2 lg:block"
          style={{ top: Math.max(8, flyout.top - 6) }}
          onMouseEnter={() => openFlyout(flyout)}
          onMouseLeave={scheduleFlyoutClose}
        >
          <div
            className={`w-[230px] rounded-2xl border border-white/10 ${SIDEBAR_BG} p-2 shadow-[0_18px_40px_rgba(11,34,57,0.35)]`}
          >
            <Link
              href={flyout.item.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-white hover:bg-white/[0.06]"
            >
              <i className={`ti ${flyout.item.icon} text-[16px] text-orange-400`} />
              {flyout.item.label}
            </Link>
            {childrenOf(flyout.item).length > 0 && (
              <div className="ml-4 mt-1 max-h-[60vh] overflow-y-auto border-l border-white/10 pl-3">
                {renderChildren(flyout.item, {
                  onNavigate: () => setFlyout(null),
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
