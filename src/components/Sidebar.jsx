"use client";
import Icon from "@/components/Icon";

import { useEffect, useMemo, useState } from "react";
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
  mobileOpen = false,
  onMobileClose,
}) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [openLabel, setOpenLabel] = useState(null);
  useEffect(() => {
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
            <Icon name={`ti ${item.icon} text-[19px] ${isActive ? "text-white" : "text-[#8FA7BB] group-hover:text-white"}`} />
            <span className="flex-1 truncate text-left">{item.label}</span>
            {hasChildren && (
              <Icon name={`ti ti-chevron-down text-[13px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${isActive ? "text-white" : "text-[#6F8BA3]"}`} />
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
            <Icon name="ti ti-x text-[18px]" />
          </button>
        </div>
        {renderExpandedNav({ onNavigate: onMobileClose })}
      </aside>

      {/* Desktop */}
      <aside
        className={`fixed left-0 top-0 z-40 hidden h-screen w-[240px] flex-col ${SIDEBAR_BG} shadow-[4px_0_24px_rgba(11,34,57,0.18)] lg:flex`}
        aria-label="Main navigation"
      >
        {brand(false)}
        {renderExpandedNav()}
      </aside>
    </>
  );
}
