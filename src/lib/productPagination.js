const DEFAULT_PRODUCT_PAGE_SIZE = 500;

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

export async function fetchAllProductPages(
  endpoint,
  {
    params = {},
    pageSize = DEFAULT_PRODUCT_PAGE_SIZE,
    fetchOptions = {},
    mapRecord = (record) => record,
  } = {},
) {
  const records = [];
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || String(value) === "") continue;
      query.set(key, String(value));
    }
    query.set("page", String(page));
    query.set("pageSize", String(pageSize));

    const response = await fetch(`${endpoint}?${query.toString()}`, fetchOptions);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || payload?.error || "Failed to fetch products");
    }

    const pageRecords = getRecords(payload);
    records.push(...pageRecords);
    totalPages = getTotalPages(payload, pageSize, pageRecords.length, page);

    if (pageRecords.length < pageSize) break;
    page += 1;
  } while (page <= totalPages);

  return records.map(mapRecord);
}

export function fetchAllCatalogProducts(options = {}) {
  return fetchAllProductPages("/api/catalog/products", options);
}

export function fetchAllInventoryProducts(options = {}) {
  return fetchAllProductPages("/api/inventory/products", options);
}
