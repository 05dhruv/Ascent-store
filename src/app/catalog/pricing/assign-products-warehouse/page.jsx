"use client";

import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import CatalogListPage from "@/components/CatalogListPage";

const columns = [
  { key: "sno",              label: "S. No.",          sortable: true },
  { key: "product_id",       label: "Product ID",      sortable: true },
  { key: "product_name",     label: "Product Name",    sortable: true },
  { key: "sku",              label: "SKU",             sortable: true },
  { key: "safe_stock_level", label: "Safe Stock Level",sortable: true },
  { key: "low_stock_level",  label: "Low Stock Level", sortable: true },
  { key: "assigned_to_warehouse", label: "Assigned", sortable: true },
];

function mapRows(records = []) {
  return records.map((item, index) => ({
    id: item.id,
    sno: index + 1,
    product_id: item.product_id || item.id,
    product_name: item.name,
    sku: item.sku || "-",
    safe_stock_level: item.safe_stock_level ?? 0,
    low_stock_level: item.low_stock_level ?? 0,
    assigned_to_warehouse: item.is_assigned ? "Yes" : "No",
    is_assigned: Boolean(item.is_assigned),
  }));
}

export default function AssignProductsToWarehousePage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/warehouses');
        const json = await res.json();
        if (json.success) setWarehouses(json.data.records || []);
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const handleStoreChange = async (warehouseId) => {
    setSelectedWarehouseId(warehouseId || '');
    if (!warehouseId) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/assign-products-warehouse?warehouseId=${encodeURIComponent(warehouseId)}`);
      const json = await res.json();
      setRows(json.success ? mapRows(json.data.records || []) : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (row) => {
    if (!selectedWarehouseId) return alert('Select a warehouse first');
    const res = await fetch('/api/catalog/assign-products-warehouse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: row.id, warehouseId: selectedWarehouseId, assign: !row.is_assigned }),
    });
    const json = await res.json();
    if (!json.success) return alert(json.message || 'Failed to update warehouse assignment');
    handleStoreChange(selectedWarehouseId);
  };

  const handleBulkCreate = () => router.push('/catalog/pricing/assign-products-warehouse/assignbulk');

  return (
    <CatalogListPage
      breadcrumbs={[
        { label: "Catalog", href: "/catalog" },
        { label: "Pricing",  href: "/catalog/pricing" },
        { label: "Assign Products To Warehouse" },
      ]}
      title="Assign Product To Warehouse"
      description="Map/Unmap products to warehouse Need Help?"
        createLabel={'Bulk Create'}
        onCreateClick={handleBulkCreate}
        bulkOperations={false}
      showStoreSelector={true}
      selectorLabel={null}
      selectorPlaceholder="None"
      stores={warehouses}
      onStoreChange={handleStoreChange}
      columns={columns}
      rows={rows}
      loading={loading}
      totalLabel="Product(s)"
      emptyMessage="No Records Found"
      showRowActions={true}
      onEdit={handleToggle}
    />
  );
}
