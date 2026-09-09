import ReportsListPage from '@/components/ReportListPage';

const filters = [
  {
    "key": "date_range",
    "label": "Date Range",
    "type": "date-range"
  },
  {
    "key": "region",
    "label": "Select Region",
    "type": "text"
  }
];

const columns = [
  { "key": "requisition_id", "label": "Requisition ID" },
  { "key": "date", "label": "Date" },
  { "key": "source", "label": "Source" },
  { "key": "destination", "label": "Destination" },
  { "key": "product", "label": "Product" },
  { "key": "sku", "label": "SKU" },
  { "key": "requested_qty", "label": "Requested Qty" },
  { "key": "fulfilled_qty", "label": "Fulfilled Qty" },
  { "key": "pending_qty", "label": "Pending Qty" },
  { "key": "approval_status", "label": "Approval Status" },
  { "key": "fulfillment_status", "label": "Fulfillment Status" },
  { "key": "status", "label": "Status" }
];

export default function InventoryStockRequisitionPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Inventory' },
        { label: 'Stock Requisition' },
      ]}
      title="Stock Requisition"
      description="Stock requisition report"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
