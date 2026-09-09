import Dexie from 'dexie';

// ─── IndexedDB Schema ──────────────────────────────────────────────────────
// Version history: bump DB_VERSION + add .stores() when schema changes
export const localDb = new Dexie('BuyzaarSyncOffline');

localDb.version(1).stores({
  // ── Cached server data (refreshed when online) ──────────────────────────
  // Products available at a store (with store-specific pricing)
  products: 'id, name, barcode, sku, is_active',

  // Payment modes for the selected store
  payment_modes: 'id, store_id',

  // ── Offline operation queue ──────────────────────────────────────────────
  // Bills created while offline (or online, waiting for immediate sync)
  // status: 'pending' | 'synced' | 'failed'
  pending_bills: '++localId, syncId, status, storeId, createdAt',

  // ── App metadata ─────────────────────────────────────────────────────────
  settings: 'key',
});

// ─── Settings helpers ──────────────────────────────────────────────────────

export async function getSetting(key) {
  const row = await localDb.settings.get(key);
  return row?.value ?? null;
}

export async function setSetting(key, value) {
  await localDb.settings.put({ key, value });
}

// ─── Device identity (stable UUID, generated once per browser) ────────────

export async function getDeviceId() {
  let id = await getSetting('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    await setSetting('deviceId', id);
  }
  return id;
}

// ─── Pending bill count helper ─────────────────────────────────────────────

export async function getPendingCount() {
  return localDb.pending_bills.where('status').equals('pending').count();
}
