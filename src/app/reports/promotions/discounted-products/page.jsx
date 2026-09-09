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
    "key": "promotion",
    "label": "Promotion"
  },
  {
    "key": "discount_type",
    "label": "Type"
  },
  {
    "key": "invoice_number",
    "label": "Bill No."
  },
  {
    "key": "qty",
    "label": "Quantity"
  },
  {
    "key": "sales",
    "label": "Sales"
  },
  {
    "key": "discount",
    "label": "Free / Discount Value"
  }
];

export default function PromotionsDiscountedProductsPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Promotions' },
        { label: 'Discounted Products' },
      ]}
      title="Discounted Products"
      description="Products with active discounts"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
