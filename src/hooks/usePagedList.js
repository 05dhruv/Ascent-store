"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function buildQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    qs.set(key, String(value));
  });
  return qs;
}

/**
 * Server-paginated list. The endpoint must accept `page` / `pageSize` and
 * return `{ records, total, totalPages }` (see src/lib/pagination.js).
 * Changing `params` resets to page 1.
 */
export function usePagedList(endpoint, { params = {}, pageSize: initialPageSize = 25, enabled = true } = {}) {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [extra, setExtra] = useState({});
  const paramsKey = JSON.stringify(params || {});
  const requestId = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [paramsKey, pageSize]);

  const fetchPage = useCallback(async () => {
    if (!enabled || !endpoint) return;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const qs = buildQuery({ ...JSON.parse(paramsKey), page, pageSize });
      const separator = endpoint.includes("?") ? "&" : "?";
      const res = await fetch(`${endpoint}${separator}${qs}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.error || "Could not load records");
      }
      if (id !== requestId.current) return;
      const { records: rows = [], total: count, totalPages: pages, ...rest } = json.data || {};
      setRecords(rows);
      setTotal(Number(count) || rows.length);
      setTotalPages(Math.max(1, Number(pages) || 1));
      setExtra(rest);
    } catch (err) {
      if (id === requestId.current) setError(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [endpoint, paramsKey, page, pageSize, enabled]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const exportUrl = useCallback(
    (format = "xlsx") => {
      const qs = buildQuery({ ...JSON.parse(paramsKey), format });
      return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}`;
    },
    [endpoint, paramsKey],
  );

  const pagination = useMemo(
    () => ({ page, pageSize, total, totalPages, onPageChange: setPage, onPageSizeChange: setPageSize, loading }),
    [page, pageSize, total, totalPages, loading],
  );

  return {
    records,
    total,
    totalPages,
    page,
    pageSize,
    loading,
    error,
    extra,
    setPage,
    setPageSize,
    refresh: fetchPage,
    exportUrl,
    pagination,
  };
}

/** Starts a server-side download without loading the data into the page. */
export function downloadFromUrl(url) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
