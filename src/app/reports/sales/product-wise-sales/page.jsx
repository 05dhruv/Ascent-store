import ReportsListPage from "@/components/ReportListPage";

const filters = [
  {
    key: "date_range",
    label: "Date Range",
    type: "date-range",
  },
  {
    key: "region",
    label: "Select Region",
    type: "select",
  },
  {
    key: "store",
    label: "Select Store",
    type: "select",
  },
  {
    key: "counter",
    label: "Counter",
    type: "text",
    placeholder: "All",
  },
  {
    key: "sales_type",
    label: "Sales Type",
    type: "select",
    options: [
      { value: "regular", label: "Regular" },
      { value: "all", label: "All" },
    ],
  },
  {
    key: "department",
    label: "Department",
    type: "text",
    placeholder: "All",
  },
  {
    key: "entity_type",
    label: "Entity Type",
    type: "select",
    options: [
      { value: "product", label: "Product" },
      { value: "all", label: "All" },
    ],
  },
];

const columns = [
  {
    key: "variant_id",
    label: "variantID",
  },
  {
    key: "product_id",
    label: "productID",
  },
  {
    key: "product_name",
    label: "productName",
  },
  {
    key: "brand",
    label: "Brand",
  },
  {
    key: "sold_in",
    label: "soldIn",
  },
  {
    key: "category_id",
    label: "categoryID",
  },
  {
    key: "category_name",
    label: "categoryName",
  },
  {
    key: "sub_category_id",
    label: "subCategoryID",
  },
  {
    key: "sub_category_name",
    label: "subCategoryName",
  },
  {
    key: "barcode",
    label: "Barcode",
  },
  {
    key: "sku",
    label: "SKU",
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
    key: "quantity",
    label: "Quantity",
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
    key: "orders",
    label: "Orders",
  },
  {
    key: "cost_amount",
    label: "Cost Amount",
  },
  {
    key: "margin_amount",
    label: "Margin Amount",
  },
  {
    key: "margin_percent",
    label: "Margin %",
  },
];

export default function SalesProductWiseSalesPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: "Reports Dashboard", href: "/reports" },
        { label: "Sales" },
        { label: "Product Wise Sales" },
      ]}
      title="Product Wise Sales"
      description="Product wise daily sale report for selected stores and timeframe."
      filters={filters}
      columns={columns}
      reportKey="sales/product-wise-sales"
      actionButtons={[]}
    />
  );
}
