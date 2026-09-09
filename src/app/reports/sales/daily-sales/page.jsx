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
    key: "view_bills",
    label: "Bills",
    type: "view-bills",
  },
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
    key: "round_off",
    label: "Round Off",
  },
  {
    key: "gross_bill",
    label: "Gross Bill",
  },
  {
    key: "orders",
    label: "Orders",
  },
  {
    key: "avg_order_value",
    label: "Avg Order Value",
  },
];

const detailReports = [
  {
    key: "bills",
    title: "Every Bill",
    reportKey: "orders/list-of-orders",
    extraFilters: { sales_scope: "closed" },
    columns: [
      { key: "invoice_number", label: "Bill No" },
      { key: "store", label: "Store" },
      { key: "order_date", label: "Date" },
      { key: "order_time", label: "Time" },
      { key: "invoiced_customer", label: "Customer" },
      { key: "quantity", label: "Quantity" },
      { key: "category", label: "Category" },
      { key: "tax_slab", label: "Tax Slab" },
      { key: "sales", label: "Sales" },
      { key: "discount", label: "Discount" },
      { key: "net_bill", label: "Net Bill" },
      { key: "taxes_product", label: "Tax" },
      { key: "round_off", label: "Round Off" },
      { key: "gross_bill", label: "Gross Bill" },
      { key: "paid_amount", label: "Paid" },
      { key: "payment_mode", label: "Payment" },
      { key: "payment_status", label: "Status" },
    ],
  },
  {
    key: "products",
    title: "Product / Barcode Breakup",
    reportKey: "orders/product-in-orders",
    extraFilters: { sales_scope: "closed" },
    columns: [
      { key: "invoice_number", label: "Bill No" },
      { key: "store", label: "Store" },
      { key: "order_date", label: "Date" },
      { key: "order_time", label: "Time" },
      { key: "product", label: "Product" },
      { key: "barcode", label: "Barcode" },
      { key: "sku", label: "SKU" },
      { key: "qty", label: "Qty" },
      { key: "rate", label: "Rate" },
      { key: "sales", label: "Sales" },
      { key: "discount", label: "Discount" },
      { key: "net_bill", label: "Net Bill" },
      { key: "taxes", label: "Tax" },
      { key: "gross_bill", label: "Gross" },
    ],
  },
  {
    key: "taxes",
    title: "Product Wise Tax Breakup",
    reportKey: "accounting/product-wise-tax-breakup",
    columns: [
      { key: "product", label: "Product" },
      { key: "store", label: "Store" },
      { key: "date", label: "Date" },
      { key: "orders", label: "Bills" },
      { key: "taxable_amount", label: "Taxable" },
      { key: "cgst", label: "CGST" },
      { key: "sgst", label: "SGST" },
      { key: "taxes", label: "Tax" },
      { key: "gross_bill", label: "Gross" },
    ],
  },
];

export default function SalesDailySalesPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: "Reports Dashboard", href: "/reports" },
        { label: "Sales" },
        { label: "Daily Sales" },
      ]}
      title="Daily Sales"
      description="Daily sales summary (DSR)"
      filters={filters}
      columns={columns}
      detailReports={detailReports}
      reportKey="sales/daily-sales"
      actionButtons={[]}
    />
  );
}
