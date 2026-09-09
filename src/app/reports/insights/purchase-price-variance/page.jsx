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
    "key": "category",
    "label": "Category"
  },
  {
    "key": "store",
    "label": "Store"
  },
  {
    "key": "metric",
    "label": "Metric"
  },
  {
    "key": "value",
    "label": "Value"
  },
  {
    "key": "recommendation",
    "label": "Recommendation"
  }
];

export default function InsightsPurchasePriceVariancePage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Insights' },
        { label: 'Purchase Price Variance' },
      ]}
      title="Purchase Price Variance"
      description="Purchase price variance analysis"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}