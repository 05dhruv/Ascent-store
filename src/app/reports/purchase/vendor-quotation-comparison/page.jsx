import ReportsListPage from '@/components/ReportListPage';

const filters = [
  { key: 'date_range', label: 'Date Range', type: 'date-range' },
  { key: 'store', label: 'Store', type: 'select' },
];

const columns = [
  { key: 'quote_id', label: 'Quote ID' },
  { key: 'date', label: 'Date' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'store', label: 'Store' },
  { key: 'items', label: 'Items' },
  { key: 'amount', label: 'Amount' },
  { key: 'freight', label: 'Freight' },
  { key: 'lead_days', label: 'Lead Days' },
  { key: 'score', label: 'Score' },
  { key: 'status', label: 'Status' },
];

export default function VendorQuotationComparisonReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[{ label: 'Reports Dashboard', href: '/reports' }, { label: 'Purchase' }, { label: 'Vendor Quotation Comparison' }]}
      title="Vendor Quotation Comparison"
      description="Compare vendor quote amount, freight, lead time and approval status."
      filters={filters}
      columns={columns}
    />
  );
}
