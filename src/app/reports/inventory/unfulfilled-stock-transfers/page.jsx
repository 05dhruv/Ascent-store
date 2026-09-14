import ReportsListPage from '@/components/ReportListPage';

const filters = [
  {
    "key": "date_range",
    "label": "Date Range",
    "type": "date-range"
  },
  {
    "key": "store",
    "label": "Select Store / Warehouse",
    "type": "select"
  }
];

const columns = [
  { "key": "transfer_id", "label": "Transfer ID" },
  { "key": "date", "label": "Date" },
  { "key": "source", "label": "Source" },
  { "key": "destination", "label": "Destination" },
  { "key": "product", "label": "Product" },
  { "key": "sku", "label": "SKU" },
  { "key": "requested_qty", "label": "Qty" },
  { "key": "pending_qty", "label": "Pending Qty" },
  { "key": "status", "label": "Status" }
];

export default function InventoryUnfulfilledStockTransfersPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Inventory' },
        { label: 'Unfulfilled Stock Transfers' },
      ]}
      title="Unfulfilled Stock Transfers"
      description="Pending stock transfers"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
