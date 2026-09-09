"use client";

import { useEffect, useState } from 'react';

export default function AssignBulkPreview() {
  const [rows, setRows] = useState([]);
  const [storeIds, setStoreIds] = useState([]);
  const [stores, setStores] = useState([]);
  const [preview, setPreview] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);

  useEffect(() => {
    const r = JSON.parse(sessionStorage.getItem('assignBulk_preview_rows') || '[]');
    const s = JSON.parse(sessionStorage.getItem('assignBulk_preview_stores') || '[]');
    setRows(r);
    setStoreIds(s);

    (async () => {
      try {
        const res = await fetch('/api/stores');
        const json = await res.json();
        if (json.success) setStores(json.data.stores || json.data.records || []);
      } catch (e) { /* ignore */ }

      // call preview API to match rows to products
      try {
        const res2 = await fetch('/api/catalog/assign-products-store/bulk/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: r }),
        });
        const json2 = await res2.json();
        if (json2.success) setPreview(json2.data.records || []);
        else setPreview([]);
      } catch (e) { setPreview([]); }
    })();
  }, []);

  const getKey = (row) => `${row.id}:${row.store_id || storeIds[0] || ''}`;
  const toggleSelect = (row) => {
    const key = getKey(row);
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(x=>x!==key) : [...prev, key]);
  };

  const doApply = async () => {
    if (!storeIds.length) return alert('No stores selected');
    if (!selectedKeys.length) return alert('Select at least one product');
    const assignments = preview
      .filter((row) => selectedKeys.includes(getKey(row)))
      .flatMap((row) => {
        if (row.store_id) return [{ productId: row.id, storeId: row.store_id }];
        return storeIds.map((storeId) => ({ productId: row.id, storeId }));
      });
    const res = await fetch('/api/catalog/assign-products-store/bulk/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments, storeIds }),
    });
    const json = await res.json();
    if (json.success) {
      alert('Bulk operation completed');
      window.location.href = '/catalog/pricing/assign-products-store';
    } else alert(json.message || 'Failed');
  };

  const storeNames = storeIds.map(id => stores.find(s => String(s.id) === String(id))?.name).filter(Boolean);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Bulk Operation — Preview</h2>
      <div className="bg-white p-4 rounded-lg mb-4 shadow-sm">
        <div className="text-sm text-gray-600">Stores: {storeNames.length ? storeNames.join(', ') : storeIds.join(', ')}</div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b"><th className="w-8"></th><th>Product ID</th><th>Name</th><th>SKU</th><th>Barcode</th></tr>
          </thead>
          <tbody>
            {preview.map(p => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={selectedKeys.includes(getKey(p))} onChange={() => toggleSelect(p)} />
                </td>
                <td className="px-2 py-2">{p.id}</td>
                <td className="px-2 py-2">{p.name}</td>
                <td className="px-2 py-2">{p.sku}</td>
                <td className="px-2 py-2">{p.barcode}</td>
              </tr>
            ))}
            {preview.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No matching products found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <button onClick={() => window.history.back()} className="px-4 py-2 border rounded-md">Back</button>
        <button onClick={doApply} className={`px-4 py-2 rounded-md text-white ${selectedKeys.length ? 'bg-blue-600' : 'bg-slate-300'}`} disabled={!selectedKeys.length}>Apply</button>
      </div>
    </div>
  );
}
