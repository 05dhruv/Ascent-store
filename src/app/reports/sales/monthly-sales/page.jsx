import ReportsListPage from '@/components/ReportListPage';

const filters = [
  { key: 'date_range', label: 'Date Range', type: 'date-range' },
  { key: 'region', label: 'Select Region', type: 'text' },
  { key: 'store', label: 'Store', type: 'select' },
];

const columns = [
  { key: 'month', label: 'Month' },
  { key: 'store', label: 'Store' },
  { key: 'orders', label: 'Orders' },
  { key: 'sales', label: 'Sales' },
  { key: 'discount', label: 'Discount' },
  { key: 'net_bill', label: 'Net Bill' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'gross_bill', label: 'Gross Bill' },
  { key: 'avg_order_value', label: 'Avg Order Value' },
];

export default function MonthlySalesPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Sales' },
        { label: 'Monthly Sales' },
      ]}
      title="Monthly Sales"
      description="Month-wise sales summary"
      filters={filters}
      columns={columns}
      reportKey="sales/monthly-sales"
      actionButtons={[]}
    />
  );
}
