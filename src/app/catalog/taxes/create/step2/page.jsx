'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { fetchAllCatalogProducts } from '@/lib/productPagination';

export default function CreateTaxStep2() {
  const search = useSearchParams();
  const taxId = search.get('taxId');
  const router = useRouter();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ category_id: '', brand_id: '' });

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!taxId) return;
    (async () => {
      await Promise.all([
        loadLookups(),
        fetchAssignedProducts(),
      ]);
    })();
  }, [taxId]);

  const loadLookups = async () => {
    try {
      const [categoryRes, brandRes] = await Promise.all([
        fetch('/api/catalog/categories?pageSize=200'),
        fetch('/api/catalog/brands?pageSize=200'),
      ]);
      const categoryJson = await categoryRes.json();
      const brandJson = await brandRes.json();
      setCategories(categoryJson.success ? (categoryJson.data?.records || []) : []);
      setBrands(brandJson.success ? (brandJson.data?.records || []) : []);
    } catch (err) {
      console.error('lookup load failed', err);
    }
  };

  const fetchAssignedProducts = async () => {
    setLoading(true);
    try {
      const [assignedRes, productsRes] = await Promise.all([
        fetch(`/api/catalog/taxes/assign-products?tax_id=${taxId}`),
        fetchAllCatalogProducts({ pageSize: 500 }),
      ]);

      const assignedJson = await assignedRes.json();

      const assignedIds = new Set((assignedJson.data?.records || []).map((item) => String(item.id)));
      setProducts(productsRes);
      setSelected(assignedIds);
    } catch (err) {
      setError(err?.message || String(err));
    } finally { setLoading(false); }
  };

  const fetchProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const records = await fetchAllCatalogProducts({
        params: {
          search: searchTerm.trim(),
          category_id: filters.category_id,
          brand_id: filters.brand_id,
        },
        pageSize: 500,
      });
      setProducts(records);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const onSave = async () => {
    if (!taxId) return setError('Missing tax id');
    if (!selected.size) return setError('Select at least one product');
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/catalog/taxes/assign-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tax_id: Number(taxId), product_ids: Array.from(selected).map(Number) }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Save failed');
      router.push('/catalog/taxes');
    } catch (err) {
      setError(err?.message || String(err));
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fc] p-6 text-sm">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
        <a href="/catalog" className="text-blue-500 hover:underline">Catalog</a>
        <span>›</span>
        <a href="/catalog/taxes" className="text-blue-500 hover:underline">Taxes & Charges</a>
        <span>›</span>
        <a href="/catalog/taxes" className="text-blue-500 hover:underline">Taxes</a>
        <span>›</span>
        <span className="font-medium text-gray-700">Create Tax</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold text-gray-900">Select Applicable Products</h2>
          <p className="mt-1 text-sm text-gray-500">Step 2 of 2</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/catalog/taxes/create')} className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm text-blue-600 hover:bg-blue-50">Back</button>
          <button onClick={onSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <select value={filters.category_id} onChange={(event) => setFilter('category_id', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select Category</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Brand Information</label>
            <select value={filters.brand_id} onChange={(event) => setFilter('brand_id', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select Brand</option>
              {brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div className="flex items-end justify-end">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 md:max-w-[320px]"
            />
          </div>
        </div>

        <div className="mb-4 flex justify-end">
          <button onClick={fetchProducts} disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">{loading ? 'Loading...' : 'Fetch Data'}</button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="w-10 px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && products.every((item) => selected.has(String(item.id)))}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelected(new Set(products.map((item) => String(item.id))));
                      } else {
                        setSelected(new Set());
                      }
                    }}
                  />
                </th>
                <th className="px-3 py-3 text-left font-medium">Product ID</th>
                <th className="px-3 py-3 text-left font-medium">Product</th>
                <th className="px-3 py-3 text-left font-medium">SKU</th>
                <th className="px-3 py-3 text-left font-medium">Unit Name</th>
                <th className="px-3 py-3 text-left font-medium">Brand Information</th>
                <th className="px-3 py-3 text-left font-medium">Category</th>
                <th className="px-3 py-3 text-left font-medium">M.R.P</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-500">Loading products...</td></tr>
              ) : products.length ? (
                products.map((item) => {
                  const id = String(item.id);
                  const isChecked = selected.has(id);
                  return (
                    <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50/70">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={isChecked} onChange={() => toggle(id)} />
                      </td>
                      <td className="px-3 py-2 text-gray-700">{item.id}</td>
                      <td className="px-3 py-2 text-blue-700">{item.name}</td>
                      <td className="px-3 py-2 text-gray-700">{item.sku || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{item.unit || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{item.brand_name || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{item.category_name || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{item.mrp != null ? `₹ ${Number(item.mrp).toFixed(2)}` : '-'}</td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-500">No products found. Use filters or Fetch Data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-gray-600">
          <p>Selected {selected.size} product(s)</p>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">Clear Selection</button>
            <button onClick={onSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
