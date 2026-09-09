import ReportsListPage from '@/components/ReportListPage';

const filters = [
  { key: 'date_range', label: 'Date Range', type: 'date-range' },
  { key: 'store', label: 'Store', type: 'select' },
];

const columns = [
  { key: 'return_id', label: 'Return ID' },
  { key: 'date', label: 'Date' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'store', label: 'Store' },
  { key: 'qty', label: 'Qty' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
  { key: 'reason', label: 'Reason' },
];

export default function PurchaseReturnReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[{ label: 'Reports Dashboard', href: '/reports' }, { label: 'Purchase' }, { label: 'Purchase Return Report' }]}
      title="Purchase Return Report"
      description="Track vendor returns by date, store, amount and status."
      filters={filters}
      columns={columns}
    />
  );
}
