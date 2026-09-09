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
    "key": "store",
    "label": "Store"
  },
  {
    "key": "date",
    "label": "Date"
  },
  {
    "key": "sales",
    "label": "Sales"
  },
  {
    "key": "discount",
    "label": "Discount"
  },
  {
    "key": "net_bill",
    "label": "Net Bill"
  },
  {
    "key": "taxes",
    "label": "Taxes"
  },
  {
    "key": "gross_bill",
    "label": "Gross Bill"
  },
  {
    "key": "orders",
    "label": "Orders"
  },
  {
    "key": "avg_order_value",
    "label": "Avg Order Value"
  }
];

export default function OnlineOrderProductWiseOnlineSalesPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Online Order' },
        { label: 'Product Wise Online Sales' },
      ]}
      title="Product Wise Online Sales"
      description="Online sales by product"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}