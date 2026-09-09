'use client';

/**
 * useOfflineBilling
 *
 * Drop-in billing hook for the POS.  The caller never needs to know whether
 * the device is online or offline — the hook handles both transparently.
 *
 * Online path:
 *   1. Calls the existing /api/sales-order/pos route (unchanged behaviour).
 *   2. On success, returns the server's response.
 *   3. On any network error it falls back to the offline path automatically.
 *
 * Offline path:
 *   1. Generates a client-side sync_id (UUID) and a temporary bill number.
 *   2. Saves the full bill to IndexedDB (pending_bills).
 *   3. Queues it for sync — the OfflineSyncContext will push it to the server
 *      the next time the device comes online.
 *   4. Returns immediately with { success: true, offline: true }.
 *
 * Usage:
 *   const { createBill, isOnline, pendingCount } = useOfflineBilling();
 *
 *   const result = await createBill({
 *     storeId, sessionId, counterId,
 *     customerName, customerMobile,
 *     items, payments, paymentMode,
 *     subtotal, discountTotal, taxTotal, roundOff, grandTotal,
 *     paidAmount, balanceAmount,
 *   });
 *   // result → { success, billNumber, syncId, offline, data? }
 */

import { useCallback } from 'react';
import { localDb, getDeviceId } from '@/lib/localDb';
import { useOfflineSync }       from '@/contexts/OfflineSyncContext';

// Generates a human-readable temp bill number for offline receipts.
// Format: OFL-DDMMYY-HHMMSS  →  e.g. OFL-150126-143022
function makeTempBillNumber() {
  const n = new Date();
  const p = (v, w = 2) => String(v).padStart(w, '0');
  const date = `${p(n.getDate())}${p(n.getMonth() + 1)}${String(n.getFullYear()).slice(2)}`;
  const time = `${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
  return `OFL-${date}-${time}`;
}

export function useOfflineBilling() {
  const { isOnline, triggerSync, refreshPendingCount } = useOfflineSync();

  const createBill = useCallback(
    async (billData) => {
      // ── Online path ────────────────────────────────────────────────────
      if (isOnline) {
        try {
          const res = await fetch('/api/sales-order/pos', {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify(billData),
            signal:      AbortSignal.timeout(10_000), // 10 s timeout
          });

          if (res.ok) {
            const data = await res.json();
            return { success: true, offline: false, ...data };
          }
          // HTTP error (e.g. 5xx) — fall through to offline path
        } catch {
          // Network error or timeout — fall through to offline path
        }
      }

      // ── Offline path ───────────────────────────────────────────────────
      const syncId     = crypto.randomUUID();
      const deviceId   = await getDeviceId();
      const billNumber = billData.billNumber || makeTempBillNumber();

      const pendingBill = {
        ...billData,
        syncId,
        deviceId,
        billNumber,
        status:         'pending',
        createdOffline: true,
        createdAt:      new Date().toISOString(),
      };

      await localDb.pending_bills.add(pendingBill);
      await refreshPendingCount();

      // Trigger a sync attempt (non-blocking) — will be a no-op if still offline
      triggerSync().catch(() => {});

      return { success: true, offline: true, syncId, billNumber };
    },
    [isOnline, triggerSync, refreshPendingCount]
  );

  // ── Offline product lookup ────────────────────────────────────────────────
  // Returns the locally-cached product list so the POS can render items
  // without a network request.
  const getLocalProducts = useCallback(async () => {
    return localDb.products.where('is_active').equals(1).toArray();
  }, []);

  const getLocalPaymentModes = useCallback(async () => {
    return localDb.payment_modes.toArray();
  }, []);

  return { createBill, isOnline, getLocalProducts, getLocalPaymentModes };
}
