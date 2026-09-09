import SalesOrderSectionPage from '@/components/SalesOrderSectionPage';

const columns = [
  { key: 'id',                      label: 'ID' },
  { key: 'sales_order_id',          label: 'Sales Order ID' },
  { key: 'booking_id',              label: 'Booking ID' },
  { key: 'booking_date',            label: 'Booking Date' },
  { key: 'billing_username',        label: 'Billing Username' },
  { key: 'gross_bill',              label: 'Gross Bill' },
  { key: 'total_discount',          label: 'Total Discount' },
  { key: 'additional_charge_value', label: 'Additional Charge Value' },
  { key: 'tds_rate',                label: 'TDS Rate' },
  { key: 'tds_value',               label: 'TDS Value' },
  { key: 'tcs_rate',                label: 'TCS Rate' },
  { key: 'tcs_value',               label: 'TCS Value' },
  { key: 'status',                  label: 'Status' },
  { key: 'channel',                 label: 'Channel' },
];

export default function BulkSalesOrderPage() {
  return (
    <SalesOrderSectionPage
      view="bulk-sales-order"
      breadcrumbs={[
        { label: 'Sales Order', href: '/sales-order' },
        { label: 'Bulk Sales Order' },
      ]}
      title="Bulk Sales Order"
      description="List of Bulk Sales Order"
      columns={columns}
      bulkOperations={['Create Invoice', 'Write Off', 'Export']}
    />
  );
}