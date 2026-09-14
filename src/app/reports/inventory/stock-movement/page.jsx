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
    "label": "Material / Product"
  },
  {
    "key": "barcode",
    "label": "Barcode"
  },
  {
    "key": "sku",
    "label": "SKU / Code"
  },
  {
    "key": "store",
    "label": "Store / Site Location"
  },
  {
    "key": "opening_stock",
    "label": "Opening Stock"
  },
  {
    "key": "stock_in",
    "label": "Stock In (+)"
  },
  {
    "key": "stock_out",
    "label": "Stock Out (-)"
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

export default function InventoryStockMovementPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Inventory' },
        { label: 'Material Movement' },
      ]}
      title="Material Movement"
      description="Material movement, dispatch, receipt and stock balance tracking by site store and warehouse"
      filters={filters}
      columns={columns}
      reportKey="inventory/stock-movement"
      actionButtons={[]}
    />
  );
}