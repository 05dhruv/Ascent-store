export function extractStores(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.stores)) return payload.data.stores;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.stores)) return payload.stores;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
}

export function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
}
