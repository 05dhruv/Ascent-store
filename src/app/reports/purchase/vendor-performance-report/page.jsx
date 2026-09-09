import ReportsListPage from '@/components/ReportListPage';

const filters = [
  { key: 'date_range', label: 'Date Range', type: 'date-range' },
  { key: 'store', label: 'Store', type: 'select' },
];

const columns = [
  { key: 'vendor', label: 'Vendor' },
  { key: 'score', label: 'Score' },
  { key: 'grade', label: 'Grade' },
  { key: 'po_count', label: 'POs' },
  { key: 'purchase_value', label: 'Purchase Value' },
  { key: 'avg_lead_days', label: 'Lead Days' },
  { key: 'return_count', label: 'Returns' },
  { key: 'outstanding', label: 'Outstanding' },
];

export default function VendorPerformanceReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[{ label: 'Reports Dashboard', href: '/reports' }, { label: 'Purchase' }, { label: 'Vendor Performance Report' }]}
      title="Vendor Performance Report"
      description="Vendor score and purchase volume by date and store."
      filters={filters}
      columns={columns}
    />
  );
}
