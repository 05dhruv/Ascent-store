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
  { "key": "source", "label": "Source" },
  { "key": "destination", "label": "Destination" },
  { "key": "product", "label": "Product" },
  { "key": "requested_qty", "label": "Requested Qty" },
  { "key": "fulfilled_qty", "label": "Fulfilled Qty" },
  { "key": "stock_transfer_id", "label": "Stock Transfer ID" },
  { "key": "purchase_order_id", "label": "Purchase Order ID" },
  { "key": "fulfillment_status", "label": "Fulfillment Status" },
  { "key": "status", "label": "Status" }
];

export default function InventoryStockFulfillmentPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Inventory' },
        { label: 'Stock Fulfillment' },
      ]}
      title="Stock Fulfillment"
      description="Stock fulfillment report"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
