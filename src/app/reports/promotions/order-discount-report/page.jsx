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
    "key": "store",
    "label": "Store"
  },
  {
    "key": "discount_type",
    "label": "Discount Type"
  },
  {
    "key": "discount_value",
    "label": "Discount Value"
  },
  {
    "key": "orders",
    "label": "Orders"
  },
  {
    "key": "quantity",
    "label": "Quantity"
  },
  {
    "key": "sales",
    "label": "Sales"
  },
  {
    "key": "discount_amount",
    "label": "Discount Amount"
  }
];

export default function PromotionsOrderDiscountReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Promotions' },
        { label: 'Order Discount Report' },
      ]}
      title="Order Discount Report"
      description="Discount at order level"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}