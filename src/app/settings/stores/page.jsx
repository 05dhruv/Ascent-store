"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import CatalogListPage from '@/components/CatalogListPage';
import { getStoreCode } from '@/lib/storeMeta';
import { formatIndianDate } from '@/lib/dateUtils';

export default function Page() {
  const router = useRouter();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStores = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/stores?${params.toString()}`);
      const json = await res.json();

      if (res.ok && json.success) {
        const rows = (json.data.stores || []).map((store, index) => ({
          id: store.id,
          rawName: store.name,
          sno: (page - 1) * pageSize + index + 1,
          name: (
            <div>
              <button
                type="button"
                onClick={() => router.push(`/settings/stores/${store.id}`)}
                className="text-blue-600 hover:underline text-left font-semibold"
              >
                {store.name}
              </button>
              {store.meta?.franchiseType && (
                <span className="block text-[11px] text-gray-500">
                  {store.meta.franchiseType.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          ),
          store_code: getStoreCode(store.meta) || '—',
          project_name: store.meta?.projectName || '—',
          incharge_info: store.manager_name ? (
            <div>
              <div className="font-medium text-gray-900">{store.manager_name}</div>
              {store.manager_mobile && (
                <div className="text-xs text-gray-500">{store.manager_mobile}</div>
              )}
            </div>
          ) : '—',
          live_since: formatIndianDate(store.created_at, '—'),
          address_text: [store.city, store.state].filter(Boolean).join(', ') || '—',
        }));

        setStores(rows);
        setTotal(json.data.total ?? rows.length);
        setTotalPages(json.data.totalPages ?? 1);
      } else {
        showToast(json.message || 'Failed to load site stores', 'error');
      }
    } catch {
      showToast('Network error while loading site stores', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, router]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const res = await fetch(`/api/stores/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || 'Delete failed', 'error');
        return;
      }

      showToast('Site store deleted');
      setDeleteId(null);
      fetchStores();
    } catch {
      showToast('Delete failed', 'error');
    }
  };

  const columns = useMemo(() => ([
    { key: 'sno', label: 'S. No.', sortable: true },
    { key: 'name', label: 'Site Store Name', sortable: true },
    { key: 'store_code', label: 'Site Code', sortable: true },
    { key: 'project_name', label: 'Associated Project', sortable: true },
    { key: 'incharge_info', label: 'Site In-Charge', sortable: true },
    { key: 'address_text', label: 'City / State', sortable: true },
    { key: 'live_since', label: 'Created On', sortable: true },
  ]), []);

  return (
    <MainLayout>
      {toast && (
        <div className={`fixed top-4 right-4 z-[999] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80 relative z-[1000]">
            <h3 className="text-base font-bold text-gray-800 mb-2">Delete Site Store?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <CatalogListPage
        breadcrumbs={[
          { label: 'Home', href: '/home' },
          { label: 'Construction Settings', href: '/settings' },
          { label: 'Site Stores' },
        ]}
        title="Site Stores"
        description="Create and manage site stores for material receipt, issue and site inventory."
        createLabel="Create Site Store"
        onCreateClick={() => router.push('/settings/stores/create')}
        bulkOperations={false}
        columns={columns}
        rows={stores}
        loading={loading}
        totalLabel="Site Store(s)"
        emptyMessage="No site stores found"
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        search={search}
        onSearchChange={setSearch}
        showRowActions={true}
        onEdit={(row) => router.push(`/settings/stores/${row.id}/edit`)}
        onDelete={(row) => setDeleteId(row.id)}
      />
    </MainLayout>
  );
}
