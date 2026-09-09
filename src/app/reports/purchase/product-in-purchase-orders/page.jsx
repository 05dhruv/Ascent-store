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
  {
    "key": "po_id",
    "label": "PO ID"
  },
  {
    "key": "vendor",
    "label": "Vendor"
  },
  {
    "key": "store",
    "label": "Store"
  },
  {
    "key": "date",
    "label": "Date"
  },
  {
    "key": "items",
    "label": "Items"
  },
  {
    "key": "total_amount",
    "label": "Total Amount"
  },
  {
    "key": "tax",
    "label": "Tax"
  },
  {
    "key": "grand_total",
    "label": "Grand Total"
  },
  {
    "key": "status",
    "label": "Status"
  }
];

export default function PurchaseProductInPurchaseOrdersPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Purchase' },
        { label: 'Product In Purchase Orders' },
      ]}
      title="Product In Purchase Orders"
      description="Products in purchase orders"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}