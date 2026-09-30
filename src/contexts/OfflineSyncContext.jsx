'use client';

/**
 * OfflineSyncContext
 *
 * POS offline sync is gated to sales/POS routes (or OFFLINE_POS=true).
 * Construction workspace does not prefetch catalogues or poll sync.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { useUser }              from '@/hooks/useUser';
import { useNetworkStatus }     from '@/hooks/useNetworkStatus';

const OfflineSyncContext = createContext(null);
const loadLocalDb = () => import('@/lib/localDb');
const loadSyncEngine = () => import('@/lib/syncEngine');

function isOfflinePosEnabled() {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_OFFLINE_POS === 'true') {
    return true;
  }
  return false;
}

const POS_ROUTES = ['/sales/pos', '/sales-order/pos'];

function isPosRoute(pathname) {
  if (!pathname) return false;
  return POS_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function OfflineSyncProvider({ children }) {
  const { user }   = useUser();
  const isOnline   = useNetworkStatus();
  const pathname   = usePathname();

  const offlineActive = useMemo(
    () => isOfflinePosEnabled() || isPosRoute(pathname),
    [pathname],
  );

  const [pendingCount,  setPendingCount]  = useState(0);
  const [isSyncing,     setIsSyncing]     = useState(false);
  const [lastSyncTime,  setLastSyncTime]  = useState(null);
  const [syncError,     setSyncError]     = useState(null);

  const syncingRef  = useRef(false);
  const intervalRef = useRef(null);

  const refreshPendingCount = useCallback(async () => {
    if (!offlineActive) {
      setPendingCount(0);
      return;
    }
    try {
      const { getPendingCount } = await loadLocalDb();
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB unavailable — ignore
    }
  }, [offlineActive]);

  const triggerSync = useCallback(async () => {
    if (!offlineActive) return;
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const { syncPendingBills } = await loadSyncEngine();
      const result = await syncPendingBills();
      setLastSyncTime(new Date().toISOString());
      await refreshPendingCount();
      return result;
    } catch (err) {
      setSyncError(err.message);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [offlineActive, refreshPendingCount]);

  useEffect(() => {
    if (!offlineActive) return;
    if (isOnline) triggerSync();
  }, [isOnline, offlineActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!offlineActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return undefined;
    }
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) triggerSync();
    }, 30_000);

    return () => clearInterval(intervalRef.current);
  }, [triggerSync, offlineActive]);

  useEffect(() => {
    if (!offlineActive || !user || !isOnline) return;
    const storeId = user.assigned_stores?.[0];
    if (!storeId) return;

    loadSyncEngine()
      .then(({ prefetchOfflineData }) => prefetchOfflineData(storeId))
      .catch(() => {});
  }, [user, isOnline, offlineActive]);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        pendingCount: offlineActive ? pendingCount : 0,
        isSyncing: offlineActive ? isSyncing : false,
        lastSyncTime,
        syncError: offlineActive ? syncError : null,
        triggerSync,
        refreshPendingCount,
        offlineActive,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) throw new Error('useOfflineSync must be used inside <OfflineSyncProvider>');
  return ctx;
}
