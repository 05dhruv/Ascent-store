'use client';

/**
 * OfflineSyncContext
 *
 * Single source of truth for offline/sync state across the whole app.
 *
 * Responsibilities:
 *   • Track network status (isOnline)
 *   • Keep a live count of pending (un-synced) bills
 *   • Run auto-sync: immediately when network returns, then every 30 s
 *   • Prefetch products/payment-modes when the user is online
 *   • Expose triggerSync() for manual or programmatic sync
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useUser }              from '@/hooks/useUser';
import { useNetworkStatus }     from '@/hooks/useNetworkStatus';
import { localDb, getPendingCount } from '@/lib/localDb';
import { prefetchOfflineData, syncPendingBills } from '@/lib/syncEngine';

const OfflineSyncContext = createContext(null);

// ─── Provider ──────────────────────────────────────────────────────────────

export function OfflineSyncProvider({ children }) {
  const { user }   = useUser();
  const isOnline   = useNetworkStatus();

  const [pendingCount,  setPendingCount]  = useState(0);
  const [isSyncing,     setIsSyncing]     = useState(false);
  const [lastSyncTime,  setLastSyncTime]  = useState(null);
  const [syncError,     setSyncError]     = useState(null);

  // Guard so concurrent triggers don't double-sync
  const syncingRef  = useRef(false);
  const intervalRef = useRef(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB unavailable in SSR / some private-browsing modes — ignore
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
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
  }, [refreshPendingCount]);

  // ── Auto-sync when network restores ──────────────────────────────────────
  useEffect(() => {
    if (isOnline) triggerSync();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling: sync every 30 s while online ─────────────────────────────
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) triggerSync();
    }, 30_000);

    return () => clearInterval(intervalRef.current);
  }, [triggerSync]);

  // ── Prefetch product catalogue when user + store is known and online ──────
  useEffect(() => {
    if (!user || !isOnline) return;
    const storeId = user.assigned_stores?.[0];
    if (!storeId) return;

    prefetchOfflineData(storeId).catch(() => {
      // Non-fatal — the POS falls back to whatever is already cached
    });
  }, [user, isOnline]);

  // ── Initial pending count on mount ───────────────────────────────────────
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        pendingCount,
        isSyncing,
        lastSyncTime,
        syncError,
        triggerSync,
        refreshPendingCount,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

// ─── Consumer hook ──────────────────────────────────────────────────────────

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) throw new Error('useOfflineSync must be used inside <OfflineSyncProvider>');
  return ctx;
}
