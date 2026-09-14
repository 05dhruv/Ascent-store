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
  {
    "key": "product",
    "label": "Product"
  },
  {
    "key": "sku",
    "label": "SKU"
  },
  {
    "key": "store",
    "label": "Store"
  },
  {
    "key": "opening_stock",
    "label": "Opening Stock"
  },
  {
    "key": "stock_in",
    "label": "Stock In"
  },
  {
    "key": "stock_out",
    "label": "Stock Out"
  },
  {
    "key": "current_stock",
    "label": "Current Stock"
  },
  {
    "key": "unit",
    "label": "Unit"
  },
  {
    "key": "status",
    "label": "Status"
  }
];

export default function InventoryProductAgeingReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Inventory' },
        { label: 'Product Ageing Report' },
      ]}
      title="Product Ageing Report"
      description="Product age analysis"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}