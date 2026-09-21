const DEFAULT_PRODUCT_PAGE_SIZE = 50;
const MAX_UI_PAGE_SIZE = 100;
const MAX_EXPORT_PAGE_SIZE = 500;
const MAX_EXPORT_PAGES = 40; // hard ceiling: 20k rows for export dumps

function getRecords(payload) {
  const records = payload?.data?.records ?? payload?.records ?? [];
  return Array.isArray(records) ? records : [];
}

function getTotalPages(payload, pageSize, recordCount, page) {
  const explicitTotalPages = Number(payload?.data?.totalPages ?? payload?.totalPages);
  if (Number.isFinite(explicitTotalPages) && explicitTotalPages > 0) {
    return explicitTotalPages;
  }

  const total = Number(payload?.data?.total ?? payload?.total);
  if (Number.isFinite(total) && total > 0) {
    return Math.ceil(total / pageSize);
  }

  return recordCount < pageSize ? page : page + 1;
}

/**
 * Cap page sizes for list UIs. Export/bulk may use a higher but still bounded size.
 */
export function clampProductPageSize(raw, { exportMode = false } = {}) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  const fallback = exportMode ? MAX_EXPORT_PAGE_SIZE : DEFAULT_PRODUCT_PAGE_SIZE;
  const value = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(value, exportMode ? MAX_EXPORT_PAGE_SIZE : MAX_UI_PAGE_SIZE);
}

/**
 * Fetch a single page of products (preferred for interactive UIs).
 */
export async function fetchProductPage(
  endpoint,
  {
    params = {},
    page = 1,
    pageSize = DEFAULT_PRODUCT_PAGE_SIZE,
    fetchOptions = {},
    mapRecord = (record) => record,
  } = {},
) {
  const safePageSize = clampProductPageSize(pageSize, {
    exportMode: ["true", "1", "yes"].includes(
      String(params.export || params.all || "").toLowerCase(),
    ),
  });
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || String(value) === "") continue;
    query.set(key, String(value));
  }
  query.set("page", String(Math.max(1, Number(page) || 1)));
  query.set("pageSize", String(safePageSize));

  const response = await fetch(`${endpoint}?${query.toString()}`, fetchOptions);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || payload?.error || "Failed to fetch products");
  }

  const records = getRecords(payload).map(mapRecord);
  return {
    records,
    total: Number(payload?.data?.total ?? payload?.total ?? records.length) || 0,
    page: Number(payload?.data?.page ?? payload?.page ?? page) || page,
    pageSize: Number(payload?.data?.pageSize ?? payload?.pageSize ?? safePageSize) || safePageSize,
    totalPages:
      Number(payload?.data?.totalPages ?? payload?.totalPages) ||
      Math.max(1, Math.ceil((Number(payload?.data?.total ?? records.length) || 0) / safePageSize)),
  };
}

/**
 * Full dump — only for explicit export/bulk. Capped to avoid unbounded browser memory.
 */
export async function fetchAllProductPages(
  endpoint,
  {
    params = {},
    pageSize = MAX_EXPORT_PAGE_SIZE,
    fetchOptions = {},
    mapRecord = (record) => record,
    maxPages = MAX_EXPORT_PAGES,
  } = {},
) {
  const records = [];
  let page = 1;
  let totalPages = 1;
  const safePageSize = clampProductPageSize(pageSize, { exportMode: true });
  const exportParams = { ...params, export: "true" };

  do {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(exportParams)) {
      if (value === undefined || value === null || String(value) === "") continue;
      query.set(key, String(value));
    }
    query.set("page", String(page));
    query.set("pageSize", String(safePageSize));

    const response = await fetch(`${endpoint}?${query.toString()}`, fetchOptions);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || payload?.error || "Failed to fetch products");
    }

    const pageRecords = getRecords(payload);
    records.push(...pageRecords);
    totalPages = Math.min(
      getTotalPages(payload, safePageSize, pageRecords.length, page),
      maxPages,
    );

    if (pageRecords.length < safePageSize) break;
    page += 1;
  } while (page <= totalPages && page <= maxPages);

  return records.map(mapRecord);
}

export function fetchAllCatalogProducts(options = {}) {
  return fetchAllProductPages("/api/catalog/products", options);
}

export function fetchAllInventoryProducts(options = {}) {
  return fetchAllProductPages("/api/inventory/products", options);
}

export function fetchCatalogProductPage(options = {}) {
  return fetchProductPage("/api/catalog/products", options);
}

export function fetchInventoryProductPage(options = {}) {
  return fetchProductPage("/api/inventory/products", options);
}

export { DEFAULT_PRODUCT_PAGE_SIZE, MAX_UI_PAGE_SIZE, MAX_EXPORT_PAGE_SIZE };
