"use client";

import { useMemo, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import { menuItems } from "./sidebarConfig";
import { useUser } from "@/hooks/useUser";
import {
  canAccessPath,
  filterMenuItemsForUser,
  getFirstAccessibleHref,
} from "@/lib/accessControl";

const COLLAPSE_STORAGE_KEY = "ascent-sidebar-collapsed";

export default function MainLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const accessibleMenuItems = useMemo(
    () => filterMenuItemsForUser(menuItems, user),
    [user],
  );
  const accessAllowed = !loading && user && canAccessPath(user, pathname);
  const hasAccessibleMenu = accessibleMenuItems.length > 0;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (!canAccessPath(user, pathname)) {
      const fallbackRoute = getFirstAccessibleHref(menuItems, user);
      if (fallbackRoute && fallbackRoute !== pathname) {
        router.replace(fallbackRoute);
      }
    }
  }, [loading, pathname, router, user]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const content = accessAllowed ? (
    children
  ) : !loading && user && !hasAccessibleMenu ? (
    <div className="flex min-h-[50vh] items-center justify-center text-sm font-medium text-gray-500">
      You do not have access to any sections.
    </div>
  ) : (
    <div className="flex min-h-[50vh] items-center justify-center text-sm font-medium text-gray-500">
      Loading your workspace...
    </div>
  );

  return (
    <div className="workspace-shell min-h-screen text-slate-900">
      <Topbar
        hasSidebar={hasAccessibleMenu}
        sidebarCollapsed={collapsed}
        onMenuOpen={() => setMobileOpen(true)}
      />

      {hasAccessibleMenu && (
        <Sidebar
          items={accessibleMenuItems}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      )}

      <main
        className={`
          transition-[margin] duration-300
          mt-[56px]
          ${
            !hasAccessibleMenu
              ? "lg:ml-0"
              : collapsed
                ? "lg:ml-[72px]"
                : "lg:ml-[240px]"
          }
          min-h-[calc(100vh-56px)]
          p-3 sm:p-5 md:p-6 lg:p-7
          max-w-full overflow-x-clip pb-safe
        `}
      >
        <div key={pathname} className="workspace-content page-route-transition">
          {content}
        </div>
      </main>
    </div>
  );
}
