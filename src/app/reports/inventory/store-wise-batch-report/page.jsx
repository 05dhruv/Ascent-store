'use client';

import ReportsListPage from '@/components/ReportListPage';

const filters = [{ key: 'store', label: 'Location', type: 'select', options: [] }];
const columns = [
  { key: 'store', label: 'Location' }, { key: 'product', label: 'Material' },
  { key: 'sku', label: 'Material Code' }, { key: 'batch_no', label: 'Batch / Lot No.' },
  { key: 'mfg_date', label: 'MFG Date' }, { key: 'expiry_date', label: 'Expiry Date' },
  { key: 'received_qty', label: 'Received Qty' }, { key: 'available_qty', label: 'Available Qty' },
  { key: 'unit', label: 'Unit' }, { key: 'status', label: 'Status' }, { key: 'source_type', label: 'Source' },
];

export default function StoreWiseBatchReportPage() {
  return <ReportsListPage breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Inventory' }, { label: 'Batch & Lot Trace' }]} title="Batch & Lot Trace" description="Trace material lots, quantities and locations. Material rates are maintained in the material master." filters={filters} columns={columns} reportKey="inventory/store-wise-batch-report" stickyFilters totalLabel="Batch records" emptyMessage="No batch records found" />;
}
