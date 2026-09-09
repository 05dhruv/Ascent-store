import MessageLogsPage from '@/components/MessageLogsPage';

const columns = [
  { key: 'storeId', label: 'Store ID' },
  { key: 'store', label: 'Store' },
  { key: 'orderId', label: 'Order ID' },
  { key: 'customerId', label: 'Customer ID' },
  { key: 'customerMobile', label: 'Mobile' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'messageType', label: 'Message Type' },
  { key: 'messageTypeName', label: 'Message Type Name' },
  { key: 'message', label: 'Message' },
  { key: 'creditsUsed', label: 'Credits Used' },
  { key: 'deliveryDate', label: 'Delivery Date' },
  { key: 'deliveryTime', label: 'Delivery Time' },
];

export default function WhatsappLogsPage() {
  return (
    <MessageLogsPage
      breadcrumbs={[
        { label: 'Customer', href: '/customer/dashboard' },
        { label: 'WhatsApp Logs' },
      ]}
      title="WhatsApp Logs"
      description="WhatsApp Logs description can be found here"
      apiBase="/api/customer-message-history"
      columns={columns}
      defaultMessageType="WhatsApp"
      showMessageTypeFilter={false}
    />
  );
}