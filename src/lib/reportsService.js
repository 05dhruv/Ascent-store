import * as XLSX from "xlsx";
import { query } from "@/lib/db";
import { ensureSalesBillingSchema } from "@/lib/salesBillingSchema";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureStockOutSchema } from "@/lib/stockOutSchema";
import { ensureInvoiceSalesOrdersSchema } from "@/lib/invoiceSalesOrdersSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { ensureVendorsSchema } from "@/lib/vendorsSchema";
import { ensurePurchaseOrderSchema } from "@/lib/purchaseOrderSchema";
import { ensureStockRequisitionSchema } from "@/lib/stockRequisitionSchema";
import { ensureStockTransferSchema } from "@/lib/stockTransferSchema";
import { ensureAuditLogsSchema } from "@/lib/auditLogsSchema";
import { ensureProcurementSchema } from "@/lib/procurementSchema";
import { ensureVendorInvoicesSchema } from "@/lib/vendorInvoicesSchema";
import { ensurePosDeletedCartItemsSchema } from "@/lib/posDeletedCartItemsSchema";
import { ensureSalesReturnsSchema } from "@/lib/salesReturnsSchema";

const REPORT_ROLES = ["super_admin", "admin", "manager"];

const REPORTS = {
  "orders/list-of-orders": {
    title: "List Of Orders",
    worksheet: "Orders",
    columns: [
      { key: "order_id", label: "Order ID" },
      { key: "sales_order_id", label: "Sales Order ID" },
      { key: "store", label: "Store" },
      { key: "invoice_number", label: "Invoice Number" },
      { key: "order_mode", label: "Order Mode" },
      { key: "order_date", label: "Order Date" },
      { key: "order_time", label: "Order Time" },
      { key: "sales", label: "Sales" },
      { key: "discount", label: "(-) Discount" },
      { key: "net_bill", label: "(=) Net Bill" },
      { key: "taxes_product", label: "(+) Taxes (Product Level)" },
      { key: "gross_bill", label: "(=) Gross Bill" },
      { key: "payment_status", label: "Payment Status" },
      { key: "paid_amount", label: "Paid Amount" },
      { key: "unpaid_amount", label: "Unpaid Amount" },
      { key: "employee", label: "Employee" },
      { key: "invoiced_customer", label: "Invoiced Customer Name" },
      { key: "inv_customer_phone", label: "Invoiced Customer Phone" },
      { key: "quantity", label: "Quantity" },
      { key: "category", label: "Category" },
      { key: "tax_slab", label: "Tax Slab" },
      { key: "payment_mode", label: "Payment Mode" },
      { key: "remarks", label: "Remarks" },
    ],
  },
  "sales/daily-sales": {
    title: "Daily Sales",
    worksheet: "Daily Sales",
    columns: [
      { key: "store", label: "Store" },
      { key: "date", label: "Date" },
      { key: "sales", label: "Sales" },
      { key: "discount", label: "Discount" },
      { key: "net_bill", label: "Net Bill" },
      { key: "taxes", label: "Taxes" },
      { key: "round_off", label: "Round Off" },
      { key: "gross_bill", label: "Gross Bill" },
      { key: "orders", label: "Orders" },
      { key: "avg_order_value", label: "Avg Order Value" },
    ],
  },
  "sales/pos-deleted-items": {
    title: "POS Deleted Items",
    worksheet: "POS Deleted Items",
    columns: [
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
    ],
  },
  "sales/store-wise-sales": {
    title: "Store Wise Sales",
    worksheet: "Store Sales",
    columns: [
      { key: "store", label: "Store" },
      { key: "date", label: "Date" },
      { key: "sales", label: "Sales" },
      { key: "discount", label: "Discount" },
      { key: "net_bill", label: "Net Bill" },
      { key: "taxes", label: "Taxes" },
      { key: "round_off", label: "Round Off" },
      { key: "gross_bill", label: "Gross Bill" },
      { key: "payment_mode", label: "Payment Breakup" },
      { key: "payment_amount", label: "Total Paid" },
      { key: "orders", label: "Orders" },
      { key: "avg_order_value", label: "Avg Order Value" },
    ],
  },
  "sales/product-wise-sales": {
    title: "Product Wise Sales",
    worksheet: "Product Sales",
    columns: [
      { key: "variant_id", label: "variantID" },
      { key: "product_id", label: "productID" },
      { key: "product_name", label: "productName" },
      { key: "brand", label: "Brand" },
      { key: "sold_in", label: "soldIn" },
      { key: "category_id", label: "categoryID" },
      { key: "category_name", label: "categoryName" },
      { key: "sub_category_id", label: "subCategoryID" },
      { key: "sub_category_name", label: "subCategoryName" },
      { key: "barcode", label: "Barcode" },
      { key: "sku", label: "SKU" },
      { key: "store", label: "Store" },
      { key: "date", label: "Date" },
      { key: "quantity", label: "Quantity" },
      { key: "sales", label: "Sales" },
      { key: "discount", label: "Discount" },
      { key: "net_bill", label: "Net Bill" },
      { key: "taxes", label: "Taxes" },
      { key: "gross_bill", label: "Gross Bill" },
      { key: "orders", label: "Orders" },
      { key: "cost_amount", label: "Cost Amount" },
      { key: "margin_amount", label: "Margin Amount" },
      { key: "margin_percent", label: "Margin %" },
    ],
  },
  "daily-sales-dsr": {
    title: "Daily Sales (DSR)",
    worksheet: "DSR",
    columns: [
      { key: "store", label: "Store" },
      { key: "date", label: "Date" },
      { key: "orders", label: "Orders" },
      { key: "sales", label: "Sales" },
      { key: "discount", label: "Discount" },
      { key: "net_bill", label: "Net Bill" },
      { key: "taxes", label: "Taxes" },
      { key: "round_off", label: "Round Off" },
      { key: "gross_bill", label: "Gross Bill" },
    ],
  },
  "sales/monthly-sales": {
    title: "Monthly Sales",
    worksheet: "Monthly Sales",
    columns: [
      { key: "month", label: "Month" },
      { key: "store", label: "Store" },
      { key: "orders", label: "Orders" },
      { key: "sales", label: "Sales" },
      { key: "discount", label: "Discount" },
      { key: "net_bill", label: "Net Bill" },
      { key: "taxes", label: "Taxes" },
      { key: "round_off", label: "Round Off" },
      { key: "gross_bill", label: "Gross Bill" },
      { key: "avg_order_value", label: "Avg Order Value" },
    ],
  },
  "net-sales": {
    title: "Net Sales",
    worksheet: "Net Sales",
    columns: [
      { key: "store", label: "Store" },
      { key: "date", label: "Date" },
      { key: "gross_sales", label: "Gross Sales" },
      { key: "discount", label: "(-) Discount" },
      { key: "taxes", label: "(+) Taxes" },
      { key: "net_sales", label: "(=) Net Sales" },
      { key: "orders", label: "Orders" },
    ],
  },
  "accounting/store-sales-tax-register": {
    title: "Store Sales Tax Register",
    worksheet: "Sales Tax Register",
    columns: [
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
    ],
  },
  "inventory/stock-level": {
    title: "Stock Level",
    worksheet: "Stock Level",
    columns: [
      { key: "product", label: "Product" },
      { key: "barcode", label: "Barcode" },
      { key: "store", label: "Store" },
      { key: "stock_in", label: "Stock In" },
      { key: "stock_out", label: "Stock Out" },
      { key: "current_stock", label: "Current Stock" },
      { key: "cost_price", label: "Store Cost" },
      { key: "unit", label: "Unit" },
      { key: "selling_price", label: "Selling Price" },
      { key: "mrp", label: "MRP" },
      { key: "status", label: "Status" },
    ],
  },
  "inventory/stock-ledger-summary": {
    title: "Stock Ledger Summary",
    worksheet: "Stock Ledger Summary",
    columns: [
      { key: "ledger_id", label: "ID" },
      { key: "inventory_source_id", label: "Inventory Source ID" },
      { key: "inventory_source_type", label: "Inventory Source Type" },
      { key: "source_name", label: "Source Name" },
      { key: "user_name", label: "User Name" },
      { key: "transaction_party_id", label: "Transaction Party ID" },
      { key: "transaction_party_type", label: "Transaction Party Type" },
      { key: "transaction_party_name", label: "Transaction Party Name" },
      { key: "transaction_id", label: "Transaction ID" },
      { key: "transaction_type", label: "Transaction Type" },
      { key: "transaction_sub_type", label: "Transaction Sub Type" },
      { key: "trans_ref1", label: "Trans Ref1" },
      { key: "trans_ref2", label: "Trans Ref2" },
      { key: "audit_id", label: "Audit ID" },
      { key: "total_item_count", label: "Total Item Count" },
      { key: "total_item_quantity", label: "Total Item Quantity" },
      { key: "total_transaction_value", label: "Total Transaction Value" },
      { key: "transaction_user", label: "Transaction User" },
      { key: "transaction_time", label: "Transaction Time" },
      { key: "total_approved_quantity", label: "Total Approved Quantity" },
      { key: "total_approved_value", label: "Total Approved Value" },
      { key: "approval_status", label: "Approval Status" },
      { key: "approval_user", label: "Approval User" },
      { key: "approval_time", label: "Approval Time" },
      { key: "inventory_sync_status", label: "Inventory Sync Status" },
      { key: "inventory_sync_time", label: "Inventory Sync Time" },
      { key: "log_time", label: "Log Time" },
    ],
  },
  "inventory/store-wise-batch-report": {
    title: "Batch & Lot Trace",
    worksheet: "Batch Lot Trace",
    columns: [
      { key: "store", label: "Location" },
      { key: "product", label: "Material" },
      { key: "sku", label: "Material Code" },
      { key: "batch_no", label: "Batch / Lot No." },
      { key: "mfg_date", label: "MFG Date" },
      { key: "expiry_date", label: "Expiry Date" },
      { key: "received_qty", label: "Received Qty" },
      { key: "available_qty", label: "Available Qty" },
      { key: "unit", label: "Unit" },
      { key: "status", label: "Status" },
      { key: "source_type", label: "Source" },
    ],
  },
  "inventory/stock-level": {
    title: "Material Stock Level",
    worksheet: "Stock Level",
    columns: [
      { key: "product", label: "Material / Product" },
      { key: "barcode", label: "Barcode" },
      { key: "sku", label: "SKU / Code" },
      { key: "store", label: "Store / Site Location" },
      { key: "stock_in", label: "Stock In (+)" },
      { key: "stock_out", label: "Stock Out (-)" },
      { key: "current_stock", label: "Current Stock" },
      { key: "cost_price", label: "Store Cost" },
      { key: "unit", label: "Unit" },
      { key: "selling_price", label: "Selling Price" },
      { key: "mrp", label: "MRP" },
      { key: "status", label: "Status" },
    ],
  },
  "inventory/stock-movement": {
    title: "Material Movement",
    worksheet: "Material Movement",
    columns: [
      { key: "product", label: "Material / Product" },
      { key: "barcode", label: "Barcode" },
      { key: "sku", label: "SKU / Code" },
      { key: "store", label: "Store / Site Location" },
      { key: "opening_stock", label: "Opening Stock" },
      { key: "stock_in", label: "Stock In (+)" },
      { key: "stock_out", label: "Stock Out (-)" },
      { key: "current_stock", label: "Current Stock" },
      { key: "unit", label: "Unit" },
      { key: "status", label: "Status" },
    ],
  },
  "inventory/stock-movement-detail": {
    title: "Material Movement Detail",
    worksheet: "Movement Detail",
    columns: [
      { key: "product", label: "Material / Product" },
      { key: "barcode", label: "Barcode" },
      { key: "sku", label: "SKU / Code" },
      { key: "store", label: "Store / Site Location" },
      { key: "opening_stock", label: "Opening Stock" },
      { key: "stock_in", label: "Stock In (+)" },
      { key: "stock_out", label: "Stock Out (-)" },
      { key: "current_stock", label: "Current Stock" },
      { key: "unit", label: "Unit" },
      { key: "status", label: "Status" },
    ],
  },
  "inventory/stock-ledger-summary": {
    title: "Movement Ledger Summary",
    worksheet: "Stock Ledger",
    columns: [
      { key: "date", label: "Date" },
      { key: "time", label: "Time" },
      { key: "transaction_type", label: "Transaction Type" },
      { key: "source_name", label: "Source / Warehouse" },
      { key: "transaction_party_name", label: "Party / Destination" },
      { key: "product_name", label: "Material" },
      { key: "sku", label: "SKU" },
      { key: "barcode", label: "Barcode" },
      { key: "in_quantity", label: "In Qty" },
      { key: "out_quantity", label: "Out Qty" },
      { key: "rate", label: "Rate (₹)" },
      { key: "amount", label: "Amount (₹)" },
      { key: "user_name", label: "User / Creator" },
      { key: "reference_id", label: "Reference" },
    ],
  },
  "inventory/stock-requisition": {
    title: "Stock Requisition Report",
    worksheet: "Stock Requisition",
    columns: [
      { key: "requisition_id", label: "Requisition ID" },
      { key: "date", label: "Requisition Date" },
      { key: "destination", label: "Requesting Site / Store" },
      { key: "requested_by_name", label: "Requested By" },
      { key: "source", label: "Source Warehouse" },
      { key: "product", label: "Product / Material" },
      { key: "sku", label: "SKU" },
      { key: "unit", label: "Unit" },
      { key: "dimensions", label: "Dimensions" },
      { key: "requested_qty", label: "Requested Qty" },
      { key: "available_qty", label: "Warehouse Stock" },
      { key: "shortage_qty", label: "Shortage Qty" },
      { key: "fulfilled_qty", label: "Fulfilled Qty" },
      { key: "pending_qty", label: "Pending Qty" },
      { key: "shortage_status", label: "Shortage Status" },
      { key: "approval_status", label: "Approval Status" },
      { key: "approved_by_name", label: "Approved By" },
      { key: "approved_at", label: "Approved At" },
      { key: "purchase_order_id", label: "Linked PO No" },
      { key: "vendor_name", label: "Matched Vendor" },
      { key: "vendor_email", label: "Vendor Email" },
      { key: "po_emailed_at", label: "PO Emailed At" },
      { key: "fulfillment_status", label: "Fulfillment Status" },
    ],
  },
  "inventory/unfulfilled-stock-requests": {
    title: "Unfulfilled Stock Requests",
    worksheet: "Unfulfilled Requests",
    columns: [
      { key: "requisition_id", label: "Requisition ID" },
      { key: "date", label: "Date" },
      { key: "destination", label: "Requesting Site" },
      { key: "requested_by_name", label: "Requested By" },
      { key: "source", label: "Source Warehouse" },
      { key: "product", label: "Product" },
      { key: "unit", label: "Unit" },
      { key: "dimensions", label: "Dimensions" },
      { key: "requested_qty", label: "Requested Qty" },
      { key: "available_qty", label: "Warehouse Stock" },
      { key: "shortage_qty", label: "Shortage Qty" },
      { key: "fulfilled_qty", label: "Fulfilled Qty" },
      { key: "pending_qty", label: "Pending Qty" },
      { key: "shortage_status", label: "Shortage Status" },
      { key: "purchase_order_id", label: "PO No" },
      { key: "vendor_name", label: "Vendor" },
      { key: "vendor_email", label: "Vendor Email" },
      { key: "po_emailed_at", label: "PO Emailed At" },
      { key: "approval_status", label: "Approval Status" },
    ],
  },
  "inventory/stock-fulfillment": {
    title: "Stock Fulfillment Report",
    worksheet: "Stock Fulfillment",
    columns: [
      { key: "requisition_id", label: "Requisition ID" },
      { key: "date", label: "Date" },
      { key: "destination", label: "Destination Site" },
      { key: "source", label: "Source Warehouse" },
      { key: "product", label: "Product" },
      { key: "unit", label: "Unit" },
      { key: "requested_qty", label: "Requested Qty" },
      { key: "fulfilled_qty", label: "Fulfilled Qty" },
      { key: "pending_qty", label: "Pending Qty" },
      { key: "shortage_qty", label: "Shortage Qty" },
      { key: "fulfillment_status", label: "Status" },
      { key: "purchase_order_id", label: "Linked PO" },
      { key: "vendor_name", label: "Vendor" },
    ],
  },
  "stock-level": {
    title: "Stock Level",
    worksheet: "Stock Level",
    columns: [
      { key: "product", label: "Product" },
      { key: "barcode", label: "Barcode" },
      { key: "store", label: "Store" },
      { key: "stock_in", label: "Stock In" },
      { key: "stock_out", label: "Stock Out" },
      { key: "current_stock", label: "Current Stock" },
      { key: "cost_price", label: "Store Cost" },
      { key: "unit", label: "Unit" },
      { key: "selling_price", label: "Selling Price" },
      { key: "mrp", label: "MRP" },
      { key: "status", label: "Status" },
    ],
  },
  "purchase/vendor-quotation-comparison": {
    title: "Vendor Quotation Comparison",
    worksheet: "Vendor Quotes",
    columns: [
      { key: "quote_id", label: "Quote ID" },
      { key: "date", label: "Date" },
      { key: "vendor", label: "Vendor" },
      { key: "store", label: "Store" },
      { key: "items", label: "Items" },
      { key: "amount", label: "Amount" },
      { key: "freight", label: "Freight" },
      { key: "lead_days", label: "Lead Days" },
      { key: "score", label: "Score" },
      { key: "status", label: "Status" },
    ],
  },
  "purchase/purchase-return-report": {
    title: "Purchase Return Report",
    worksheet: "Purchase Returns",
    columns: [
      { key: "return_id", label: "Return ID" },
      { key: "date", label: "Date" },
      { key: "vendor", label: "Vendor" },
      { key: "store", label: "Store" },
      { key: "qty", label: "Qty" },
      { key: "amount", label: "Amount" },
      { key: "status", label: "Status" },
      { key: "reason", label: "Reason" },
    ],
  },
  "purchase/vendor-ledger-report": {
    title: "Vendor Ledger Report",
    worksheet: "Vendor Ledger",
    columns: [
      { key: "date", label: "Date" },
      { key: "vendor", label: "Vendor" },
      { key: "entry_type", label: "Type" },
      { key: "transaction_id", label: "Transaction" },
      { key: "reference_no", label: "Reference" },
      { key: "debit", label: "Debit" },
      { key: "credit", label: "Credit" },
      { key: "balance", label: "Balance" },
      { key: "remarks", label: "Remarks" },
    ],
  },
  "purchase/vendor-performance-report": {
    title: "Vendor Performance Report",
    worksheet: "Vendor Performance",
    columns: [
      { key: "vendor", label: "Vendor" },
      { key: "score", label: "Score" },
      { key: "grade", label: "Grade" },
      { key: "po_count", label: "POs" },
      { key: "purchase_value", label: "Purchase Value" },
      { key: "avg_lead_days", label: "Lead Days" },
      { key: "return_count", label: "Returns" },
      { key: "outstanding", label: "Outstanding" },
    ],
  },
  "purchase/auto-reorder-suggestions": {
    title: "Auto Reorder Suggestions",
    worksheet: "Auto Reorder",
    columns: [
      { key: "product", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "store", label: "Store" },
      { key: "current_stock", label: "Current Stock" },
      { key: "reorder_level", label: "Reorder Level" },
      { key: "suggested_qty", label: "Suggested Qty" },
      { key: "vendor", label: "Last Vendor" },
      { key: "cost", label: "Cost" },
    ],
  },
  "logs/audit-trail": {
    title: "Audit Trail",
    worksheet: "Audit Trail",
    columns: [
      { key: "date", label: "Date" },
      { key: "time", label: "Time" },
      { key: "employee", label: "Employee" },
      { key: "action", label: "Action" },
      { key: "resource_type", label: "Resource Type" },
      { key: "resource_id", label: "Resource ID" },
      { key: "status", label: "Status" },
      { key: "remarks", label: "Remarks" },
    ],
  },
};

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canAccessAllStoresForReports(user) {
  const assignedStores = (user?.assigned_stores || [])
    .map(Number)
    .filter(Number.isFinite);
  return (
    user?.role === "super_admin" &&
    assignedStores.length === 0 &&
    !user?.is_employee
  );
}

function addDashboardStoreScope({
  conditions,
  params,
  user,
  alias = "sb",
  column = "store_id",
}) {
  if (canAccessAllStoresForReports(user)) return;

  const assignedStores = (user?.assigned_stores || [])
    .map(Number)
    .filter(Number.isFinite);
  if (!assignedStores.length) {
    conditions.push("1 = 0");
    return;
  }

  params.push(assignedStores);
  conditions.push(`${alias}.${column} = ANY($${params.length}::int[])`);
}

function getStockDisplayUnit(unit) {
  const normalized = String(unit || "PCS")
    .trim()
    .toUpperCase();
  if (
    ["KG", "KGS", "KILOGRAM", "KILOGRAMS", "GRAM", "GRAMS", "GM", "G"].includes(
      normalized,
    )
  ) {
    return "GRAMS";
  }
  return normalized || "PCS";
}

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d))
    return false;
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

function stockDisplayQty(value, unit) {
  const normalized = String(unit || "PCS")
    .trim()
    .toUpperCase();
  const factor = ["KG", "KGS", "KILOGRAM", "KILOGRAMS"].includes(normalized)
    ? 1000
    : 1;
  const converted = number(value) * factor;
  return Number.isInteger(converted) ? converted : Number(converted.toFixed(3));
}

function isoDate(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (match) return match[1];
  }
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

function displayTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function businessDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const anchor = new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays),
  );
  return anchor.toISOString().slice(0, 10);
}

function formatPaymentMethod(method) {
  const value = String(method || "cash").trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Cash";
}

function paymentBreakupText(value, fallbackMode = "cash") {
  const rows = Array.isArray(value) ? value : [];
  const payments = rows
    .map((payment) => ({
      method: payment.method || payment.payment_mode || fallbackMode,
      amount: number(payment.amount),
    }))
    .filter((payment) => payment.amount > 0);
  if (!payments.length) return formatPaymentMethod(fallbackMode);
  if (payments.length === 1) return formatPaymentMethod(payments[0].method);
  return `Split: ${payments.map((payment) => `${formatPaymentMethod(payment.method)} ${money(payment.amount)}`).join(" + ")}`;
}

function paymentSummaryText(value) {
  const rows = Array.isArray(value) ? value : [];
  const payments = rows
    .map((payment) => ({
      method: payment.method || payment.payment_mode || "cash",
      amount: number(payment.amount),
    }))
    .filter((payment) => payment.amount > 0);
  if (!payments.length) return "Cash 0.00";
  return payments
    .map(
      (payment) =>
        `${formatPaymentMethod(payment.method)} ${money(payment.amount)}`,
    )
    .join(" + ");
}

function salesStatusCondition(filters, alias = "sb") {
  return filters.sales_scope === "closed"
    ? `${alias}.status IN ('paid', 'completed')`
    : `${alias}.status IN ('paid', 'completed', 'partial', 'pending')`;
}

function parseReportDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch)
    return isValidDateParts(isoMatch[1], isoMatch[2], isoMatch[3])
      ? trimmed
      : null;

  const indianMatch = trimmed.match(
    /^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2}|\d{4})$/,
  );
  if (indianMatch) {
    const year =
      indianMatch[3].length === 2 ? `20${indianMatch[3]}` : indianMatch[3];
    return isValidDateParts(year, indianMatch[2], indianMatch[1])
      ? `${year}-${indianMatch[2].padStart(2, "0")}-${indianMatch[1].padStart(2, "0")}`
      : null;
  }

  const displayMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (displayMatch) {
    const months = {
      jan: "01",
      january: "01",
      feb: "02",
      february: "02",
      mar: "03",
      march: "03",
      apr: "04",
      april: "04",
      may: "05",
      jun: "06",
      june: "06",
      jul: "07",
      july: "07",
      aug: "08",
      august: "08",
      sep: "09",
      sept: "09",
      september: "09",
      oct: "10",
      october: "10",
      nov: "11",
      november: "11",
      dec: "12",
      december: "12",
    };
    const month = months[displayMatch[2].toLowerCase()];
    if (month)
      return `${displayMatch[3]}-${month}-${displayMatch[1].padStart(2, "0")}`;
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
  return null;
}

function displayDate(value) {
  const normalized = parseReportDate(isoDate(value));
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function parseDateRange(value) {
  const today = businessDate();
  if (!value) return { from: today, to: today };
  const parts = String(value).split(/\s+-\s+/);
  const from = parseReportDate(parts[0]) || today;
  const to = parseReportDate(parts[1] || parts[0]) || from;
  return from <= to ? { from, to } : { from: to, to: from };
}

function addStoreScope({
  conditions,
  params,
  user,
  alias = "sb",
  requestedStoreId,
}) {
  const storeId = Number(requestedStoreId || 0) || null;
  const assignedStores = (user.assigned_stores || [])
    .map(Number)
    .filter(Number.isFinite);

  if (user.role === "super_admin") {
    if (storeId) {
      params.push(storeId);
      conditions.push(`${alias}.store_id = $${params.length}`);
    }
    return;
  }

  if (storeId && assignedStores.includes(storeId)) {
    params.push(storeId);
    conditions.push(`${alias}.store_id = $${params.length}`);
    return;
  }

  if (assignedStores.length > 0) {
    params.push(assignedStores);
    conditions.push(`${alias}.store_id = ANY($${params.length}::int[])`);
    return;
  }

  conditions.push("1 = 0");
}

function addSalesFilters({ conditions, params, filters, user, alias = "sb" }) {
  const range = parseDateRange(filters.date_range);
  params.push(range.from);
  conditions.push(
    `DATE(${alias}.created_at AT TIME ZONE 'Asia/Kolkata') >= $${params.length}`,
  );
  params.push(range.to);
  conditions.push(
    `DATE(${alias}.created_at AT TIME ZONE 'Asia/Kolkata') <= $${params.length}`,
  );
  addStoreScope({
    conditions,
    params,
    user,
    alias,
    requestedStoreId: filters.store,
  });

  if (filters.customer) {
    params.push(`%${String(filters.customer).trim()}%`);
    conditions.push(
      `(${alias}.customer_name ILIKE $${params.length} OR ${alias}.customer_mobile ILIKE $${params.length})`,
    );
  }

  if (
    filters.payment_type &&
    !["all", "select", "select..."].includes(
      String(filters.payment_type).toLowerCase(),
    )
  ) {
    params.push(String(filters.payment_type).toLowerCase());
    conditions.push(`(
      LOWER(${alias}.payment_mode) = $${params.length}
      OR EXISTS (
        SELECT 1 FROM sales_bill_payments filter_sbp
        WHERE filter_sbp.sales_bill_id = ${alias}.id
          AND LOWER(filter_sbp.method) = $${params.length}
      )
    )`);
  }

  if (
    filters.payment_status &&
    !["all", "select"].includes(String(filters.payment_status).toLowerCase())
  ) {
    params.push(String(filters.payment_status).toLowerCase());
    conditions.push(`LOWER(${alias}.status) = $${params.length}`);
  }
}

function addStoreColumnScope({
  conditions,
  params,
  user,
  columnName,
  requestedStoreId,
}) {
  const storeId = Number(requestedStoreId || 0) || null;
  const assignedStores = (user.assigned_stores || [])
    .map(Number)
    .filter(Number.isFinite);

  if (user.role === "super_admin") {
    if (storeId) {
      params.push(storeId);
      conditions.push(`${columnName} = $${params.length}`);
    }
    return;
  }

  if (storeId && assignedStores.includes(storeId)) {
    params.push(storeId);
    conditions.push(`${columnName} = $${params.length}`);
    return;
  }

  if (assignedStores.length > 0) {
    params.push(assignedStores);
    conditions.push(`${columnName} = ANY($${params.length}::int[])`);
    return;
  }

  conditions.push("1 = 0");
}

async function ensureReportSchemas() {
  await ensureStockInSchema();
  await ensureStockOutSchema();
  await ensureCatalogExtrasSchema();
  await ensureSalesBillingSchema();
  await ensureInvoiceSalesOrdersSchema();
  await ensureInventoryBatchSchema();
  await ensureVendorsSchema();
  await ensurePurchaseOrderSchema();
  await ensureStockRequisitionSchema();
  await ensureStockTransferSchema();
  await ensureAuditLogsSchema();
  await ensureProcurementSchema();
  await ensureVendorInvoicesSchema();
  await ensurePosDeletedCartItemsSchema();
  await ensureSalesReturnsSchema();
}

let stockLevelIndexesEnsured = false;

async function ensureStockLevelReportSchemas() {
  await ensureStockInSchema();
  await ensureStockOutSchema();
  await ensureCatalogExtrasSchema();
  await ensureSalesBillingSchema();
  await ensureInventoryBatchSchema();
  await ensureStockTransferSchema();

  if (stockLevelIndexesEnsured) return;
  await query(`
    CREATE INDEX IF NOT EXISTS idx_stock_level_stock_in_date
      ON stock_in(destination_id, (COALESCE(confirmed_at, created_at)), id DESC)
      WHERE status = 'confirmed';
    CREATE INDEX IF NOT EXISTS idx_stock_level_stock_in_items_product
      ON stock_in_items(stock_in_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_level_stock_out_date
      ON stock_out((COALESCE(source_id, destination_id)), (COALESCE(confirmed_at, created_at)), id DESC)
      WHERE status = 'confirmed' AND COALESCE(reference_type, '') <> 'sales_bill';
    CREATE INDEX IF NOT EXISTS idx_stock_level_stock_out_items_product
      ON stock_out_items(stock_out_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_level_sales_date
      ON sales_bills(store_id, created_at, id)
      WHERE status IN ('paid', 'completed');
    CREATE INDEX IF NOT EXISTS idx_stock_level_sales_items_product
      ON sales_bill_items(sales_bill_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_level_transfer_destination
      ON stock_transfer(destination_id, (COALESCE(confirmed_at, created_at)), id DESC)
      WHERE status = 'confirmed';
    CREATE INDEX IF NOT EXISTS idx_stock_level_transfer_items_product
      ON stock_transfer_items(stock_transfer_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_level_active_batches
      ON inventory_batches(store_id, product_id, created_at DESC, id DESC)
      WHERE status = 'active';
  `);
  stockLevelIndexesEnsured = true;
}

export function normalizeReportKey(slug) {
  if (Array.isArray(slug)) return slug.join("/");
  return String(slug || "").replace(/^\/+|\/+$/g, "");
}

export function canAccessReports(user) {
  return REPORT_ROLES.includes(user?.role);
}

export function getReportDefinition(reportKey) {
  return REPORTS[reportKey] || createGenericReportDefinition(reportKey);
}

function titleFromReportKey(reportKey) {
  return (
    normalizeReportKey(reportKey)
      .split("/")
      .pop()
      ?.split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Report"
  );
}

function createGenericReportDefinition(reportKey, columns = null) {
  const title = titleFromReportKey(reportKey);
  const defaultColumns = columns || [
    { key: "date", label: "Date" },
    { key: "store", label: "Store" },
    { key: "orders", label: "Orders" },
    { key: "items", label: "Items" },
    { key: "sales", label: "Sales" },
    { key: "discount", label: "Discount" },
    { key: "taxes", label: "Taxes" },
    { key: "gross_bill", label: "Gross Bill" },
    { key: "status", label: "Status" },
  ];
  return { title, worksheet: title.slice(0, 31), columns: defaultColumns };
}

export async function getStoresForUser(user) {
  if (user.role === "super_admin") {
    const res = await query("SELECT id, name FROM stores ORDER BY name ASC");
    return res.rows;
  }

  const assignedStores = (user.assigned_stores || [])
    .map(Number)
    .filter(Number.isFinite);
  if (!assignedStores.length) return [];
  const res = await query(
    "SELECT id, name FROM stores WHERE id = ANY($1::int[]) ORDER BY name ASC",
    [assignedStores],
  );
  return res.rows;
}

export async function getReportRows(reportKey, filters = {}, user) {
  const isStockLevelReport =
    reportKey === "inventory/stock-level" || reportKey === "stock-level";
  if (isStockLevelReport) await ensureStockLevelReportSchemas();
  else await ensureReportSchemas();

  if (reportKey === "orders/list-of-orders")
    return getOrdersReport(filters, user);
  if (reportKey === "sales/daily-sales")
    return getDailySalesReport(filters, user);
  if (reportKey === "sales/pos-deleted-items")
    return getPosDeletedItemsReport(filters, user);
  if (reportKey === "sales/store-wise-sales")
    return getStoreWiseSalesReport(filters, user);
  if (reportKey === "sales/monthly-sales")
    return getMonthlySalesReport(filters, user);
  if (reportKey === "daily-sales-dsr")
    return getDailySalesReport(filters, user);
  if (reportKey === "net-sales") return getNetSalesReport(filters, user);
  if (reportKey === "orders-list") return getOrdersReport(filters, user);
  if (reportKey === "inventory/stock-level")
    return getStockLevelReport(filters, user);
  if (reportKey === "inventory/store-wise-batch-report")
    return getStoreWiseBatchReport(filters, user);
  if (reportKey === "inventory/store-batch-price-audit")
    return getStoreBatchPriceAuditReport(filters, user);
  if (reportKey === "stock-level") return getStockLevelReport(filters, user);
  if (reportKey === "accounting/store-sales-tax-register")
    return getStoreSalesTaxRegister(filters, user);
  if (reportKey.startsWith("sales/"))
    return getSalesDimensionReport(reportKey, filters, user);
  if (reportKey.startsWith("orders/"))
    return getOrderFamilyReport(reportKey, filters, user);
  if (reportKey.startsWith("online-order/"))
    return getOnlineOrderReport(reportKey, filters, user);
  if (reportKey.startsWith("proforma-invoices/"))
    return getProformaInvoiceReport(reportKey, filters, user);
  if (reportKey.startsWith("accounting/"))
    return getAccountingTaxReport(reportKey, filters, user);
  if (reportKey.startsWith("inventory/"))
    return getInventoryFamilyReport(reportKey, filters, user);
  if (reportKey === "purchase/vendor-quotation-comparison")
    return getVendorQuotationReport(filters, user);
  if (reportKey === "purchase/purchase-return-report")
    return getPurchaseReturnReport(filters, user);
  if (reportKey === "purchase/vendor-ledger-report")
    return getVendorLedgerReport(filters, user);
  if (reportKey === "purchase/vendor-performance-report")
    return getVendorPerformanceReport(filters, user);
  if (reportKey === "purchase/auto-reorder-suggestions")
    return getAutoReorderReport(filters, user);
  if (reportKey.startsWith("purchase/"))
    return getPurchaseFamilyReport(reportKey, filters, user);
  if (reportKey.startsWith("promotions/"))
    return getPromotionsFamilyReport(reportKey, filters, user);
  if (reportKey.startsWith("insights/"))
    return getInsightsFamilyReport(reportKey, filters, user);
  if (reportKey.startsWith("logs/"))
    return getLogsFamilyReport(reportKey, filters, user);
  if (reportKey.startsWith("custom/"))
    return getDailySalesReport(filters, user);

  return [];
}

async function getOrdersReport(filters, user) {
  const params = [];
  const conditions = [salesStatusCondition(filters, "sb")];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });

  const res = await query(
    `SELECT
       sb.id,
       sb.bill_number,
       sb.created_at,
       sb.subtotal,
       sb.discount_total,
       sb.tax_total,
       sb.round_off,
       sb.grand_total,
       sb.paid_amount,
       sb.balance_amount,
       sb.status,
       sb.payment_mode,
       COALESCE(payments.payments, '[]'::jsonb) AS payments,
       COALESCE(items.quantity, 0) AS quantity,
       COALESCE(items.products, '') AS products,
       COALESCE(items.barcodes, '') AS barcodes,
       COALESCE(items.category, '') AS category,
       COALESCE(items.tax_slabs, '') AS tax_slabs,
       sb.customer_name,
       sb.customer_mobile,
       sb.remarks,
       sb.store_id,
       s.name AS store_name,
       u.name AS employee_name
     FROM sales_bills sb
     LEFT JOIN stores s ON s.id = sb.store_id
     LEFT JOIN users u ON u.id = sb.user_id
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object('method', sbp.method, 'amount', sbp.amount, 'referenceNo', sbp.reference_no) ORDER BY sbp.id) AS payments
       FROM sales_bill_payments sbp
       WHERE sbp.sales_bill_id = sb.id
     ) payments ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         COALESCE(SUM(sbi.qty), 0) AS quantity,
         STRING_AGG(DISTINCT COALESCE(p.name, sbi.product_name, 'Product'), ', ' ORDER BY COALESCE(p.name, sbi.product_name, 'Product'))
           FILTER (WHERE COALESCE(p.name, sbi.product_name, '') <> '') AS products,
         STRING_AGG(DISTINCT COALESCE(p.barcode, sbi.barcode, ''), ', ' ORDER BY COALESCE(p.barcode, sbi.barcode, ''))
           FILTER (WHERE COALESCE(p.barcode, sbi.barcode, '') <> '') AS barcodes,
         STRING_AGG(
           DISTINCT COALESCE(NULLIF(c.name, ''), 'Uncategorised'),
           ', ' ORDER BY COALESCE(NULLIF(c.name, ''), 'Uncategorised')
         ) AS category,
         STRING_AGG(
           DISTINCT CONCAT(
             CASE WHEN COALESCE(NULLIF(TRIM(sbi.tax_name), ''), '') <> ''
               THEN TRIM(sbi.tax_name) || ' '
               ELSE ''
             END,
             COALESCE(NULLIF(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM COALESCE(sbi.tax_rate, 0)::text)), ''), '0'),
             '%'
           ),
           ', ' ORDER BY CONCAT(
             CASE WHEN COALESCE(NULLIF(TRIM(sbi.tax_name), ''), '') <> ''
               THEN TRIM(sbi.tax_name) || ' '
               ELSE ''
             END,
             COALESCE(NULLIF(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM COALESCE(sbi.tax_rate, 0)::text)), ''), '0'),
             '%'
           )
         ) AS tax_slabs
       FROM sales_bill_items sbi
       LEFT JOIN products p ON p.id = sbi.product_id
       LEFT JOIN LATERAL (
         SELECT p2.category_id
         FROM products p2
         WHERE p.category_id IS NULL
           AND p2.category_id IS NOT NULL
           AND (
             (COALESCE(sbi.barcode, '') <> '' AND p2.barcode = sbi.barcode)
             OR (COALESCE(sbi.sku, '') <> '' AND p2.sku = sbi.sku)
             OR (COALESCE(sbi.product_name, '') <> '' AND LOWER(p2.name) = LOWER(sbi.product_name))
           )
         ORDER BY CASE
           WHEN COALESCE(sbi.barcode, '') <> '' AND p2.barcode = sbi.barcode THEN 1
           WHEN COALESCE(sbi.sku, '') <> '' AND p2.sku = sbi.sku THEN 2
           ELSE 3
         END, p2.id
         LIMIT 1
       ) category_fallback ON TRUE
       LEFT JOIN categories c ON c.id = COALESCE(p.category_id, category_fallback.category_id)
       WHERE sbi.sales_bill_id = sb.id
     ) items ON TRUE
     WHERE ${conditions.join(" AND ")}
     ORDER BY sb.created_at DESC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row) => ({
    id: `bill-${row.id}`,
    order_id: row.id,
    store_id: row.store_id,
    sales_order_id: row.bill_number,
    store: row.store_name || "Store",
    customer: row.customer_name || "Walk-in Customer",
    invoice_number: row.bill_number,
    order_mode: "POS",
    date: isoDate(row.created_at),
    order_date: isoDate(row.created_at),
    order_time: displayTime(row.created_at),
    order_log_time: displayTime(row.created_at),
    sales: money(
      number(row.grand_total) -
        number(row.tax_total) -
        number(row.round_off) +
        number(row.discount_total),
    ),
    discount: money(row.discount_total),
    net_bill: money(
      number(row.grand_total) - number(row.tax_total) - number(row.round_off),
    ),
    taxes_product: money(row.tax_total),
    taxes_order: "0.00",
    round_off: money(row.round_off),
    gross_bill: money(row.grand_total),
    payment_status: row.status,
    paid_amount: money(row.paid_amount),
    unpaid_amount: money(row.balance_amount),
    employee: row.employee_name || "",
    invoiced_customer: row.customer_name || "Walk-in Customer",
    original_customer: row.customer_name || "Walk-in Customer",
    inv_customer_phone: row.customer_mobile || "",
    orig_customer_phone: row.customer_mobile || "",
    quantity: number(row.quantity),
    product: row.products || "",
    product_name: row.products || "",
    barcode: row.barcodes || "",
    category: row.category || "",
    tax_slab: row.tax_slabs || "",
    payment_mode: paymentBreakupText(row.payments, row.payment_mode),
    remarks: row.remarks || "",
  }));
}

async function getDailySalesReport(filters, user) {
  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });

  const res = await query(
    `SELECT
       COALESCE(s.name, 'Store') AS store,
       sb.store_id,
       DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS date,
       COUNT(*)::int AS orders,
       COALESCE(SUM(sb.discount_total), 0) AS discount,
       COALESCE(SUM(sb.tax_total), 0) AS taxes,
       COALESCE(SUM(sb.round_off), 0) AS round_off,
       COALESCE(SUM(sb.grand_total - sb.tax_total - sb.round_off), 0) AS net_bill,
       COALESCE(SUM(sb.grand_total - sb.tax_total - sb.round_off + sb.discount_total), 0) AS sales,
       COALESCE(SUM(sb.grand_total), 0) AS gross_bill
     FROM sales_bills sb
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY s.name, sb.store_id, DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata')
     ORDER BY DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') DESC, s.name ASC`,
    params,
  );

  return res.rows.map((row, index) => ({
    id: `daily-${index}`,
    store_id: row.store_id,
    store: row.store,
    date: isoDate(row.date),
    sales: money(row.sales),
    discount: money(row.discount),
    net_bill: money(row.net_bill),
    taxes: money(row.taxes),
    round_off: money(row.round_off),
    gross_bill: money(row.gross_bill),
    orders: row.orders,
    avg_order_value: money(
      number(row.gross_bill) / Math.max(1, number(row.orders)),
    ),
  }));
}

async function getPosDeletedItemsReport(filters, user) {
  const params = [];
  const conditions = ["1 = 1"];
  addSalesFilters({ conditions, params, filters, user, alias: "d" });

  const productSearch = String(filters.product || "").trim();
  if (productSearch) {
    params.push(`%${productSearch}%`);
    conditions.push(`(
      d.product_name ILIKE $${params.length}
      OR COALESCE(d.barcode, '') ILIKE $${params.length}
      OR COALESCE(d.sku, '') ILIKE $${params.length}
    )`);
  }

  const res = await query(
    `SELECT
       d.id,
       d.created_at,
       d.user_name,
       d.product_name,
       d.barcode,
       d.sku,
       d.qty,
       d.selling_price,
       d.line_amount,
       d.event_type,
       d.reason,
       d.bill_number,
       COALESCE(s.name, 'Store') AS store_name
     FROM pos_deleted_cart_items d
     LEFT JOIN stores s ON s.id = d.store_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY d.created_at DESC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row) => ({
    id: `pos-deleted-${row.id}`,
    date: isoDate(row.created_at),
    time: displayTime(row.created_at),
    store: row.store_name,
    cashier: row.user_name || "",
    product: row.product_name || "Product",
    barcode: row.barcode || "",
    sku: row.sku || "",
    qty: number(row.qty),
    selling_price: money(row.selling_price),
    line_amount: money(row.line_amount),
    event_type:
      row.event_type === "cart_cleared" ? "Cart Cleared" : "Item Removed",
    reason: row.reason || "",
    bill_number: row.bill_number || "",
  }));
}

async function getStoreWiseSalesReport(filters, user) {
  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });

  const res = await query(
    `WITH scoped_bills AS (
       SELECT
         sb.id,
         sb.store_id,
         COALESCE(s.name, 'Store') AS store,
         DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS date,
         sb.subtotal,
         sb.discount_total,
         sb.tax_total,
         sb.round_off,
         sb.grand_total,
         sb.payment_mode
       FROM sales_bills sb
       LEFT JOIN stores s ON s.id = sb.store_id
       WHERE ${conditions.join(" AND ")}
     ),
     store_totals AS (
       SELECT
         store,
         store_id,
         date,
         COUNT(*)::int AS orders,
         COALESCE(SUM(discount_total), 0) AS discount,
         COALESCE(SUM(tax_total), 0) AS taxes,
         COALESCE(SUM(round_off), 0) AS round_off,
         COALESCE(SUM(grand_total - tax_total - round_off), 0) AS net_bill,
         COALESCE(SUM(grand_total - tax_total - round_off + discount_total), 0) AS sales,
         COALESCE(SUM(grand_total), 0) AS gross_bill
       FROM scoped_bills
       GROUP BY store, store_id, date
     ),
     payment_totals AS (
       SELECT
         scoped_bills.store,
         scoped_bills.store_id,
         scoped_bills.date,
         COALESCE(NULLIF(sbp.method, ''), NULLIF(scoped_bills.payment_mode, ''), 'cash') AS payment_mode,
         COUNT(DISTINCT scoped_bills.id)::int AS payment_orders,
         COALESCE(SUM(COALESCE(sbp.amount, scoped_bills.grand_total)), 0) AS payment_amount
       FROM scoped_bills
       LEFT JOIN sales_bill_payments sbp ON sbp.sales_bill_id = scoped_bills.id
       GROUP BY scoped_bills.store, scoped_bills.store_id, scoped_bills.date, COALESCE(NULLIF(sbp.method, ''), NULLIF(scoped_bills.payment_mode, ''), 'cash')
     ),
     payment_summary AS (
       SELECT
         store_id,
         date,
         JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'method', payment_mode,
             'amount', payment_amount,
             'orders', payment_orders
           )
           ORDER BY payment_mode
         ) AS payment_breakup,
         COALESCE(SUM(payment_amount), 0) AS payment_amount
       FROM payment_totals
       GROUP BY store_id, date
     )
     SELECT
       store_totals.store_id,
       store_totals.store,
       store_totals.date,
       store_totals.orders,
       store_totals.sales,
       store_totals.discount,
       store_totals.net_bill,
       store_totals.taxes,
       store_totals.round_off,
       store_totals.gross_bill,
       payment_summary.payment_breakup,
       payment_summary.payment_amount
     FROM store_totals
     LEFT JOIN payment_summary
       ON payment_summary.store_id = store_totals.store_id
      AND payment_summary.date = store_totals.date
     ORDER BY store_totals.date DESC, store_totals.store ASC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row, index) => {
    return {
      id: `store-sales-${index}`,
      store_id: row.store_id,
      store: row.store,
      date: displayDate(row.date),
      sales: money(row.sales),
      discount: money(row.discount),
      net_bill: money(row.net_bill),
      taxes: money(row.taxes),
      round_off: money(row.round_off),
      gross_bill: money(row.gross_bill),
      payment_mode: paymentSummaryText(row.payment_breakup),
      payment_amount: money(row.payment_amount),
      orders: row.orders,
      avg_order_value: money(
        number(row.gross_bill) / Math.max(1, number(row.orders)),
      ),
    };
  });
}

async function getNetSalesReport(filters, user) {
  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });

  const res = await query(
    `SELECT
       COALESCE(s.name, 'Store') AS store,
       DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS date,
       COUNT(*)::int AS orders,
       COALESCE(SUM(sb.subtotal), 0) AS gross_sales,
       COALESCE(SUM(sb.discount_total), 0) AS discount,
       COALESCE(SUM(sb.tax_total), 0) AS taxes,
       COALESCE(SUM(sb.grand_total), 0) AS net_sales
     FROM sales_bills sb
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY s.name, DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata')
     ORDER BY DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') DESC, s.name ASC`,
    params,
  );

  return res.rows.map((row, index) => ({
    id: `net-${index}`,
    store: row.store,
    date: isoDate(row.date),
    gross_sales: money(row.gross_sales),
    discount: money(row.discount),
    taxes: money(row.taxes),
    net_sales: money(row.net_sales),
    orders: row.orders,
  }));
}

async function getMonthlySalesReport(filters, user) {
  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });

  const res = await query(
    `SELECT
       COALESCE(s.name, 'Store') AS store,
       DATE_TRUNC('month', sb.created_at AT TIME ZONE 'Asia/Kolkata')::date AS month_date,
       TO_CHAR(DATE_TRUNC('month', sb.created_at AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY') AS month,
       COUNT(*)::int AS orders,
       COALESCE(SUM(sb.discount_total), 0) AS discount,
       COALESCE(SUM(sb.tax_total), 0) AS taxes,
       COALESCE(SUM(sb.round_off), 0) AS round_off,
       COALESCE(SUM(sb.grand_total - sb.tax_total - sb.round_off), 0) AS net_bill,
       COALESCE(SUM(sb.grand_total - sb.tax_total - sb.round_off + sb.discount_total), 0) AS sales,
       COALESCE(SUM(sb.grand_total), 0) AS gross_bill
     FROM sales_bills sb
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY s.name, DATE_TRUNC('month', sb.created_at AT TIME ZONE 'Asia/Kolkata')
     ORDER BY month_date DESC, s.name ASC`,
    params,
  );

  return res.rows.map((row, index) => ({
    id: `monthly-${index}`,
    month: row.month,
    date: isoDate(row.month_date),
    store: row.store,
    sales: money(row.sales),
    discount: money(row.discount),
    net_bill: money(row.net_bill),
    taxes: money(row.taxes),
    round_off: money(row.round_off),
    gross_bill: money(row.gross_bill),
    orders: row.orders,
    avg_order_value: money(
      number(row.gross_bill) / Math.max(1, number(row.orders)),
    ),
  }));
}

async function getStockLevelReport(filters, user) {
  const range = parseDateRange(filters.date_range);
  const fromDate = range.from;
  const toDate = range.to;

  const params = [];
  const conditions = ["COALESCE(p.is_active, TRUE) = TRUE"];

  // Store scope on outer product_saleability — sub-queries reference ps.store_id
  addStoreScope({
    conditions,
    params,
    user,
    alias: "ps",
    requestedStoreId: filters.store,
  });
  const storeOnlyInventory =
    user.permissions?.includes("VIEW_STORE_PRODUCT_INVENTORY") &&
    !user.permissions?.some((permission) =>
      ["VIEW_STORE_REPORTS", "VIEW_FINANCIAL_REPORTS", "*"].includes(
        permission,
      ),
    );
  if (storeOnlyInventory)
    conditions.push(
      "LOWER(COALESCE(s.meta->>'locationType', 'Store')) = 'store'",
    );

  if (filters.product && String(filters.product).trim()) {
    params.push(`%${String(filters.product).trim()}%`);
    conditions.push(
      `(p.name ILIKE $${params.length} OR COALESCE(p.sku,'') ILIKE $${params.length} OR COALESCE(p.barcode,'') ILIKE $${params.length})`,
    );
  }

  // Date params — sub-queries share these positional params
  params.push(fromDate);
  const pFrom = params.length;
  params.push(toDate);
  const pTo = params.length;

  const res = await query(
    `WITH pair_sources AS (
       SELECT product_id, store_id FROM product_saleability
       UNION ALL
       SELECT product_id, store_id FROM inventory_batches
       UNION ALL
       SELECT sii.product_id, si.destination_id AS store_id
       FROM stock_in_items sii
       JOIN stock_in si ON si.id = sii.stock_in_id
       WHERE si.status = 'confirmed'
       UNION ALL
       SELECT sti.product_id, st.destination_id AS store_id
       FROM stock_transfer_items sti
       JOIN stock_transfer st ON st.id = sti.stock_transfer_id
       WHERE st.status = 'confirmed'
     ),
     eligible_pairs AS (
       SELECT DISTINCT ps.product_id, ps.store_id
       FROM pair_sources ps
       INNER JOIN products p ON p.id = ps.product_id
       LEFT JOIN stores s ON s.id = ps.store_id
       WHERE ${conditions.join(" AND ")}
     ),
     batch_totals AS (
       SELECT ib.product_id, ib.store_id, SUM(ib.available_qty) AS current_stock
       FROM inventory_batches ib
       JOIN eligible_pairs ep ON ep.product_id = ib.product_id AND ep.store_id = ib.store_id
       WHERE ib.status = 'active'
       GROUP BY ib.product_id, ib.store_id
     ),
     stock_in_range AS (
       SELECT in_union.product_id, in_union.store_id, SUM(in_union.qty) AS qty
       FROM (
         SELECT sii.product_id, si.destination_id AS store_id, sii.qty
         FROM stock_in_items sii
         JOIN stock_in si ON si.id = sii.stock_in_id
         WHERE si.status = 'confirmed'
           AND COALESCE(si.confirmed_at, si.created_at) >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
           AND COALESCE(si.confirmed_at, si.created_at) < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
         UNION ALL
         SELECT sti.product_id, st.destination_id AS store_id, COALESCE(NULLIF(sti.accepted_qty, 0), NULLIF(sti.received_qty, 0), sti.qty) AS qty
         FROM stock_transfer_items sti
         JOIN stock_transfer st ON st.id = sti.stock_transfer_id
         WHERE st.status IN ('confirmed', 'completed', 'received', 'partially_received')
           AND COALESCE(st.received_at, st.confirmed_at, st.created_at) >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
           AND COALESCE(st.received_at, st.confirmed_at, st.created_at) < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       ) in_union
       JOIN eligible_pairs ep ON ep.product_id = in_union.product_id AND ep.store_id = in_union.store_id
       GROUP BY in_union.product_id, in_union.store_id
     ),
     manual_stock_out_range AS (
       SELECT soi.product_id, COALESCE(so.source_id, so.destination_id) AS store_id, SUM(soi.qty) AS qty
       FROM stock_out_items soi
       JOIN stock_out so ON so.id = soi.stock_out_id
       JOIN eligible_pairs ep ON ep.product_id = soi.product_id AND ep.store_id = COALESCE(so.source_id, so.destination_id)
       WHERE so.status = 'confirmed'
         AND COALESCE(so.reference_type, '') <> 'sales_bill'
         AND COALESCE(so.confirmed_at, so.created_at) >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND COALESCE(so.confirmed_at, so.created_at) < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY soi.product_id, COALESCE(so.source_id, so.destination_id)
     ),
     sales_out_range AS (
       SELECT sbi.product_id, sb.store_id, SUM(sbi.qty) AS qty
       FROM sales_bill_items sbi
       JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
       JOIN eligible_pairs ep ON ep.product_id = sbi.product_id AND ep.store_id = sb.store_id
       WHERE sb.status IN ('paid', 'completed')
         AND sb.created_at >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND sb.created_at < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY sbi.product_id, sb.store_id
     ),
     transfer_out_range AS (
       SELECT sti.product_id, st.source_id AS store_id, SUM(COALESCE(NULLIF(sti.dispatched_qty, 0), sti.qty)) AS qty
       FROM stock_transfer_items sti
       JOIN stock_transfer st ON st.id = sti.stock_transfer_id
       JOIN eligible_pairs ep ON ep.product_id = sti.product_id AND ep.store_id = st.source_id
       WHERE st.status IN ('confirmed', 'completed', 'dispatched', 'in_transit', 'received', 'partially_received')
         AND COALESCE(st.dispatched_at, st.confirmed_at, st.created_at) >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND COALESCE(st.dispatched_at, st.confirmed_at, st.created_at) < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY sti.product_id, st.source_id
     ),
     latest_stock_in_mrp AS (
       SELECT DISTINCT ON (sii.product_id, si.destination_id)
         sii.product_id, si.destination_id AS store_id, sii.mrp
       FROM stock_in_items sii
       JOIN stock_in si ON si.id = sii.stock_in_id
       JOIN eligible_pairs ep ON ep.product_id = sii.product_id AND ep.store_id = si.destination_id
       WHERE si.status = 'confirmed' AND COALESCE(sii.mrp, 0) > 0
       ORDER BY sii.product_id, si.destination_id, COALESCE(si.confirmed_at, si.created_at) DESC, sii.id DESC
     ),
     latest_stock_in_cost AS (
       SELECT DISTINCT ON (sii.product_id, si.destination_id)
         sii.product_id, si.destination_id AS store_id, sii.cost_price
       FROM stock_in_items sii
       JOIN stock_in si ON si.id = sii.stock_in_id
       JOIN eligible_pairs ep ON ep.product_id = sii.product_id AND ep.store_id = si.destination_id
       WHERE si.status = 'confirmed' AND COALESCE(sii.cost_price, 0) > 0
       ORDER BY sii.product_id, si.destination_id, COALESCE(si.confirmed_at, si.created_at) DESC, sii.id DESC
     ),
     latest_transfer_mrp AS (
       SELECT DISTINCT ON (sti.product_id, st.destination_id)
         sti.product_id, st.destination_id AS store_id,
         COALESCE(NULLIF(sti.destination_mrp, 0), NULLIF(sti.mrp, 0)) AS mrp
       FROM stock_transfer_items sti
       JOIN stock_transfer st ON st.id = sti.stock_transfer_id
       JOIN eligible_pairs ep ON ep.product_id = sti.product_id AND ep.store_id = st.destination_id
       WHERE st.status = 'confirmed'
         AND COALESCE(NULLIF(sti.destination_mrp, 0), NULLIF(sti.mrp, 0), 0) > 0
       ORDER BY sti.product_id, st.destination_id, COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
     ),
     latest_transfer_cost AS (
       SELECT DISTINCT ON (sti.product_id, st.destination_id)
         sti.product_id, st.destination_id AS store_id, sti.cost_price
       FROM stock_transfer_items sti
       JOIN stock_transfer st ON st.id = sti.stock_transfer_id
       JOIN eligible_pairs ep ON ep.product_id = sti.product_id AND ep.store_id = st.destination_id
       WHERE st.status = 'confirmed' AND COALESCE(sti.cost_price, 0) > 0
       ORDER BY sti.product_id, st.destination_id, COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
     ),
     latest_batch_cost AS (
       SELECT DISTINCT ON (ib.product_id, ib.store_id)
         ib.product_id, ib.store_id, ib.cost_price
       FROM inventory_batches ib
       JOIN eligible_pairs ep ON ep.product_id = ib.product_id AND ep.store_id = ib.store_id
       WHERE ib.status = 'active'
       ORDER BY ib.product_id, ib.store_id, ib.created_at DESC, ib.id DESC
     )
     SELECT
       p.id,
       p.name  AS product,
       p.sku,
       p.barcode,
       p.unit,
       COALESCE(s.name, 'Unknown Store') AS store,
       COALESCE(sale.low_stock_value, 0) AS low_stock_value,
       COALESCE(NULLIF(sale.selling_price, 0), p.selling_price, 0) AS store_selling_price,
       COALESCE(NULLIF(CASE
         WHEN LOWER(COALESCE(s.meta->>'locationType', 'Warehouse')) = 'warehouse' THEN lsim.mrp
         ELSE ltm.mrp
       END, 0), NULLIF(sale.mrp, 0), p.mrp, 0) AS store_mrp,
       COALESCE(NULLIF(CASE
         WHEN LOWER(COALESCE(s.meta->>'locationType', 'Warehouse')) = 'warehouse' THEN lsic.cost_price
         ELSE ltc.cost_price
       END, 0), lbc.cost_price, p.cost_price, 0) AS store_cost_price,
       COALESCE(bt.current_stock, 0) AS current_stock,
       COALESCE(sir.qty, 0) AS stock_in,
       COALESCE(msor.qty, 0) + COALESCE(sor.qty, 0) + COALESCE(tor.qty, 0) AS stock_out

     FROM eligible_pairs ps
     INNER JOIN products p ON p.id = ps.product_id
     LEFT  JOIN stores s ON s.id = ps.store_id
     LEFT JOIN product_saleability sale ON sale.product_id = ps.product_id AND sale.store_id = ps.store_id
     LEFT JOIN batch_totals bt ON bt.product_id = ps.product_id AND bt.store_id = ps.store_id
     LEFT JOIN stock_in_range sir ON sir.product_id = ps.product_id AND sir.store_id = ps.store_id
     LEFT JOIN manual_stock_out_range msor ON msor.product_id = ps.product_id AND msor.store_id = ps.store_id
     LEFT JOIN sales_out_range sor ON sor.product_id = ps.product_id AND sor.store_id = ps.store_id
     LEFT JOIN transfer_out_range tor ON tor.product_id = ps.product_id AND tor.store_id = ps.store_id
     LEFT JOIN latest_stock_in_mrp lsim ON lsim.product_id = ps.product_id AND lsim.store_id = ps.store_id
     LEFT JOIN latest_stock_in_cost lsic ON lsic.product_id = ps.product_id AND lsic.store_id = ps.store_id
     LEFT JOIN latest_transfer_mrp ltm ON ltm.product_id = ps.product_id AND ltm.store_id = ps.store_id
     LEFT JOIN latest_transfer_cost ltc ON ltc.product_id = ps.product_id AND ltc.store_id = ps.store_id
     LEFT JOIN latest_batch_cost lbc ON lbc.product_id = ps.product_id AND lbc.store_id = ps.store_id
     ORDER BY p.name ASC, s.name ASC`,
    params,
  );

  return res.rows.map((row) => {
    const stockIn = number(row.stock_in);
    const stockOut = number(row.stock_out);
    const currentStock = number(row.current_stock);
    const lowStockValue = number(row.low_stock_value);
    const displayUnit = getStockDisplayUnit(row.unit);
    return {
      id: `stock-${row.id}-${row.store}`,
      product: row.product,
      barcode: row.barcode || "",
      store: row.store,
      stock_in: stockDisplayQty(stockIn, row.unit),
      stock_out: stockDisplayQty(stockOut, row.unit),
      current_stock: stockDisplayQty(currentStock, row.unit),
      unit: displayUnit,
      cost_price: money(row.store_cost_price),
      selling_price: money(row.store_selling_price),
      mrp: money(row.store_mrp),
      status:
        lowStockValue > 0 && currentStock <= lowStockValue
          ? "Low"
          : currentStock <= 0
            ? "Out"
            : "In Stock",
    };
  });
}

async function getStoreWiseBatchReport(filters, user) {
  await ensureInventoryBatchSchema();
  const params = [];
  const conditions = ["COALESCE(p.is_active, TRUE) = TRUE"];

  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: "ib.store_id",
    requestedStoreId: filters.store,
  });

  const res = await query(
    `SELECT
       ib.id,
       ib.batch_no,
       ib.mfg_date,
       ib.expiry_date,
       ib.received_qty,
       ib.available_qty,
       ib.cost_price AS batch_cost_price,
       ib.status,
       ib.source_type,
       ib.meta,
       p.name AS product,
       p.sku,
       p.barcode,
       p.unit,
       p.cost_price AS product_cost_price,
       p.selling_price AS product_selling_price,
       p.mrp AS product_mrp,
       COALESCE(s.name, 'Unknown Store') AS store,
       ps.selling_price AS store_selling_price,
       ps.mrp AS store_mrp,
       sii.cost_price AS stock_in_cost_price,
       sii.selling_price AS stock_in_selling_price,
       sii.mrp AS stock_in_mrp
     FROM inventory_batches ib
     INNER JOIN products p ON p.id = ib.product_id
     LEFT JOIN stores s ON s.id = ib.store_id
     LEFT JOIN product_saleability ps ON ps.product_id = ib.product_id AND ps.store_id = ib.store_id
     LEFT JOIN stock_in_items sii
      ON ib.source_type = 'stock_in'
     AND sii.id = CASE
       WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
         THEN NULLIF(ib.source_id, '')::BIGINT
       ELSE NULL
     END
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.name ASC, p.name ASC,
       CASE WHEN ib.expiry_date IS NULL THEN 1 ELSE 0 END ASC,
       ib.expiry_date ASC,
       ib.created_at ASC,
       ib.id ASC
     LIMIT 5000`,
    params,
  );

  const readMetaNumber = (meta, key) =>
    meta && Object.prototype.hasOwnProperty.call(meta, key)
      ? number(meta[key])
      : 0;

  return res.rows.map((row) => {
    const unit = getStockDisplayUnit(row.unit);
    const availableQty = number(row.available_qty);
    const receivedQty = number(row.received_qty);
    const costPrice =
      readMetaNumber(row.meta, "costPrice") ||
      number(row.stock_in_cost_price) ||
      number(row.batch_cost_price) ||
      number(row.product_cost_price);
    const sellingPrice =
      readMetaNumber(row.meta, "sellingPrice") ||
      number(row.stock_in_selling_price) ||
      number(row.store_selling_price) ||
      number(row.product_selling_price);
    const mrp =
      readMetaNumber(row.meta, "mrp") ||
      number(row.stock_in_mrp) ||
      number(row.store_mrp) ||
      number(row.product_mrp);

    return {
      id: `batch-${row.id}`,
      batch_id: row.id,
      store: row.store,
      product: row.product,
      barcode: row.barcode || "",
      sku: row.sku || "",
      batch_no: row.batch_no || "",
      mfg_date: isoDate(row.mfg_date),
      expiry_date: isoDate(row.expiry_date),
      received_qty: stockDisplayQty(receivedQty, row.unit),
      available_qty: stockDisplayQty(availableQty, row.unit),
      unit,
      cost_price: money(costPrice),
      selling_price: money(sellingPrice),
      mrp: money(mrp),
      stock_value: money(availableQty * costPrice),
      status: row.status || (availableQty > 0 ? "active" : "depleted"),
      source_type: row.source_type || "",
    };
  });
}

async function getStoreBatchPriceAuditReport(filters, user) {
  await ensureInventoryBatchSchema();
  const params = [];
  const conditions = [
    "COALESCE(p.is_active, TRUE) = TRUE",
    "ib.status = 'active'",
    "ib.available_qty > 0",
  ];

  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: "ib.store_id",
    requestedStoreId: filters.store,
  });

  const res = await query(
    `SELECT
       ib.id, ib.batch_no, ib.available_qty, ib.cost_price AS batch_cost_price,
       ib.source_type, ib.meta, ib.created_at,
       p.name AS product, p.sku, p.barcode,
       COALESCE(s.name, 'Unknown Store') AS store,
       ps.id AS store_assignment_id,
       ps.franchise_cost AS assigned_cost_price,
       ps.selling_price AS assigned_selling_price,
       ps.mrp AS assigned_mrp
     FROM inventory_batches ib
     INNER JOIN products p ON p.id = ib.product_id
     LEFT JOIN stores s ON s.id = ib.store_id
     LEFT JOIN product_saleability ps
       ON ps.product_id = ib.product_id
      AND ps.store_id = ib.store_id
      AND ps.is_active = TRUE
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.name ASC, p.name ASC, ib.created_at ASC, ib.id ASC
     LIMIT 10000`,
    params,
  );

  const readMetaNumber = (meta, key) =>
    meta && Object.prototype.hasOwnProperty.call(meta, key)
      ? number(meta[key])
      : 0;
  const samePrice = (left, right) => Math.abs(left - right) < 0.005;
  const issueFilter = String(filters.issue || "mismatch").toLowerCase();

  return res.rows
    .map((row) => {
      const batchCostPrice =
        readMetaNumber(row.meta, "costPrice") || number(row.batch_cost_price);
      const batchSellingPrice = readMetaNumber(row.meta, "sellingPrice");
      const batchMrp = readMetaNumber(row.meta, "mrp");
      const assignedCostPrice = number(row.assigned_cost_price);
      const assignedSellingPrice = number(row.assigned_selling_price);
      const assignedMrp = number(row.assigned_mrp);
      const hasAssignment = Boolean(row.store_assignment_id);
      const costCheck = !hasAssignment || !(assignedCostPrice > 0)
        ? "Not assigned"
        : samePrice(batchCostPrice, assignedCostPrice) ? "Match" : "Mismatch";
      const sellingPriceCheck = !hasAssignment || !(assignedSellingPrice > 0)
        ? "Not assigned"
        : samePrice(batchSellingPrice, assignedSellingPrice) ? "Match" : "Mismatch";
      const mrpCheck = !hasAssignment || !(assignedMrp > 0)
        ? "Not assigned"
        : samePrice(batchMrp, assignedMrp) ? "Match" : "Mismatch";
      const auditStatus = !hasAssignment
        ? "No active store assignment"
        : [costCheck, sellingPriceCheck, mrpCheck].includes("Mismatch")
          ? "Price mismatch"
          : "Match";

      return {
        id: `batch-price-audit-${row.id}`,
        audit_status: auditStatus,
        store: row.store,
        product: row.product,
        barcode: row.barcode || "",
        sku: row.sku || "",
        batch_no: row.batch_no || "",
        available_qty: number(row.available_qty),
        batch_cost_price: money(batchCostPrice),
        assigned_cost_price: assignedCostPrice > 0 ? money(assignedCostPrice) : "Not assigned",
        cost_check: costCheck,
        batch_selling_price: money(batchSellingPrice),
        assigned_selling_price: assignedSellingPrice > 0 ? money(assignedSellingPrice) : "Not assigned",
        selling_price_check: sellingPriceCheck,
        batch_mrp: money(batchMrp),
        assigned_mrp: assignedMrp > 0 ? money(assignedMrp) : "Not assigned",
        mrp_check: mrpCheck,
        source_type: row.source_type || "",
        created_at: isoDate(row.created_at),
        _isMismatch: auditStatus !== "Match",
        _hasMrpMismatch: mrpCheck === "Mismatch",
        _hasSellingPriceMismatch: sellingPriceCheck === "Mismatch",
        _hasCostMismatch: costCheck === "Mismatch",
      };
    })
    .filter((row) => {
      if (issueFilter === "all") return true;
      if (issueFilter === "mrp") return row._hasMrpMismatch;
      if (issueFilter === "selling_price") return row._hasSellingPriceMismatch;
      if (issueFilter === "cost") return row._hasCostMismatch;
      return row._isMismatch;
    });
}

async function getProductWiseSalesReport(filters, user) {
  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });

  const salesType = String(filters.sales_type || "")
    .trim()
    .toLowerCase();
  if (salesType && !["all", "regular", "select"].includes(salesType)) {
    params.push(salesType);
    conditions.push(
      `LOWER(COALESCE(sb.meta->>'salesType', sb.meta->>'sales_type', 'regular')) = $${params.length}`,
    );
  }

  const entityType = String(filters.entity_type || "")
    .trim()
    .toLowerCase();
  if (entityType && !["all", "product", "select"].includes(entityType)) {
    params.push(entityType);
    conditions.push(
      `LOWER(COALESCE(sb.meta->>'entityType', sb.meta->>'entity_type', 'product')) = $${params.length}`,
    );
  }

  const department = String(filters.department || "").trim();
  if (department && !["all", "select"].includes(department.toLowerCase())) {
    if (/^\d+$/.test(department)) {
      params.push(Number(department));
      conditions.push(`p.department_id = $${params.length}`);
    } else {
      params.push(`%${department}%`);
      conditions.push(`COALESCE(d.name, '') ILIKE $${params.length}`);
    }
  }

  const region = String(filters.region || "").trim();
  if (region && !["all", "select"].includes(region.toLowerCase())) {
    params.push(Number(region));
    conditions.push(`(
      s.region_id = $${params.length}
      OR EXISTS (
        SELECT 1
        FROM region_store_mappings rsm
        WHERE rsm.store_id = s.id
          AND rsm.region_id = $${params.length}
      )
    )`);
  }

  const counter = String(filters.counter || "").trim();
  if (counter && !["all", "select"].includes(counter.toLowerCase())) {
    params.push(`%${counter}%`);
    const counterParam = params.length;
    if (/^\d+$/.test(counter)) {
      params.push(Number(counter));
      conditions.push(`(
        COALESCE(ucs.counter_name, '') ILIKE $${counterParam}
        OR COALESCE(ucs.counter_uid, '') ILIKE $${counterParam}
        OR sb.counter_id = $${params.length}
      )`);
    } else {
      conditions.push(`(
        COALESCE(ucs.counter_name, '') ILIKE $${counterParam}
        OR COALESCE(ucs.counter_uid, '') ILIKE $${counterParam}
      )`);
    }
  }

  const res = await query(
    `SELECT
       COALESCE(p.id, sbi.product_id, 0) AS variant_id,
       COALESCE(NULLIF(p.product_id::text, ''), p.id::text, sbi.product_id::text, '') AS product_id,
       COALESCE(NULLIF(p.name, ''), NULLIF(sbi.product_name, ''), 'Product') AS product_name,
       COALESCE(b.name, 'Unbranded') AS brand,
       COALESCE(NULLIF(p.unit, ''), 'PCS') AS sold_in,
       COALESCE(p.category_id, 0) AS category_id,
       COALESCE(c.name, 'Uncategorised') AS category_name,
       COALESCE(p.sub_category_id, 0) AS sub_category_id,
       COALESCE(sc.name, '') AS sub_category_name,
       COALESCE(NULLIF(sbi.barcode, ''), p.barcode, '') AS barcode,
       COALESCE(NULLIF(sbi.sku, ''), p.sku, '') AS sku,
       COALESCE(s.name, 'Store') AS store,
       DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS date,
       COUNT(DISTINCT sb.id)::int AS orders,
       COALESCE(SUM(sbi.qty), 0) AS quantity,
       COALESCE(SUM(COALESCE(sbi.taxable_amount, sbi.line_total - sbi.tax_amount) + sbi.discount_amount), 0) AS sales,
       COALESCE(SUM(sbi.discount_amount), 0) AS discount,
       COALESCE(SUM(sbi.tax_amount), 0) AS taxes,
       COALESCE(SUM(sbi.line_total), 0) AS gross_bill,
       COALESCE(SUM(COALESCE(allocation_cost.cost_amount, sbi.qty * COALESCE(store_cost.avg_cost, 0))), 0) AS cost_amount
     FROM sales_bills sb
     LEFT JOIN sales_bill_items sbi ON sbi.sales_bill_id = sb.id
     LEFT JOIN products p ON p.id = sbi.product_id
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN stores s ON s.id = sb.store_id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN sub_categories sc ON sc.id = p.sub_category_id
     LEFT JOIN departments d ON d.id = p.department_id
     LEFT JOIN user_counter_sessions ucs ON ucs.session_id = sb.session_id
     LEFT JOIN LATERAL (
       SELECT SUM(CASE
         WHEN COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$'
          AND COALESCE(entry->>'costPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
         THEN (entry->>'qty')::numeric * (entry->>'costPrice')::numeric
         ELSE 0 END) AS cost_amount
       FROM jsonb_array_elements(COALESCE(sbi.batch_allocations, '[]'::jsonb)) entry
     ) allocation_cost ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(ib.available_qty * ib.cost_price) / NULLIF(SUM(ib.available_qty), 0) AS avg_cost
       FROM inventory_batches ib
       WHERE ib.product_id = sbi.product_id
         AND ib.store_id = sb.store_id
         AND ib.available_qty > 0
     ) store_cost ON TRUE
     WHERE ${conditions.join(" AND ")}
     GROUP BY
       COALESCE(p.id, sbi.product_id, 0),
       COALESCE(NULLIF(p.product_id::text, ''), p.id::text, sbi.product_id::text, ''),
       COALESCE(NULLIF(p.name, ''), NULLIF(sbi.product_name, ''), 'Product'),
       COALESCE(b.name, 'Unbranded'),
       COALESCE(NULLIF(p.unit, ''), 'PCS'),
       COALESCE(p.category_id, 0),
       COALESCE(c.name, 'Uncategorised'),
       COALESCE(p.sub_category_id, 0),
       COALESCE(sc.name, ''),
       COALESCE(NULLIF(sbi.barcode, ''), p.barcode, ''),
       COALESCE(NULLIF(sbi.sku, ''), p.sku, ''),
       COALESCE(s.name, 'Store'),
       DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata')
     ORDER BY date DESC, gross_bill DESC, product_name ASC
     LIMIT 5000`,
    params,
  );

  return res.rows.map((row, index) => {
    const netSales = number(row.sales) - number(row.discount);
    const profit = netSales - number(row.cost_amount);
    const marginPercent = netSales > 0 ? (profit / netSales) * 100 : 0;
    return {
      id: `product-wise-sales-${row.variant_id}-${row.date}-${index}`,
      variant_id: row.variant_id || "",
      product_id: row.product_id || "",
      product_name: row.product_name || "",
      product: row.product_name || "",
      brand: row.brand || "Unbranded",
      sold_in: row.sold_in || "PCS",
      category_id: row.category_id || "",
      category_name: row.category_name || "",
      sub_category_id: row.sub_category_id || "",
      sub_category_name: row.sub_category_name || "",
      barcode: row.barcode || "",
      sku: row.sku || "",
      store: row.store || "",
      date: isoDate(row.date),
      orders: number(row.orders),
      quantity: number(row.quantity),
      sales: money(row.sales),
      discount: money(row.discount),
      net_bill: money(netSales),
      taxes: money(row.taxes),
      gross_bill: money(row.gross_bill),
      cost_amount: money(row.cost_amount),
      margin_amount: money(profit),
      margin_percent: `${marginPercent.toFixed(2)}%`,
    };
  });
}

async function getSalesDimensionReport(reportKey, filters, user) {
  if (reportKey.includes("daily-payment-breakup"))
    return getDailyPaymentBreakupReport(filters, user);
  if (reportKey.includes("store-hourly"))
    return getStoreHourlySalesReport(filters, user);
  if (reportKey === "sales/product-wise-sales")
    return getProductWiseSalesReport(filters, user);

  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });

  let dimensionSql = "COALESCE(s.name, 'Store')";
  let dimensionAlias = "store";
  let joins = "";

  if (
    reportKey.includes("product-wise") ||
    reportKey.includes("store-wise-product") ||
    reportKey.includes("employee-wise-product")
  ) {
    dimensionSql = "COALESCE(p.name, sbi.product_name, 'Product')";
    dimensionAlias = "product";
  } else if (reportKey.includes("customer-wise")) {
    dimensionSql = "COALESCE(NULLIF(sb.customer_name, ''), 'Walk-in Customer')";
    dimensionAlias = "customer";
  } else if (reportKey.includes("employee-wise")) {
    dimensionSql = "COALESCE(u.name, 'Unassigned')";
    dimensionAlias = "employee";
  } else if (reportKey.includes("brand-wise")) {
    dimensionSql = "COALESCE(b.name, 'Unbranded')";
    dimensionAlias = "brand";
    joins += " LEFT JOIN brands b ON b.id = p.brand_id";
  } else if (reportKey.includes("category-wise")) {
    dimensionSql = "COALESCE(c.name, 'Uncategorised')";
    dimensionAlias = "category";
    joins += " LEFT JOIN categories c ON c.id = p.category_id";
  } else if (reportKey.includes("sub-category")) {
    dimensionSql = "COALESCE(sc.name, 'No Sub Category')";
    dimensionAlias = "sub_category";
    joins += " LEFT JOIN sub_categories sc ON sc.id = p.sub_category_id";
  } else if (reportKey.includes("department-wise")) {
    dimensionSql = "COALESCE(d.name, 'No Department')";
    dimensionAlias = "department";
    joins += " LEFT JOIN departments d ON d.id = p.department_id";
  } else if (reportKey.includes("income-head")) {
    dimensionSql = "COALESCE(ih.name, 'No Income Head')";
    dimensionAlias = "income_head";
    joins += " LEFT JOIN income_heads ih ON ih.id = p.income_head_id";
  } else if (
    reportKey.includes("location") ||
    reportKey.includes("region") ||
    reportKey.includes("entity") ||
    reportKey.includes("device") ||
    reportKey.includes("fiscal")
  ) {
    dimensionSql = "COALESCE(s.name, 'Store')";
    dimensionAlias = reportKey.includes("region")
      ? "region"
      : reportKey.includes("device")
        ? "device"
        : "store";
  }

  const res = await query(
    `SELECT
       ${dimensionSql} AS dimension,
       COALESCE(s.name, 'Store') AS store,
       DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS date,
       COUNT(DISTINCT sb.id)::int AS orders,
       COALESCE(SUM(sbi.qty), 0) AS items,
       COALESCE(SUM(COALESCE(sbi.taxable_amount, sbi.line_total - sbi.tax_amount) + sbi.discount_amount), 0) AS sales,
       COALESCE(SUM(sbi.discount_amount), 0) AS discount,
       COALESCE(SUM(sbi.tax_amount), 0) AS taxes,
       COALESCE(SUM(sbi.line_total), 0) AS gross_bill,
       COALESCE(SUM(COALESCE(allocation_cost.cost_amount, sbi.qty * COALESCE(store_cost.avg_cost, 0))), 0) AS cost_amount
     FROM sales_bills sb
     LEFT JOIN sales_bill_items sbi ON sbi.sales_bill_id = sb.id
     LEFT JOIN products p ON p.id = sbi.product_id
     LEFT JOIN stores s ON s.id = sb.store_id
     LEFT JOIN users u ON u.id = sb.user_id
     LEFT JOIN LATERAL (
       SELECT SUM(CASE
         WHEN COALESCE(entry->>'qty', '') ~ '^[0-9]+([.][0-9]+)?$'
          AND COALESCE(entry->>'costPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
         THEN (entry->>'qty')::numeric * (entry->>'costPrice')::numeric
         ELSE 0 END) AS cost_amount
       FROM jsonb_array_elements(COALESCE(sbi.batch_allocations, '[]'::jsonb)) entry
     ) allocation_cost ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(ib.available_qty * ib.cost_price) / NULLIF(SUM(ib.available_qty), 0) AS avg_cost
       FROM inventory_batches ib
       WHERE ib.product_id = sbi.product_id AND ib.store_id = sb.store_id AND ib.available_qty > 0
     ) store_cost ON TRUE
     ${joins}
     WHERE ${conditions.join(" AND ")}
     GROUP BY ${dimensionSql}, COALESCE(s.name, 'Store'), DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata')
     ORDER BY gross_bill DESC, date DESC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row, index) => {
    const netSales = number(row.sales) - number(row.discount);
    const profit = netSales - number(row.cost_amount);
    const marginPercent = netSales > 0 ? (profit / netSales) * 100 : 0;
    return {
      id: `sales-${reportKey}-${index}`,
      [dimensionAlias]: row.dimension,
      product: row.dimension,
      category: row.dimension,
      brand: row.dimension,
      department: row.dimension,
      employee: row.dimension,
      customer: row.dimension,
      store: row.store,
      date: isoDate(row.date),
      orders: row.orders,
      items: number(row.items),
      quantity: number(row.items),
      sales: money(row.sales),
      discount: money(row.discount),
      net_bill: money(netSales),
      taxes: money(row.taxes),
      gross_bill: money(row.gross_bill),
      cost_amount: money(row.cost_amount),
      margin_amount: money(profit),
      margin_percent: `${marginPercent.toFixed(2)}%`,
      avg_order_value: money(
        number(row.gross_bill) / Math.max(1, number(row.orders)),
      ),
      margin: `${marginPercent.toFixed(2)}%`,
      profit: money(profit),
    };
  });
}

async function getDailyPaymentBreakupReport(filters, user) {
  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });
  const res = await query(
    `WITH bill_payments AS (
       SELECT
         sb.id,
         DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS date,
         COALESCE(s.name, 'Store') AS store,
         COALESCE(NULLIF(sbp.method, ''), NULLIF(sb.payment_mode, ''), 'cash') AS payment_mode,
         COALESCE(sbp.amount, sb.grand_total) AS amount
       FROM sales_bills sb
       LEFT JOIN stores s ON s.id = sb.store_id
       LEFT JOIN sales_bill_payments sbp ON sbp.sales_bill_id = sb.id
       WHERE ${conditions.join(" AND ")}
     )
     SELECT date, store, payment_mode, COUNT(DISTINCT id)::int AS orders, COALESCE(SUM(amount), 0) AS amount
     FROM bill_payments
     GROUP BY date, store, payment_mode
     ORDER BY date DESC, store ASC`,
    params,
  );
  return res.rows.map((row, index) => ({
    id: `payment-${index}`,
    date: isoDate(row.date),
    store: row.store,
    payment_mode: row.payment_mode,
    orders: row.orders,
    amount: money(row.amount),
    sales: money(row.amount),
    gross_bill: money(row.amount),
  }));
}

async function getStoreHourlySalesReport(filters, user) {
  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });
  const res = await query(
    `SELECT COALESCE(s.name, 'Store') AS store,
            DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS date,
            EXTRACT(HOUR FROM sb.created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
            COUNT(*)::int AS orders,
            COALESCE(SUM(sb.grand_total), 0) AS gross_bill
     FROM sales_bills sb
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY s.name, DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata'), EXTRACT(HOUR FROM sb.created_at AT TIME ZONE 'Asia/Kolkata')
     ORDER BY date DESC, store ASC, hour ASC`,
    params,
  );
  return res.rows.map((row, index) => ({
    id: `hourly-${index}`,
    store: row.store,
    date: isoDate(row.date),
    hour: `${String(row.hour).padStart(2, "0")}:00`,
    orders: row.orders,
    sales: money(row.gross_bill),
    gross_bill: money(row.gross_bill),
    avg_order_value: money(
      number(row.gross_bill) / Math.max(1, number(row.orders)),
    ),
  }));
}

async function getOrderFamilyReport(reportKey, filters, user) {
  if (
    reportKey.includes("product-in") ||
    reportKey.includes("product-transaction")
  )
    return getProductInOrdersReport(filters, user);
  if (reportKey.includes("payment"))
    return getOrderPaymentReport(filters, user);
  if (reportKey.includes("void")) {
    const next = { ...filters, payment_status: "void" };
    return getOrdersReport(next, user);
  }
  return getOrdersReport(filters, user);
}

async function getProductInOrdersReport(filters, user) {
  const params = [];
  const conditions = [salesStatusCondition(filters, "sb")];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });
  if (filters.product) {
    params.push(`%${String(filters.product).trim()}%`);
    conditions.push(
      `(p.name ILIKE $${params.length} OR COALESCE(p.sku, '') ILIKE $${params.length} OR COALESCE(p.barcode, sbi.barcode, '') ILIKE $${params.length})`,
    );
  }
  const res = await query(
    `SELECT sbi.id AS item_id, sb.id AS order_id, sb.bill_number, sb.created_at, sb.payment_mode, sb.status,
            COALESCE(s.name, 'Store') AS store,
            COALESCE(p.name, sbi.product_name, 'Product') AS product,
            COALESCE(p.barcode, sbi.barcode, '') AS barcode,
            COALESCE(p.sku, sbi.sku, '') AS sku,
            sbi.qty, sbi.selling_price, sbi.discount_amount,
            COALESCE(sbi.taxable_amount, sbi.line_total - sbi.tax_amount) AS taxable_amount,
            sbi.tax_amount, sbi.line_total
     FROM sales_bill_items sbi
     INNER JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
     LEFT JOIN products p ON p.id = sbi.product_id
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY sb.created_at DESC, sb.id DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `order-product-${row.item_id}`,
    order_id: row.order_id,
    sales_order_id: row.bill_number,
    invoice_number: row.bill_number,
    store: row.store,
    date: isoDate(row.created_at),
    order_date: isoDate(row.created_at),
    order_time: displayTime(row.created_at),
    product: row.product,
    barcode: row.barcode || "",
    sku: row.sku,
    qty: number(row.qty),
    quantity: number(row.qty),
    rate: money(row.selling_price),
    sales: money(number(row.taxable_amount) + number(row.discount_amount)),
    discount: money(row.discount_amount),
    net_bill: money(row.taxable_amount),
    taxes: money(row.tax_amount),
    gross_bill: money(row.line_total),
    payment_mode: row.payment_mode,
    status: row.status,
  }));
}

async function getOrderPaymentReport(filters, user) {
  const params = [];
  const conditions = [
    `sb.status IN ('paid', 'completed', 'partial', 'pending')`,
  ];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });
  const res = await query(
    `SELECT sb.id, sb.bill_number, sb.created_at, sb.payment_mode, sb.status,
            sb.grand_total, sb.paid_amount, sb.balance_amount,
            COALESCE(payments.payments, '[]'::jsonb) AS payments,
            COALESCE(s.name, 'Store') AS store,
            sb.customer_name, sb.customer_mobile
     FROM sales_bills sb
     LEFT JOIN stores s ON s.id = sb.store_id
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object('method', sbp.method, 'amount', sbp.amount, 'referenceNo', sbp.reference_no) ORDER BY sbp.id) AS payments
       FROM sales_bill_payments sbp
       WHERE sbp.sales_bill_id = sb.id
     ) payments ON TRUE
     WHERE ${conditions.join(" AND ")}
     ORDER BY sb.created_at DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `order-pay-${row.id}`,
    order_id: row.id,
    sales_order_id: row.bill_number,
    invoice_number: row.bill_number,
    date: isoDate(row.created_at),
    order_date: isoDate(row.created_at),
    order_time: displayTime(row.created_at),
    store: row.store,
    customer: row.customer_name || "Walk-in Customer",
    customer_mobile: row.customer_mobile || "",
    payment_mode: paymentBreakupText(row.payments, row.payment_mode),
    payment_status: row.status,
    amount: money(row.grand_total),
    paid_amount: money(row.paid_amount || row.grand_total),
    unpaid_amount: money(row.balance_amount),
    gross_bill: money(row.grand_total),
    status: row.status,
  }));
}

async function getProformaInvoiceReport(reportKey, filters, user) {
  if (
    reportKey.includes("product-in") ||
    reportKey.includes("product-sale-transaction") ||
    reportKey.includes("product-level-discount")
  ) {
    return getProformaProductReport(reportKey, filters, user);
  }
  if (reportKey.includes("payment"))
    return getProformaPaymentReport(reportKey, filters, user);
  return getProformaListReport(filters, user);
}

async function getOnlineOrderReport(reportKey, filters, user) {
  const onlineFilters = { ...filters };
  const params = [];
  const conditions = [
    `sb.status IN ('paid', 'completed', 'partial', 'pending')`,
    `(
      LOWER(COALESCE(sb.meta->>'orderMode', sb.meta->>'channel', sb.payment_meta->>'channel', '')) LIKE '%online%'
      OR LOWER(COALESCE(sb.meta->>'source', '')) LIKE '%online%'
      OR LOWER(COALESCE(sb.payment_mode, '')) IN ('online', 'razorpay', 'paytm', 'phonepe')
    )`,
  ];
  addSalesFilters({
    conditions,
    params,
    filters: onlineFilters,
    user,
    alias: "sb",
  });

  if (reportKey.includes("product-in") || reportKey.includes("product-wise")) {
    const res = await query(
      `SELECT sb.id AS order_id, sb.bill_number, sb.created_at, sb.status, sb.payment_mode,
              COALESCE(s.name, 'Store') AS store,
              COALESCE(p.name, sbi.product_name, 'Product') AS product,
              COALESCE(p.sku, sbi.sku, '') AS sku,
              sbi.qty, sbi.selling_price, sbi.discount_amount, sbi.tax_amount, sbi.line_total
       FROM sales_bill_items sbi
       INNER JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
       LEFT JOIN products p ON p.id = sbi.product_id
       LEFT JOIN stores s ON s.id = sb.store_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY sb.created_at DESC, sb.id DESC
       LIMIT 1000`,
      params,
    );
    return res.rows.map((row) => ({
      id: `online-product-${row.order_id}-${row.sku}`,
      order_id: row.order_id,
      invoice_number: row.bill_number,
      store: row.store,
      date: isoDate(row.created_at),
      product: row.product,
      sku: row.sku,
      qty: number(row.qty),
      sales: money(number(row.qty) * number(row.selling_price)),
      discount: money(row.discount_amount),
      taxes: money(row.tax_amount),
      gross_bill: money(row.line_total),
      payment_mode: row.payment_mode,
      status: row.status,
    }));
  }

  const res = await query(
    `SELECT sb.id, sb.bill_number, sb.created_at, sb.status, sb.payment_mode,
            sb.subtotal, sb.discount_total, sb.tax_total, sb.grand_total,
            sb.customer_name, sb.customer_mobile,
            COALESCE(s.name, 'Store') AS store
     FROM sales_bills sb
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY sb.created_at DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `online-${row.id}`,
    order_id: row.id,
    invoice_number: row.bill_number,
    store: row.store,
    customer: row.customer_name || "Online Customer",
    customer_mobile: row.customer_mobile || "",
    date: isoDate(row.created_at),
    sales: money(row.subtotal),
    discount: money(row.discount_total),
    net_bill: money(number(row.subtotal) - number(row.discount_total)),
    taxes: money(row.tax_total),
    gross_bill: money(row.grand_total),
    payment_mode: row.payment_mode,
    status: row.status,
  }));
}

function addProformaFilters({
  conditions,
  params,
  filters,
  user,
  alias = "iso",
}) {
  const range = parseDateRange(filters.date_range);
  params.push(range.from);
  conditions.push(
    `DATE(COALESCE(${alias}.invoice_date, ${alias}.booking_date, ${alias}.submitted_date, ${alias}.created_at::date)) >= $${params.length}`,
  );
  params.push(range.to);
  conditions.push(
    `DATE(COALESCE(${alias}.invoice_date, ${alias}.booking_date, ${alias}.submitted_date, ${alias}.created_at::date)) <= $${params.length}`,
  );
  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: `${alias}.store_id`,
    requestedStoreId: filters.store,
  });
  if (filters.customer) {
    params.push(`%${String(filters.customer).trim()}%`);
    conditions.push(
      `(${alias}.customer_name ILIKE $${params.length} OR ${alias}.customer_mobile ILIKE $${params.length})`,
    );
  }
}

async function getProformaListReport(filters, user) {
  const params = [];
  const conditions = [`TRUE`];
  addProformaFilters({ conditions, params, filters, user });
  const res = await query(
    `SELECT iso.*, COALESCE(s.name, 'Store') AS store_name,
            COALESCE(sb.subtotal, iso.gross_bill, 0) AS subtotal,
            COALESCE(sb.discount_total, iso.total_discount, 0) AS discount_total,
            COALESCE(sb.tax_total, 0) AS tax_total,
            COALESCE(sb.grand_total, iso.gross_bill, 0) AS grand_total
     FROM invoice_sales_orders iso
     LEFT JOIN stores s ON s.id = iso.store_id
     LEFT JOIN sales_bills sb ON sb.id = iso.sales_bill_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY COALESCE(iso.invoice_date, iso.booking_date, iso.created_at::date) DESC, iso.id DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `pi-${row.id}`,
    pi_number:
      row.invoice_id ||
      row.auto_invoice_id ||
      row.transaction_id ||
      row.sales_order_id ||
      row.id,
    sales_order_id: row.sales_order_id || "",
    store: row.store_name || "",
    customer: row.customer_name || "Walk-in Customer",
    customer_mobile: row.customer_mobile || "",
    date: isoDate(row.invoice_date || row.booking_date || row.created_at),
    sales: money(row.subtotal),
    discount: money(row.discount_total),
    net_bill: money(number(row.subtotal) - number(row.discount_total)),
    taxes: money(row.tax_total),
    gross_bill: money(row.grand_total),
    payment_mode: row.payment_mode || row.channel || "",
    status: row.status || "",
  }));
}

async function getProformaProductReport(reportKey, filters, user) {
  const params = [];
  const conditions = [`TRUE`];
  addProformaFilters({ conditions, params, filters, user });
  if (reportKey.includes("product-level-discount")) {
    conditions.push(`COALESCE(sbi.discount_amount, 0) > 0`);
  }
  const res = await query(
    `SELECT iso.id AS pi_id, iso.invoice_id, iso.auto_invoice_id, iso.transaction_id, iso.sales_order_id,
            COALESCE(iso.invoice_date, iso.booking_date, iso.created_at::date) AS pi_date,
            iso.customer_name, iso.status, COALESCE(s.name, 'Store') AS store_name,
            COALESCE(p.name, sbi.product_name, 'Product') AS product,
            COALESCE(p.sku, sbi.sku, '') AS sku,
            sbi.qty, sbi.selling_price, sbi.discount_amount, sbi.tax_amount, sbi.line_total
     FROM invoice_sales_orders iso
     LEFT JOIN stores s ON s.id = iso.store_id
     LEFT JOIN sales_bill_items sbi ON sbi.sales_bill_id = iso.sales_bill_id
     LEFT JOIN products p ON p.id = sbi.product_id
     WHERE ${conditions.join(" AND ")}
       AND sbi.id IS NOT NULL
     ORDER BY pi_date DESC, iso.id DESC, product ASC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `pi-product-${row.pi_id}-${row.sku || row.product}`,
    pi_number:
      row.invoice_id ||
      row.auto_invoice_id ||
      row.transaction_id ||
      row.sales_order_id ||
      row.pi_id,
    store: row.store_name || "",
    customer: row.customer_name || "Walk-in Customer",
    date: isoDate(row.pi_date),
    product: row.product,
    sku: row.sku || "",
    qty: number(row.qty),
    quantity: number(row.qty),
    rate: money(row.selling_price),
    sales: money(number(row.qty) * number(row.selling_price)),
    discount: money(row.discount_amount),
    net_bill: money(number(row.line_total) - number(row.tax_amount)),
    taxes: money(row.tax_amount),
    gross_bill: money(row.line_total),
    status: row.status || "",
  }));
}

async function getProformaPaymentReport(reportKey, filters, user) {
  const params = [];
  const conditions = [`TRUE`];
  addProformaFilters({ conditions, params, filters, user });
  const res = await query(
    `SELECT iso.id AS pi_id, iso.invoice_id, iso.auto_invoice_id, iso.transaction_id, iso.sales_order_id,
            COALESCE(iso.invoice_date, iso.booking_date, iso.created_at::date) AS pi_date,
            iso.customer_name, iso.customer_mobile, iso.payment_mode, iso.channel, iso.status,
            COALESCE(s.name, 'Store') AS store_name,
            COALESCE(sb.subtotal, iso.gross_bill, 0) AS subtotal,
            COALESCE(sb.discount_total, iso.total_discount, 0) AS discount_total,
            COALESCE(sb.tax_total, 0) AS tax_total,
            COALESCE(sb.grand_total, iso.gross_bill, 0) AS grand_total,
            COALESCE(sbp.method, iso.payment_mode, iso.channel, 'unpaid') AS payment_method,
            COALESCE(sbp.amount, sb.paid_amount, 0) AS payment_amount,
            sbp.reference_no,
            COALESCE(sbp.created_at, iso.updated_at, iso.created_at) AS payment_date
     FROM invoice_sales_orders iso
     LEFT JOIN stores s ON s.id = iso.store_id
     LEFT JOIN sales_bills sb ON sb.id = iso.sales_bill_id
     LEFT JOIN sales_bill_payments sbp ON sbp.sales_bill_id = sb.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY payment_date DESC, iso.id DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row, index) => ({
    id: `pi-payment-${row.pi_id}-${index}`,
    pi_number:
      row.invoice_id ||
      row.auto_invoice_id ||
      row.transaction_id ||
      row.sales_order_id ||
      row.pi_id,
    store: row.store_name || "",
    customer: row.customer_name || "Walk-in Customer",
    customer_mobile: row.customer_mobile || "",
    date: isoDate(row.pi_date),
    payment_date: isoDate(row.payment_date),
    payment_mode: formatPaymentMethod(row.payment_method),
    reference_no: row.reference_no || "",
    sales: money(row.subtotal),
    discount: money(row.discount_total),
    net_bill: money(number(row.subtotal) - number(row.discount_total)),
    taxes: money(row.tax_total),
    gross_bill: money(row.grand_total),
    paid_amount: money(row.payment_amount),
    amount: money(row.payment_amount),
    status: row.status || "",
  }));
}

// This register uses the tax values saved on each sale line, so later edits to a
// product's tax slab cannot alter a historical sales-tax report.
async function getStoreSalesTaxRegister(filters, user) {
  const params = [];
  const conditions = ["sb.status IN ('paid', 'completed')"];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });

  const res = await query(
    `SELECT
       DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS sale_date,
       sb.store_id,
       COALESCE(s.name, 'Store') AS store,
       COALESCE(sbi.product_name, p.name, 'Product') AS product,
       COALESCE(sbi.barcode, p.barcode, '') AS barcode,
       COALESCE(sbi.sku, p.sku, '') AS sku,
       COALESCE(p.hsn_code, '') AS hsn_sac,
       COALESCE(sbi.tax_name, '') AS tax_name,
       COALESCE(sbi.tax_rate, 0) AS tax_rate,
       COUNT(DISTINCT sb.id)::int AS bills,
       COALESCE(SUM(sbi.qty), 0) AS qty,
       COALESCE(SUM(sbi.taxable_amount), 0) AS taxable_amount,
       COALESCE(SUM(sbi.discount_amount), 0) AS discount,
       COALESCE(SUM(sbi.tax_amount), 0) AS taxes,
       COALESCE(SUM(sbi.line_total), 0) AS gross_bill
     FROM sales_bill_items sbi
     INNER JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
     LEFT JOIN stores s ON s.id = sb.store_id
     LEFT JOIN products p ON p.id = sbi.product_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY
       DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata'), sb.store_id, s.name,
       COALESCE(sbi.product_name, p.name, 'Product'),
       COALESCE(sbi.barcode, p.barcode, ''), COALESCE(sbi.sku, p.sku, ''),
       COALESCE(p.hsn_code, ''), COALESCE(sbi.tax_name, ''), COALESCE(sbi.tax_rate, 0)
     ORDER BY sale_date DESC, store ASC, tax_rate ASC, product ASC
     LIMIT 5000`,
    params,
  );

  return res.rows.map((row, index) => ({
    id: `store-sales-tax-${index}`,
    date: isoDate(row.sale_date),
    store_id: row.store_id,
    store: row.store,
    product: row.product,
    barcode: row.barcode,
    sku: row.sku,
    hsn_sac: row.hsn_sac || "—",
    bills: Number(row.bills || 0),
    qty: number(row.qty),
    tax_slab: row.tax_name || `${number(row.tax_rate)}%`,
    taxable_amount: money(row.taxable_amount),
    discount: money(row.discount),
    taxes: money(row.taxes),
    gross_bill: money(row.gross_bill),
  }));
}

async function getAccountingTaxReport(reportKey, filters, user) {
  if (reportKey.includes("order-wise")) {
    const rows = await getOrdersReport(filters, user);
    return rows.map((row) => ({
      ...row,
      taxes_product: row.taxes_product || "0.00",
      taxes_order: row.taxes_order || "0.00",
      tax: row.taxes_product || "0.00",
      taxes: row.taxes_product || "0.00",
      taxable_amount: row.net_bill || "0.00",
    }));
  }
  const params = [];
  const conditions = [`sb.status IN ('paid', 'completed')`];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });
  const groupExpr = reportKey.includes("hsn")
    ? `COALESCE(t.hsn_code, 'NA')`
    : reportKey.includes("store-wise")
      ? `COALESCE(s.name, 'Store')`
      : reportKey.includes("order-wise")
        ? `sb.bill_number`
        : `COALESCE(p.name, sbi.product_name, 'Product')`;
  const res = await query(
    `SELECT ${groupExpr} AS group_name,
            COALESCE(s.name, 'Store') AS store,
            DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') AS date,
            COUNT(DISTINCT sb.id)::int AS orders,
            COALESCE(SUM(sbi.line_total - sbi.tax_amount), 0) AS taxable_amount,
            COALESCE(SUM(sbi.tax_amount), 0) AS tax,
            COALESCE(SUM(sbi.line_total), 0) AS gross_bill
     FROM sales_bill_items sbi
     INNER JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
     LEFT JOIN products p ON p.id = sbi.product_id
     LEFT JOIN taxes t ON t.id = p.tax_id
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY ${groupExpr}, s.name, DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata')
     ORDER BY date DESC, tax DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row, index) => ({
    id: `tax-${index}`,
    hsn_sac: row.group_name,
    product: row.group_name,
    order_id: row.group_name,
    invoice_number: row.group_name,
    store: row.store,
    date: isoDate(row.date),
    orders: row.orders,
    taxable_amount: money(row.taxable_amount),
    tax: money(row.tax),
    taxes: money(row.tax),
    cgst: money(number(row.tax) / 2),
    sgst: money(number(row.tax) / 2),
    gross_bill: money(row.gross_bill),
  }));
}

async function getStockRequisitionReport(reportKey, filters = {}, user = {}) {
  await ensureStockRequisitionSchema();
  const range = parseDateRange(filters.date_range);
  const fromDate = range.from;
  const toDate = range.to;

  const params = [];
  const conditions = [];

  if (fromDate) {
    params.push(fromDate);
    conditions.push(
      `DATE(COALESCE(sr.requisition_date, sr.created_at) AT TIME ZONE 'Asia/Kolkata') >= $${params.length}`,
    );
  }
  if (toDate) {
    params.push(toDate);
    conditions.push(
      `DATE(COALESCE(sr.requisition_date, sr.created_at) AT TIME ZONE 'Asia/Kolkata') <= $${params.length}`,
    );
  }

  if (filters.store) {
    const storeId = Number(filters.store);
    if (storeId) {
      params.push(storeId);
      conditions.push(
        `(sr.source_id = $${params.length} OR sr.destination_id = $${params.length})`,
      );
    }
  }

  const assignedStores = (user?.assigned_stores || [])
    .map(Number)
    .filter(Number.isFinite);
  if (user?.role !== "super_admin" && assignedStores.length > 0) {
    params.push(assignedStores);
    conditions.push(
      `(sr.source_id = ANY($${params.length}::int[]) OR sr.destination_id = ANY($${params.length}::int[]))`,
    );
  }

  if (reportKey.includes("unfulfilled-stock-requests")) {
    conditions.push(
      `(sr.status != 'fulfilled' OR COALESCE(sri.fulfilled_qty, 0) < sri.requested_qty)`,
    );
  }

  if (filters.product && String(filters.product).trim()) {
    params.push(`%${String(filters.product).trim()}%`);
    conditions.push(
      `(p.name ILIKE $${params.length} OR COALESCE(p.sku,'') ILIKE $${params.length} OR COALESCE(p.barcode,'') ILIKE $${params.length})`,
    );
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const sql = `
    SELECT 
      sr.id AS requisition_id,
      COALESCE(sr.created_at) AS date,
      sr.created_at,
      sr.source_id,
      s_src.name AS source_name,
      sr.destination_id,
      s_dest.name AS destination_name,
      sr.status AS fulfillment_status,
      sr.approval_status,
      sr.approved_at,
      COALESCE(u_req.name, sr.requested_by) AS requester_name,
      COALESCE(u_req.email, sr.mail_to) AS requester_email,
      u_app.name AS approver_name,
      sr.stock_transfer_id,
      sr.purchase_order_id,
      po.transaction_id AS po_transaction_id,
      sr.vendor_id,
      COALESCE(sr.vendor_email, v.email) AS vendor_email,
      COALESCE(v.name, sr.remarks) AS vendor_name,
      sr.po_emailed_at,
      sr.shortage_status,
      sr.total_shortage_qty,
      sri.id AS item_id,
      sri.product_id,
      COALESCE(sri.product_name, p.name) AS product_name,
      p.sku AS product_sku,
      p.barcode AS product_barcode,
      COALESCE(sri.unit, p.unit, 'PCS') AS unit,
      COALESCE(sri.dimensions, p.dimensions, '-') AS dimensions,
      sri.qty AS requested_qty,
      sri.qty AS approved_qty,
      COALESCE(sri.fulfilled_qty, 0) AS fulfilled_qty,
      COALESCE(sri.available_qty, 0) AS available_qty,
      COALESCE(sri.shortage_qty, 0) AS shortage_qty
    FROM stock_requisitions sr
    JOIN stock_requisition_items sri ON sri.requisition_id = sr.id
    LEFT JOIN stores s_src ON s_src.id = sr.source_id
    LEFT JOIN stores s_dest ON s_dest.id = sr.destination_id
    LEFT JOIN users u_req ON u_req.id = sr.requested_by_user_id
    LEFT JOIN users u_app ON u_app.id = sr.approved_by_user_id
    LEFT JOIN products p ON p.id = sri.product_id
    LEFT JOIN purchase_orders po ON po.id = sr.purchase_order_id
    LEFT JOIN vendors v ON v.id = sr.vendor_id
    ${whereClause}
    ORDER BY sr.id DESC, sri.id ASC
  `;

  const res = await query(sql, params);

  return res.rows.map((row, idx) => {
    const reqQty = number(row.requested_qty);
    const fulQty = number(row.fulfilled_qty);
    const availQty = number(row.available_qty);
    const shortQty = number(row.shortage_qty);
    const pendingQty = Math.max(0, reqQty - fulQty);

    return {
      id: `${row.requisition_id}-${row.item_id || idx}`,
      requisition_id: `REQ-${row.requisition_id}`,
      date: isoDate(row.date),
      created_at: isoDate(row.created_at),
      source: row.source_name || `Warehouse #${row.source_id || "-"}`,
      destination: row.destination_name || `Site #${row.destination_id || "-"}`,
      requested_by_name: row.requester_name || "Admin / System",
      requested_by_email: row.requester_email || "-",
      approved_by_name: row.approver_name || "-",
      approved_at: row.approved_at ? isoDate(row.approved_at) : "-",
      product: row.product_name || "Unknown Item",
      sku: row.product_sku || "-",
      barcode: row.product_barcode || "-",
      unit: row.unit || "PCS",
      dimensions: row.dimensions || "-",
      requested_qty: reqQty,
      available_qty: availQty,
      shortage_qty: shortQty,
      fulfilled_qty: fulQty,
      pending_qty: pendingQty,
      approval_status: (row.approval_status || "pending").toUpperCase(),
      fulfillment_status: (row.fulfillment_status || "pending").toUpperCase(),
      shortage_status: row.shortage_status
        ? row.shortage_status.toUpperCase()
        : shortQty > 0
          ? "SHORTAGE_DETECTED"
          : "IN_STOCK",
      purchase_order_id:
        row.po_transaction_id ||
        (row.purchase_order_id ? `PO-${row.purchase_order_id}` : "-"),
      vendor_name: row.vendor_name || "-",
      vendor_email: row.vendor_email || "-",
      po_emailed_at: row.po_emailed_at ? isoDate(row.po_emailed_at) : "-",
      po_email_status: row.po_emailed_at
        ? "SENT"
        : row.purchase_order_id
          ? "PENDING"
          : "-",
      status: (row.fulfillment_status || "pending").toUpperCase(),
    };
  });
}

async function getInventoryFamilyReport(reportKey, filters, user) {
  if (
    reportKey.includes("stock-requisition") ||
    reportKey.includes("unfulfilled-stock-requests") ||
    reportKey.includes("stock-fulfillment")
  ) {
    return getStockRequisitionReport(reportKey, filters, user);
  }
  if (reportKey.includes("unfulfilled-stock-transfers")) {
    return getUnfulfilledStockTransfersReport(filters, user);
  }
  if (reportKey.includes("low-stock")) {
    const rows = await getStockLevelReport(filters, user);
    return rows.filter((row) => row.status === "Low" || row.status === "Out");
  }
  if (reportKey.includes("stock-ledger-summary")) {
    return getStockLedgerSummaryReport(filters, user);
  }
  if (
    reportKey.includes("stock-movement") ||
    reportKey.includes("stock-operations") ||
    reportKey.includes("ledger")
  ) {
    return getStockMovementReport(filters, user);
  }
  if (
    reportKey.includes("store-wise") ||
    reportKey.includes("product-group") ||
    reportKey.includes("ageing") ||
    reportKey.includes("profit-margin")
  ) {
    return getStockLevelReport(filters, user);
  }
  return getStockLevelReport(filters, user);
}

async function getStockMovementReport(filters, user) {
  const range = parseDateRange(filters.date_range);
  const fromDate = range.from;
  const toDate = range.to;

  const params = [];
  const conditions = ["COALESCE(p.is_active, TRUE) = TRUE"];

  addStoreScope({
    conditions,
    params,
    user,
    alias: "ps",
    requestedStoreId: filters.store,
  });

  const storeOnlyInventory =
    user.permissions?.includes("VIEW_STORE_PRODUCT_INVENTORY") &&
    !user.permissions?.some((permission) =>
      ["VIEW_STORE_REPORTS", "VIEW_FINANCIAL_REPORTS", "*"].includes(permission),
    );
  if (storeOnlyInventory)
    conditions.push(
      "LOWER(COALESCE(s.meta->>'locationType', 'Store')) = 'store'",
    );

  if (filters.product && String(filters.product).trim()) {
    params.push(`%${String(filters.product).trim()}%`);
    conditions.push(
      `(p.name ILIKE $${params.length} OR COALESCE(p.sku,'') ILIKE $${params.length} OR COALESCE(p.barcode,'') ILIKE $${params.length})`,
    );
  }

  params.push(fromDate);
  const pFrom = params.length;
  params.push(toDate);
  const pTo = params.length;

  const res = await query(
    `WITH pair_sources AS (
       SELECT product_id, store_id FROM product_saleability
       UNION ALL
       SELECT product_id, store_id FROM inventory_batches
       UNION ALL
       SELECT sii.product_id, si.destination_id AS store_id
       FROM stock_in_items sii
       JOIN stock_in si ON si.id = sii.stock_in_id
       WHERE si.status = 'confirmed'
       UNION ALL
       SELECT sti.product_id, st.destination_id AS store_id
       FROM stock_transfer_items sti
       JOIN stock_transfer st ON st.id = sti.stock_transfer_id
       WHERE st.status = 'confirmed'
       UNION ALL
       SELECT sti.product_id, st.source_id AS store_id
       FROM stock_transfer_items sti
       JOIN stock_transfer st ON st.id = sti.stock_transfer_id
       WHERE st.status IN ('confirmed', 'completed', 'dispatched', 'in_transit', 'received', 'partially_received')
     ),
     eligible_pairs AS (
       SELECT DISTINCT ps.product_id, ps.store_id
       FROM pair_sources ps
       INNER JOIN products p ON p.id = ps.product_id
       LEFT JOIN stores s ON s.id = ps.store_id
       WHERE ${conditions.join(" AND ")}
     ),
     batch_totals AS (
       SELECT ib.product_id, ib.store_id, SUM(ib.available_qty) AS current_stock
       FROM inventory_batches ib
       JOIN eligible_pairs ep ON ep.product_id = ib.product_id AND ep.store_id = ib.store_id
       WHERE ib.status = 'active'
       GROUP BY ib.product_id, ib.store_id
     ),
     stock_in_range AS (
       SELECT in_union.product_id, in_union.store_id, SUM(in_union.qty) AS qty
       FROM (
         SELECT sii.product_id, si.destination_id AS store_id, sii.qty
         FROM stock_in_items sii
         JOIN stock_in si ON si.id = sii.stock_in_id
         WHERE si.status = 'confirmed'
           AND COALESCE(si.confirmed_at, si.created_at) >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
           AND COALESCE(si.confirmed_at, si.created_at) < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
         UNION ALL
         SELECT sti.product_id, st.destination_id AS store_id, COALESCE(NULLIF(sti.accepted_qty, 0), NULLIF(sti.received_qty, 0), sti.qty) AS qty
         FROM stock_transfer_items sti
         JOIN stock_transfer st ON st.id = sti.stock_transfer_id
         WHERE st.status IN ('confirmed', 'completed', 'received', 'partially_received')
           AND COALESCE(st.received_at, st.confirmed_at, st.created_at) >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
           AND COALESCE(st.received_at, st.confirmed_at, st.created_at) < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       ) in_union
       JOIN eligible_pairs ep ON ep.product_id = in_union.product_id AND ep.store_id = in_union.store_id
       GROUP BY in_union.product_id, in_union.store_id
     ),
     manual_stock_out_range AS (
       SELECT soi.product_id, COALESCE(so.source_id, so.destination_id) AS store_id, SUM(soi.qty) AS qty
       FROM stock_out_items soi
       JOIN stock_out so ON so.id = soi.stock_out_id
       JOIN eligible_pairs ep ON ep.product_id = soi.product_id AND ep.store_id = COALESCE(so.source_id, so.destination_id)
       WHERE so.status = 'confirmed'
         AND COALESCE(so.reference_type, '') <> 'sales_bill'
         AND COALESCE(so.confirmed_at, so.created_at) >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND COALESCE(so.confirmed_at, so.created_at) < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY soi.product_id, COALESCE(so.source_id, so.destination_id)
     ),
     sales_out_range AS (
       SELECT sbi.product_id, sb.store_id, SUM(sbi.qty) AS qty
       FROM sales_bill_items sbi
       JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
       JOIN eligible_pairs ep ON ep.product_id = sbi.product_id AND ep.store_id = sb.store_id
       WHERE sb.status IN ('paid', 'completed')
         AND sb.created_at >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND sb.created_at < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY sbi.product_id, sb.store_id
     ),
     transfer_out_range AS (
       SELECT sti.product_id, st.source_id AS store_id, SUM(COALESCE(NULLIF(sti.dispatched_qty, 0), sti.qty)) AS qty
       FROM stock_transfer_items sti
       JOIN stock_transfer st ON st.id = sti.stock_transfer_id
       JOIN eligible_pairs ep ON ep.product_id = sti.product_id AND ep.store_id = st.source_id
       WHERE st.status IN ('confirmed', 'completed', 'dispatched', 'in_transit', 'received', 'partially_received')
         AND COALESCE(st.dispatched_at, st.confirmed_at, st.created_at) >= ($${pFrom}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND COALESCE(st.dispatched_at, st.confirmed_at, st.created_at) < (($${pTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY sti.product_id, st.source_id
     )
     SELECT
       p.id,
       p.name  AS product,
       p.sku,
       p.barcode,
       p.unit,
       COALESCE(s.name, 'Unknown Store') AS store,
       COALESCE(sale.low_stock_value, 0) AS low_stock_value,
       COALESCE(bt.current_stock, 0) AS current_stock,
       COALESCE(sir.qty, 0) AS stock_in,
       COALESCE(msor.qty, 0) + COALESCE(sor.qty, 0) + COALESCE(tor.qty, 0) AS stock_out
     FROM eligible_pairs ps
     INNER JOIN products p ON p.id = ps.product_id
     LEFT  JOIN stores s ON s.id = ps.store_id
     LEFT JOIN product_saleability sale ON sale.product_id = ps.product_id AND sale.store_id = ps.store_id
     LEFT JOIN batch_totals bt ON bt.product_id = ps.product_id AND bt.store_id = ps.store_id
     LEFT JOIN stock_in_range sir ON sir.product_id = ps.product_id AND sir.store_id = ps.store_id
     LEFT JOIN manual_stock_out_range msor ON msor.product_id = ps.product_id AND msor.store_id = ps.store_id
     LEFT JOIN sales_out_range sor ON sor.product_id = ps.product_id AND sor.store_id = ps.store_id
     LEFT JOIN transfer_out_range tor ON tor.product_id = ps.product_id AND tor.store_id = ps.store_id
     ORDER BY p.name ASC, s.name ASC`,
    params,
  );

  return res.rows.map((row) => {
    const stockIn = number(row.stock_in);
    const stockOut = number(row.stock_out);
    const currentStock = number(row.current_stock);
    const lowStockValue = number(row.low_stock_value);
    const openingStock = Math.max(0, currentStock - stockIn + stockOut);
    const displayUnit = getStockDisplayUnit(row.unit);
    return {
      id: `mov-${row.id}-${row.store}`,
      product: row.product,
      barcode: row.barcode || "-",
      sku: row.sku || "-",
      store: row.store,
      opening_stock: stockDisplayQty(openingStock, row.unit),
      stock_in: stockDisplayQty(stockIn, row.unit),
      stock_out: stockDisplayQty(stockOut, row.unit),
      current_stock: stockDisplayQty(currentStock, row.unit),
      unit: displayUnit,
      status:
        lowStockValue > 0 && currentStock <= lowStockValue
          ? "Low Stock"
          : currentStock <= 0
            ? "Out of Stock"
            : "In Stock",
    };
  });
}

async function getStockLedgerSummaryReport(filters, user) {
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  const conditions = [
    `DATE(ledger.transaction_time AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2`,
  ];

  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: "ledger.inventory_source_id",
    requestedStoreId: filters.store,
  });

  const transactionType = String(filters.transaction_type || "")
    .trim()
    .toUpperCase();
  if (
    transactionType &&
    !["ALL", "SELECT", "SELECT..."].includes(transactionType)
  ) {
    params.push(transactionType);
    conditions.push(`ledger.transaction_type = $${params.length}`);
  }

  const res = await query(
    `WITH ledger AS (
       SELECT
         ('stock-in-' || si.id)::text AS id,
         si.destination_id::bigint AS inventory_source_id,
         CASE WHEN LOWER(COALESCE(dst.name, '')) LIKE '%warehouse%' THEN 'WAREHOUSE' ELSE 'STORE' END AS inventory_source_type,
         COALESCE(dst.name, 'Store') AS source_name,
         COALESCE(NULLIF(si.meta->>'createdByName', ''), NULLIF(si.meta->>'userName', ''), NULLIF(si.meta->>'created_by', ''), '-') AS user_name,
         COALESCE(si.vendor_id, 0)::text AS transaction_party_id,
         CASE WHEN COALESCE(si.vendor_name, '') <> '' OR si.vendor_id IS NOT NULL THEN 'VENDOR' ELSE 'SOURCE' END AS transaction_party_type,
         COALESCE(NULLIF(si.vendor_name, ''), NULLIF(si.meta->>'sourceName', ''), '-') AS transaction_party_name,
         COALESCE(si.transaction_id, 'STK-' || LPAD(si.id::text, 4, '0')) AS transaction_id,
         'STOCK_IN' AS transaction_type,
         UPPER(COALESCE(NULLIF(si.method, ''), 'ADJUSTMENT')) AS transaction_sub_type,
         COALESCE(si.invoice_number, '-') AS trans_ref1,
         COALESCE(si.reference_id, '-') AS trans_ref2,
         '-' AS audit_id,
         COUNT(sii.id)::numeric AS total_item_count,
         COALESCE(SUM(sii.qty), 0)::numeric AS total_item_quantity,
         COALESCE(NULLIF(si.total_cost, 0), SUM(sii.qty * COALESCE(sii.cost_price, 0)), 0)::numeric AS total_transaction_value,
         COALESCE(NULLIF(si.meta->>'createdByName', ''), NULLIF(si.meta->>'userName', ''), NULLIF(si.meta->>'created_by', ''), '-') AS transaction_user,
         COALESCE(si.confirmed_at, si.created_at) AS transaction_time,
         COALESCE(SUM(sii.qty), 0)::numeric AS total_approved_quantity,
         COALESCE(NULLIF(si.total_cost, 0), SUM(sii.qty * COALESCE(sii.cost_price, 0)), 0)::numeric AS total_approved_value,
         CASE WHEN LOWER(COALESCE(si.status, '')) IN ('confirmed', 'completed') THEN 'AUTO_APPROVED' ELSE UPPER(COALESCE(si.status, 'DRAFT')) END AS approval_status,
         COALESCE(NULLIF(si.meta->>'approvedByName', ''), NULLIF(si.meta->>'createdByName', ''), '-') AS approval_user,
         COALESCE(si.confirmed_at, si.created_at) AS approval_time,
         CASE WHEN LOWER(COALESCE(si.status, '')) IN ('confirmed', 'completed') THEN 'SYNCED' ELSE 'PENDING' END AS inventory_sync_status,
         COALESCE(si.confirmed_at, si.created_at) AS inventory_sync_time,
         si.created_at AS log_time
       FROM stock_in si
       LEFT JOIN stock_in_items sii ON sii.stock_in_id = si.id
       LEFT JOIN stores dst ON dst.id = si.destination_id
       WHERE LOWER(COALESCE(si.status, 'draft')) IN ('confirmed', 'completed')
       GROUP BY si.id, dst.name

       UNION ALL

       SELECT
         ('stock-out-' || so.id)::text AS id,
         so.destination_id::bigint AS inventory_source_id,
         CASE WHEN LOWER(COALESCE(src.name, '')) LIKE '%warehouse%' THEN 'WAREHOUSE' ELSE 'STORE' END AS inventory_source_type,
         COALESCE(src.name, 'Store') AS source_name,
         COALESCE(NULLIF(so.meta->>'createdByName', ''), NULLIF(so.meta->>'userName', ''), '-') AS user_name,
         '0' AS transaction_party_id,
         'ADJUSTMENT' AS transaction_party_type,
         COALESCE(NULLIF(so.reason, ''), NULLIF(so.vendor_name, ''), '-') AS transaction_party_name,
         COALESCE(so.transaction_id, 'OUT-' || LPAD(so.id::text, 4, '0')) AS transaction_id,
         'STOCK_OUT' AS transaction_type,
         UPPER(COALESCE(NULLIF(so.method, ''), 'ADJUSTMENT')) AS transaction_sub_type,
         COALESCE(so.invoice_number, '-') AS trans_ref1,
         COALESCE(so.reference_id, '-') AS trans_ref2,
         '-' AS audit_id,
         COUNT(soi.id)::numeric AS total_item_count,
         (COALESCE(SUM(soi.qty), 0) * -1)::numeric AS total_item_quantity,
         (COALESCE(NULLIF(so.total_cost, 0), SUM(soi.qty * COALESCE(soi.cost_price, 0)), 0) * -1)::numeric AS total_transaction_value,
         COALESCE(NULLIF(so.meta->>'createdByName', ''), NULLIF(so.meta->>'userName', ''), '-') AS transaction_user,
         COALESCE(so.confirmed_at, so.created_at) AS transaction_time,
         (COALESCE(SUM(soi.qty), 0) * -1)::numeric AS total_approved_quantity,
         (COALESCE(NULLIF(so.total_cost, 0), SUM(soi.qty * COALESCE(soi.cost_price, 0)), 0) * -1)::numeric AS total_approved_value,
         CASE WHEN LOWER(COALESCE(so.status, '')) IN ('confirmed', 'completed') THEN 'AUTO_APPROVED' ELSE UPPER(COALESCE(so.status, 'DRAFT')) END AS approval_status,
         COALESCE(NULLIF(so.meta->>'approvedByName', ''), NULLIF(so.meta->>'createdByName', ''), '-') AS approval_user,
         COALESCE(so.confirmed_at, so.created_at) AS approval_time,
         CASE WHEN LOWER(COALESCE(so.status, '')) IN ('confirmed', 'completed') THEN 'SYNCED' ELSE 'PENDING' END AS inventory_sync_status,
         COALESCE(so.confirmed_at, so.created_at) AS inventory_sync_time,
         so.created_at AS log_time
       FROM stock_out so
       LEFT JOIN stock_out_items soi ON soi.stock_out_id = so.id
       LEFT JOIN stores src ON src.id = so.destination_id
       WHERE LOWER(COALESCE(so.status, 'draft')) IN ('confirmed', 'completed')
       GROUP BY so.id, src.name

       UNION ALL

       SELECT
         ('transfer-out-' || st.id)::text AS id,
         st.source_id::bigint AS inventory_source_id,
         CASE WHEN LOWER(COALESCE(src.name, '')) LIKE '%warehouse%' THEN 'WAREHOUSE' ELSE 'STORE' END AS inventory_source_type,
         COALESCE(src.name, 'Store') AS source_name,
         COALESCE(NULLIF(st.meta->>'createdByName', ''), NULLIF(st.meta->>'userName', ''), '-') AS user_name,
         COALESCE(st.destination_id, 0)::text AS transaction_party_id,
         CASE WHEN LOWER(COALESCE(dst.name, '')) LIKE '%warehouse%' THEN 'WAREHOUSE' ELSE 'STORE' END AS transaction_party_type,
         COALESCE(dst.name, '-') AS transaction_party_name,
         COALESCE(st.transaction_id, 'TRN-' || LPAD(st.id::text, 4, '0')) AS transaction_id,
         'STOCK_TRANSFER_OUT' AS transaction_type,
         'TRANSFER_OUT' AS transaction_sub_type,
         COALESCE(st.invoice_number, '-') AS trans_ref1,
         '-' AS trans_ref2,
         '-' AS audit_id,
         COUNT(sti.id)::numeric AS total_item_count,
         (COALESCE(SUM(COALESCE(NULLIF(sti.dispatched_qty, 0), sti.qty)), 0) * -1)::numeric AS total_item_quantity,
         (COALESCE(NULLIF(st.total_cost, 0), SUM(COALESCE(NULLIF(sti.dispatched_qty, 0), sti.qty) * COALESCE(sti.cost_price, 0)), 0) * -1)::numeric AS total_transaction_value,
         COALESCE(NULLIF(st.meta->>'createdByName', ''), NULLIF(st.meta->>'userName', ''), '-') AS transaction_user,
         COALESCE(st.dispatched_at, st.confirmed_at, st.created_at) AS transaction_time,
         (COALESCE(SUM(COALESCE(NULLIF(sti.dispatched_qty, 0), sti.qty)), 0) * -1)::numeric AS total_approved_quantity,
         (COALESCE(NULLIF(st.total_cost, 0), SUM(COALESCE(NULLIF(sti.dispatched_qty, 0), sti.qty) * COALESCE(sti.cost_price, 0)), 0) * -1)::numeric AS total_approved_value,
         CASE WHEN LOWER(COALESCE(st.status, '')) IN ('confirmed', 'completed', 'received', 'partially_received') THEN 'APPROVED' ELSE UPPER(COALESCE(st.status, 'DRAFT')) END AS approval_status,
         COALESCE(NULLIF(st.meta->>'approvedByName', ''), NULLIF(st.meta->>'createdByName', ''), '-') AS approval_user,
         COALESCE(st.confirmed_at, st.created_at) AS approval_time,
         CASE WHEN LOWER(COALESCE(st.status, '')) IN ('confirmed', 'completed', 'dispatched', 'in_transit', 'received', 'partially_received') THEN 'SYNCED' ELSE 'PENDING' END AS inventory_sync_status,
         COALESCE(st.confirmed_at, st.created_at) AS inventory_sync_time,
         st.created_at AS log_time
       FROM stock_transfer st
       LEFT JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
       LEFT JOIN stores src ON src.id = st.source_id
       LEFT JOIN stores dst ON dst.id = st.destination_id
       WHERE LOWER(COALESCE(st.status, 'draft')) IN ('confirmed', 'completed', 'dispatched', 'in_transit', 'received', 'partially_received')
       GROUP BY st.id, src.name, dst.name

       UNION ALL

       SELECT
         ('transfer-in-' || st.id)::text AS id,
         st.destination_id::bigint AS inventory_source_id,
         CASE WHEN LOWER(COALESCE(dst.name, '')) LIKE '%warehouse%' THEN 'WAREHOUSE' ELSE 'STORE' END AS inventory_source_type,
         COALESCE(dst.name, 'Store') AS source_name,
         COALESCE(NULLIF(st.meta->>'createdByName', ''), NULLIF(st.meta->>'userName', ''), '-') AS user_name,
         COALESCE(st.source_id, 0)::text AS transaction_party_id,
         CASE WHEN LOWER(COALESCE(src.name, '')) LIKE '%warehouse%' THEN 'WAREHOUSE' ELSE 'STORE' END AS transaction_party_type,
         COALESCE(src.name, '-') AS transaction_party_name,
         COALESCE(st.transaction_id, 'TRN-' || LPAD(st.id::text, 4, '0')) AS transaction_id,
         'STOCK_TRANSFER_IN' AS transaction_type,
         'TRANSFER_IN' AS transaction_sub_type,
         COALESCE(st.invoice_number, '-') AS trans_ref1,
         '-' AS trans_ref2,
         '-' AS audit_id,
         COUNT(sti.id)::numeric AS total_item_count,
         COALESCE(SUM(COALESCE(NULLIF(sti.accepted_qty, 0), NULLIF(sti.received_qty, 0), sti.qty)), 0)::numeric AS total_item_quantity,
         COALESCE(NULLIF(st.total_cost, 0), SUM(COALESCE(NULLIF(sti.accepted_qty, 0), NULLIF(sti.received_qty, 0), sti.qty) * COALESCE(sti.cost_price, 0)), 0)::numeric AS total_transaction_value,
         COALESCE(NULLIF(st.meta->>'createdByName', ''), NULLIF(st.meta->>'userName', ''), '-') AS transaction_user,
         COALESCE(st.received_at, st.confirmed_at, st.created_at) AS transaction_time,
         COALESCE(SUM(COALESCE(NULLIF(sti.accepted_qty, 0), NULLIF(sti.received_qty, 0), sti.qty)), 0)::numeric AS total_approved_quantity,
         COALESCE(NULLIF(st.total_cost, 0), SUM(COALESCE(NULLIF(sti.accepted_qty, 0), NULLIF(sti.received_qty, 0), sti.qty) * COALESCE(sti.cost_price, 0)), 0)::numeric AS total_approved_value,
         CASE WHEN LOWER(COALESCE(st.status, '')) IN ('confirmed', 'completed', 'received', 'partially_received') THEN 'RECEIVED' ELSE UPPER(COALESCE(st.status, 'DRAFT')) END AS approval_status,
         COALESCE(NULLIF(st.meta->>'approvedByName', ''), NULLIF(st.meta->>'createdByName', ''), '-') AS approval_user,
         COALESCE(st.confirmed_at, st.created_at) AS approval_time,
         CASE WHEN LOWER(COALESCE(st.status, '')) IN ('confirmed', 'completed', 'received', 'partially_received') THEN 'SYNCED' ELSE 'PENDING' END AS inventory_sync_status,
         COALESCE(st.confirmed_at, st.created_at) AS inventory_sync_time,
         st.created_at AS log_time
       FROM stock_transfer st
       LEFT JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
       LEFT JOIN stores src ON src.id = st.source_id
       LEFT JOIN stores dst ON dst.id = st.destination_id
       WHERE LOWER(COALESCE(st.status, 'draft')) IN ('confirmed', 'completed', 'received', 'partially_received')
       GROUP BY st.id, src.name, dst.name

       UNION ALL

       SELECT
         ('sale-' || sb.id)::text AS id,
         sb.store_id::bigint AS inventory_source_id,
         CASE WHEN LOWER(COALESCE(s.name, '')) LIKE '%warehouse%' THEN 'WAREHOUSE' ELSE 'STORE' END AS inventory_source_type,
         COALESCE(s.name, 'Store') AS source_name,
         COALESCE(u.name, '-') AS user_name,
         COALESCE(NULLIF(sb.customer_mobile, ''), '0') AS transaction_party_id,
         'CUSTOMER' AS transaction_party_type,
         COALESCE(NULLIF(sb.customer_name, ''), 'Walk-in Customer') AS transaction_party_name,
         sb.bill_number AS transaction_id,
         'SALES_INVOICE' AS transaction_type,
         'REGULAR' AS transaction_sub_type,
         COALESCE(sb.payment_mode, '-') AS trans_ref1,
         COALESCE(sb.session_id, '-') AS trans_ref2,
         '-' AS audit_id,
         COUNT(sbi.id)::numeric AS total_item_count,
         (COALESCE(SUM(sbi.qty), 0) * -1)::numeric AS total_item_quantity,
         (COALESCE(NULLIF(sb.grand_total, 0), SUM(sbi.line_total), 0) * -1)::numeric AS total_transaction_value,
         COALESCE(u.name, '-') AS transaction_user,
         sb.created_at AS transaction_time,
         (COALESCE(SUM(sbi.qty), 0) * -1)::numeric AS total_approved_quantity,
         (COALESCE(NULLIF(sb.grand_total, 0), SUM(sbi.line_total), 0) * -1)::numeric AS total_approved_value,
         'AUTO_APPROVED' AS approval_status,
         COALESCE(u.name, '-') AS approval_user,
         sb.created_at AS approval_time,
         CASE WHEN sb.status IN ('paid', 'completed') THEN 'SYNCED' ELSE UPPER(COALESCE(sb.status, 'PENDING')) END AS inventory_sync_status,
         sb.created_at AS inventory_sync_time,
         sb.created_at AS log_time
       FROM sales_bills sb
       LEFT JOIN sales_bill_items sbi ON sbi.sales_bill_id = sb.id
       LEFT JOIN stores s ON s.id = sb.store_id
       LEFT JOIN users u ON u.id = sb.user_id
       WHERE sb.status IN ('paid', 'completed')
       GROUP BY sb.id, s.name, u.name

       UNION ALL

       SELECT
         ('sales-return-' || sr.id)::text AS id,
         sr.store_id::bigint AS inventory_source_id,
         CASE WHEN LOWER(COALESCE(s.name, '')) LIKE '%warehouse%' THEN 'WAREHOUSE' ELSE 'STORE' END AS inventory_source_type,
         COALESCE(s.name, 'Store') AS source_name,
         COALESCE(u.name, '-') AS user_name,
         COALESCE(NULLIF(sb.customer_mobile, ''), '0') AS transaction_party_id,
         'CUSTOMER' AS transaction_party_type,
         COALESCE(NULLIF(sb.customer_name, ''), 'Walk-in Customer') AS transaction_party_name,
         COALESCE(sr.return_number, 'RET-' || sr.id::text) AS transaction_id,
         'SALES_RETURN' AS transaction_type,
         UPPER(COALESCE(NULLIF(sr.return_type, ''), 'RETURN')) AS transaction_sub_type,
         COALESCE(sb.bill_number, '-') AS trans_ref1,
         COALESCE(sr.refund_payment_mode, '-') AS trans_ref2,
         '-' AS audit_id,
         COUNT(sri.id)::numeric AS total_item_count,
         COALESCE(SUM(sri.qty), 0)::numeric AS total_item_quantity,
         COALESCE(NULLIF(sr.refund_amount, 0), SUM(sri.qty * COALESCE(sri.original_price, 0)), 0)::numeric AS total_transaction_value,
         COALESCE(u.name, '-') AS transaction_user,
         COALESCE(sr.completed_at, sr.approved_at, sr.created_at) AS transaction_time,
         COALESCE(SUM(sri.qty), 0)::numeric AS total_approved_quantity,
         COALESCE(NULLIF(sr.refund_amount, 0), SUM(sri.qty * COALESCE(sri.original_price, 0)), 0)::numeric AS total_approved_value,
         CASE WHEN sr.status IN ('completed', 'approved') THEN 'AUTO_APPROVED' ELSE UPPER(COALESCE(sr.status, 'PENDING')) END AS approval_status,
         COALESCE(approver.name, u.name, '-') AS approval_user,
         COALESCE(sr.approved_at, sr.completed_at, sr.created_at) AS approval_time,
         CASE WHEN sr.status IN ('completed', 'approved') THEN 'SYNCED' ELSE UPPER(COALESCE(sr.status, 'PENDING')) END AS inventory_sync_status,
         COALESCE(sr.completed_at, sr.approved_at, sr.created_at) AS inventory_sync_time,
         sr.created_at AS log_time
       FROM sales_returns sr
       LEFT JOIN sales_return_items sri ON sri.sales_return_id = sr.id
       LEFT JOIN sales_bills sb ON sb.id = sr.original_bill_id
       LEFT JOIN stores s ON s.id = sr.store_id
       LEFT JOIN users u ON u.id = sr.created_by
       LEFT JOIN users approver ON approver.id = COALESCE(sr.approved_by, sr.completed_by)
       WHERE sr.status IN ('completed', 'approved')
       GROUP BY sr.id, s.name, u.name, approver.name, sb.customer_mobile, sb.customer_name, sb.bill_number
     )
     SELECT
       ROW_NUMBER() OVER (ORDER BY ledger.transaction_time DESC, ledger.id DESC) AS ledger_id,
       ledger.*,
       TO_CHAR(ledger.transaction_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') AS transaction_time_display,
       TO_CHAR(ledger.approval_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') AS approval_time_display,
       TO_CHAR(ledger.inventory_sync_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') AS inventory_sync_time_display,
       TO_CHAR(ledger.log_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') AS log_time_display
     FROM ledger
     WHERE ${conditions.join(" AND ")}
     ORDER BY ledger.transaction_time DESC, ledger.id DESC
     LIMIT 2000`,
    params,
  );

  return res.rows.map((row) => ({
    id: row.id,
    ledger_id: Number(row.ledger_id),
    inventory_source_id: row.inventory_source_id || "",
    inventory_source_type: row.inventory_source_type || "",
    source_name: row.source_name || "",
    user_name: row.user_name || "-",
    transaction_party_id: row.transaction_party_id || "0",
    transaction_party_type: row.transaction_party_type || "",
    transaction_party_name: row.transaction_party_name || "-",
    transaction_id: row.transaction_id || "",
    transaction_type: row.transaction_type || "",
    transaction_sub_type: row.transaction_sub_type || "",
    trans_ref1: row.trans_ref1 || "-",
    trans_ref2: row.trans_ref2 || "-",
    audit_id: row.audit_id || "-",
    total_item_count: number(row.total_item_count),
    total_item_quantity: number(row.total_item_quantity),
    total_transaction_value: Number(
      number(row.total_transaction_value).toFixed(4),
    ),
    transaction_user: row.transaction_user || "-",
    transaction_time: row.transaction_time_display || "",
    total_approved_quantity: number(row.total_approved_quantity),
    total_approved_value: Number(number(row.total_approved_value).toFixed(4)),
    approval_status: row.approval_status || "",
    approval_user: row.approval_user || "-",
    approval_time: row.approval_time_display || "",
    inventory_sync_status: row.inventory_sync_status || "",
    inventory_sync_time: row.inventory_sync_time_display || "",
    log_time: row.log_time_display || "-",
  }));
}

async function getUnfulfilledStockTransfersReport(filters, user) {
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  const conditions = [
    `DATE(st.created_at AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2`,
    `st.status <> 'confirmed'`,
  ];
  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: "st.destination_id",
    requestedStoreId: filters.store,
  });

  const res = await query(
    `SELECT st.id, st.transaction_id, st.created_at, st.status,
            COALESCE(src.name, '') AS source_name,
            COALESCE(dst.name, '') AS destination_name,
            COALESCE(p.name, sti.product_name, 'Product') AS product,
            COALESCE(p.sku, '') AS sku,
            sti.qty
     FROM stock_transfer st
     LEFT JOIN stores src ON src.id = st.source_id
     LEFT JOIN stores dst ON dst.id = st.destination_id
     LEFT JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
     LEFT JOIN products p ON p.id = sti.product_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY st.created_at DESC, st.id DESC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row) => ({
    id: `transfer-${row.id}-${row.sku || row.product}`,
    transfer_id: row.transaction_id || `TRN-${String(row.id).padStart(4, "0")}`,
    date: isoDate(row.created_at),
    source: row.source_name || "",
    destination: row.destination_name || "",
    store: row.destination_name || "",
    product: row.product || "",
    sku: row.sku || "",
    requested_qty: number(row.qty),
    pending_qty: number(row.qty),
    status: row.status || "draft",
    unit: "PCS",
    opening_stock: 0,
    stock_in: 0,
    stock_out: number(row.qty),
    current_stock: number(row.qty),
  }));
}

async function getStockMovementDetailLogsReport(filters, user) {
  const range = parseDateRange(filters.date_range);
  const assignedStores = (user.assigned_stores || [])
    .map(Number)
    .filter(Number.isFinite);
  const params = [range.from, range.to];
  let storeClause = "";
  if (user.role !== "super_admin") {
    if (!assignedStores.length) return [];
    params.push(assignedStores);
    storeClause = ` AND m.store_id = ANY($${params.length}::int[])`;
  } else if (filters.store && filters.store !== "all") {
    params.push(Number(filters.store));
    storeClause = ` AND m.store_id = $${params.length}`;
  }
  const res = await query(
    `SELECT m.*, COALESCE(p.name, 'Product') AS product, p.sku, COALESCE(s.name, 'Store') AS store
     FROM inventory_batch_movements m
     LEFT JOIN products p ON p.id = m.product_id
     LEFT JOIN stores s ON s.id = m.store_id
     WHERE DATE(m.created_at AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2 ${storeClause}
     ORDER BY m.created_at DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `movement-${row.id}`,
    date: isoDate(row.created_at),
    time: displayTime(row.created_at),
    product: row.product,
    sku: row.sku || "",
    store: row.store,
    direction: row.direction,
    qty: number(row.qty),
    quantity: number(row.qty),
    reference_type: row.reference_type || "",
    reference_id: row.reference_id || "",
    status: row.direction === "in" ? "Stock In" : "Stock Out",
  }));
}

async function getVendorQuotationReport(filters, user) {
  await ensureProcurementSchema();
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  const conditions = [`DATE(vq.quotation_date) BETWEEN $1 AND $2`];
  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: "vq.store_id",
    requestedStoreId: filters.store,
  });

  const res = await query(
    `SELECT vq.id, vq.transaction_id, vq.quotation_no, vq.quotation_date, vq.delivery_days,
            vq.freight_amount, vq.status, COALESCE(v.name, 'Vendor') AS vendor,
            COALESCE(s.name, 'Store') AS store,
            COUNT(vqi.id)::int AS items,
            COALESCE(SUM(vqi.qty * vqi.quoted_price + vqi.tax_value), 0) AS amount
     FROM vendor_quotations vq
     LEFT JOIN vendors v ON v.id = vq.vendor_id
     LEFT JOIN stores s ON s.id = vq.store_id
     LEFT JOIN vendor_quotation_items vqi ON vqi.quotation_id = vq.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY vq.id, v.name, s.name
     ORDER BY vq.quotation_date DESC, vq.created_at DESC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row) => {
    const amount = number(row.amount);
    const score = Math.max(
      0,
      Math.round(
        100 -
          number(row.delivery_days) * 2 -
          (number(row.freight_amount) / Math.max(amount || 1, 1)) * 10,
      ),
    );
    return {
      id: `quote-${row.id}`,
      quote_id:
        row.transaction_id ||
        row.quotation_no ||
        `VQ-${String(row.id).padStart(4, "0")}`,
      date: isoDate(row.quotation_date),
      vendor: row.vendor,
      store: row.store,
      items: number(row.items),
      amount: money(amount),
      freight: money(row.freight_amount),
      lead_days: number(row.delivery_days),
      score,
      status: row.status || "Draft",
    };
  });
}

async function getPurchaseReturnReport(filters, user) {
  await ensureProcurementSchema();
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  const conditions = [`DATE(pr.return_date) BETWEEN $1 AND $2`];
  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: "pr.store_id",
    requestedStoreId: filters.store,
  });

  const res = await query(
    `SELECT pr.id, pr.transaction_id, pr.return_date, pr.total_qty, pr.total_amount,
            pr.status, pr.reason, COALESCE(v.name, 'Vendor') AS vendor, COALESCE(s.name, 'Store') AS store
     FROM purchase_returns pr
     LEFT JOIN vendors v ON v.id = pr.vendor_id
     LEFT JOIN stores s ON s.id = pr.store_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY pr.return_date DESC, pr.created_at DESC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row) => ({
    id: `purchase-return-${row.id}`,
    return_id: row.transaction_id || `PR-${String(row.id).padStart(4, "0")}`,
    date: isoDate(row.return_date),
    vendor: row.vendor,
    store: row.store,
    qty: number(row.total_qty),
    amount: money(row.total_amount),
    status: row.status || "Draft",
    reason: row.reason || "",
  }));
}

async function getVendorLedgerReport(filters, user) {
  await ensureProcurementSchema();
  await ensureVendorInvoicesSchema();
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  const conditions = [
    `DATE(ledger.entry_at AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2`,
  ];
  if (user.role !== "super_admin") {
    const assignedStores = (user.assigned_stores || [])
      .map(Number)
      .filter(Number.isFinite);
    if (!assignedStores.length) conditions.push("1 = 0");
    else {
      params.push(assignedStores);
      conditions.push(
        `(ledger.store_id IS NULL OR ledger.store_id = ANY($${params.length}::int[]))`,
      );
    }
  }

  const res = await query(
    `WITH ledger AS (
       SELECT vi.created_at AS entry_at, vi.vendor_id, v.name AS vendor_name,
              COALESCE(po.destination_id, si.destination_id) AS store_id,
              vi.transaction_id, vi.invoice_number AS reference_no,
              'Invoice' AS entry_type, vi.total_amount AS debit, 0::numeric AS credit, vi.remarks
       FROM vendor_invoices vi
       LEFT JOIN vendors v ON v.id = vi.vendor_id
       LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
       LEFT JOIN stock_in si ON si.id = vi.stock_in_id
       UNION ALL
       SELECT vis.created_at AS entry_at, vi.vendor_id, v.name AS vendor_name,
              COALESCE(po.destination_id, si.destination_id) AS store_id,
              vi.transaction_id, vis.reference_no,
              'Payment' AS entry_type, 0::numeric AS debit, vis.amount AS credit, vis.remarks
       FROM vendor_invoice_settlements vis
       JOIN vendor_invoices vi ON vi.id = vis.vendor_invoice_id
       LEFT JOIN vendors v ON v.id = vi.vendor_id
       LEFT JOIN purchase_orders po ON po.id = vi.purchase_order_id
       LEFT JOIN stock_in si ON si.id = vi.stock_in_id
       UNION ALL
       SELECT pr.created_at AS entry_at, pr.vendor_id, v.name AS vendor_name,
              pr.store_id, pr.transaction_id, pr.transaction_id AS reference_no,
              'Purchase Return' AS entry_type, 0::numeric AS debit, pr.total_amount AS credit, pr.reason AS remarks
       FROM purchase_returns pr
       LEFT JOIN vendors v ON v.id = pr.vendor_id
     )
     SELECT ledger.*,
            SUM(debit - credit) OVER (PARTITION BY vendor_id ORDER BY entry_at, transaction_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
     FROM ledger
     WHERE ${conditions.join(" AND ")}
     ORDER BY entry_at DESC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row, index) => ({
    id: `vendor-ledger-${index}`,
    date: isoDate(row.entry_at),
    vendor: row.vendor_name || "Vendor",
    entry_type: row.entry_type,
    transaction_id: row.transaction_id || "",
    reference_no: row.reference_no || "",
    debit: money(row.debit),
    credit: money(row.credit),
    balance: money(row.balance),
    remarks: row.remarks || "",
  }));
}

async function getVendorPerformanceReport(filters, user) {
  const rows = await getPurchaseFamilyReport(
    "purchase/vendor-purchase-summary",
    filters,
    user,
  );
  const byVendor = new Map();
  rows.forEach((row) => {
    const current = byVendor.get(row.vendor) || {
      vendor: row.vendor,
      po_count: 0,
      purchase_value: 0,
      return_count: 0,
      outstanding: 0,
    };
    current.po_count += 1;
    current.purchase_value += number(
      String(row.grand_total || row.total_amount || "0").replace(/,/g, ""),
    );
    byVendor.set(row.vendor, current);
  });
  return [...byVendor.values()].map((row, index) => {
    const score = Math.max(50, Math.min(100, 100 - row.return_count * 5));
    return {
      id: `vendor-performance-${index}`,
      vendor: row.vendor,
      score,
      grade: score >= 85 ? "A" : score >= 70 ? "B" : "C",
      po_count: row.po_count,
      purchase_value: money(row.purchase_value),
      avg_lead_days: 0,
      return_count: row.return_count,
      outstanding: money(row.outstanding),
    };
  });
}

async function getAutoReorderReport(filters, user) {
  await ensureProcurementSchema();
  await ensureInventoryBatchSchema();
  const params = [];
  const conditions = ["ps.is_active = TRUE"];
  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: "ps.store_id",
    requestedStoreId: filters.store,
  });

  const res = await query(
    `WITH stock AS (
       SELECT product_id, store_id, COALESCE(SUM(available_qty), 0) AS available_qty
       FROM inventory_batches
       WHERE status = 'active'
       GROUP BY product_id, store_id
     )
     SELECT p.name AS product, p.sku, COALESCE(s.name, 'Store') AS store,
            COALESCE(stock.available_qty, 0) AS current_stock,
            COALESCE(NULLIF(ps.low_stock_value, 0), 10) AS reorder_level,
            GREATEST(COALESCE(NULLIF(ps.low_stock_value, 0), 10) * 2 - COALESCE(stock.available_qty, 0), 0) AS suggested_qty,
            COALESCE(p.cost_price, 0) AS cost,
            last_vendor.vendor_name AS vendor
     FROM product_saleability ps
     JOIN products p ON p.id = ps.product_id
     JOIN stores s ON s.id = ps.store_id
     LEFT JOIN stock ON stock.product_id = ps.product_id AND stock.store_id = ps.store_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(v.name, si.vendor_name) AS vendor_name
       FROM stock_in_items sii
       JOIN stock_in si ON si.id = sii.stock_in_id
       LEFT JOIN vendors v ON v.id = si.vendor_id
       WHERE sii.product_id = p.id AND si.vendor_id IS NOT NULL
       ORDER BY si.confirmed_at DESC NULLS LAST, si.created_at DESC
       LIMIT 1
     ) last_vendor ON TRUE
     WHERE ${conditions.join(" AND ")}
       AND COALESCE(stock.available_qty, 0) <= COALESCE(NULLIF(ps.low_stock_value, 0), 10)
     ORDER BY suggested_qty DESC, p.name ASC
     LIMIT 1000`,
    params,
  );

  return res.rows.map((row, index) => ({
    id: `auto-reorder-${index}`,
    product: row.product,
    sku: row.sku || "",
    store: row.store,
    current_stock: number(row.current_stock),
    reorder_level: number(row.reorder_level),
    suggested_qty: number(row.suggested_qty),
    vendor: row.vendor || "",
    cost: money(row.cost),
  }));
}

async function getPurchaseFamilyReport(reportKey, filters, user) {
  await ensureStockInSchema();
  await ensureVendorsSchema();
  await ensurePurchaseOrderSchema();
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  const poConditions = [
    `DATE(COALESCE(po.confirmed_at, po.created_at) AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2`,
  ];
  const stockConditions = [
    `DATE(COALESCE(si.confirmed_at, si.created_at) AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2`,
  ];
  const requestedStoreId = Number(filters.store || 0) || null;
  const assignedStores = (user.assigned_stores || [])
    .map(Number)
    .filter(Number.isFinite);
  if (user.role === "super_admin") {
    if (requestedStoreId) {
      params.push(requestedStoreId);
      poConditions.push(`po.destination_id = $${params.length}`);
      stockConditions.push(`si.destination_id = $${params.length}`);
    }
  } else if (requestedStoreId && assignedStores.includes(requestedStoreId)) {
    params.push(requestedStoreId);
    poConditions.push(`po.destination_id = $${params.length}`);
    stockConditions.push(`si.destination_id = $${params.length}`);
  } else if (assignedStores.length) {
    params.push(assignedStores);
    poConditions.push(`po.destination_id = ANY($${params.length}::int[])`);
    stockConditions.push(`si.destination_id = ANY($${params.length}::int[])`);
  } else {
    poConditions.push("1 = 0");
    stockConditions.push("1 = 0");
  }
  const productJoin =
    reportKey.includes("product") || reportKey.includes("details");
  const res = await query(
    `SELECT *
     FROM (
       SELECT
         po.id,
         po.transaction_id,
         po.invoice_number,
         po.invoice_date,
         COALESCE(v.name, 'Vendor') AS vendor_name,
         po.vendor_id,
         po.total_items,
         po.total_cost,
         po.total_tax,
         po.status,
         COALESCE(po.confirmed_at, po.created_at) AS created_at,
         COALESCE(s.name, 'Store') AS store,
         'purchase_order' AS source_type
         ${productJoin ? `, COALESCE(p.name, poi.product_name, 'Product') AS product, p.sku, poi.qty, poi.cost_price, poi.tax_value` : ""}
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN stores s ON s.id = po.destination_id
       ${productJoin ? "LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id LEFT JOIN products p ON p.id = poi.product_id" : ""}
       WHERE ${poConditions.join(" AND ")}

       UNION ALL

       SELECT
         si.id,
         si.transaction_id,
         si.invoice_number,
         si.invoice_date,
         COALESCE(v.name, NULLIF(si.vendor_name, ''), 'Vendor') AS vendor_name,
         si.vendor_id,
         si.total_items,
         si.total_cost,
         si.total_tax,
         si.status,
         COALESCE(si.confirmed_at, si.created_at) AS created_at,
         COALESCE(s.name, 'Store') AS store,
         'stock_in' AS source_type
         ${productJoin ? `, COALESCE(p.name, sii.product_name, 'Product') AS product, p.sku, sii.qty, sii.cost_price, sii.tax_value` : ""}
       FROM stock_in si
       LEFT JOIN vendors v ON v.id = si.vendor_id OR LOWER(v.name) = LOWER(COALESCE(si.vendor_name, ''))
       LEFT JOIN stores s ON s.id = si.destination_id
       ${productJoin ? "LEFT JOIN stock_in_items sii ON sii.stock_in_id = si.id LEFT JOIN products p ON p.id = sii.product_id" : ""}
       WHERE ${stockConditions.join(" AND ")}
         AND COALESCE(si.reference_type, '') <> 'purchase_order'
     ) purchases
     ORDER BY created_at DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row, index) => ({
    id: `purchase-${row.id}-${index}`,
    po_id: row.transaction_id || row.id,
    purchase_order_id: row.transaction_id || row.id,
    vendor: row.vendor_name || "Vendor",
    store: row.store,
    date: isoDate(row.invoice_date || row.created_at),
    invoice_number: row.invoice_number || "",
    product: row.product || "",
    sku: row.sku || "",
    qty: number(row.qty || row.total_items),
    items: number(row.total_items || row.qty),
    rate: money(row.cost_price),
    total_amount: money(
      row.total_cost || number(row.qty) * number(row.cost_price),
    ),
    tax: money(row.total_tax || row.tax_value),
    grand_total: money(
      number(row.total_cost || number(row.qty) * number(row.cost_price)) +
        number(row.total_tax || row.tax_value),
    ),
    status: row.status,
  }));
}

async function getPromotionsFamilyReport(reportKey, filters, user) {
  if (reportKey.includes("coupon-redemption"))
    return getCouponRedemptionReport(filters, user);
  if (reportKey.includes("membership"))
    return getMembershipReport(filters, user);
  if (
    reportKey.includes("discounted-products") ||
    reportKey.includes("product-discount")
  )
    return getDiscountedProductsReport(filters, user);

  const params = [];
  const conditions = [
    `sb.status IN ('paid', 'completed')`,
    `COALESCE(sb.discount_total, 0) > 0`,
  ];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });
  const res = await query(
    `SELECT sb.id, sb.bill_number, sb.created_at, sb.discount_total, sb.grand_total,
            COALESCE(s.name, 'Store') AS store, sb.customer_name
     FROM sales_bills sb
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY sb.created_at DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `promo-${row.id}`,
    order_id: row.id,
    invoice_number: row.bill_number,
    date: isoDate(row.created_at),
    store: row.store,
    customer: row.customer_name || "Walk-in Customer",
    coupon: "",
    membership: "",
    discount: money(row.discount_total),
    discount_amount: money(row.discount_total),
    sales: money(row.grand_total),
    gross_bill: money(row.grand_total),
    status: "Applied",
  }));
}

async function getCouponRedemptionReport(filters, user) {
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  const conditions = [
    `COALESCE(v.is_used, false) = true`,
    `DATE(COALESCE(v.updated_at, v.created_at) AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2`,
  ];
  addStoreColumnScope({
    conditions,
    params,
    user,
    columnName: "v.store_id",
    requestedStoreId: filters.store,
  });

  const res = await query(
    `SELECT v.id, v.code, v.value, v.voucher_type, v.redeemed_count, v.updated_at, v.created_at,
            COALESCE(s.name, 'Store') AS store,
            COALESCE(c.name, '') AS customer
     FROM vouchers v
     LEFT JOIN stores s ON s.id = v.store_id
     LEFT JOIN customers c ON c.id = v.customer_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY COALESCE(v.updated_at, v.created_at) DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `coupon-${row.id}`,
    date: isoDate(row.updated_at || row.created_at),
    store: row.store,
    customer: row.customer || "",
    coupon: row.code,
    voucher: row.code,
    discount: money(row.value),
    discount_amount: money(row.value),
    redeemed_count: number(row.redeemed_count || 1),
    status: "Redeemed",
    type: row.voucher_type || "",
  }));
}

async function getMembershipReport(filters, user) {
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  const conditions = [
    `DATE(m.created_at AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2`,
  ];
  const res = await query(
    `SELECT m.id, m.name, m.membership_code, m.price, m.quantity, m.validity_days,
            m.discount_type, m.discount_value, m.is_active, m.created_at,
            COALESCE(c.name, '') AS category
     FROM memberships m
     LEFT JOIN categories c ON c.id = m.category_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY m.created_at DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `membership-${row.id}`,
    date: isoDate(row.created_at),
    membership: row.name,
    membership_code: row.membership_code || "",
    category: row.category || "",
    sales: money(row.price),
    gross_bill: money(row.price),
    discount: row.discount_value
      ? `${row.discount_type || ""} ${row.discount_value}`.trim()
      : "",
    qty: number(row.quantity),
    validity_days: number(row.validity_days),
    status: row.is_active ? "Active" : "Inactive",
  }));
}

async function getDiscountedProductsReport(filters, user) {
  const params = [];
  const conditions = [
    `sb.status IN ('paid', 'completed')`,
    `COALESCE(sbi.discount_amount, 0) > 0`,
  ];
  addSalesFilters({ conditions, params, filters, user, alias: "sb" });
  const res = await query(
    `SELECT sb.id AS order_id, sb.bill_number, sb.created_at,
            COALESCE(s.name, 'Store') AS store,
            COALESCE(p.name, sbi.product_name, 'Product') AS product,
            COALESCE(p.sku, sbi.sku, '') AS sku,
            sbi.qty, sbi.selling_price, sbi.discount_amount, sbi.line_total,
            sbi.promotion_id, sbi.promotion_name, sbi.is_promotion_free
     FROM sales_bill_items sbi
     INNER JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
     LEFT JOIN products p ON p.id = sbi.product_id
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY sb.created_at DESC
     LIMIT 1000`,
    params,
  );
  return res.rows.map((row) => ({
    id: `discount-product-${row.order_id}-${row.sku}`,
    date: isoDate(row.created_at),
    order_id: row.order_id,
    invoice_number: row.bill_number,
    store: row.store,
    product: row.product,
    sku: row.sku,
    promotion: row.promotion_name || "",
    discount_type: row.is_promotion_free ? "Promotion free item" : "Discount",
    is_promotion_free: Boolean(row.is_promotion_free),
    qty: number(row.qty),
    sales: money(number(row.qty) * number(row.selling_price)),
    discount: money(row.discount_amount),
    discount_amount: money(row.discount_amount),
    gross_bill: money(row.line_total),
    status: "Discounted",
  }));
}

async function getInsightsFamilyReport(reportKey, filters, user) {
  if (
    reportKey.includes("dead-stock") ||
    reportKey.includes("stockout") ||
    reportKey.includes("smart-reorder")
  ) {
    const rows = await getStockLevelReport(filters, user);
    return rows
      .filter((row) =>
        reportKey.includes("dead-stock")
          ? number(row.current_stock) > 0
          : number(row.current_stock) <= 0 || row.status === "Low",
      )
      .map((row) => ({
        ...row,
        risk:
          row.status === "Out"
            ? "High"
            : row.status === "Low"
              ? "Medium"
              : "Low",
        recommendation:
          row.status === "Out"
            ? "Reorder immediately"
            : row.status === "Low"
              ? "Plan reorder"
              : "Review movement",
      }));
  }
  if (reportKey.includes("basket"))
    return getProductInOrdersReport(filters, user);
  if (reportKey.includes("purchase-price"))
    return getPurchaseFamilyReport(
      "purchase/product-in-purchase-orders",
      filters,
      user,
    );
  return getSalesDimensionReport("sales/product-wise-sales", filters, user);
}

async function getLogsFamilyReport(reportKey, filters, user) {
  if (reportKey.includes("audit-trail"))
    return getAuditLogReport(filters, user, "");
  if (reportKey.includes("system"))
    return getAuditLogReport(filters, user, "system");
  if (reportKey.includes("order-sync"))
    return getAuditLogReport(filters, user, "order");
  if (reportKey.includes("product")) {
    const auditRows = await getAuditLogReport(filters, user, "product");
    if (auditRows.length) return auditRows;
    const range = parseDateRange(filters.date_range);
    const res = await query(
      `SELECT p.id, p.name, p.sku, p.updated_at
       FROM products p
       WHERE DATE(COALESCE(p.updated_at, p.created_at) AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2
       ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
       LIMIT 1000`,
      [range.from, range.to],
    );
    return res.rows.map((row) => ({
      id: `product-log-${row.id}`,
      date: isoDate(row.updated_at),
      time: displayTime(row.updated_at),
      product: row.name,
      sku: row.sku || "",
      resource_type: "product",
      resource_id: row.id,
      action: "Updated",
      employee: "",
      status: "Logged",
    }));
  }
  const rows = await getOrdersReport(filters, user);
  return rows.map((row) => ({
    ...row,
    action: reportKey.includes("sync") ? "Synced" : "System activity",
    status: row.payment_status || "Logged",
  }));
}

async function getAuditLogReport(filters, user, type = "") {
  const range = parseDateRange(filters.date_range);
  const params = [range.from, range.to];
  // audit_logs.created_at is a legacy timestamp without time zone and is stored
  // in UTC, so attach UTC before converting it to the India business date.
  const conditions = [
    `DATE(al.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2`,
  ];
  if (type === "product") {
    conditions.push(`LOWER(COALESCE(al.resource_type, '')) LIKE '%product%'`);
  } else if (type === "order") {
    conditions.push(
      `(LOWER(COALESCE(al.resource_type, '')) LIKE '%order%' OR LOWER(COALESCE(al.action, '')) LIKE '%sync%')`,
    );
  }
  const res = await query(
    `SELECT al.id, al.action, al.resource_type, al.resource_id, al.status, al.error_message, al.details,
            al.created_at, COALESCE(u.name, u.email, '') AS employee
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY al.created_at DESC
     LIMIT 1000`,
    params,
  );
  const actionLabel = (action) =>
    ({
      "batch.store_price_synced": "Store price synced to matching batches",
      "inventory_batch.prices_updated": "Batch price updated",
      "inventory_batch.prices_updated_bulk": "Batch prices updated in bulk",
      "batch.status_updated": "Batch status changed",
      "product.prices_updated": "Product master price updated",
      "product.prices_updated_bulk": "Product master prices updated in bulk",
    })[action] ||
    String(action || "System activity")
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const resourceLabel = (typeName) =>
    ({ product: "Product", inventory_batch: "Inventory Batch" })[typeName] ||
    String(typeName || "—")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const detailsText = (row) => {
    const details = row.details && typeof row.details === "object" ? row.details : {};
    if (row.action === "batch.store_price_synced") {
      const count = Array.isArray(details.updatedBatchIds) ? details.updatedBatchIds.length : 0;
      const previous = details.previous || {};
      const next = details.next || {};
      return `${count} matching batch(es) updated. MRP ${previous.mrp ?? "—"} → ${next.mrp ?? "—"}; SP ${previous.sellingPrice ?? "—"} → ${next.sellingPrice ?? "—"}.`;
    }
    if (row.action === "batch.status_updated") {
      return `Batch marked ${details.nextStatus || "updated"}; available quantity remained ${details.availableQty ?? "unchanged"}.`;
    }
    return row.error_message || "—";
  };
  return res.rows.map((row) => ({
    id: `audit-${row.id}`,
    date: isoDate(row.created_at),
    time: displayTime(row.created_at),
    action: actionLabel(row.action),
    resource_type: resourceLabel(row.resource_type),
    resource_id: row.resource_id || "",
    employee: row.employee || "",
    status: row.status || (row.error_message ? "Failed" : "Logged"),
    remarks: detailsText(row),
    product: row.resource_type === "product" ? row.resource_id : "",
    order_id: row.resource_type === "order" ? row.resource_id : "",
  }));
}

export async function getLiveReportsDashboard(user) {
  await ensureReportSchemas();
  const today = businessDate();
  const yesterday = businessDate(-1);

  const todayParams = [today];
  const todayConditions = [
    `DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') = $1::date`,
    `sb.status IN ('paid', 'completed', 'partial', 'pending')`,
  ];
  addDashboardStoreScope({
    conditions: todayConditions,
    params: todayParams,
    user,
    alias: "sb",
  });

  const yesterdayParams = [yesterday];
  const yesterdayConditions = [
    `DATE(sb.created_at AT TIME ZONE 'Asia/Kolkata') = $1::date`,
    `sb.status IN ('paid', 'completed', 'partial', 'pending')`,
  ];
  addDashboardStoreScope({
    conditions: yesterdayConditions,
    params: yesterdayParams,
    user,
    alias: "sb",
  });

  const stockParams = [];
  const stockConditions = ["ps.is_active = TRUE"];
  addDashboardStoreScope({
    conditions: stockConditions,
    params: stockParams,
    user,
    alias: "ps",
  });

  const [todaySalesResult, yesterdaySalesResult, stockResult, stores] =
    await Promise.all([
      query(
        `SELECT
         COUNT(*)::int AS orders,
         COALESCE(SUM(sb.grand_total), 0)::numeric AS gross_sales,
         COALESCE(SUM(sb.tax_total), 0)::numeric AS tax_total,
         COALESCE(SUM(sb.discount_total), 0)::numeric AS discount_total
       FROM sales_bills sb
       WHERE ${todayConditions.join(" AND ")}`,
        todayParams,
      ),
      query(
        `SELECT
         COUNT(*)::int AS orders,
         COALESCE(SUM(sb.grand_total), 0)::numeric AS gross_sales,
         COALESCE(SUM(sb.tax_total), 0)::numeric AS tax_total,
         COALESCE(SUM(sb.discount_total), 0)::numeric AS discount_total
       FROM sales_bills sb
       WHERE ${yesterdayConditions.join(" AND ")}`,
        yesterdayParams,
      ),
      query(
        `WITH stock AS (
         SELECT product_id, store_id, COALESCE(SUM(available_qty), 0) AS available_qty
         FROM inventory_batches
         WHERE status = 'active'
         GROUP BY product_id, store_id
       )
       SELECT
         COUNT(DISTINCT ps.product_id)::int AS skus,
         COUNT(DISTINCT CASE
           WHEN COALESCE(stock.available_qty, 0) <= COALESCE(NULLIF(ps.low_stock_value, 0), 10)
           THEN ps.product_id
         END)::int AS low_skus
       FROM product_saleability ps
       LEFT JOIN stock ON stock.product_id = ps.product_id AND stock.store_id = ps.store_id
       WHERE ${stockConditions.join(" AND ")}`,
        stockParams,
      ),
      getStoresForUser(user),
    ]);

  const todaySales = todaySalesResult.rows[0] || {};
  const yesterdaySales = yesterdaySalesResult.rows[0] || {};
  const stock = stockResult.rows[0] || {};
  const todayGross = number(todaySales.gross_sales);
  const yesterdayGross = number(yesterdaySales.gross_sales);
  const todayNet = Math.max(
    0,
    todayGross -
      number(todaySales.tax_total) -
      number(todaySales.discount_total),
  );
  const yesterdayNet = Math.max(
    0,
    number(yesterdaySales.gross_sales) -
      number(yesterdaySales.tax_total) -
      number(yesterdaySales.discount_total),
  );
  const changeLabel = (current, previous) => {
    if (!previous && !current) return "0%";
    if (!previous) return "+100%";
    const change = ((current - previous) / previous) * 100;
    const rounded =
      Math.abs(change) >= 10 ? change.toFixed(0) : change.toFixed(1);
    return `${change >= 0 ? "+" : ""}${rounded}%`;
  };

  return {
    stores,
    pinned: {
      orders: {
        value: number(todaySales.orders),
        label: `${number(todaySales.orders)} orders`,
        change: changeLabel(
          number(todaySales.orders),
          number(yesterdaySales.orders),
        ),
      },
      dailySales: {
        value: todayGross,
        label: `₹${money(todayGross)}`,
        change: changeLabel(todayGross, yesterdayGross),
      },
      netSales: {
        value: todayNet,
        label: `₹${money(todayNet)}`,
        change: changeLabel(todayNet, yesterdayNet),
      },
      stockLevel: {
        value: number(stock.skus),
        low: number(stock.low_skus),
        label: `${number(stock.skus)} SKUs`,
      },
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getReportsDashboard(user) {
  await ensureReportSchemas();
  const today = businessDate();
  const filters = { date_range: `${today} - ${today}` };
  const [orders, dailySales, netSales, stockRows, stores] = await Promise.all([
    getOrdersReport(filters, user),
    getDailySalesReport(filters, user),
    getNetSalesReport(filters, user),
    getStockLevelReport({}, user),
    getStoresForUser(user),
  ]);

  const dailyTotal = dailySales.reduce(
    (sum, row) => sum + number(String(row.gross_bill).replace(/,/g, "")),
    0,
  );
  const netTotal = netSales.reduce(
    (sum, row) => sum + number(String(row.net_sales).replace(/,/g, "")),
    0,
  );
  const lowStock = stockRows.filter(
    (row) => row.status === "Low" || row.status === "Out",
  );

  return {
    stores,
    pinned: {
      orders: { value: orders.length, label: `${orders.length} orders` },
      dailySales: { value: dailyTotal, label: `₹${money(dailyTotal)}` },
      netSales: { value: netTotal, label: `₹${money(netTotal)}` },
      stockLevel: {
        value: stockRows.length,
        low: lowStock.length,
        label: `${stockRows.length} SKUs`,
      },
    },
  };
}

export function createReportWorkbookBuffer(definition, rows) {
  const headers = definition.columns.map((column) => column.label);
  const body = rows.map((row) =>
    definition.columns.map((column) => row[column.key] ?? ""),
  );
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    definition.worksheet || definition.title || "Report",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
