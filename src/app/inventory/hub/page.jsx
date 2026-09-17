"use client";

import { useEffect, useMemo, useState } from 'react';
import InventoryShell from '@/components/inventory/InventoryShell';
import { useUser } from '@/hooks/useUser';

const STORE_INVENTORY_PERMISSIONS = ['VIEW_STORE_INVENTORY_DASHBOARD', 'VIEW_STORE_PRODUCT_INVENTORY'];

const baseStats = [
  { key: 'inventory_value_retail', label: 'On-hand value', note: 'Stock × price' },
  { key: 'stockout_risk', label: 'Materials to replenish', note: 'Below reorder level' },
  { key: 'low_moving', label: 'Low-use materials', note: 'Review before new purchase' },
  { key: 'total_products', label: 'Materials available', note: 'Active material master records' },
];

const insights = [
  {
    title: 'Need to procure?',
    text: 'Review material shortages and create a purchase order only when warehouse stock is insufficient.',
    button: 'Site requests',
    href: '/inventory/stockrequisition',
  },
  {
    title: 'Send material to site',
    text: 'Approve a site request, then pick and dispatch the requested material from the warehouse.',
    button: 'Transfer to site',
    href: '/inventory/stocktransfer',
  },
  {
    title: 'Track receipt and issue',
    text: 'Confirm site receipt before issuing material for construction work.',
    button: 'Movement tracker',
    href: '/inventory/movement-tracker',
  },
];

const cards = [
  { title: '1. Receive at warehouse', text: 'Record supplier delivery through GRN.', href: '/inventory/stockin' },
  { title: '2. Site material request', text: 'Site engineer requests approved materials.', href: '/inventory/stockrequisition' },
  { title: '3. Dispatch to site', text: 'Pick, dispatch and track warehouse-to-site transfers.', href: '/inventory/stocktransfer' },
  { title: '4. Receive / issue at site', text: 'Confirm receipt, then issue material for work.', href: '/inventory/stockout' },
  { title: 'Material movement tracker', text: 'See all dispatches, receipts and discrepancies.', href: '/inventory/movement-tracker' },
  { title: 'Purchase orders', text: 'Procure material when warehouse stock is short.', href: '/purchase/purchase-orders' },
  { title: 'Material stock check', text: 'Verify physical warehouse and site stock.', href: '/inventory/stockvalidation' },
  { title: 'Suppliers', text: 'Manage material suppliers and contractor vendors.', href: '/purchase/vendors' },
];

export default function InventoryHubPage() {
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [storeInventory, setStoreInventory] = useState([]);
  const [storeInventoryLoading, setStoreInventoryLoading] = useState(false);
  const [storeInventoryError, setStoreInventoryError] = useState('');
  const [storeInventorySearch, setStoreInventorySearch] = useState('');
  const [storeInventoryBrand, setStoreInventoryBrand] = useState('');
  const [storeInventoryCategory, setStoreInventoryCategory] = useState('');
  const [storeInventoryVendor, setStoreInventoryVendor] = useState('');

  const canViewStoreInventory = useMemo(() => {
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    return user?.role === 'super_admin' || permissions.includes('*') || STORE_INVENTORY_PERMISSIONS.some((permission) => permissions.includes(permission));
  }, [user]);
  const canFilterStoreInventoryByVendor = user?.role === 'super_admin';

  useEffect(() => {
    let mounted = true;

    const loadOverview = async () => {
      try {
        const params = new URLSearchParams();
        params.set('date_from', new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
        params.set('date_to', new Date().toISOString().split('T')[0]);

        const res = await fetch(`/api/dashboard/analytics?${params}`);
        if (!res.ok) throw new Error('Failed to load inventory overview');

        const json = await res.json();
        if (mounted && json.success && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.error('[inventory hub]', err);
        if (mounted) setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadOverview();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canViewStoreInventory) return;

    let mounted = true;
    const loadStores = async () => {
      setStoresLoading(true);
      try {
        const res = await fetch('/api/stores', { cache: 'no-store', credentials: 'include' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load stores');

        const records = json.data?.records || json.data?.stores || json.stores || [];
        if (mounted) {
          setStores(Array.isArray(records) ? records : []);
        }
      } catch (err) {
        console.error('[inventory hub stores]', err);
        if (mounted) setStores([]);
      } finally {
        if (mounted) setStoresLoading(false);
      }
    };

    loadStores();
    return () => {
      mounted = false;
    };
  }, [canViewStoreInventory]);

  useEffect(() => {
    if (!canViewStoreInventory || !canFilterStoreInventoryByVendor) {
      setVendors([]);
      setStoreInventoryVendor('');
      return;
    }

    let mounted = true;
    const loadVendors = async () => {
      setVendorsLoading(true);
      try {
        const res = await fetch('/api/vendors?pageSize=500', { cache: 'no-store', credentials: 'include' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load vendors');
        if (mounted) setVendors(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error('[inventory hub vendors]', err);
        if (mounted) setVendors([]);
      } finally {
        if (mounted) setVendorsLoading(false);
      }
    };

    loadVendors();
    return () => {
      mounted = false;
    };
  }, [canFilterStoreInventoryByVendor, canViewStoreInventory]);

  useEffect(() => {
    if (!canViewStoreInventory || !selectedStoreId) {
      setStoreInventory([]);
      setStoreInventoryError('');
      setStoreInventoryBrand('');
      setStoreInventoryCategory('');
      return;
    }

    const controller = new AbortController();
    const loadStoreInventory = async () => {
      setStoreInventoryLoading(true);
      setStoreInventoryError('');
      try {
        const params = new URLSearchParams({
          store_id: selectedStoreId,
          dashboard_inventory: 'true',
          page: '1',
          pageSize: '5000',
        });
        if (canFilterStoreInventoryByVendor && storeInventoryVendor) {
          params.set('vendor', storeInventoryVendor);
        }
        const res = await fetch(`/api/inventory/products?${params.toString()}`, {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load store inventory');
        setStoreInventory(Array.isArray(json.data?.records) ? json.data.records : []);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[inventory hub store inventory]', err);
        setStoreInventory([]);
        setStoreInventoryError(err.message || 'Failed to load store inventory');
      } finally {
        setStoreInventoryLoading(false);
      }
    };

    loadStoreInventory();
    return () => {
      controller.abort();
    };
  }, [canFilterStoreInventoryByVendor, canViewStoreInventory, selectedStoreId, storeInventoryVendor]);

  const stats = useMemo(() => {
    const inventory = data?.inventory || {};
    const stockAlerts = Array.isArray(data?.stock_alerts) ? data.stock_alerts : [];
    const movingItems = Array.isArray(data?.moving_items) ? data.moving_items : [];

    const formatCurrency = (value) =>
      `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    const riskCount = stockAlerts.filter((item) => Number(item.current_stock || 0) <= Number(item.reorder_level || 0)).length;
    const lowMovingCount = movingItems.filter((item) => String(item.movement_category || '').toLowerCase() === 'slow-moving').length;

    return baseStats.map((stat) => {
      if (stat.key === 'inventory_value_retail') {
        return { label: stat.label, note: stat.note, value: formatCurrency(inventory.inventory_value_retail) };
      }
      if (stat.key === 'stockout_risk') {
        return { label: stat.label, note: stat.note, value: String(riskCount) };
      }
      if (stat.key === 'low_moving') {
        return { label: stat.label, note: stat.note, value: String(lowMovingCount) };
      }
      if (stat.key === 'total_products') {
        return { label: stat.label, note: stat.note, value: String(inventory.total_products || 0) };
      }
      return { label: stat.label, note: stat.note, value: '-' };
    });
  }, [data]);

  const selectedStore = stores.find((store) => String(store.id) === String(selectedStoreId));
  const inventoryFilterOptions = useMemo(() => {
    const brands = new Map();
    const categories = new Map();

    storeInventory.forEach((item) => {
      const brandName = String(item.brandName || '').trim();
      const categoryName = String(item.categoryName || '').trim();

      if (brandName) brands.set(brandName.toLowerCase(), brandName);
      if (categoryName) categories.set(categoryName.toLowerCase(), categoryName);
    });

    return {
      brands: Array.from(brands.values()).sort((a, b) => a.localeCompare(b)),
      categories: Array.from(categories.values()).sort((a, b) => a.localeCompare(b)),
    };
  }, [storeInventory]);
  const filteredStoreInventory = useMemo(() => {
    const needle = storeInventorySearch.trim().toLowerCase();
    const brand = storeInventoryBrand.trim().toLowerCase();
    const category = storeInventoryCategory.trim().toLowerCase();

    return storeInventory.filter((item) =>
      (!needle ||
        [item.name, item.sku, item.barcode, item.categoryName, item.brandName].some((value) =>
          String(value || '').toLowerCase().includes(needle)
        )) &&
      (!brand || String(item.brandName || '').trim().toLowerCase() === brand) &&
      (!category || String(item.categoryName || '').trim().toLowerCase() === category)
    );
  }, [storeInventory, storeInventoryBrand, storeInventoryCategory, storeInventorySearch]);
  const visibleTotalUnits = filteredStoreInventory.reduce((sum, item) => sum + Number(item.availableStock || 0), 0);
  const visibleTotalStockCost = filteredStoreInventory.reduce(
    (sum, item) =>
      sum +
      Number(item.stockCost ?? Number(item.availableStock || 0) * Number(item.cost_price ?? item.costPrice ?? 0)),
    0
  );
  const totalProducts = selectedStoreId ? filteredStoreInventory.length : 0;
  const totalUnits = selectedStoreId ? visibleTotalUnits : 0;
  const totalStockCost = selectedStoreId ? visibleTotalStockCost : 0;

  return (
    <InventoryShell
      breadcrumb={[{ label: 'Home' }, { label: 'Inventory' }]}
      title="Material Control"
      subtitle="Follow one simple flow: receive at warehouse, request from site, dispatch, receive, then issue to work."
      actions={[]}
      searchPlaceholder="Search"
      stats={loading ? baseStats.map((stat) => ({ label: stat.label, note: stat.note })) : stats}
      insights={insights}
      cards={cards}
      showTable={false}
    >
      {canViewStoreInventory && (
        <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[17px] font-bold text-slate-900">Store inventory</h2>
              <p className="mt-1 text-[12.5px] text-slate-400">
                Select a store to view products currently available with stock on hand.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[280px]">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500" htmlFor="store-inventory-select">
                Store
              </label>
              <select
                id="store-inventory-select"
                value={selectedStoreId}
                onChange={(event) => {
                  setSelectedStoreId(event.target.value);
                  setStoreInventorySearch('');
                  setStoreInventoryBrand('');
                  setStoreInventoryCategory('');
                  setStoreInventoryVendor('');
                }}
                disabled={storesLoading}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">{storesLoading ? 'Loading stores...' : 'Select store'}</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Selected store</p>
              <p className="mt-1 truncate text-[14px] font-semibold text-slate-800">{selectedStore?.name || '-'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Products available</p>
              <p className="mt-1 text-[20px] font-black text-indigo-600">{totalProducts.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Total stock units</p>
              <p className="mt-1 text-[20px] font-black text-indigo-600">{totalUnits.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Total stock cost</p>
              <p className="mt-1 text-[20px] font-black text-indigo-600">
                &#8377;{totalStockCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-end xl:justify-between">
            <div className={`grid w-full grid-cols-1 gap-3 ${canFilterStoreInventoryByVendor ? 'md:grid-cols-4 xl:max-w-5xl' : 'md:grid-cols-3 xl:max-w-4xl'}`}>
              <div>
                <label className="sr-only" htmlFor="store-inventory-search">
                  Search store inventory
                </label>
                <input
                  id="store-inventory-search"
                  type="search"
                  value={storeInventorySearch}
                  onChange={(event) => setStoreInventorySearch(event.target.value)}
                  placeholder="Search products, SKU, barcode..."
                  disabled={!selectedStoreId || storeInventoryLoading}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500" htmlFor="store-inventory-brand">
                  Brand
                </label>
                <select
                  id="store-inventory-brand"
                  value={storeInventoryBrand}
                  onChange={(event) => setStoreInventoryBrand(event.target.value)}
                  disabled={!selectedStoreId || storeInventoryLoading || inventoryFilterOptions.brands.length === 0}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">All brands</option>
                  {inventoryFilterOptions.brands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500" htmlFor="store-inventory-category">
                  Category
                </label>
                <select
                  id="store-inventory-category"
                  value={storeInventoryCategory}
                  onChange={(event) => setStoreInventoryCategory(event.target.value)}
                  disabled={!selectedStoreId || storeInventoryLoading || inventoryFilterOptions.categories.length === 0}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">All categories</option>
                  {inventoryFilterOptions.categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              {canFilterStoreInventoryByVendor && (
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500" htmlFor="store-inventory-vendor">
                    Vendor
                  </label>
                  <select
                    id="store-inventory-vendor"
                    value={storeInventoryVendor}
                    onChange={(event) => {
                      setStoreInventoryVendor(event.target.value);
                      setStoreInventoryBrand('');
                      setStoreInventoryCategory('');
                    }}
                    disabled={!selectedStoreId || storeInventoryLoading || vendorsLoading || vendors.length === 0}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{vendorsLoading ? 'Loading vendors...' : 'All vendors'}</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id || vendor.name} value={vendor.name}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {selectedStoreId && !storeInventoryLoading && !storeInventoryError && (
              <p className="text-[12px] font-medium text-slate-400">
                Showing {filteredStoreInventory.length.toLocaleString('en-IN')} of {storeInventory.length.toLocaleString('en-IN')}
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Product', 'SKU', 'Barcode', 'Category', 'Brand', 'Stock', 'Store Cost'].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!selectedStoreId ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[14px] font-medium text-indigo-700">
                      Select a store to view inventory.
                    </td>
                  </tr>
                ) : storeInventoryLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[14px] font-medium text-indigo-700">
                      Loading store inventory...
                    </td>
                  </tr>
                ) : storeInventoryError ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[14px] font-medium text-rose-600">
                      {storeInventoryError}
                    </td>
                  </tr>
                ) : storeInventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[14px] font-medium text-indigo-700">
                      No inventory found for this store.
                    </td>
                  </tr>
                ) : filteredStoreInventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[14px] font-medium text-indigo-700">
                      No products match this search.
                    </td>
                  </tr>
                ) : (
                  filteredStoreInventory.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 transition-colors hover:bg-indigo-50/50">
                      <td className="px-4 py-3 text-[13px] font-semibold text-slate-800">{item.name || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600">{item.sku || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600">{item.barcode || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600">{item.categoryName || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600">{item.brandName || '-'}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-slate-900">
                        {Number(item.availableStock || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-bold text-slate-900">
                        &#8377;{Number(item.cost_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </InventoryShell>
  );
}
