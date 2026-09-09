"use client";

import { useEffect, useState } from 'react';

export default function AssignWarehouseBulkPreview() {
  const [rows, setRows] = useState([]);
  const [warehouseIds, setWarehouseIds] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [preview, setPreview] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);

  useEffect(() => {
    const r = JSON.parse(sessionStorage.getItem('assignBulkWarehouse_preview_rows') || '[]');
    const w = JSON.parse(sessionStorage.getItem('assignBulkWarehouse_preview_warehouses') || '[]');
    setRows(r);
    setWarehouseIds(w);

    (async () => {
      try {
        const whRes = await fetch('/api/warehouses');
        const whJson = await whRes.json();
        if (whJson.success) setWarehouses(whJson.data.records || []);
      } catch (e) { /* ignore */ }

      try {
        const res2 = await fetch('/api/catalog/assign-products-warehouse/bulk/preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: r })
        });
        const j2 = await res2.json();
        if (j2.success) setPreview(j2.data.records || []);
      } catch (e) { setPreview([]); }
    })();
  }, []);

  const getKey = (row) => `${row.id}:${row.warehouse_id || warehouseIds[0] || ''}`;
  const toggleSelect = (row) => {
    const key = getKey(row);
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(x=>x!==key) : [...prev, key]);
  };

  const doApply = async () => {
    if (!warehouseIds.length) return alert('No warehouses selected');
    if (!selectedKeys.length) return alert('Select at least one product');
    const assignments = preview
      .filter((row) => selectedKeys.includes(getKey(row)))
      .flatMap((row) => {
        if (row.warehouse_id) return [{ productId: row.id, warehouseId: row.warehouse_id }];
        return warehouseIds.map((warehouseId) => ({ productId: row.id, warehouseId }));
      });
    const res = await fetch('/api/catalog/assign-products-warehouse/bulk/execute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments, warehouseIds })
    });
    const json = await res.json();
    if (json.success) {
      alert('Bulk operation completed');
      window.location.href = '/catalog/pricing/assign-products-warehouse';
    } else alert(json.message || 'Failed');
  };

  const warehouseNames = warehouseIds.map(id => warehouses.find(s => String(s.id) === String(id))?.name).filter(Boolean);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Bulk Operation — Preview (Warehouses)</h2>
      <div className="bg-white p-4 rounded-lg mb-4 shadow-sm">
        <div className="text-sm text-gray-600 space-y-1">
          <div>Warehouses: {warehouseNames.length ? warehouseNames.join(', ') : warehouseIds.join(', ')}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b"><th className="w-8"></th><th>Product ID</th><th>Name</th><th>SKU</th><th>Barcode</th></tr>
          </thead>
          <tbody>
            {preview.map(p => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-2 py-2 text-center"><input type="checkbox" checked={selectedKeys.includes(getKey(p))} onChange={() => toggleSelect(p)} /></td>
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
