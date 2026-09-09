import ReportsListPage from '@/components/ReportListPage';

const filters = [
  { key: 'store', label: 'Store', type: 'select' },
];

const columns = [
  { key: 'product', label: 'Product' },
  { key: 'sku', label: 'SKU' },
  { key: 'store', label: 'Store' },
  { key: 'current_stock', label: 'Current Stock' },
  { key: 'reorder_level', label: 'Reorder Level' },
  { key: 'suggested_qty', label: 'Suggested Qty' },
  { key: 'vendor', label: 'Last Vendor' },
  { key: 'cost', label: 'Cost' },
];

export default function AutoReorderSuggestionsReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[{ label: 'Reports Dashboard', href: '/reports' }, { label: 'Purchase' }, { label: 'Auto Reorder Suggestions' }]}
      title="Auto Reorder Suggestions"
      description="Low-stock products with reorder threshold, suggested quantity and last vendor."
      filters={filters}
      columns={columns}
    />
  );
}
