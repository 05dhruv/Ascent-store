/**
 * syncEngine.js
 *
 * Pure async functions — no React, no hooks.
 * Called by OfflineSyncContext (the React layer).
 *
 * Two responsibilities:
 *   1. prefetchOfflineData  → pulls products + payment_modes from server → IndexedDB
 *   2. syncPendingBills     → pushes pending_bills → /api/sync/bills → marks as synced
 */

import { localDb, setSetting } from './localDb';

// ─── Prefetch ──────────────────────────────────────────────────────────────
// Downloads the full product catalogue and payment modes for a store so the
// POS can work without a network connection.

export async function prefetchOfflineData(storeId) {
  const res = await fetch(`/api/sync/prefetch?storeId=${encodeURIComponent(storeId)}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Prefetch failed with HTTP ${res.status}`);
  }

  const data = await res.json();

  // Write atomically so the local cache is never half-updated
  await localDb.transaction('rw', [localDb.products, localDb.payment_modes], async () => {
    if (Array.isArray(data.products) && data.products.length > 0) {
      await localDb.products.clear();
      await localDb.products.bulkPut(data.products);
    }
    if (Array.isArray(data.paymentModes) && data.paymentModes.length > 0) {
      await localDb.payment_modes.clear();
      await localDb.payment_modes.bulkPut(data.paymentModes);
    }
  });

  await setSetting('lastPrefetchTime', new Date().toISOString());
  await setSetting('prefetchStoreId', String(storeId));

  return { productCount: data.products?.length ?? 0 };
}

// ─── Sync ──────────────────────────────────────────────────────────────────
// Reads all pending_bills from IndexedDB, batches them to the server, and
// marks each one synced / failed based on the server's response.

export async function syncPendingBills() {
  const pending = await localDb.pending_bills
    .where('status')
    .equals('pending')
    .toArray();

  if (pending.length === 0) return { synced: 0, duplicates: 0, failed: 0 };

  const res = await fetch('/api/sync/bills', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bills: pending }),
  });

  if (!res.ok) {
    throw new Error(`Sync request failed with HTTP ${res.status}`);
  }

  const result = await res.json();

  const syncedIds  = new Set([...(result.synced || []), ...(result.duplicates || [])]);
  const failedMap  = new Map((result.failed || []).map((f) => [f.syncId, f.error]));
  const now        = new Date().toISOString();

  await localDb.transaction('rw', localDb.pending_bills, async () => {
    for (const syncId of syncedIds) {
      await localDb.pending_bills
        .where('syncId').equals(syncId)
        .modify({ status: 'synced', syncedAt: now });
    }
    for (const [syncId, error] of failedMap) {
      await localDb.pending_bills
        .where('syncId').equals(syncId)
        .modify({ status: 'failed', errorMessage: error });
    }
  });

  await setSetting('lastSyncTime', now);

  return {
    synced:     (result.synced || []).length,
    duplicates: (result.duplicates || []).length,
    failed:     (result.failed || []).length,
  };
}
