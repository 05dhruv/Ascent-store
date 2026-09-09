import ReportsListPage from "@/components/ReportListPage";

const filters = [
  {
    key: "date_range",
    label: "Date Range",
    type: "date-range",
  },
  {
    key: "store",
    label: "Select Store",
    type: "select",
  },
];

const columns = [
  {
    key: "store",
    label: "Store",
  },
  {
    key: "date",
    label: "Date",
  },
  {
    key: "sales",
    label: "Sales",
  },
  {
    key: "discount",
    label: "Discount",
  },
  {
    key: "net_bill",
    label: "Net Bill",
  },
  {
    key: "taxes",
    label: "Taxes",
  },
  {
    key: "gross_bill",
    label: "Gross Bill",
  },
  {
    key: "payment_mode",
    label: "Payment Breakup",
  },
  {
    key: "payment_amount",
    label: "Total Paid",
  },
  {
    key: "orders",
    label: "Orders",
  },
  {
    key: "avg_order_value",
    label: "Avg Order Value",
  },
  {
    key: "view",
    label: "View",
    type: "view-bills",
  },
];

const summaryCards = [
  { key: "gross_bill", label: "Total Sales" },
  { key: "orders", label: "Total Orders", type: "number" },
  { key: "discount", label: "Total Discount" },
  { key: "net_bill", label: "Net Sales" },
];

export default function SalesStoreWiseSalesPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: "Reports Dashboard", href: "/reports" },
        { label: "Sales" },
        { label: "Store Wise Sales" },
      ]}
      title="Store Wise Sales"
      description="Sales by store"
      filters={filters}
      columns={columns}
      reportKey="sales/store-wise-sales"
      summaryCards={summaryCards}
      actionButtons={[]}
    />
  );
}
