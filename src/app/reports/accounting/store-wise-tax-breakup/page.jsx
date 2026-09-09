import ReportsListPage from '@/components/ReportListPage';

const filters = [
  {
    "key": "date_range",
    "label": "Date Range",
    "type": "date-range"
  },
  {
    "key": "store",
    "label": "Select Store",
    "type": "select"
  }
];

const columns = [
  {
    "key": "store",
    "label": "Store"
  },
  {
    "key": "date",
    "label": "Date"
  },
  {
    "key": "orders",
    "label": "Orders"
  },
  {
    "key": "taxable_amount",
    "label": "Taxable Amount"
  },
  {
    "key": "cgst",
    "label": "CGST"
  },
  {
    "key": "sgst",
    "label": "SGST"
  },
  {
    "key": "taxes",
    "label": "Total Tax"
  },
  {
    "key": "gross_bill",
    "label": "Gross Bill"
  }
];

export default function AccountingStoreWiseTaxBreakupPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Accounting' },
        { label: 'Store Wise Tax Breakup' },
      ]}
      title="Store Wise Tax Breakup"
      description="Tax breakup by store location"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}
