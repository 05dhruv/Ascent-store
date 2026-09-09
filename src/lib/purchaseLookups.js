export function normalizeStores(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.stores)) return payload.data.stores;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.stores)) return payload.stores;
  if (Array.isArray(payload?.records)) return payload.records;
  if (payload?.success && Array.isArray(payload.data)) return payload.data;
  return [];
}

export function normalizeVendors(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.data?.vendors)) return payload.data.vendors;
  if (Array.isArray(payload?.vendors)) return payload.vendors;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
}

export function normalizeProducts(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
}

export async function fetchLookup(url) {
  const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.message || payload?.error || `Failed to fetch ${url}`;
    throw new Error(message);
  }
  return payload;
}
