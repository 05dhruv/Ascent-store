import ReportListPage from '@/components/ReportListPage';

const filters = [
  {
    "key": "date_range",
    "label": "Date Range",
    "type": "daterange"
  },
  {
    "key": "region",
    "label": "Select Region",
    "type": "region"
  },
  {
    "key": "order_mode",
    "label": "Order Mode",
    "type": "select",
    "options": [
      "All",
      "Online",
      "Offline",
      "B2B"
    ]
  },
  {
    "key": "payment_status",
    "label": "Payment Status",
    "type": "select",
    "options": [
      "Select",
      "Paid",
      "Unpaid",
      "Partial"
    ]
  }
];

const columns = [
  {
    "key": "order_id",
    "label": "Order ID"
  },
  {
    "key": "store",
    "label": "Store"
  },
  {
    "key": "customer",
    "label": "Customer"
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
    "key": "gross_bill",
    "label": "Gross Bill"
  },
  {
    "key": "payment_status",
    "label": "Payment Status"
  }
];

export default function OrdersListPage() {
  return (
    <ReportListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Pinned' },
        { label: 'Orders List' },
      ]}
      title="Orders List"
      description="List of all orders for today"
      filters={filters}
      columns={columns}
      reportKey="orders/list-of-orders"
      actionButtons={[]}
    />
  );
}
