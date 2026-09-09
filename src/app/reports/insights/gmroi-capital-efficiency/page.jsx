import ReportsListPage from '@/components/ReportsListPage';

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

export default function InsightsGmroiCapitalEfficiencyPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Insights' },
        { label: 'GMROI Capital Efficiency' },
      ]}
      title="GMROI Capital Efficiency"
      description="Gross margin return on investment"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}