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
  { "key": "pi_number", "label": "PI Number" },
  { "key": "store", "label": "Store" },
  { "key": "customer", "label": "Customer" },
  { "key": "payment_date", "label": "Payment Date" },
  { "key": "payment_mode", "label": "Payment Mode" },
  { "key": "paid_amount", "label": "Paid Amount" },
  { "key": "reference_no", "label": "Reference No" },
  { "key": "gross_bill", "label": "Gross Bill" },
  { "key": "status", "label": "Status" }
];

export default function ProformaInvoicesPiPaymentHistoryPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Proforma Invoices' },
        { label: 'PI Payment History' },
      ]}
      title="PI Payment History"
      description="Payment history for PI"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
