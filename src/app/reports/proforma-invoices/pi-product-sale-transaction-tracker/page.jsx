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
  { "key": "date", "label": "Date" },
  { "key": "store", "label": "Store" },
  { "key": "customer", "label": "Customer" },
  { "key": "product", "label": "Product" },
  { "key": "sku", "label": "SKU" },
  { "key": "qty", "label": "Qty" },
  { "key": "rate", "label": "Rate" },
  { "key": "sales", "label": "Sales" },
  { "key": "discount", "label": "Discount" },
  { "key": "taxes", "label": "Taxes" },
  { "key": "gross_bill", "label": "Gross Bill" },
  { "key": "status", "label": "Status" }
];

export default function ProformaInvoicesPiProductSaleTransactionTrackerPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Proforma Invoices' },
        { label: 'PI Product Sale Transaction Tracker' },
      ]}
      title="PI Product Sale Transaction Tracker"
      description="PI transaction tracker"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
