'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import SubSidebar from './SubSidebar';
import { menuItems } from './sidebarConfig';
import { useUser } from '@/hooks/useUser';
import { canAccessPath, filterMenuItemsForUser, getFirstAccessibleHref } from '@/lib/accessControl';

export default function MainLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const [activeMenu, setActiveMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('main');
  const [pinnedSidebarOpen, setPinnedSidebarOpen] = useState(false);
  const sidebarShellRef = useRef(null);
  const accessibleMenuItems = useMemo(() => filterMenuItemsForUser(menuItems, user), [user]);
  const accessAllowed = !loading && user && canAccessPath(user, pathname);
  const hasAccessibleMenu = accessibleMenuItems.length > 0;
  const isHomeRoute = pathname === '/home' || pathname === '/' || pathname.startsWith('/home/');
  const homeSidebarExpanded = pinnedSidebarOpen || isHomeRoute;

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

  // Auto-open subSidebar when on a matching route
  useEffect(() => {
    // Extract base path from current pathname (e.g., 'purchase' from '/purchase/purchase-orders')
    const pathBase = pathname.split('/')[1];
    
    // Find matching menu item by comparing base paths
    const matched = accessibleMenuItems.find(
      (item) =>
        item.subSidebar &&
        item.href.split('/')[1] === pathBase // Compare base paths
    );
    
    if (matched) {
      setActiveMenu(matched);
    } else {
      setActiveMenu(null);
    }
  }, [pathname, accessibleMenuItems]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setMobilePanel('main');
  }, [pathname]);

  useEffect(() => {
    if (!pinnedSidebarOpen) return;

    const handlePointerDown = (event) => {
      if (sidebarShellRef.current?.contains(event.target)) return;
      setPinnedSidebarOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [pinnedSidebarOpen]);

  const subOpen = activeMenu?.subSidebar != null;
  const content = accessAllowed ? children : !loading && user && !hasAccessibleMenu ? (
    <div className="flex min-h-[50vh] items-center justify-center text-sm font-medium text-gray-500">
      You do not have access to any sections.
    </div>
  ) : (
    <div className="flex min-h-[50vh] items-center justify-center text-sm font-medium text-gray-500">
      Loading your workspace...
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <Topbar
        sidebarExpanded={homeSidebarExpanded && hasAccessibleMenu && !subOpen}
        onMenuOpen={() => {
          setMobilePanel('main');
          setMobileOpen(true);
        }}
      />

      {hasAccessibleMenu && (
        <div ref={sidebarShellRef}>
          <Sidebar
            items={accessibleMenuItems}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
            expanded={homeSidebarExpanded && !subOpen}
            mobileOpen={mobileOpen}
            onRequestOpen={() => setPinnedSidebarOpen(true)}
            onMobileSubOpen={(item) => {
              setActiveMenu(item);
              setMobilePanel('sub');
              setMobileOpen(true);
            }}
            onMobileClose={() => {
              setMobileOpen(false);
              setMobilePanel('main');
            }}
          />
        </div>
      )}

      {/* Desktop SubSidebar panel */}
      {hasAccessibleMenu && subOpen && (
        <div className="hidden md:block fixed left-[64px] top-[56px] h-[calc(100vh-56px)] z-30 w-[256px] border-r border-slate-200/80 bg-[#fff1f1] shadow-[6px_0_22px_rgba(15,23,42,0.06)] animate-shell-slide-in">
          <SubSidebar
            subSidebar={activeMenu.subSidebar}
            onClose={null}
          />
        </div>
      )}

      {/* Mobile SubSidebar — full-screen overlay drawer */}
      {hasAccessibleMenu && subOpen && mobileOpen && mobilePanel === 'sub' && (
        <div className="md:hidden fixed inset-0 z-[60] bg-white flex flex-col">
          <SubSidebar
            subSidebar={activeMenu.subSidebar}
            sectionHref={activeMenu.href}
            onBackToMain={() => setMobilePanel('main')}
            onClose={() => {
              setMobileOpen(false);
              setMobilePanel('main');
            }}
          />
        </div>
      )}

      {/* Main content — margins shift based on screen + sidebar state */}
      <main
        className={`
          transition-all duration-300
          mt-[56px]
          ${
            !hasAccessibleMenu
              ? 'md:ml-0'
              : subOpen
                ? 'md:ml-[320px]'
                : homeSidebarExpanded
                  ? 'md:ml-[240px]'
                  : 'md:ml-[64px]'
          }
          min-h-[calc(100vh-56px)]
          p-2.5 sm:p-5 md:p-6 lg:p-7
          w-full max-w-full overflow-x-hidden pb-safe
        `}
      >
        <div key={pathname} className="page-route-transition">
          {content}
        </div>
      </main>
    </div>
  );
}
