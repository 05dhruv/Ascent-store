import ReportsListPage from '@/components/ReportListPage';

const filters = [
  { key: 'date_range', label: 'Date Range', type: 'date-range' },
];

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'entry_type', label: 'Type' },
  { key: 'transaction_id', label: 'Transaction' },
  { key: 'reference_no', label: 'Reference' },
  { key: 'debit', label: 'Debit' },
  { key: 'credit', label: 'Credit' },
  { key: 'balance', label: 'Balance' },
  { key: 'remarks', label: 'Remarks' },
];

export default function VendorLedgerReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[{ label: 'Reports Dashboard', href: '/reports' }, { label: 'Purchase' }, { label: 'Vendor Ledger Report' }]}
      title="Vendor Ledger Report"
      description="Vendor invoices, payments, purchase returns and running balance."
      filters={filters}
      columns={columns}
    />
  );
}
