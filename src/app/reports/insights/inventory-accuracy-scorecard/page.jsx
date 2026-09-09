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

export default function InsightsInventoryAccuracyScorecardPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Insights' },
        { label: 'Inventory Accuracy Scorecard' },
      ]}
      title="Inventory Accuracy Scorecard"
      description="Inventory accuracy metrics"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}