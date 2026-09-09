import MessageLogsPage from '@/components/MessageLogsPage';

const columns = [
  { key: 'store', label: 'Store' },
  { key: 'orderId', label: 'Order ID' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'messageType', label: 'Message Type' },
  { key: 'message', label: 'Message' },
  { key: 'creditsUsed', label: 'Credits Used' },
  { key: 'deliveryDate', label: 'Date' },
  { key: 'deliveryTime', label: 'Time' },
];

export default function MessageHistoryPage() {
  return (
    <MessageLogsPage
      breadcrumbs={[
        { label: 'Customer', href: '/customer/dashboard' },
        { label: 'Message History' },
      ]}
      title="Message History"
      description="Customer message history"
      apiBase="/api/customer-message-history"
      columns={columns}
      defaultMessageType=""
      showMessageTypeFilter
    />
  );
}