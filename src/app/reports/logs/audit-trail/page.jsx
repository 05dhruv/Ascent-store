import ReportsListPage from '@/components/ReportListPage';

const filters = [
  { key: 'date_range', label: 'Date Range', type: 'date-range' },
];

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'employee', label: 'Employee' },
  { key: 'action', label: 'Action' },
  { key: 'resource_type', label: 'Resource Type' },
  { key: 'resource_id', label: 'Resource ID' },
  { key: 'status', label: 'Status' },
  { key: 'remarks', label: 'Remarks' },
];

export default function AuditTrailReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[{ label: 'Reports Dashboard', href: '/reports' }, { label: 'Logs' }, { label: 'Audit Trail' }]}
      title="Audit Trail"
      description="User and system activity history with export support."
      filters={filters}
      columns={columns}
    />
  );
}
