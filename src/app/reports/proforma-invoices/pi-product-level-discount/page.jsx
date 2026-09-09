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
  { "key": "product", "label": "Product" },
  { "key": "sku", "label": "SKU" },
  { "key": "qty", "label": "Qty" },
  { "key": "sales", "label": "Sales" },
  { "key": "discount", "label": "Product Discount" },
  { "key": "gross_bill", "label": "Line Total" },
  { "key": "status", "label": "Status" }
];

export default function ProformaInvoicesPiProductLevelDiscountPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Proforma Invoices' },
        { label: 'PI Product Level Discount' },
      ]}
      title="PI Product Level Discount"
      description="Product-level discounts in PI"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
