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

export default function LogsSystemChangeLogsPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Logs' },
        { label: 'System Change Logs' },
      ]}
      title="System Change Logs"
      description="System-level change logs"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}