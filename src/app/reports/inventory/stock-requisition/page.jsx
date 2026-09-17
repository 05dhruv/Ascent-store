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
  { "key": "requisition_id", "label": "Requisition ID" },
  { "key": "date", "label": "Date" },
  { "key": "destination", "label": "Requesting Site" },
  { "key": "requested_by_name", "label": "Requested By" },
  { "key": "source", "label": "Source Warehouse" },
  { "key": "product", "label": "Product / Material" },
  { "key": "sku", "label": "SKU" },
  { "key": "unit", "label": "Unit" },
  { "key": "dimensions", "label": "Dimensions" },
  { "key": "requested_qty", "label": "Requested Qty" },
  { "key": "available_qty", "label": "Warehouse Stock" },
  { "key": "shortage_qty", "label": "Shortage Qty" },
  { "key": "fulfilled_qty", "label": "Fulfilled Qty" },
  { "key": "pending_qty", "label": "Pending Qty" },
  { "key": "shortage_status", "label": "Shortage Status" },
  { "key": "approval_status", "label": "Approval" },
  { "key": "approved_by_name", "label": "Approved By" },
  { "key": "purchase_order_id", "label": "Linked PO" },
  { "key": "vendor_name", "label": "Vendor" },
  { "key": "vendor_email", "label": "Vendor Email" },
  { "key": "po_email_status", "label": "PO Email" },
  { "key": "fulfillment_status", "label": "Fulfillment Status" }
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
