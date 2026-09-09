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

export default function PromotionsProductDiscountReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Promotions' },
        { label: 'Product Discount Report' },
      ]}
      title="Product Discount Report"
      description="Discount applied on products"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}