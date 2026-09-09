'use client';

import { useRouter } from 'next/navigation';
import SalesOrderSectionPage from '@/components/SalesOrderSectionPage';

const columns = [
  { key: 'id',           label: 'ID' },
  { key: 'billNumber',   label: 'Bill Number' },
  { key: 'customerName', label: 'Customer' },
  { key: 'billingUser',  label: 'Billing User' },
  { key: 'grandTotal',   label: 'Amount' },
  { key: 'paymentMode',  label: 'Mode' },
  { key: 'status',       label: 'Status' },
  { key: 'createdAt',    label: 'Date' },
];

export default function InvoiceSalesOrderPage() {
  const router = useRouter();

  const handleViewItem = (row) => {
    router.push(`/sales-order/invoice-sales-order/${encodeURIComponent(row.id)}`);
  };

  return (
    <SalesOrderSectionPage
      view="invoice-sales-order"
      breadcrumbs={[
        { label: 'Sales Order', href: '/sales-order' },
        { label: 'Invoice Sales Order' },
      ]}
      title="Invoice Sales Order"
      description="List of invoice sales orders"
      columns={columns}
      bulkOperations={['Export']}
      onViewItem={handleViewItem}
    />
  );
}
