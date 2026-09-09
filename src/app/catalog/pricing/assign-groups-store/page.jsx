"use client";

import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import CatalogListPage from "@/components/CatalogListPage";

const columns = [
  { key: "product_group_id",   label: "Product Group ID",   sortable: true },
  { key: "product_group_name", label: "Product Group Name", sortable: true },
  { key: "product_id",         label: "Product ID",         sortable: true },
  { key: "product_name",       label: "Product Name",       sortable: true },
  { key: "barcode",            label: "Barcode",            sortable: true },
  { key: "serial_number",      label: "Serial Number",      sortable: true },
  { key: "mrp",                label: "MRP",                sortable: true },
];

export default function AssignProductGroupsToStorePage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [storesList, setStoresList] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/stores');
        const json = await res.json();
        if (json.success) setStoresList(json.data.stores || json.data.records || []);
      } catch (e) { }
    })();
  }, []);

  const [selectedStoreId, setSelectedStoreId] = useState(null);

  const handleStoreChange = async (storeId) => {
    setSelectedStoreId(storeId || null);
    if (!storeId) { setRows([]); return; }
    try {
      const res = await fetch(`/api/catalog/assign-product-groups-store?storeId=${storeId}`);
      const json = await res.json();
      if (json.success) {
        // map to CatalogListPage rows shape
        const mapped = json.data.records.map(g => ({
          id: g.id,
          product_group_id: g.id,
          product_group_name: g.name,
          product_id: '—',
          product_name: '—',
          barcode: '—',
          serial_number: '—',
          mrp: '—',
          is_assigned: g.is_assigned,
        }));
        setRows(mapped);
      } else setRows([]);
    } catch (e) { setRows([]); }
  };

  const handleBulkCreate = () => router.push('/catalog/pricing/assign-groups-store/assignbulk');

  const handleToggle = async (row) => {
    const storeId = selectedStoreId;
    if (!storeId) return alert('Select a store first');
    const assign = !row.is_assigned;
    const res = await fetch('/api/catalog/assign-product-groups-store/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: row.product_group_id, storeId, assign })
    });
    const j = await res.json();
    if (j.success) {
      // refresh
      handleStoreChange(storeId);
    } else alert(j.message || 'Failed');
  };

  return (
    <CatalogListPage
      breadcrumbs={[
        { label: "Catalog", href: "/catalog" },
        { label: "Pricing",  href: "/catalog/pricing" },
        { label: "Assign product groups to store" },
      ]}
      title="Assign Product Group to Store"
      description="Map product groups to stores Need Help?"
      createLabel={'Bulk Create'}
      onCreateClick={handleBulkCreate}
      bulkOperations={false}
      showStoreSelector={true}
      selectorLabel="Select Store"
      selectorPlaceholder="None"
      stores={storesList}
      onStoreChange={handleStoreChange}
      columns={columns}
      rows={rows}
      totalLabel="Product Group(s)"
      emptyMessage="No data found"
      showRowActions={true}
      onEdit={handleToggle}
      onDelete={null}
    />
  );
}
