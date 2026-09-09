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
  {
    "key": "pi_number",
    "label": "PI Number"
  },
  {
    "key": "store",
    "label": "Store"
  },
  {
    "key": "customer",
    "label": "Customer"
  },
  {
    "key": "date",
    "label": "Date"
  },
  {
    "key": "sales",
    "label": "Sales"
  },
  {
    "key": "discount",
    "label": "Discount"
  },
  {
    "key": "net_bill",
    "label": "Net Bill"
  },
  {
    "key": "taxes",
    "label": "Taxes"
  },
  {
    "key": "gross_bill",
    "label": "Gross Bill"
  },
  {
    "key": "status",
    "label": "Status"
  }
];

export default function ProformaInvoicesListOfPiPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Proforma Invoices' },
        { label: 'List of PI' },
      ]}
      title="List of PI"
      description="All proforma invoices"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}