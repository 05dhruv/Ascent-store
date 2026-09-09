"use client";

import ReportsListPage from "@/components/ReportListPage";

const filters = [
  { key: "store", label: "Store", type: "select", options: [] },
  {
    key: "issue",
    label: "Show",
    type: "select",
    options: [
      { value: "mismatch", label: "Mismatches only" },
      { value: "mrp", label: "MRP mismatches" },
      { value: "selling_price", label: "Selling price mismatches" },
      { value: "cost", label: "Cost price mismatches" },
      { value: "all", label: "All active batches" },
    ],
  },
];

const columns = [
  { key: "audit_status", label: "Audit Status" },
  { key: "store", label: "Store" },
  { key: "product", label: "Product" },
  { key: "barcode", label: "Barcode" },
  { key: "sku", label: "SKU" },
  { key: "batch_no", label: "Batch No" },
  { key: "available_qty", label: "Available Qty" },
  { key: "batch_cost_price", label: "Batch CP" },
  { key: "assigned_cost_price", label: "Assigned Store CP" },
  { key: "cost_check", label: "CP Check" },
  { key: "batch_selling_price", label: "Batch SP" },
  { key: "assigned_selling_price", label: "Assigned Store SP" },
  { key: "selling_price_check", label: "SP Check" },
  { key: "batch_mrp", label: "Batch MRP" },
  { key: "assigned_mrp", label: "Assigned Store MRP" },
  { key: "mrp_check", label: "MRP Check" },
  { key: "source_type", label: "Source" },
  { key: "created_at", label: "Batch Created" },
];

export default function StoreBatchPriceAuditPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: "Reports Dashboard", href: "/reports" },
        { label: "Inventory" },
        { label: "Store Batch Price Audit" },
      ]}
      title="Store Batch Price Audit"
      description="Compares active batch prices with the MRP, selling price and franchise cost assigned to that store."
      filters={filters}
      columns={columns}
      reportKey="inventory/store-batch-price-audit"
      totalLabel="Batches"
      emptyMessage="No batches match the selected audit filter"
    />
  );
}
