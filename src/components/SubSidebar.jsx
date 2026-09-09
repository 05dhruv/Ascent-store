'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SubSidebar({ subSidebar, sectionHref, onBackToMain, onClose }) {
  const pathname = usePathname();
  const currentSectionHref = subSidebar.sectionHref || sectionHref;
  const groups = subSidebar.groups || [];
  const [openGroups, setOpenGroups] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineOrderCount, setOnlineOrderCount] = useState(0);
  const scrollRef = useRef(null);
  const activeLinkRef = useRef(null);
  const hasOnlineOrdersLink = useMemo(
    () =>
      groups.some((group) =>
        group.items?.some((item) => item.href === '/sales/online-orders')
      ),
    [groups]
  );
  const storageKey = useMemo(
    () => `sub-sidebar-scroll:${subSidebar.title || currentSectionHref || 'default'}`,
    [currentSectionHref, subSidebar.title]
  );

  const isItemActive = (href) => {
    if (!href) return false;
    const cleanPath = pathname.replace(/\/+$/, '') || '/';
    const cleanHref = href.replace(/\/+$/, '') || '/';
    if (cleanPath === cleanHref) return true;
    const hrefDepth = cleanHref.split('/').filter(Boolean).length;
    if (hrefDepth <= 1) return false;
    return cleanPath.startsWith(`${cleanHref}/`);
  };

  useEffect(() => {
    setOpenGroups(Object.fromEntries(groups.map((g) => [g.label, true])));
    setSearchQuery('');
  }, [subSidebar]);

  useEffect(() => {
    if (!hasOnlineOrdersLink) {
      setOnlineOrderCount(0);
      return undefined;
    }

    let cancelled = false;
    const loadOnlineOrderCount = async () => {
      try {
        const params = new URLSearchParams({
          status: 'pending_store_acceptance',
        });
        const response = await fetch(`/api/ecommerce-orders?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) return;
        if (!cancelled) {
          setOnlineOrderCount((payload.data?.orders || []).length);
        }
      } catch {
        if (!cancelled) setOnlineOrderCount(0);
      }
    };

    loadOnlineOrderCount();
    const interval = setInterval(loadOnlineOrderCount, 30000);
    const refreshOnFocus = () => loadOnlineOrderCount();
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [hasOnlineOrdersLink]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${group.label} ${item.label}`.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, searchQuery]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;

    const saved = Number(sessionStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved > 0) {
      requestAnimationFrame(() => {
        node.scrollTop = saved;
      });
    } else if (activeLinkRef.current) {
      requestAnimationFrame(() => {
        activeLinkRef.current?.scrollIntoView({ block: 'nearest' });
      });
    }

    const saveScroll = () => {
      sessionStorage.setItem(storageKey, String(node.scrollTop));
    };
    node.addEventListener('scroll', saveScroll, { passive: true });
    return () => {
      saveScroll();
      node.removeEventListener('scroll', saveScroll);
    };
  }, [pathname, storageKey, openGroups]);

  /* ── Employee-style flat list ── */
  if (subSidebar.flatItems?.length) {
    const sectionActive =
      currentSectionHref &&
      isItemActive(currentSectionHref);

    return (
      <div ref={scrollRef} className="no-scrollbar flex flex-col h-full overflow-y-auto overflow-x-hidden bg-slate-50 border-r border-slate-200">
        {(onBackToMain || onClose) && (
          <div className="md:hidden flex items-center justify-between px-3 py-2.5 border-b border-slate-200 bg-white shrink-0">
            {onBackToMain ? (
              <button
                type="button"
                onClick={onBackToMain}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                <i className="ti ti-arrow-left text-[16px]" />
                Sections
              </button>
            ) : (
              <span />
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-100"
                aria-label="Close menu"
              >
                <i className="ti ti-x text-slate-500 text-[16px]" />
              </button>
            )}
          </div>
        )}

        {subSidebar.sectionTitle && (
          <div className="px-4 pt-5 pb-2">
            {currentSectionHref ? (
              <Link
                href={currentSectionHref}
                onClick={() => onClose?.()}
                className={`block text-[13px] font-semibold tracking-tight transition-colors ${
                  sectionActive
                    ? 'text-indigo-600'
                      : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {subSidebar.sectionTitle}
              </Link>
            ) : (
              <p className="text-[13px] font-semibold text-slate-500 tracking-tight">
                {subSidebar.sectionTitle}
              </p>
            )}
          </div>
        )}

        <nav className="px-3 pb-6 pt-2 flex flex-col gap-0.5">
          {subSidebar.flatItems.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                ref={active ? activeLinkRef : null}
                onClick={() => onClose?.()}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-[13px] font-medium transition-colors ${
                  active
                    ? 'text-indigo-700 bg-indigo-50 font-semibold'
                    : 'text-slate-700 hover:text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                {item.icon ? (
                  <i
                    className={`ti ${item.icon} text-[18px] w-[22px] text-center flex-shrink-0 ${
                      active ? 'text-indigo-600' : 'text-slate-500'
                    }`}
                  />
                ) : (
                  <span className="w-[22px] flex-shrink-0" aria-hidden />
                )}
                <span className="leading-snug">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  /* ── Grouped sidebar (Catalog, Sales Order, …) ── */
  const toggle = (label) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <div ref={scrollRef} className="no-scrollbar flex flex-col h-full overflow-y-auto overflow-x-hidden bg-slate-50 border-r border-slate-200">
      <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 px-3 py-3 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBackToMain && (
            <button
              type="button"
              onClick={onBackToMain}
              className="md:hidden -ml-2 rounded-lg p-1.5 text-indigo-700 hover:bg-indigo-50"
              aria-label="Back to sections"
            >
              <i className="ti ti-arrow-left text-[17px]" />
            </button>
          )}
          <i className={`ti ${subSidebar.titleIcon} text-indigo-700 text-[16px]`} />
          <span className="text-[13px] font-black text-slate-900">{subSidebar.title}</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <i className="ti ti-x text-slate-400 text-[14px]" />
          </button>
        )}
        </div>
        <div className="relative">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400" />
          <input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-9 text-[12px] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Ctrl K</span>
        </div>
      </div>

      {currentSectionHref && (
        <div className="md:hidden border-b border-gray-200 bg-white px-3 py-2">
          <Link
            href={currentSectionHref}
            onClick={() => onClose?.()}
            className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
              isItemActive(currentSectionHref)
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-indigo-700 hover:bg-indigo-50'
            }`}
          >
            <i className="ti ti-layout-dashboard text-[16px]" />
            {subSidebar.title} home
          </Link>
        </div>
      )}

      <div className="py-3 px-2 space-y-2">
        {filteredGroups.map((group) => {
          const isOpen = openGroups[group.label];
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggle(group.label)}
                className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/80"
              >
                <i className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'} text-amber-500 text-[11px]`} />
                <i className={`ti ${group.icon} text-indigo-700 text-[16px]`} />
                <span className="text-[12.5px] font-black text-slate-900 text-left">{group.label}</span>
              </button>
              {isOpen && (
                <div className="ml-5 border-l border-slate-300 pl-3 mt-0.5 mb-2 space-y-0.5">
                  {group.items.map((item) => {
                    const active = isItemActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        ref={active ? activeLinkRef : null}
                        onClick={() => onClose?.()}
                        className={`relative block rounded-xl px-3 py-2 text-[12.5px] transition-all duration-200
                          ${active
                            ? 'text-indigo-700 font-bold bg-white shadow-sm'
                            : 'text-slate-600 hover:text-indigo-900 hover:bg-white/70'
                          }`}
                      >
                        {active && <span className="absolute -left-[13px] top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-indigo-600" />}
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.href === '/sales/online-orders' && onlineOrderCount > 0 && (
                            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-red-700 px-1.5 text-[10px] font-black leading-none text-white shadow-sm">
                              {onlineOrderCount > 99 ? '99+' : onlineOrderCount}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filteredGroups.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-[12px] font-medium text-slate-400">
            No menu items found
          </div>
        )}
      </div>
    </div>
  );
}
