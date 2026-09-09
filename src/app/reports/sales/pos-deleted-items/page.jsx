import ReportsListPage from "@/components/ReportListPage";

const filters = [
  {
    key: "date_range",
    label: "Date Range",
    type: "date-range",
  },
  {
    key: "store",
    label: "Store",
    type: "select",
  },
  {
    key: "product",
    label: "Product / Barcode / SKU",
    type: "text",
  },
];

const columns = [
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "store", label: "Store" },
  { key: "cashier", label: "Cashier" },
  { key: "product", label: "Product" },
  { key: "barcode", label: "Barcode" },
  { key: "sku", label: "SKU" },
  { key: "qty", label: "Qty" },
  { key: "selling_price", label: "Selling Price" },
  { key: "line_amount", label: "Line Amount" },
  { key: "event_type", label: "Event Type" },
  { key: "reason", label: "Reason" },
  { key: "bill_number", label: "Bill Number" },
];

export default function PosDeletedItemsReportPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: "Reports Dashboard", href: "/reports" },
        { label: "Sales" },
        { label: "POS Deleted Items" },
      ]}
      title="POS Deleted Items"
      description="Daily audit report for products removed from POS cart before billing."
      filters={filters}
      columns={columns}
      reportKey="sales/pos-deleted-items"
      emptyMessage="No deleted cart items found"
      actionButtons={[]}
    />
  );
}
