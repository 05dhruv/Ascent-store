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
    "key": "store",
    "label": "Store"
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
    "key": "orders",
    "label": "Orders"
  },
  {
    "key": "avg_order_value",
    "label": "Avg Order Value"
  }
];

export default function SalesIncomeHeadWiseSalesPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Sales' },
        { label: 'Income Head Wise Sales' },
      ]}
      title="Income Head Wise Sales"
      description="Sales by income head"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}