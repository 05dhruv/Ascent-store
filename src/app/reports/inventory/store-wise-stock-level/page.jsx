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

export default function InventoryStoreWiseStockLevelPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Inventory' },
        { label: 'Store Wise Stock Level' },
      ]}
      title="Store Wise Stock Level"
      description="Stock levels by store"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}