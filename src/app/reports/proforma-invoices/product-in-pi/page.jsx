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
  { "key": "date", "label": "Date" },
  { "key": "product", "label": "Product" },
  { "key": "sku", "label": "SKU" },
  { "key": "qty", "label": "Qty" },
  { "key": "rate", "label": "Rate" },
  { "key": "discount", "label": "Discount" },
  { "key": "taxes", "label": "Taxes" },
  { "key": "gross_bill", "label": "Gross Bill" },
  { "key": "status", "label": "Status" }
];

export default function ProformaInvoicesProductInPiPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Proforma Invoices' },
        { label: 'Product in PI' },
      ]}
      title="Product in PI"
      description="Products in proforma invoices"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
