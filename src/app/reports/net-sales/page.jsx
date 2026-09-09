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
  },
  {
    "key": "store",
    "label": "Store",
    "type": "select",
    "options": [
      "All Stores"
    ]
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
    "key": "gross_sales",
    "label": "Gross Sales"
  },
  {
    "key": "discount",
    "label": "(-) Discount"
  },
  {
    "key": "taxes",
    "label": "(+) Taxes"
  },
  {
    "key": "net_sales",
    "label": "(=) Net Sales"
  },
  {
    "key": "orders",
    "label": "Orders"
  }
];

export default function NetSalesPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Pinned' },
        { label: 'Net Sales' },
      ]}
      title="Net Sales"
      description="Net sales today after tax and discount"
      filters={filters}
      columns={columns}
      reportKey="net-sales"
      actionButtons={[]}
    />
  );
}
