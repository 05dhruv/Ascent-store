'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAllCatalogProducts } from '@/lib/productPagination';

function SectionCard({ title, description, children, action }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
        <div>
          <h2 className="text-[15px] font-semibold text-blue-600">{title}</h2>
          {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export default function ProductSaleabilityPage() {
  const router = useRouter();
  const [customerGroups, setCustomerGroups] = useState([]);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [counters, setCounters] = useState([]);

  const [filters, setFilters] = useState({
    customer_group_id: '', channel: '', store_id: '', counter_id: '', transaction_type: '', pos_date: '', product_id: '', batch_variant: ''
  });

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [cgRes, storesRes, products, countersRes] = await Promise.all([
          fetch('/api/customer-groups'),
          fetch('/api/stores'),
          fetchAllCatalogProducts({ pageSize: 500 }),
          fetch('/api/employee/user-counter-session'),
        ]);
        const cgJson = await cgRes.json();
        const storesJson = await storesRes.json();
        const countersJson = await countersRes.json();
        setCustomerGroups(cgJson.data?.records || []);
        setStores(Array.isArray(storesJson) ? storesJson : (storesJson.data?.records || []));
        setProducts(products);
        setCounters(Array.isArray(countersJson) ? countersJson : (countersJson?.data?.records || countersJson?.records || []));
      } catch (err) {
        // ignore
      }
    })();
  }, []);

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.product_id) params.set('product_id', filters.product_id);
      if (filters.store_id) params.set('store_id', filters.store_id);
      if (filters.customer_group_id) params.set('customer_group_id', filters.customer_group_id);

      const res = await fetch(`/api/catalog/product-saleability?${params.toString()}`);
      const json = await res.json();
      if (!json) throw new Error('No response');
      if (!json.success) {
        throw new Error(json.message || 'Failed to fetch');
      }
      setRecords(json.data?.records || []);
    } catch (err) {
      console.error('fetchData error', err);
      setError(err?.message || String(err));
    } finally { setLoading(false); }
  };

  const toggleRecord = (idx) => {
    setRecords(prev => {
      const arr = [...prev]; arr[idx] = { ...arr[idx], is_active: !arr[idx].is_active }; return arr;
    });
  };

  const saveAll = async () => {
    setLoading(true);
    try {
      await Promise.all(records.map(r => fetch('/api/catalog/product-saleability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: r.product_id || null, store_id: r.store_id || null, is_active: r.is_active }) })));
      fetchData();
    } catch (err) {
      // ignore
    } finally { setLoading(false); }
  };

  return (
    <div className="font-sans text-sm">
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Link href="/catalog" className="text-blue-500 hover:underline">Catalog</Link>
        <span>›</span>
        <Link href="/catalog/products" className="text-blue-500 hover:underline">Product</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">Product Saleability</span>
      </nav>

      <SectionCard title="Product Saleability" description="Test and validate product saleability across channels, stores, and counters.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Customer Group</label>
            <select value={filters.customer_group_id} onChange={e => setFilter('customer_group_id', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">Select Customer Group</option>
              {customerGroups.map(cg => <option key={cg.id} value={cg.id}>{cg.group_name || cg.name || cg.groupName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Channel</label>
            <select value={filters.channel} onChange={e => setFilter('channel', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">Select Channel</option>
              <option value="pos">POS</option>
              <option value="online">Online</option>
              <option value="mobile">Mobile</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Store</label>
            <select value={filters.store_id} onChange={e => setFilter('store_id', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">Select Store</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Counter</label>
            <select value={filters.counter_id} onChange={e => setFilter('counter_id', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">Select Counter</option>
              {counters.map(c => <option key={c.id} value={c.counterId || c.counter_id}>{c.counterName || c.counter_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Transaction Type</label>
            <select value={filters.transaction_type} onChange={e => setFilter('transaction_type', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">Select Transaction Type</option>
              <option value="sale">Sale</option>
              <option value="return">Return</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">POS Date</label>
            <input type="date" value={filters.pos_date} onChange={e => setFilter('pos_date', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Product</label>
            <select value={filters.product_id} onChange={e => setFilter('product_id', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">Select Product</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Batch Variant</label>
            <select value={filters.batch_variant} onChange={e => setFilter('batch_variant', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">Select Batch Variant</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={() => { setFilters({ customer_group_id: '', channel: '', store_id: '', counter_id: '', transaction_type: '', pos_date: '', product_id: '', batch_variant: '' }); setRecords([]); setError(''); router.refresh(); }} className="px-4 py-2 border border-slate-200 rounded-lg bg-white mr-2">Reset</button>
          <button onClick={fetchData} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{loading ? 'Fetching...' : 'Fetch Data'}</button>
        </div>

        <div className="mt-6">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {records.length > 0 ? (
            <>
              <p className="text-sm text-gray-700 mb-2">Found {records.length} record(s).</p>
              <ul className="space-y-2">
                {records.map((r, idx) => (
                  <li key={r.id || idx} className="p-3 border rounded-lg bg-white flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{r.product || '—'}</div>
                      <div className="text-xs text-gray-500">{r.store || 'All stores'}</div>
                    </div>
                    <div className="text-sm text-gray-700">{r.is_active ? 'Active' : 'Inactive'}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
