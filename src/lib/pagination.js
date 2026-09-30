// Lookup tables (brands, categories, taxes…) feed full dropdown lists.
export const LOOKUP_MAX_PAGE_SIZE = 5000;
// Transactional lists (returns, credit, ledgers…) must paginate.
export const LIST_MAX_PAGE_SIZE = 500;

export function clampPageSize(raw, { fallback = 10, max = LIST_MAX_PAGE_SIZE } = {}) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return Math.min(fallback, max);
  return Math.min(n, max);
}

export function clampPage(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
