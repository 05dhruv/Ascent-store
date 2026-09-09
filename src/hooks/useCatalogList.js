'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Generic hook for catalog list pages
 * @param {string} endpoint  - e.g. '/api/catalog/categories'
 * @param {object} options   - { pageSize, filters }
 */
export function useCatalogList(endpoint, options = {}) {
  const [records, setRecords]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(options.pageSize || 10);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page,
        pageSize,
        ...(search && { search }),
        ...(options.filters || {}),
      });

      const res = await fetch(`${endpoint}?${params}`);
      const json = await res.json();

      if (!json.success) throw new Error(json.message);

      setRecords(json.data.records);
      setTotal(json.data.total);
      setTotalPages(json.data.totalPages);
    } catch (err) {
      setError(err.message);
      console.error('[useCatalogList]', err);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, pageSize, search, JSON.stringify(options.filters)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const deleteRecord = async (id) => {
    try {
      const res = await fetch(`${endpoint}/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      fetchData(); // refresh
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const createRecord = async (data) => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      fetchData(); // refresh
      return { success: true, data: json.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const updateRecord = async (id, data) => {
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      fetchData(); // refresh
      return { success: true, data: json.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return {
    records,
    total,
    totalPages,
    page,
    pageSize,
    search,
    loading,
    error,
    setPage,
    setPageSize,
    setSearch,
    refresh: fetchData,
    deleteRecord,
    createRecord,
    updateRecord,
  };
}