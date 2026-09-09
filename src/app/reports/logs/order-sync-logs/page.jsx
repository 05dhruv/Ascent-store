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
    "key": "timestamp",
    "label": "Timestamp"
  },
  {
    "key": "user",
    "label": "User"
  },
  {
    "key": "action",
    "label": "Action"
  },
  {
    "key": "entity",
    "label": "Entity"
  },
  {
    "key": "details",
    "label": "Details"
  },
  {
    "key": "store",
    "label": "Store"
  }
];

export default function LogsOrderSyncLogsPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Logs' },
        { label: 'Order Sync Logs' },
      ]}
      title="Order Sync Logs"
      description="Order sync logs"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}