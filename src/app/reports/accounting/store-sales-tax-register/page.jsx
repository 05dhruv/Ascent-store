import ReportsListPage from "@/components/ReportListPage";

const filters = [
  { key: "date_range", label: "Date Range", type: "date-range" },
  { key: "store", label: "Select Store", type: "select" },
];

const columns = [
  { key: "date", label: "Sale Date" },
  { key: "store", label: "Store" },
  { key: "product", label: "Product" },
  { key: "barcode", label: "Barcode" },
  { key: "sku", label: "SKU" },
  { key: "hsn_sac", label: "HSN/SAC" },
  { key: "bills", label: "Bills" },
  { key: "qty", label: "Qty Sold" },
  { key: "tax_slab", label: "Tax Slab" },
  { key: "taxable_amount", label: "Taxable Amount" },
  { key: "discount", label: "Discount" },
  { key: "taxes", label: "GST / Tax Amount" },
  { key: "gross_bill", label: "Gross Amount" },
];

export default function StoreSalesTaxRegisterPage() {
  return (
    <ReportsListPage
      breadcrumbs={[
        { label: "Reports Dashboard", href: "/reports" },
        { label: "Accounting" },
        { label: "Store Sales Tax Register" },
      ]}
      title="Store Sales Tax Register"
      description="Product-wise sales and tax-slab breakup by store, based on the tax applied at the time of sale."
      filters={filters}
      columns={columns}
      reportKey="accounting/store-sales-tax-register"
    />
  );
}
