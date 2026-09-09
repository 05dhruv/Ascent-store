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
    "key": "order_id",
    "label": "Order ID"
  },
  {
    "key": "sales_order_id",
    "label": "Sales Order ID"
  },
  {
    "key": "store",
    "label": "Store"
  },
  {
    "key": "invoice_number",
    "label": "Invoice Number"
  },
  {
    "key": "pi_number",
    "label": "PI Number"
  },
  {
    "key": "tin_number",
    "label": "TIN Number"
  },
  {
    "key": "customer_gst",
    "label": "Customer GST Number"
  },
  {
    "key": "order_mode",
    "label": "Order Mode"
  },
  {
    "key": "order_date",
    "label": "Order Date"
  },
  {
    "key": "order_time",
    "label": "Order Time"
  },
  {
    "key": "order_log_time",
    "label": "Order Log Time"
  },
  {
    "key": "sales",
    "label": "Sales"
  },
  {
    "key": "discount",
    "label": "(-) Discount"
  },
  {
    "key": "charges_product",
    "label": "(+) Charges (Product Level)"
  },
  {
    "key": "charges_order",
    "label": "(+) Charges (Order Level)"
  },
  {
    "key": "net_bill",
    "label": "(=) Net Bill"
  },
  {
    "key": "taxes_product",
    "label": "(+) Taxes (Product Level)"
  },
  {
    "key": "taxes_order",
    "label": "(+) Taxes (Order Level)"
  },
  {
    "key": "gross_bill",
    "label": "(=) Gross Bill"
  },
  {
    "key": "nc_amount",
    "label": "NC Amount"
  },
  {
    "key": "payment_status",
    "label": "Payment Status"
  },
  {
    "key": "paid_amount",
    "label": "Paid Amount"
  },
  {
    "key": "unpaid_amount",
    "label": "Unpaid Amount"
  },
  {
    "key": "voucher_amount",
    "label": "Voucher Amount"
  },
  {
    "key": "irn_number",
    "label": "IRN Number"
  },
  {
    "key": "irn_ack1",
    "label": "IRN Acknowledgement Date"
  },
  {
    "key": "irn_ack2",
    "label": "IRN Acknowledgement No"
  },
  {
    "key": "employee",
    "label": "Employee"
  },
  {
    "key": "invoiced_customer",
    "label": "Invoiced Customer Name"
  },
  {
    "key": "original_customer",
    "label": "Original Customer Name"
  },
  {
    "key": "customer_email",
    "label": "Customer Email"
  },
  {
    "key": "customer_pan",
    "label": "Customer PAN"
  },
  {
    "key": "loyalty_earned",
    "label": "Loyalty Points Earned"
  },
  {
    "key": "loyalty_redeemed",
    "label": "Loyalty Points Redeemed"
  },
  {
    "key": "loyalty_value",
    "label": "Loyalty Points Value"
  },
  {
    "key": "receipt_print",
    "label": "Receipt Print Count"
  },
  {
    "key": "device_id",
    "label": "Device ID"
  },
  {
    "key": "remarks",
    "label": "Remarks"
  },
  {
    "key": "quick_bill",
    "label": "Quick Bill"
  },
  {
    "key": "inv_customer_phone",
    "label": "Invoiced Customer Phone"
  },
  {
    "key": "orig_customer_phone",
    "label": "Original Customer Phone"
  },
  {
    "key": "payment_mode",
    "label": "Payment Mode"
  },
  {
    "key": "extra_remarks",
    "label": "Extra Remarks"
  },
  {
    "key": "action",
    "label": "Action"
  }
];

export default function OrdersOrderTransactionTrackerPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: 'Reports Dashboard', href: '/reports' },
        { label: 'Orders' },
        { label: 'Order Transaction Tracker' },
      ]}
      title="Order Transaction Tracker"
      description="Track order transactions"
      filters={filters}
      columns={columns}
      actionButtons={[]}
    />
  );
}