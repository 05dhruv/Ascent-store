"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import InventoryShell from "@/components/inventory/InventoryShell";
import SearchableSelect from "@/components/SearchableSelect";
import {
  formatIndianDate,
  isPastDateValue,
  toDateInputValue,
} from "@/lib/dateUtils";
import {
  getBulkField,
  parseBulkSheet,
  pickSpreadsheetFile,
} from "@/lib/bulkSheet";
import { fetchAllCatalogProducts } from "@/lib/productPagination";
import {
  OPTIONS_SHEET_NAME,
  addOptionNamedRanges,
  applyTextFormatToColumns,
  excelText,
  hideOptionsSheet,
  optionFormula,
  prefixMatchOptionFormula,
  saveWorkbookWithValidations,
  sortOptions,
  uniqueOptions,
} from "@/lib/xlsxDropdowns";

async function fetchStores() {
  const res = await fetch("/api/stores?include_locations=all");
  if (!res.ok) throw new Error("Failed to fetch stores");
  const json = await res.json();
  return json.data?.records || json.data?.stores || json.stores || [];
}

function getLocationType(store) {
  return String(store?.meta?.locationType || store?.locationType || "")
    .trim()
    .toLowerCase();
}

function isWarehouseLocation(store) {
  return getLocationType(store) === "warehouse";
}

async function fetchStockInList(filters = {}, signal) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.source) params.set("source", filters.source);
  if (filters.destination) params.set("destination", filters.destination);
  if (filters.brand) params.set("brand", filters.brand);
  const qs = params.toString();
  const res = await fetch(`/api/inventory/stockin${qs ? `?${qs}` : ""}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch stock in records");
  return res.json();
}

async function postStockIn(payload) {
  const res = await fetch("/api/inventory/stockin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Failed to create stock in");
  return json;
}

async function fetchCatalogOptions(endpoint) {
  const res = await fetch(endpoint);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  const records = json.data?.records || json.records || [];
  return Array.isArray(records) ? records : [];
}

const tableHeaders = [
  "GRN / Inward No",
  "Received By",
  "Inward Date",
  "Challan / Invoice No",
  "Brand / Make",
  "Supplier / Vendor",
  "Site / Warehouse",
  "Status",
  "Challan / Invoice Date",
  "Material Items",
  "Received Quantity",
  "Total Amount",
  "PO / Ref Type",
  "PO / Work Order No",
];

function formatDate(value) {
  return formatIndianDate(value, "—");
}

function formatCost(value) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 6 })}`;
}

function formatUnitPrice(value) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 9 })}`;
}

function mapRecordsToTable(records) {
  return (records || []).map((row) => ({
    _id: row.id,
    _status: row.status || "confirmed",
    "GRN / Inward No": row.transactionId
      ? `#${row.transactionId}`
      : `#GRN-${row.id}`,
    "Received By": row.stockInBy || row.stockInByEmail || "—",
    "Inward Date": formatDate(row.createdAt),
    "Challan / Invoice No": row.invoiceNumber || "—",
    "Brand / Make": row.brandNames || "—",
    "Supplier / Vendor": row.vendorName || "—",
    "Site / Warehouse": row.destination || "—",
    Status:
      row.status === "margin_hold"
        ? "Margin Hold"
        : row.status === "confirmed"
          ? "Confirmed"
          : row.status || "Confirmed",
    "Challan / Invoice Date": formatDate(row.invoiceDate),
    "Material Items": row.itemCount ?? 0,
    "Received Quantity": row.totalItems ?? 0,
    "Total Amount": formatCost(row.cost),
    "PO / Ref Type": row.referenceType || "—",
    "PO / Work Order No": row.referenceId || "—",
  }));
}

function downloadCsv(rows) {
  const headers = tableHeaders;
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stock-in-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const MAX_INVOICE_UPLOAD_BYTES = 5 * 1024 * 1024;
const STOCK_IN_TEMPLATE_HEADERS = [
  "Product ID",
  "Product Name",
  "Size ID",
  "Size Name",
  "Category",
  "Brand",
  "Barcode",
  "SKU",
  "Unit",
  "Stock Items Type",
  "Quantity",
  "Cost/Unit",
  "MRP",
  "Selling Price",
  "Expiry Date",
  "Serial Number (serialNumber)",
  "serialNumber",
  "Remarks",
];
const PENDING_STOCK_IN_BULK_KEY = "pendingStockInBulkRows";
const STOCK_IN_EDIT_MANIFEST_SHEET = "_StockInEditScope";
const STOCK_IN_EDIT_ITEMS_SHEET = "Stock In Items";
const STOCK_IN_TEMPLATE_ROW_LIMIT = 5001;
const STOCK_IN_TEXT_TEMPLATE_HEADERS = [
  "Product ID",
  "Size ID",
  "Barcode",
  "SKU",
  "Serial Number (serialNumber)",
  "serialNumber",
];
const STOCK_IN_LOOKUP_HEADERS = [
  "Product ID",
  "SKU",
  "Product Name",
  "Size ID",
  "Size Name",
  "Category",
  "Brand",
  "Barcode",
  "Unit",
  "Stock Items Type",
  "Cost/Unit",
  "MRP",
  "Selling Price",
  "Expiry Date",
];

const STOCK_IN_VLOOKUP_COLUMNS = {
  "Product ID": 1,
  SKU: 2,
  "Product Name": 3,
  "Size ID": 4,
  "Size Name": 5,
  Category: 6,
  Brand: 7,
  Barcode: 8,
  Unit: 9,
  "Stock Items Type": 10,
  "Cost/Unit": 11,
  MRP: 12,
  "Selling Price": 13,
  "Expiry Date": 14,
};

const STOCK_IN_SKU_LOOKUP_COLUMNS = {
  SKU: 1,
  "Product ID": 2,
  "Product Name": 3,
  "Size ID": 4,
  "Size Name": 5,
  Category: 6,
  Brand: 7,
  Barcode: 8,
  Unit: 9,
  "Stock Items Type": 10,
  "Cost/Unit": 11,
  MRP: 12,
  "Selling Price": 13,
  "Expiry Date": 14,
};

const STOCK_IN_BARCODE_LOOKUP_COLUMNS = {
  Barcode: 1,
  "Product ID": 2,
  SKU: 3,
  "Product Name": 4,
  "Size ID": 5,
  "Size Name": 6,
  Category: 7,
  Brand: 8,
  Unit: 9,
  "Stock Items Type": 10,
  "Cost/Unit": 11,
  MRP: 12,
  "Selling Price": 13,
  "Expiry Date": 14,
};

const STOCK_IN_NAME_LOOKUP_COLUMNS = {
  "Product Name": 1,
  "Product ID": 2,
  SKU: 3,
  "Size ID": 4,
  "Size Name": 5,
  Category: 6,
  Brand: 7,
  Barcode: 8,
  Unit: 9,
  "Stock Items Type": 10,
  "Cost/Unit": 11,
  MRP: 12,
  "Selling Price": 13,
  "Expiry Date": 14,
};

const BULK_EXPIRY_KEYS = [
  "expiry_date",
  "expiry",
  "expiry_dt",
  "expire_date",
  "expiration_date",
  "exp_date",
  "warranty_expiry_date",
];

const BULK_BATCH_KEYS = [
  "batch_no",
  "batch_number",
  "batch",
  "lot_no",
  "lot_number",
  "lot_batch_no",
  "serial_heat_no",
  "serial_number_serialnumber",
  "serialnumber",
  "serial_number",
];

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function normalizeImportDate(value) {
  const normalized = toDateInputValue(value);
  if (normalized) return normalized;

  const raw = String(value ?? "").trim();
  const indianDate = raw.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/,
  );
  if (!indianDate) return "";

  const first = Number(indianDate[1]);
  const second = Number(indianDate[2]);
  const year = expandImportYear(indianDate[3]);
  return (
    formatImportDateParts(year, second, first) ||
    formatImportDateParts(year, first, second)
  );
}

function expandImportYear(value) {
  const year = Number(value);
  if (String(value).length === 2) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function formatImportDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return "";
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isMissingImportDate(value) {
  return String(value ?? "").trim() === "";
}

function parseBulkNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/[₹$]/g, "");
  if (!cleaned) return fallback;
  const direct = Number(cleaned);
  if (Number.isFinite(direct)) return direct;
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stockTemplateValue(row, keys, fallback = "") {
  return getBulkField(row, keys, fallback);
}

function stockInLookupRow(product) {
  return [
    excelText(product.id),
    excelText(product.sku),
    product.productName || "",
    excelText(product.sizeId),
    product.sizeName || "",
    product.category || "",
    product.brand || "",
    excelText(product.barcode),
    product.unit || "Piece",
    product.stockItemsType || "BATCHED",
    product.costPerUnit ?? "",
    product.mrp ?? "",
    product.sellingPrice ?? "",
    product.expiryDate || product.expiry_date || "",
  ];
}

function buildStockInOptionsSheet(XLSX, optionGroups, records) {
  const lookupRows = records.map(stockInLookupRow);
  const lookupRowsForSheet = lookupRows.length
    ? lookupRows
    : [Array.from({ length: STOCK_IN_LOOKUP_HEADERS.length }, () => "")];
  const idLookupStart = optionGroups.length + 1;
  const skuLookupStart = idLookupStart + STOCK_IN_LOOKUP_HEADERS.length + 1;
  const barcodeLookupStart =
    skuLookupStart + STOCK_IN_LOOKUP_HEADERS.length + 1;
  const nameLookupStart =
    barcodeLookupStart + STOCK_IN_LOOKUP_HEADERS.length + 1;
  const maxRows = Math.max(
    1,
    ...optionGroups.map((group) => group.values.length + 1),
    lookupRowsForSheet.length + 1,
  );
  const rows = Array.from({ length: maxRows }, () => []);

  optionGroups.forEach((group, col) => {
    rows[0][col] = group.key;
    group.values.forEach((value, row) => {
      rows[row + 1][col] = excelText(value);
    });
  });

  STOCK_IN_LOOKUP_HEADERS.forEach((header, index) => {
    rows[0][idLookupStart + index] = header;
  });
  lookupRowsForSheet.forEach((lookupRow, rowIndex) => {
    lookupRow.forEach((value, colIndex) => {
      rows[rowIndex + 1][idLookupStart + colIndex] = excelText(value);
    });
  });

  const skuLookupHeaders = [
    "SKU",
    "Product ID",
    ...STOCK_IN_LOOKUP_HEADERS.slice(2),
  ];
  skuLookupHeaders.forEach((header, index) => {
    rows[0][skuLookupStart + index] = header;
  });
  lookupRowsForSheet.forEach((lookupRow, rowIndex) => {
    const skuRow = [lookupRow[1], lookupRow[0], ...lookupRow.slice(2)];
    skuRow.forEach((value, colIndex) => {
      rows[rowIndex + 1][skuLookupStart + colIndex] = excelText(value);
    });
  });

  const barcodeLookupHeaders = [
    "Barcode",
    "Product ID",
    "SKU",
    "Product Name",
    "Size ID",
    "Size Name",
    "Category",
    "Brand",
    "Unit",
    "Stock Items Type",
    "Cost/Unit",
    "MRP",
    "Selling Price",
    "Expiry Date",
  ];
  barcodeLookupHeaders.forEach((header, index) => {
    rows[0][barcodeLookupStart + index] = header;
  });
  lookupRowsForSheet.forEach((lookupRow, rowIndex) => {
    const barcodeRow = [
      lookupRow[7],
      lookupRow[0],
      lookupRow[1],
      ...lookupRow.slice(2, 7),
      ...lookupRow.slice(8),
    ];
    barcodeRow.forEach((value, colIndex) => {
      rows[rowIndex + 1][barcodeLookupStart + colIndex] = excelText(value);
    });
  });

  const nameCounts = new Map();
  lookupRows.forEach((lookupRow) => {
    const key = compactProductLookupValue(lookupRow[2]);
    if (!key) return;
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  });
  const uniqueNameLookupRows = lookupRows.filter((lookupRow) => {
    const key = compactProductLookupValue(lookupRow[2]);
    return key && nameCounts.get(key) === 1;
  });
  const nameLookupRowsForSheet = uniqueNameLookupRows.length
    ? uniqueNameLookupRows
    : [Array.from({ length: STOCK_IN_LOOKUP_HEADERS.length }, () => "")];
  const nameLookupHeaders = [
    "Product Name",
    "Product ID",
    "SKU",
    "Size ID",
    "Size Name",
    "Category",
    "Brand",
    "Barcode",
    "Unit",
    "Stock Items Type",
    "Cost/Unit",
    "MRP",
    "Selling Price",
    "Expiry Date",
  ];
  nameLookupHeaders.forEach((header, index) => {
    rows[0][nameLookupStart + index] = header;
  });
  nameLookupRowsForSheet.forEach((lookupRow, rowIndex) => {
    const nameRow = [
      lookupRow[2],
      lookupRow[0],
      lookupRow[1],
      ...lookupRow.slice(3),
    ];
    nameRow.forEach((value, colIndex) => {
      rows[rowIndex + 1][nameLookupStart + colIndex] = excelText(value);
    });
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  for (let columnIndex = 0; columnIndex <= range.e.c; columnIndex++) {
    for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex++) {
      const ref = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      if (!worksheet[ref]) continue;
      worksheet[ref].t = "s";
      worksheet[ref].z = "@";
    }
  }

  return {
    worksheet,
    idLookupRange: `'${OPTIONS_SHEET_NAME}'!$${XLSX.utils.encode_col(
      idLookupStart,
    )}$2:$${XLSX.utils.encode_col(
      idLookupStart + STOCK_IN_LOOKUP_HEADERS.length - 1,
    )}$${lookupRowsForSheet.length + 1}`,
    skuLookupRange: `'${OPTIONS_SHEET_NAME}'!$${XLSX.utils.encode_col(
      skuLookupStart,
    )}$2:$${XLSX.utils.encode_col(
      skuLookupStart + STOCK_IN_LOOKUP_HEADERS.length - 1,
    )}$${lookupRowsForSheet.length + 1}`,
    barcodeLookupRange: `'${OPTIONS_SHEET_NAME}'!$${XLSX.utils.encode_col(
      barcodeLookupStart,
    )}$2:$${XLSX.utils.encode_col(
      barcodeLookupStart + barcodeLookupHeaders.length - 1,
    )}$${lookupRowsForSheet.length + 1}`,
    nameLookupRange: `'${OPTIONS_SHEET_NAME}'!$${XLSX.utils.encode_col(
      nameLookupStart,
    )}$2:$${XLSX.utils.encode_col(
      nameLookupStart + nameLookupHeaders.length - 1,
    )}$${nameLookupRowsForSheet.length + 1}`,
  };
}

function stockInLookupFormula(
  header,
  rowNumber,
  idLookupRange,
  skuLookupRange,
  barcodeLookupRange,
  nameLookupRange,
) {
  const productIdCell = `$A${rowNumber}`;
  const productNameCell = `$B${rowNumber}`;
  const barcodeCell = `$G${rowNumber}`;
  const skuCell = `$H${rowNumber}`;
  const textValue = (cell) => `""&${cell}`;
  const barcodeTextValue = `IF(LEFT(${textValue(
    barcodeCell,
  )},1)="'",MID(${textValue(barcodeCell)},2,32767),${textValue(barcodeCell)})`;
  const lookup = (cell, range, column) =>
    `IFERROR(VLOOKUP(${textValue(cell)},${range},${column},FALSE),"")`;
  const barcodeLookup = (column) =>
    `IFERROR(VLOOKUP(${barcodeTextValue},${barcodeLookupRange},${column},FALSE),"")`;
  const nameLookup = (column) =>
    `IFERROR(VLOOKUP(${textValue(productNameCell)},${nameLookupRange},${column},FALSE),"")`;

  if (header === "Product ID") {
    return `IF(LEN(TRIM(${skuCell}))>0,${lookup(
      skuCell,
      skuLookupRange,
      STOCK_IN_SKU_LOOKUP_COLUMNS[header],
    )},IF(LEN(TRIM(${barcodeCell}))>0,${barcodeLookup(
      STOCK_IN_BARCODE_LOOKUP_COLUMNS[header],
    )},IF(LEN(TRIM(${productNameCell}))>0,${nameLookup(
      STOCK_IN_NAME_LOOKUP_COLUMNS[header],
    )},"")))`;
  }

  if (header === "SKU") {
    return `IF(LEN(TRIM(${productIdCell}))>0,${lookup(
      productIdCell,
      idLookupRange,
      STOCK_IN_VLOOKUP_COLUMNS[header],
    )},IF(LEN(TRIM(${barcodeCell}))>0,${barcodeLookup(
      STOCK_IN_BARCODE_LOOKUP_COLUMNS[header],
    )},IF(LEN(TRIM(${productNameCell}))>0,${nameLookup(
      STOCK_IN_NAME_LOOKUP_COLUMNS[header],
    )},"")))`;
  }

  if (header === "Barcode") {
    return `IF(LEN(TRIM(${productIdCell}))>0,${lookup(
      productIdCell,
      idLookupRange,
      STOCK_IN_VLOOKUP_COLUMNS[header],
    )},IF(LEN(TRIM(${skuCell}))>0,${lookup(
      skuCell,
      skuLookupRange,
      STOCK_IN_SKU_LOOKUP_COLUMNS[header],
    )},IF(LEN(TRIM(${productNameCell}))>0,${nameLookup(
      STOCK_IN_NAME_LOOKUP_COLUMNS[header],
    )},"")))`;
  }

  const lookupColumn = STOCK_IN_VLOOKUP_COLUMNS[header];
  if (!lookupColumn) return "";
  return `IF(LEN(TRIM(${productIdCell}))>0,${lookup(
    productIdCell,
    idLookupRange,
    lookupColumn,
  )},IF(LEN(TRIM(${skuCell}))>0,${lookup(
    skuCell,
    skuLookupRange,
    STOCK_IN_SKU_LOOKUP_COLUMNS[header],
  )},IF(LEN(TRIM(${barcodeCell}))>0,${barcodeLookup(
    STOCK_IN_BARCODE_LOOKUP_COLUMNS[header],
  )},IF(LEN(TRIM(${productNameCell}))>0,${nameLookup(
    STOCK_IN_NAME_LOOKUP_COLUMNS[header],
  )},""))))`;
}

function applyStockInVlookupFormulas(
  XLSX,
  worksheet,
  idLookupRange,
  skuLookupRange,
  barcodeLookupRange,
  nameLookupRange,
) {
  const formulaHeaders = new Set(
    Object.keys(STOCK_IN_VLOOKUP_COLUMNS).filter(
      (header) => !["Product ID", "SKU", "Barcode"].includes(header),
    ),
  );
  const numericFormulaHeaders = new Set(["Cost/Unit", "MRP", "Selling Price"]);
  const dateFormulaHeaders = new Set(["Expiry Date"]);
  for (
    let rowNumber = 2;
    rowNumber <= STOCK_IN_TEMPLATE_ROW_LIMIT;
    rowNumber++
  ) {
    STOCK_IN_TEMPLATE_HEADERS.forEach((header, columnIndex) => {
      if (!formulaHeaders.has(header)) return;
      const formula = stockInLookupFormula(
        header,
        rowNumber,
        idLookupRange,
        skuLookupRange,
        barcodeLookupRange,
        nameLookupRange,
      );
      if (!formula) return;
      const ref = XLSX.utils.encode_cell({
        r: rowNumber - 1,
        c: columnIndex,
      });
      const existingValue = worksheet[ref]?.v ?? "";
      worksheet[ref] = {
        t: numericFormulaHeaders.has(header) ? "n" : "str",
        f: formula,
        v: existingValue,
      };
      if (dateFormulaHeaders.has(header)) worksheet[ref].z = "dd-mm-yy";
    });
  }
}

function clearStockInQuantityColumn(XLSX, worksheet) {
  const columnIndex = STOCK_IN_TEMPLATE_HEADERS.indexOf("Quantity");
  if (columnIndex < 0) return;
  for (
    let rowNumber = 2;
    rowNumber <= STOCK_IN_TEMPLATE_ROW_LIMIT;
    rowNumber++
  ) {
    const ref = XLSX.utils.encode_cell({
      r: rowNumber - 1,
      c: columnIndex,
    });
    delete worksheet[ref];
  }
}

function applyStockInBarcodeTextWarningCells(XLSX, worksheet, filledRowCount) {
  const columnIndex = STOCK_IN_TEMPLATE_HEADERS.indexOf("Barcode");
  if (columnIndex < 0) return;
  const column = XLSX.utils.encode_col(columnIndex);
  for (let rowNumber = 2; rowNumber <= filledRowCount + 1; rowNumber++) {
    const ref = `${column}${rowNumber}`;
    const cell = worksheet[ref];
    if (!cell || String(cell.v ?? "").trim() === "") continue;
    const value = excelText(cell.v).replace(/^'/, "");
    cell.t = "s";
    cell.v = value;
    cell.w = value;
    delete cell.z;
  }
}

function applyStockInExpiryDateFormat(XLSX, worksheet, rowLimit) {
  const columnIndex = STOCK_IN_TEMPLATE_HEADERS.indexOf("Expiry Date");
  if (columnIndex < 0) return;
  const column = XLSX.utils.encode_col(columnIndex);
  for (let rowNumber = 2; rowNumber <= rowLimit; rowNumber++) {
    const ref = `${column}${rowNumber}`;
    if (worksheet[ref]) worksheet[ref].z = "dd-mm-yy";
  }
}

function buildCreateProductUrl(row) {
  const params = new URLSearchParams();
  params.set("returnTo", "/inventory/stockin?resumeStockInBulk=1");
  params.set("source", "stock-in-bulk");
  const mappings = [
    ["name", ["product_name", "name"]],
    ["product_id", ["product_id"]],
    ["barcode", ["barcode"]],
    ["sku", ["sku"]],
    ["unit", ["unit"]],
    ["category_name", ["category"]],
    ["brand_name", ["brand"]],
    ["mrp", ["mrp"]],
    ["selling_price", ["selling_price"]],
    ["cost_price", ["cost_unit", "cost_per_unit", "cost"]],
    ["stock_item_type", ["stock_items_type"]],
    ["expiry_date", BULK_EXPIRY_KEYS],
  ];

  for (const [target, keys] of mappings) {
    const value = stockTemplateValue(row, keys);
    if (value !== "") params.set(target, String(value));
  }

  return `/catalog/products/create?${params.toString()}`;
}

function normalizeProductLookupValue(value) {
  return String(value || "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function compactProductLookupValue(value) {
  return normalizeProductLookupValue(value).replace(/[^a-z0-9]/g, "");
}

function uniqueProductsById(products) {
  const seen = new Set();
  return (products || []).filter((product) => {
    const key = String(product?.id || product?.productId || "");
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findStockInTemplateProductMatchDetail(
  products,
  { productId, productName, barcode, sku },
) {
  const lookupProductId = normalizeProductLookupValue(productId);
  const lookupBarcode = normalizeProductLookupValue(barcode);
  const lookupSku = normalizeProductLookupValue(sku);
  const lookupName = normalizeProductLookupValue(productName);
  const compactProductId = compactProductLookupValue(productId);
  const compactBarcode = compactProductLookupValue(barcode);
  const compactSku = compactProductLookupValue(sku);
  const compactName = compactProductLookupValue(productName);

  const list = Array.isArray(products) ? products : [];
  const matchBy = (values, normalizer, lookup) => {
    if (!lookup) return [];
    return uniqueProductsById(
      list.filter((product) =>
        values(product).map(normalizer).filter(Boolean).includes(lookup),
      ),
    );
  };

  const checks = [
    [
      "product_id",
      (product) => [product.id, product.productId],
      normalizeProductLookupValue,
      lookupProductId,
    ],
    [
      "product_id",
      (product) => [product.id, product.productId],
      compactProductLookupValue,
      compactProductId,
    ],
    ["sku", (product) => [product.sku], normalizeProductLookupValue, lookupSku],
    ["sku", (product) => [product.sku], compactProductLookupValue, compactSku],
    [
      "barcode",
      (product) => [product.barcode],
      normalizeProductLookupValue,
      lookupBarcode,
    ],
    [
      "barcode",
      (product) => [product.barcode],
      compactProductLookupValue,
      compactBarcode,
    ],
    [
      "name",
      (product) => [product.productName],
      normalizeProductLookupValue,
      lookupName,
    ],
    [
      "name",
      (product) => [product.productName],
      compactProductLookupValue,
      compactName,
    ],
  ];

  for (const [source, values, normalizer, lookup] of checks) {
    const matches = matchBy(values, normalizer, lookup);
    if (matches.length) {
      return {
        product: matches[0],
        matches,
        source,
      };
    }
  }

  return { product: null, matches: [], source: "" };
}

function findStockInTemplateProductMatch(
  products,
  { productId, productName, barcode, sku },
) {
  return findStockInTemplateProductMatchDetail(products, {
    productId,
    productName,
    barcode,
    sku,
  }).product;
}

// ─── Destination Picker Modal ────────────────────────────────────────────────
function DestinationPickerModal({ stores, onConfirm, onCancel }) {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");

  const filteredStores = stores.filter((store) =>
    `${store.name || ""} ${store.id || ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-[17px] font-bold text-gray-900">
            Select Destination Warehouse
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Choose the warehouse for this bulk stock in. Direct stock-in to
            stores is not allowed.
          </p>
        </div>

        <div className="px-6 pt-4 pb-2">
          <input
            autoFocus
            type="text"
            placeholder="Search warehouse..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
          />
        </div>

        <div className="px-6 pb-2 max-h-60 overflow-y-auto">
          {filteredStores.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No stores found.
            </p>
          ) : (
            <div className="space-y-1 py-1">
              {filteredStores.map((store) => {
                const locationType = getLocationType(store);
                const isWarehouse = locationType === "warehouse";
                const isSelected = String(store.id) === String(selectedId);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => setSelectedId(String(store.id))}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-50 border border-blue-300"
                        : "border border-transparent hover:bg-gray-50"
                    }`}
                  >
                    <div>
                      <span className="block text-sm font-medium text-gray-800">
                        {store.name}
                      </span>
                      <span className="block text-[11px] text-gray-400">
                        ID: {store.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {locationType && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            isWarehouse
                              ? "bg-purple-100 text-purple-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {isWarehouse ? "Warehouse" : locationType || "Store"}
                        </span>
                      )}
                      {isSelected && (
                        <svg
                          className="h-4 w-4 text-blue-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => onConfirm(selectedId)}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function StockInPage() {
  const [showModal, setShowModal] = useState(false);
  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [activeTab, setActiveTab] = useState("new");
  const [sourceType, setSourceType] = useState("warehouse");
  const [destination, setDestination] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [vendors, setVendors] = useState([]);
  const [vendorQuery, setVendorQuery] = useState("");
  const [selectedVendorIds, setSelectedVendorIds] = useState([]);
  const [applyTaxes, setApplyTaxes] = useState(true);
  const [addProductsPrefill, setAddProductsPrefill] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showTemplateFilters, setShowTemplateFilters] = useState(false);
  const [stockInBrandOptions, setStockInBrandOptions] = useState([]);
  const [templateCategories, setTemplateCategories] = useState([]);
  const [loadingTemplateOptions, setLoadingTemplateOptions] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [templateFilters, setTemplateFilters] = useState({
    categoryId: "",
  });
  const [filters, setFilters] = useState({
    search: "",
    dateFrom: "",
    dateTo: "",
    source: "",
    destination: "",
    brand: "",
  });
  const [pendingMissingProduct, setPendingMissingProduct] = useState(null);
  const [bulkImportIssue, setBulkImportIssue] = useState(null);
  const [bulkPreviewRows, setBulkPreviewRows] = useState([]);
  const [bulkPreviewSelected, setBulkPreviewSelected] = useState({});
  const [stockPreview, setStockPreview] = useState(null);
  const [loadingStockPreview, setLoadingStockPreview] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    row: null,
    loading: false,
    error: "",
  });
  const [editExcelOpen, setEditExcelOpen] = useState(false);
  const [editExcelBusy, setEditExcelBusy] = useState(false);
  const [editExcelChooserOpen, setEditExcelChooserOpen] = useState(false);
  const [editExcelChooserSearch, setEditExcelChooserSearch] = useState("");
  const [selectedStockInEditIds, setSelectedStockInEditIds] = useState({});

  const [bulkUploadReview, setBulkUploadReview] = useState(null);
  const [bulkUploadReviewBusy, setBulkUploadReviewBusy] = useState(false);
  const [destinationPickerRows, setDestinationPickerRows] = useState(null);
  const [destinationPickerStores, setDestinationPickerStores] = useState([]);
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);

  const fileInputRef = useRef(null);
  const editExcelInputRef = useRef(null);
  const router = useRouter();
  const destinationStores = stores.filter(isWarehouseLocation);
  const isSuperAdmin = currentUser?.role === "super_admin";
  const filteredVendors = vendors.filter((vendor) =>
    `${vendor.name || ""} ${vendor.company || ""}`
      .toLowerCase()
      .includes(vendorQuery.trim().toLowerCase()),
  );
  const editableStockInRows = useMemo(
    () => tableData.filter((row) => row?._id),
    [tableData],
  );
  const filteredEditableStockInRows = useMemo(() => {
    const query = editExcelChooserSearch.trim().toLowerCase();
    if (!query) return editableStockInRows;
    return editableStockInRows.filter((row) =>
      [
        row._id,
        row["GRN / Inward No"],
        row["Received By"],
        row["Inward Date"],
        row["Challan / Invoice No"],
        row["Brand / Make"],
        row["Supplier / Vendor"],
        row["Site / Warehouse"],
        row.Status,
        row["Challan / Invoice Date"],
        row["Material Items"],
        row["Received Quantity"],
        row["Total Amount"],
        row["PO / Ref Type"],
        row["PO / Work Order No"],
      ]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(query)),
    );
  }, [editExcelChooserSearch, editableStockInRows]);
  const selectedStockInEditRows = useMemo(
    () =>
      editableStockInRows.filter(
        (row) => row?._id && selectedStockInEditIds[String(row._id)],
      ),
    [editableStockInRows, selectedStockInEditIds],
  );

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setCurrentUser(json.data?.user || json.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setLoadingList(true);
        fetchStockInList(filters, controller.signal)
          .then((data) => setTableData(mapRecordsToTable(data)))
          .catch((error) => {
            if (error.name !== "AbortError") setTableData([]);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoadingList(false);
          });
      },
      filters.search ? 250 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters]);

  useEffect(() => {
    fetchStores()
      .then((data) => setStores(Array.isArray(data) ? data : []))
      .catch(() => setStores([]));
    fetchCatalogOptions("/api/catalog/brands?pageSize=1000")
      .then((records) => setStockInBrandOptions(records))
      .catch(() => setStockInBrandOptions([]));
  }, []);

  useEffect(() => {
    if (!showModal) return;
    setLoadingStores(true);
    Promise.all([
      fetchStores().catch(() => []),
      fetch("/api/vendors?pageSize=500")
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([storeData, vendorData]) => {
        setStores(Array.isArray(storeData) ? storeData : []);
        setVendors(Array.isArray(vendorData) ? vendorData : []);
      })
      .catch(() => {
        setStores([]);
        setVendors([]);
      })
      .finally(() => setLoadingStores(false));
  }, [showModal]);

  useEffect(() => {
    if (!showTemplateFilters) return;
    setLoadingTemplateOptions(true);
    fetchCatalogOptions("/api/catalog/categories?pageSize=1000")
      .then((categories) => setTemplateCategories(categories))
      .catch(() => {
        setTemplateCategories([]);
      })
      .finally(() => setLoadingTemplateOptions(false));
  }, [showTemplateFilters]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("resumeStockInBulk") !== "1") return;

    const savedRows = window.sessionStorage.getItem(PENDING_STOCK_IN_BULK_KEY);
    if (!savedRows) return;

    window.sessionStorage.removeItem(PENDING_STOCK_IN_BULK_KEY);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("resumeStockInBulk");
    window.history.replaceState({}, "", nextUrl.toString());

    try {
      const rows = JSON.parse(savedRows);
      if (Array.isArray(rows) && rows.length) {
        handleParsedBulkRows(rows, { persistOnMissing: true });
      }
    } catch {
      alert(
        "Unable to resume the previous bulk upload. Please upload the template again.",
      );
    }
  }, []);

  const handleOpen = () => setShowModal(true);
  const handleClose = () => {
    setShowModal(false);
    setSelectedFile(null);
    setPurchaseOrderId("");
    setInvoiceNumber("");
  };

  const openBulkPreview = (rows) => {
    const selectedMap = Object.fromEntries(
      rows.map((row) => [row.preview_id, true]),
    );
    setBulkPreviewRows(rows);
    setBulkPreviewSelected(selectedMap);
  };

  const closeBulkPreview = () => {
    window.sessionStorage.removeItem(PENDING_STOCK_IN_BULK_KEY);
    setBulkPreviewRows([]);
    setBulkPreviewSelected({});
  };

  const confirmBulkPreview = async () => {
    const selectedRows = bulkPreviewRows.filter(
      (row) => bulkPreviewSelected[row.preview_id],
    );
    if (!selectedRows.length) {
      alert("Please select at least one product to add.");
      return;
    }
    closeBulkPreview();
    await processBulkRows(selectedRows);
  };

  // ── UPDATED: replaced window.prompt with modal ──
  const processBulkRows = async (selectedRows, destinationId) => {
    if (!selectedRows.length) {
      alert(
        "Please enter a quantity for the products you want to add, then upload the template again.",
      );
      return;
    }

    // If no destinationId yet, load stores and open the picker modal
    if (!destinationId) {
      const storeData = stores.length
        ? stores
        : await fetchStores().catch(() => []);
      setDestinationPickerStores(
        (Array.isArray(storeData) ? storeData : []).filter(isWarehouseLocation),
      );
      setDestinationPickerRows(selectedRows);
      setShowDestinationPicker(true);
      return;
    }

    // Proceed with confirmed destinationId
    const draft = await postStockIn({
      method: "new",
      destination: String(destinationId).trim(),
      sourceType: "vendor",
      applyTaxes: true,
      addProductsPrefill: true,
    });

    const updateRes = await fetch(
      `/api/inventory/stockin/${encodeURIComponent(draft.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form: {
            remarks: "Created from bulk stock in template",
          },
          items: selectedRows,
        }),
      },
    );
    const updateJson = await updateRes.json().catch(() => ({}));
    if (!updateRes.ok) {
      alert(updateJson.error || "Unable to create the bulk stock draft.");
      return;
    }

    setLoadingList(true);
    fetchStockInList(filters)
      .then((data) => setTableData(mapRecordsToTable(data)))
      .catch(() => setTableData([]))
      .finally(() => setLoadingList(false));

    window.sessionStorage.removeItem(PENDING_STOCK_IN_BULK_KEY);
    router.push(
      `/inventory/stockin/line-items?id=${encodeURIComponent(draft.id)}`,
    );
  };

  // Handler when user confirms destination in the picker modal
  const handleDestinationPickerConfirm = async (destinationId) => {
    setShowDestinationPicker(false);
    const rows = destinationPickerRows;
    setDestinationPickerRows(null);
    await processBulkRows(rows, destinationId);
  };

  const handleDestinationPickerCancel = () => {
    setShowDestinationPicker(false);
    setDestinationPickerRows(null);
  };

  const handleParsedBulkRows = async (
    rows,
    { persistOnMissing = false } = {},
  ) => {
    if (!Array.isArray(rows) || !rows.length) {
      alert("No rows found in selected file.");
      return;
    }
    setBulkImportIssue(null);

    const lookupPayload = {
      product_ids: rows.map((row) =>
        getBulkField(row, ["product_id", "product_code", "item_code", "code"]),
      ),
      product_names: rows.map((row) =>
        getBulkField(row, ["product_name", "item_name", "product", "name"]),
      ),
      barcodes: rows.map((row) =>
        getBulkField(row, ["barcode", "bar_code", "ean", "upc"]),
      ),
      skus: rows.map((row) =>
        getBulkField(row, ["sku", "sku_code", "barcode_value"]),
      ),
    };
    const [templateRes, lookupRes] = await Promise.all([
      fetch("/api/inventory/stockin?template=products", { cache: "no-store" }),
      fetch("/api/inventory/stockin/product-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lookupPayload),
      }),
    ]);
    const templateJson = await templateRes.json().catch(() => ({}));
    const lookupJson = await lookupRes.json().catch(() => ({}));
    if (!templateRes.ok && !lookupRes.ok) {
      setBulkImportIssue({
        title: "Unable to verify products",
        message:
          lookupJson.error ||
          templateJson.error ||
          "The product catalog could not be loaded. Please retry the upload.",
        rows: [],
        extraCount: 0,
      });
      return;
    }
    let existingProducts = Array.isArray(templateJson.records)
      ? templateJson.records
      : [];
    const directlyMatchedProducts = Array.isArray(lookupJson.records)
      ? lookupJson.records
      : [];
    if (directlyMatchedProducts.length) {
      const byId = new Map(
        existingProducts.map((product) => [String(product.id), product]),
      );
      directlyMatchedProducts.forEach((product) => {
        byId.set(String(product.id), {
          ...byId.get(String(product.id)),
          ...product,
        });
      });
      existingProducts = Array.from(byId.values());
    }
    try {
      const catalogProducts = await fetchAllCatalogProducts({
        pageSize: 500,
        fetchOptions: { cache: "no-store" },
      });
      if (Array.isArray(catalogProducts) && catalogProducts.length) {
        const byId = new Map(
          existingProducts.map((product) => [String(product.id), product]),
        );
        catalogProducts.forEach((product) => {
          const id = String(product.id || "");
          if (!id || byId.has(id)) return;
          byId.set(id, {
            id: product.id,
            productId: product.product_id || product.productId || product.id,
            productName: product.name || product.productName || "",
            barcode: product.barcode || "",
            sku: product.sku || "",
            costPerUnit: Number(product.cost_price || product.costPerUnit || 0),
            mrp: Number(product.mrp || 0),
            sellingPrice: Number(
              product.selling_price || product.sellingPrice || 0,
            ),
          });
        });
        existingProducts = Array.from(byId.values());
      }
    } catch {
      // Stock-in template records are enough for normal uploads.
    }

    const selectedRows = rows
      .map((row, index) => {
        const productId = getBulkField(row, [
          "product_id",
          "material_id",
          "product_code",
          "item_code",
          "code",
        ]);
        const productName = getBulkField(row, [
          "product_name",
          "material_name",
          "item_name",
          "product",
          "name",
        ]);
        const barcode = getBulkField(row, [
          "barcode",
          "bar_code",
          "ean",
          "upc",
        ]);
        const sku = getBulkField(row, [
          "sku",
          "material_code",
          "sku_code",
          "barcode_value",
        ]);
        const qty = parseBulkNumber(
          getBulkField(
            row,
            [
              "quantity",
              "received_quantity",
              "qty",
              "total_qty",
              "total_quantity",
              "stock_qty",
              "stock_in_qty",
              "stock_in_quantity",
              "qty_in",
            ],
            0,
          ),
        );
        if (!Number.isFinite(qty) || qty <= 0) return null;
        const matchDetail = findStockInTemplateProductMatchDetail(
          existingProducts,
          {
            productId,
            productName,
            barcode,
            sku,
          },
        );
        const matchedProduct = matchDetail.product;
        const rowNumber = Number(row.__row_index || 0) + 2;
        if (!matchedProduct) {
          return {
            missing: true,
            originalRow: row,
            productName:
              productName ||
              productId ||
              barcode ||
              sku ||
              "Row " + (index + 2),
          };
        }
        if (matchedProduct.isActive === false) {
          return {
            import_error: true,
            row_number: rowNumber,
            productName: productName || matchedProduct.productName || "",
            sku,
            barcode,
            message:
              "This SKU already belongs to an inactive catalog product. Reactivate that product instead of creating a duplicate.",
          };
        }
        const sheetSku = normalizeProductLookupValue(sku);
        const catalogSku = normalizeProductLookupValue(matchedProduct.sku);
        if (sheetSku && catalogSku && sheetSku !== catalogSku) {
          return {
            import_error: true,
            row_number: rowNumber,
            productName: productName || matchedProduct.productName || "",
            sku,
            barcode,
            message:
              "Product ID and SKU refer to different catalog products. Correct the row before uploading.",
          };
        }
        const sheetBarcode = normalizeProductLookupValue(barcode);
        const catalogBarcode = normalizeProductLookupValue(
          matchedProduct.barcode,
        );
        if (sheetBarcode && catalogBarcode && sheetBarcode !== catalogBarcode) {
          return {
            import_error: true,
            row_number: rowNumber,
            productName: productName || matchedProduct.productName || "",
            sku,
            barcode,
            message:
              "Product ID and barcode refer to different catalog products. Correct the row before uploading.",
          };
        }
        if (matchDetail.matches.length > 1) {
          return {
            import_error: true,
            row_number: rowNumber,
            productName: productName || matchedProduct.productName || "",
            sku,
            barcode,
            message: `Barcode/SKU matches ${matchDetail.matches.length} catalog products. Please keep a unique barcode/SKU before stock-in.`,
          };
        }
        const sheetName = compactProductLookupValue(productName);
        const catalogName = compactProductLookupValue(
          matchedProduct.productName,
        );
        if (
          ["barcode", "sku"].includes(matchDetail.source) &&
          sheetName &&
          catalogName &&
          sheetName !== catalogName
        ) {
          return {
            import_error: true,
            row_number: rowNumber,
            productName,
            catalogName: matchedProduct.productName || "",
            sku,
            barcode,
            message: `Excel product name does not match catalog for this ${matchDetail.source}.`,
          };
        }
        const rawExpiryDate = getBulkField(row, BULK_EXPIRY_KEYS);
        const expiryDate = normalizeImportDate(rawExpiryDate);
        if (!isMissingImportDate(rawExpiryDate) && !expiryDate) {
          return {
            import_error: true,
            row_number: rowNumber,
            productName: productName || matchedProduct.productName || "",
            sku,
            barcode,
            message:
              "Expiry Date is invalid/unreadable. Use a valid Excel date or dd-mm-yy format.",
          };
        }
        if (expiryDate && isPastDateValue(expiryDate)) {
          return {
            import_error: true,
            row_number: rowNumber,
            productName: productName || matchedProduct.productName || "",
            sku,
            barcode,
            message: `Expiry Date ${formatIndianDate(expiryDate).replaceAll("/", "-")} is in the past. Use a current or future date in dd-mm-yy format.`,
          };
        }
        const costPrice = parseBulkNumber(
          getBulkField(
            row,
            [
              "purchase_rate_unit",
              "cost_unit",
              "cost_per_unit",
              "cost_price",
              "cost",
            ],
            0,
          ),
        );
        const mrp = parseBulkNumber(
          getBulkField(row, ["reference_rate", "mrp"], 0),
        );
        const sellingPrice = parseBulkNumber(
          getBulkField(
            row,
            ["issue_rate", "selling_price", "sale_price", "sp"],
            0,
          ),
        );
        const previewId = `${matchedProduct.id}-${index}`;
        const priceBatchKey = [
          ["CP", costPrice],
          ["MRP", mrp],
          ["SP", sellingPrice],
        ]
          .map(
            ([label, value]) =>
              `${label}${String(value || 0).replace(/[^0-9.]/g, "")}`,
          )
          .join("-");
        const batchNo =
          getBulkField(row, BULK_BATCH_KEYS) ||
          `BULK-${matchedProduct.id}-R${rowNumber}-${priceBatchKey}`;

        return {
          preview_id: previewId,
          product_id: matchedProduct.id,
          product_name: matchedProduct.productName || productName || "",
          barcode: barcode || matchedProduct.barcode || "",
          sku: sku || matchedProduct.sku || matchedProduct.barcode || "",
          qty,
          cost_price: costPrice,
          mrp,
          selling_price: sellingPrice,
          tax_value: 0,
          batch_no: batchNo,
          expiry_date: expiryDate,
          batches: [
            {
              batch_no: batchNo,
              qty,
              expiry_date: expiryDate,
            },
          ],
          remarks: getBulkField(row, ["inspection_remarks", "remarks"]),
        };
      })
      .filter(Boolean);

    const importErrors = selectedRows.filter((row) => row.import_error);
    if (importErrors.length) {
      setBulkImportIssue({
        title: "Bulk import needs correction",
        message:
          "Some Excel rows do not match the catalog data. Please correct these rows and upload again so stock is not added to the wrong product.",
        rows: importErrors.slice(0, 8),
        extraCount: Math.max(0, importErrors.length - 8),
      });
      return;
    }

    const missingProduct = selectedRows.find((row) => row.missing);
    if (missingProduct) {
      if (persistOnMissing) {
        window.sessionStorage.setItem(
          PENDING_STOCK_IN_BULK_KEY,
          JSON.stringify(rows),
        );
      }
      setPendingMissingProduct({
        ...missingProduct,
        originalRows: rows,
        existingRows: selectedRows.filter((row) => !row.missing),
      });
      return;
    }

    openBulkPreview(selectedRows);
  };

  const handleBulkImport = async () => {
    try {
      const file = await pickSpreadsheetFile();
      if (!file) return;

      const rows = await parseBulkSheet(file);
      if (!Array.isArray(rows) || !rows.length) {
        alert("No material rows found in the uploaded Excel/CSV file.");
        return;
      }

      // Fetch catalog products and stores in parallel
      const [productsRes, storeList, vendorList] = await Promise.all([
        fetchAllCatalogProducts({
          pageSize: 10000,
          fetchOptions: { cache: "no-store" },
        }).catch(() => []),
        stores.length ? stores : fetchStores().catch(() => []),
        vendors.length
          ? vendors
          : fetch("/api/vendors?pageSize=500")
              .then((r) => r.json())
              .catch(() => []),
      ]);

      const allProducts = Array.isArray(productsRes) ? productsRes : [];
      const allStores = Array.isArray(storeList) ? storeList : [];
      if (!stores.length && allStores.length) setStores(allStores);
      const allVendors = Array.isArray(vendorList?.records || vendorList)
        ? vendorList.records || vendorList
        : [];
      if (!vendors.length && allVendors.length) setVendors(allVendors);

      // Build lookup maps
      const byId = new Map();
      const bySku = new Map();
      const byBarcode = new Map();
      const byName = new Map();

      allProducts.forEach((p) => {
        const id = String(p.id || "");
        const productId = String(p.product_id || p.productId || "");
        const sku = String(p.sku || "")
          .trim()
          .toLowerCase();
        const barcode = String(p.barcode || "")
          .trim()
          .toLowerCase();
        const name = String(p.name || p.productName || "")
          .trim()
          .toLowerCase();

        if (id) byId.set(id, p);
        if (productId) byId.set(productId, p);
        if (sku) bySku.set(sku, p);
        if (barcode) byBarcode.set(barcode, p);
        if (name) byName.set(name, p);
      });

      let detectedInvoiceNumber = "";
      let detectedInvoiceDate = "";
      let detectedVendor = "";
      let detectedRemarks = "";

      const parsedItems = [];

      rows.forEach((row, rowIndex) => {
        const pId = getBulkField(row, [
          "product_id",
          "material_id",
          "product_code",
          "item_code",
          "code",
        ]);
        const pName = getBulkField(row, [
          "product_name",
          "material_name",
          "item_name",
          "product",
          "name",
        ]);
        const barcode = getBulkField(row, [
          "barcode",
          "bar_code",
          "ean",
          "upc",
        ]);
        const sku = getBulkField(row, [
          "sku",
          "material_code",
          "sku_code",
          "barcode_value",
        ]);
        const category = getBulkField(row, [
          "category",
          "material_category",
          "category_name",
        ]);
        const brand = getBulkField(row, [
          "brand",
          "brand_make",
          "make",
          "brand_name",
        ]);
        const unit =
          getBulkField(row, [
            "unit",
            "unit_of_measure",
            "uom",
            "uom_name",
          ]) || "PCS";
        const stockItemsType =
          getBulkField(row, [
            "stock_items_type",
            "traceability_type",
            "type",
          ]) || "BATCHED";

        const rawQty = getBulkField(row, [
          "quantity",
          "received_quantity",
          "qty",
          "total_qty",
          "total_quantity",
          "stock_qty",
          "stock_in_qty",
          "stock_in_quantity",
          "qty_in",
        ]);
        const qty = parseBulkNumber(rawQty, 0);

        const costPrice = parseBulkNumber(
          getBulkField(row, [
            "purchase_rate_unit",
            "cost_unit",
            "cost_per_unit",
            "cost_price",
            "cost",
            "purchase_rate",
            "rate",
          ]),
          0,
        );
        const mrp = parseBulkNumber(
          getBulkField(row, ["reference_rate", "mrp"]),
          0,
        );
        const sellingPrice = parseBulkNumber(
          getBulkField(row, ["issue_rate", "selling_price", "sale_price", "sp"]),
          0,
        );

        const rawBatch = getBulkField(row, BULK_BATCH_KEYS);
        const rawExpiry = getBulkField(row, BULK_EXPIRY_KEYS);
        const lineRemarks = getBulkField(row, [
          "inspection_remarks",
          "remarks",
        ]);

        const invNo = getBulkField(row, [
          "invoice_number",
          "challan_number",
          "invoice_no",
          "challan_no",
          "bill_no",
        ]);
        const invDate = getBulkField(row, [
          "invoice_date",
          "challan_date",
          "bill_date",
        ]);
        const vName = getBulkField(row, [
          "vendor_name",
          "supplier_name",
          "vendor",
          "supplier",
        ]);

        if (invNo && !detectedInvoiceNumber) detectedInvoiceNumber = invNo;
        if (invDate && !detectedInvoiceDate)
          detectedInvoiceDate = normalizeImportDate(invDate) || "";
        if (vName && !detectedVendor) detectedVendor = vName;
        if (lineRemarks && !detectedRemarks) detectedRemarks = lineRemarks;

        if (!Number.isFinite(qty) || qty <= 0) return;

        // Try to match product
        let matched = null;
        if (pId && byId.has(String(pId))) matched = byId.get(String(pId));
        else if (sku && bySku.has(sku.toLowerCase().trim()))
          matched = bySku.get(sku.toLowerCase().trim());
        else if (barcode && byBarcode.has(barcode.toLowerCase().trim()))
          matched = byBarcode.get(barcode.toLowerCase().trim());
        else if (pName && byName.has(pName.toLowerCase().trim()))
          matched = byName.get(pName.toLowerCase().trim());

        const finalName = matched
          ? matched.name || matched.productName
          : pName || sku || barcode || `Material Row ${rowIndex + 1}`;
        const finalCategory = matched
          ? matched.category_name || matched.category || category
          : category || "General";
        const finalBrand = matched
          ? matched.brand_name || matched.brand || brand
          : brand || "";
        const finalUnit = matched ? matched.unit || unit : unit;
        const finalCost =
          costPrice ||
          (matched ? Number(matched.cost_price || matched.costPerUnit || 0) : 0);
        const finalMrp = mrp || (matched ? Number(matched.mrp || 0) : 0);
        const finalSp =
          sellingPrice ||
          (matched
            ? Number(matched.selling_price || matched.sellingPrice || 0)
            : 0);

        parsedItems.push({
          rowId: `row-${rowIndex}-${Date.now()}`,
          index: rowIndex + 1,
          productId: matched ? matched.id : null,
          productName: finalName,
          category: finalCategory,
          brand: finalBrand,
          sku: matched ? matched.sku || sku : sku,
          barcode: matched ? matched.barcode || barcode : barcode,
          unit: finalUnit,
          stockItemsType:
            stockItemsType || (matched?.stock_item_type || "BATCHED"),
          qty,
          costPrice: finalCost,
          mrp: finalMrp,
          sellingPrice: finalSp,
          batchNo: rawBatch || "",
          expiryDate: normalizeImportDate(rawExpiry) || "",
          remarks: lineRemarks || "",
          isNew: !matched,
        });
      });

      if (!parsedItems.length) {
        alert(
          "No materials with a valid quantity (> 0) were found in the uploaded file. Please enter quantity in the template before uploading.",
        );
        return;
      }

      const warehouseStores = allStores.filter(isWarehouseLocation);
      const defaultStoreId = warehouseStores.length
        ? String(warehouseStores[0].id)
        : allStores.length
          ? String(allStores[0].id)
          : "";

      setBulkUploadReview({
        open: true,
        fileName: file.name,
        items: parsedItems,
        selectedMap: Object.fromEntries(
          parsedItems.map((_, i) => [i, true]),
        ),
        destinationId: defaultStoreId,
        invoiceNumber: detectedInvoiceNumber || "",
        invoiceDate:
          detectedInvoiceDate || new Date().toISOString().slice(0, 10),
        vendorName: detectedVendor || "",
        remarks: detectedRemarks || "Created from bulk Stock In template",
      });
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to process the uploaded Excel file.");
    }
  };

  const handleConfirmBulkUpload = async () => {
    if (!bulkUploadReview) return;
    const {
      items,
      selectedMap,
      destinationId,
      invoiceNumber,
      invoiceDate,
      vendorName,
      remarks,
    } = bulkUploadReview;

    if (!destinationId) {
      alert("Please select a Destination Site / Warehouse.");
      return;
    }

    const selectedItems = items.filter((_, idx) => selectedMap[idx]);
    if (!selectedItems.length) {
      alert("Please select at least one material to inward.");
      return;
    }

    setBulkUploadReviewBusy(true);
    try {
      // 1. Auto-create any new catalog products that don't exist yet
      const newItems = selectedItems.filter(
        (item) => item.isNew || !item.productId,
      );
      for (const item of newItems) {
        try {
          const createRes = await fetch("/api/catalog/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.productName,
              sku: item.sku || null,
              barcode: item.barcode || null,
              category_name: item.category || "General",
              brand_name: item.brand || null,
              unit: item.unit || "PCS",
              cost_price: item.costPrice || 0,
              mrp: item.mrp || 0,
              selling_price: item.sellingPrice || 0,
              stock_item_type: item.stockItemsType || "BATCHED",
            }),
          });
          const createdJson = await createRes.json().catch(() => ({}));
          if (createRes.ok && createdJson.id) {
            item.productId = createdJson.id;
          }
        } catch (e) {
          console.warn("Could not auto create product:", item.productName, e);
        }
      }

      // 2. Post Stock In draft
      const draft = await postStockIn({
        method: "new",
        destination: String(destinationId).trim(),
        sourceType: "vendor",
        vendorNames: vendorName ? [vendorName.trim()] : [],
        invoiceNumber: invoiceNumber ? invoiceNumber.trim() : null,
        invoiceDate: invoiceDate || null,
        remarks: remarks ? remarks.trim() : "Created from bulk Stock In template",
        applyTaxes: true,
        addProductsPrefill: true,
      });

      // 3. Format items payload for stock in
      const lineItemsPayload = selectedItems.map((item, idx) => {
        const batchNo =
          item.batchNo ||
          `BATCH-${Date.now().toString().slice(-6)}-${idx + 1}`;
        return {
          product_id: item.productId,
          product_name: item.productName,
          barcode: item.barcode || "",
          sku: item.sku || "",
          qty: Number(item.qty || 0),
          cost_price: Number(item.costPrice || 0),
          mrp: Number(item.mrp || 0),
          selling_price: Number(item.sellingPrice || 0),
          tax_value: 0,
          batch_no: batchNo,
          expiry_date: item.expiryDate || null,
          batches: [
            {
              batch_no: batchNo,
              qty: Number(item.qty || 0),
              expiry_date: item.expiryDate || null,
            },
          ],
          remarks: item.remarks || "",
        };
      });

      // 4. Update items on draft
      const updateRes = await fetch(
        `/api/inventory/stockin/${encodeURIComponent(draft.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            form: {
              vendor: vendorName ? vendorName.trim() : null,
              invoice_number: invoiceNumber ? invoiceNumber.trim() : null,
              invoice_date: invoiceDate || null,
              remarks:
                remarks ? remarks.trim() : "Created from bulk Stock In template",
              other_charges: 0,
            },
            items: lineItemsPayload,
          }),
        },
      );
      const updateJson = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) {
        throw new Error(
          updateJson.error || "Unable to save items to stock in draft.",
        );
      }

      // 5. Success! Close modal and refresh or navigate
      setBulkUploadReview(null);
      setLoadingList(true);
      fetchStockInList(filters)
        .then((data) => setTableData(mapRecordsToTable(data)))
        .catch(() => setTableData([]))
        .finally(() => setLoadingList(false));

      router.push(
        `/inventory/stockin/line-items?id=${encodeURIComponent(draft.id)}`,
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to inward stock from template.");
    } finally {
      setBulkUploadReviewBusy(false);
    }
  };

  const handleOpenTemplateFilters = () => setShowTemplateFilters(true);

  const handleCloseTemplateFilters = () => {
    if (downloadingTemplate) return;
    setShowTemplateFilters(false);
  };

  const openStockPreview = async (row) => {
    if (!row?._id) return;
    setLoadingStockPreview(true);
    try {
      const res = await fetch(
        `/api/inventory/stockin/${encodeURIComponent(row._id)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to load stock in preview");
      setStockPreview(data);
    } catch (err) {
      alert(err.message || "Failed to load stock in preview");
    } finally {
      setLoadingStockPreview(false);
    }
  };

  const editStockIn = (row) => {
    if (!row?._id) return;
    router.push(
      `/inventory/stockin/line-items?id=${encodeURIComponent(row._id)}`,
    );
  };

  const deleteStockIn = async (row) => {
    if (!row?._id) return;
    setDeleteDialog({ open: true, row, loading: false, error: "" });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog((current) =>
      current.loading
        ? current
        : { open: false, row: null, loading: false, error: "" },
    );
  };

  const confirmDeleteStockIn = async () => {
    const row = deleteDialog.row;
    if (!row?._id) return;
    setDeleteDialog((current) => ({ ...current, loading: true, error: "" }));
    try {
      const res = await fetch(
        `/api/inventory/stockin/${encodeURIComponent(row._id)}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete stock in");
      setDeleteDialog({ open: false, row: null, loading: false, error: "" });
      setLoadingList(true);
      fetchStockInList(filters)
        .then((records) => setTableData(mapRecordsToTable(records)))
        .catch(() => setTableData([]))
        .finally(() => setLoadingList(false));
    } catch (err) {
      setDeleteDialog((current) => ({
        ...current,
        loading: false,
        error: err.message || "Failed to delete stock in",
      }));
    }
  };

  const downloadEntryExcel = async (row) => {
    if (!row?._id) return;
    try {
      const res = await fetch(
        `/api/inventory/stockin/${encodeURIComponent(row._id)}`,
        { cache: "no-store" },
      );
      const details = await res.json();
      if (!res.ok)
        throw new Error(details.error || "Failed to load stock in details");
      await downloadInventoryEntryWorkbook("stock-in", details);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to download stock in Excel");
    }
  };

  const downloadConsolidatedExcel = async () => {
    if (!tableData.length) return alert("No stock-in records to download.");
    try {
      const details = await Promise.all(
        tableData
          .filter((row) => row?._id)
          .map(async (row) => {
            const res = await fetch(
              `/api/inventory/stockin/${encodeURIComponent(row._id)}`,
              { cache: "no-store" },
            );
            const json = await res.json();
            if (!res.ok)
              throw new Error(json.error || "Failed to load stock in details");
            return json;
          }),
      );
      await downloadStockInItemsWorkbook(details, filters);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to download consolidated stock-in Excel");
    }
  };

  const openEditableStockInChooser = () => {
    if (!tableData.length) return alert("No stock-in records available.");
    setEditExcelOpen(false);
    setEditExcelChooserSearch("");
    setSelectedStockInEditIds({});
    setEditExcelChooserOpen(true);
  };

  const downloadEditableStockInExcel = async (selectedRows) => {
    const rowsToDownload = Array.isArray(selectedRows) ? selectedRows : [];
    if (!rowsToDownload.length) {
      alert("Please select at least one stock-in entry to download.");
      return;
    }
    setEditExcelBusy(true);
    try {
      const details = await Promise.all(
        rowsToDownload
          .filter((row) => row?._id)
          .map(async (row) => {
            const res = await fetch(
              `/api/inventory/stockin/${encodeURIComponent(row._id)}`,
              { cache: "no-store" },
            );
            const json = await res.json();
            if (!res.ok)
              throw new Error(json.error || "Failed to load stock in details");
            return json;
          }),
      );
      await downloadEditableStockInWorkbook(details, filters);
      setEditExcelChooserOpen(false);
      setSelectedStockInEditIds({});
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to download editable stock-in Excel");
    } finally {
      setEditExcelBusy(false);
    }
  };

  const uploadEditableStockInExcel = () => {
    setEditExcelOpen(false);
    editExcelInputRef.current?.click();
  };

  const handleEditableStockInUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setEditExcelBusy(true);
    try {
      const parsed = await parseEditableStockInWorkbook(file);
      if (!parsed.rows.length) {
        throw new Error("No stock-in item rows found in the Excel file.");
      }
      const allowedIds = new Set(parsed.allowedStockInIds.map(String));
      const grouped = new Map();
      const newProductRows = [];

      for (const row of parsed.rows) {
        const stockInId = String(row.stockInId || "").trim();
        if (!stockInId || !allowedIds.has(stockInId)) {
          throw new Error(
            `Stock In ID ${stockInId || "(blank)"} is not part of this downloaded Excel scope.`,
          );
        }
        if (row.createNewProduct) newProductRows.push(row);
        if (!grouped.has(stockInId)) grouped.set(stockInId, []);
        grouped.get(stockInId).push(row);
      }

      await resolveStockInEditProducts(parsed.rows);

      const createdProductByRowKey = new Map();
      for (const row of newProductRows) {
        const created = await createProductFromStockInEditRow(row);
        createdProductByRowKey.set(row.rowKey, created.id);
      }

      for (const [stockInId, rows] of grouped.entries()) {
        const detailRes = await fetch(
          `/api/inventory/stockin/${encodeURIComponent(stockInId)}`,
          { cache: "no-store" },
        );
        const detail = await detailRes.json();
        if (!detailRes.ok) {
          throw new Error(
            detail.error || `Failed to load stock-in ${stockInId}`,
          );
        }

        const items = rows
          .map((row) => ({
            stock_in_item_id: row.stockInItemId || undefined,
            product_id:
              row.productId || createdProductByRowKey.get(row.rowKey) || "",
            product_name: row.productName,
            qty: row.qty,
            cost_price: row.costPrice,
            mrp: row.mrp,
            selling_price: row.sellingPrice,
            tax_value: row.tax,
            batch_no: row.batchNo,
            expiry_date: row.expiryDate,
            mfg_date: row.mfgDate,
          }))
          .filter((item) => Number(item.qty || 0) > 0);

        const updateRes = await fetch(
          `/api/inventory/stockin/${encodeURIComponent(stockInId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              form: {
                vendor:
                  firstNonEmpty(rows.map((row) => row.vendor)) ||
                  detail.vendor_name ||
                  null,
                invoice_date:
                  firstNonEmpty(rows.map((row) => row.invoiceDate)) ||
                  detail.invoice_date ||
                  null,
                invoice_number:
                  firstNonEmpty(rows.map((row) => row.invoiceNumber)) ||
                  detail.invoice_number ||
                  null,
                other_charges: Number(detail.other_charges || 0),
                remarks:
                  firstNonEmpty(rows.map((row) => row.remarks)) ||
                  detail.remarks ||
                  "",
              },
              items,
            }),
          },
        );
        const updateJson = await updateRes.json().catch(() => ({}));
        if (!updateRes.ok) {
          throw new Error(
            updateJson.error || `Failed to update stock-in ${stockInId}`,
          );
        }
      }

      setLoadingList(true);
      const data = await fetchStockInList(filters);
      setTableData(mapRecordsToTable(data));
      alert("Stock-in Excel changes uploaded successfully.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to upload edited stock-in Excel");
    } finally {
      setEditExcelBusy(false);
      setLoadingList(false);
    }
  };

  const handleDownloadBulkTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const params = new URLSearchParams({
        template: "products",
      });
      if (templateFilters.categoryId) {
        params.set("category_id", templateFilters.categoryId);
      }
      if (templateFilters.brandIds?.length) {
        params.set("brand_ids", templateFilters.brandIds.join(","));
      }
      const [res, freshBrandsRes, freshCategoriesRes] = await Promise.all([
        fetch(`/api/inventory/stockin?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/catalog/brands", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/catalog/categories", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);

      if (!res.ok) throw new Error("Unable to create Stock In template.");
      const json = await res.json();
      let records = Array.isArray(json.records) ? json.records : [];
      if (!records.length && !templateFilters.categoryId && !templateFilters.brandIds?.length) {
        const catalogRes = await fetch("/api/catalog/products?pageSize=5000", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({}));
        const catalogItems = catalogRes.data?.records || catalogRes.records || [];
        if (Array.isArray(catalogItems) && catalogItems.length) {
          records = catalogItems.map((p) => ({
            id: p.id,
            productId: p.product_id || p.id,
            productName: p.name || "",
            sizeId: p.id,
            sizeName: "",
            category: p.category_name || p.category || "",
            brandId: p.brand_id || "",
            brand: p.brand_name || p.brand || "",
            barcode: p.barcode || "",
            sku: p.sku || "",
            unit: p.unit || "PCS",
            stockItemsType: String(p.stock_item_type || "BATCHED").toUpperCase(),
            costPerUnit: Number(p.cost_price || 0),
            mrp: Number(p.mrp || 0),
            sellingPrice: Number(p.selling_price || 0),
            expiryDate: "",
          }));
        }
      }

      const freshBrands = Array.isArray(freshBrandsRes.data?.records) ? freshBrandsRes.data.records : [];
      const freshCategories = Array.isArray(freshCategoriesRes.data?.records) ? freshCategoriesRes.data.records : [];

      const productRows = records.map((product) => ({
        "Product ID": excelText(product.id),
        "Product Name": product.productName,
        "Size ID": excelText(product.sizeId),
        "Size Name": product.sizeName,
        Category: product.category,
        Brand: product.brand,
        Barcode: excelText(product.barcode),
        SKU: excelText(product.sku),
        Unit: product.unit || "PCS",
        "Stock Items Type": product.stockItemsType || "BATCHED",
        Quantity: "",
        "Cost/Unit": product.costPerUnit,
        MRP: product.mrp,
        "Selling Price": product.sellingPrice,
        "Expiry Date": "",
        "Serial Number (serialNumber)": "",
        serialNumber: "",
        Remarks: "",
      }));
      const rows = productRows;

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(rows, {
        header: STOCK_IN_TEMPLATE_HEADERS,
      });
      worksheet["!cols"] = STOCK_IN_TEMPLATE_HEADERS.map((header) => ({
        wch:
          header === "Barcode"
            ? 20
            : ["Product ID", "Size ID", "SKU"].includes(header)
              ? 16
              : Math.max(12, Math.min(28, header.length + 2)),
      }));
      worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      applyTextFormatToColumns(
        worksheet,
        STOCK_IN_TEMPLATE_HEADERS,
        STOCK_IN_TEXT_TEMPLATE_HEADERS,
        Math.max(2, productRows.length + 1),
      );
      applyStockInBarcodeTextWarningCells(XLSX, worksheet, productRows.length);
      applyStockInExpiryDateFormat(
        XLSX,
        worksheet,
        Math.max(2, productRows.length + 1),
      );

      const optionGroups = [
        {
          key: "product_ids",
          name: "StockInProductIds",
          values: sortOptions(
            uniqueOptions(records.map((product) => excelText(product.id))),
          ),
        },
        {
          key: "product_names",
          name: "StockInProductNames",
          values: sortOptions(
            uniqueOptions(records.map((product) => product.productName)),
          ),
        },
        {
          key: "size_ids",
          name: "StockInSizeIds",
          values: sortOptions(
            uniqueOptions(records.map((product) => excelText(product.sizeId))),
          ),
        },
        {
          key: "size_names",
          name: "StockInSizeNames",
          values: sortOptions(
            uniqueOptions(records.map((product) => product.sizeName)),
          ),
        },
        {
          key: "categories",
          name: "StockInCategories",
          values: sortOptions(
            uniqueOptions([
              ...freshCategories.map((c) => c.name),
              ...templateCategories.map((category) => category.name),
              ...records.map((product) => product.category),
            ]),
          ),
        },
        {
          key: "brands",
          name: "StockInBrands",
          values: sortOptions(
            uniqueOptions([
              ...freshBrands.map((b) => b.name),
              ...records.map((product) => product.brand),
            ]),
          ),
        },
        {
          key: "barcodes",
          name: "StockInBarcodes",
          values: sortOptions(
            uniqueOptions(records.map((product) => excelText(product.barcode))),
          ),
        },
        {
          key: "skus",
          name: "StockInSkus",
          values: sortOptions(
            uniqueOptions(records.map((product) => product.sku)),
          ),
        },
        {
          key: "units",
          name: "StockInUnits",
          values: uniqueOptions([
            "PCS",
            "NOS",
            "BAG",
            "KG",
            "MT",
            "CUM",
            "CFT",
            "MTR",
            "SQM",
            "RMT",
            "LTR",
            "SET",
            "ROLL",
            "BOX",
            "PKT",
            "PAIR",
            "BUNDLE",
            "DRUM",
            "CAN",
            "TIN",
            "QUINTAL",
            "GRAMS",
            ...records.map((product) => product.unit),
          ]),
        },
        {
          key: "stock_item_types",
          name: "StockInItemTypes",
          values: ["BATCHED", "UNBATCHED"],
        },
      ];

      const validationRowLimit = Math.max(5001, productRows.length + 500);
      const validations = [
        ["Product ID", "product_ids"],
        ["Product Name", "product_names"],
        ["Size ID", "size_ids"],
        ["Size Name", "size_names"],
        ["Category", "categories"],
        ["Brand", "brands"],
        ["SKU", "skus"],
        ["Unit", "units"],
        ["Stock Items Type", "stock_item_types"],
      ]
        .map(([header, optionKey]) => {
          const columnIndex = STOCK_IN_TEMPLATE_HEADERS.indexOf(header);
          if (columnIndex < 0) return null;
          const column = XLSX.utils.encode_col(columnIndex);
          const formula =
            optionKey === "stock_item_types" ||
            optionKey === "units" ||
            optionKey === "categories" ||
            optionKey === "brands"
              ? optionFormula(optionGroups, optionKey)
              : prefixMatchOptionFormula(optionGroups, optionKey, `${column}2`);
          if (!formula) return null;
          return {
            range: `${column}2:${column}${validationRowLimit}`,
            formula,
          };
        })
        .filter(Boolean);

      const workbook = XLSX.utils.book_new();
      const {
        worksheet: optionsWorksheet,
        idLookupRange,
        skuLookupRange,
        barcodeLookupRange,
        nameLookupRange,
      } = buildStockInOptionsSheet(XLSX, optionGroups, records);
      clearStockInQuantityColumn(XLSX, worksheet);
      applyStockInVlookupFormulas(
        XLSX,
        worksheet,
        idLookupRange,
        skuLookupRange,
        barcodeLookupRange,
        nameLookupRange,
      );
      applyStockInExpiryDateFormat(
        XLSX,
        worksheet,
        Math.max(2, productRows.length + 1),
      );
      XLSX.utils.book_append_sheet(workbook, worksheet, "Bulk Stock In");
      XLSX.utils.book_append_sheet(
        workbook,
        optionsWorksheet,
        OPTIONS_SHEET_NAME,
      );
      addOptionNamedRanges(workbook, optionGroups);
      workbook.Workbook = workbook.Workbook || {};
      workbook.Workbook.CalcPr = {
        ...(workbook.Workbook.CalcPr || {}),
        fullCalcOnLoad: true,
        forceFullCalc: true,
      };
      hideOptionsSheet(workbook);
      const fileName = `Stock In Template ${new Date().toISOString().slice(0, 10)}.xlsx`;
      try {
        await saveWorkbookWithValidations(
          workbook,
          fileName,
          validations,
          "xl/worksheets/sheet1.xml",
          {
            quotePrefixRanges: [`G2:G${Math.max(2, productRows.length + 1)}`],
          },
        );
      } catch (validationErr) {
        console.warn(
          "Stock In template validations could not be applied; downloading plain template.",
          validationErr,
        );
        XLSX.writeFile(workbook, fileName);
      }
      setShowTemplateFilters(false);
    } catch (err) {
      console.error(err);
      alert("Stock In template download failed.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleNext = async () => {
    if (!destination) return alert("Please select a destination");
    if (sourceType === "vendor" && selectedVendorIds.length === 0) {
      return alert("Please select at least one vendor");
    }
    if (activeTab === "po" && !purchaseOrderId.trim()) {
      return alert("Please enter Purchase Order ID");
    }
    setSubmitting(true);
    try {
      const payload = {
        method: activeTab === "new" ? "new" : "purchase_order",
        destination,
        sourceType,
        vendorIds: sourceType === "vendor" ? selectedVendorIds : [],
        vendorNames:
          sourceType === "vendor"
            ? vendors
                .filter((vendor) =>
                  selectedVendorIds.includes(String(vendor.id)),
                )
                .map((vendor) => vendor.name)
            : [],
        applyTaxes,
        addProductsPrefill,
        purchaseOrderId: activeTab === "po" ? purchaseOrderId.trim() : null,
        invoiceNumber: activeTab === "po" ? invoiceNumber.trim() || null : null,
      };
      const created = await postStockIn(payload);
      const stockId = created.id;
      setShowModal(false);
      router.push(
        `/inventory/stockin/line-items?id=${encodeURIComponent(stockId)}`,
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create stock in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <InventoryShell
        breadcrumb={[
          { label: "Material Movement" },
          { label: "Material Receipt (GRN)" },
        ]}
        title="Material Inward & GRN Receipt"
        subtitle="Receive construction & site materials into store/site warehouse manually or with an Excel template."
        actions={
          isSuperAdmin ||
          (Array.isArray(currentUser?.permissions) &&
            (currentUser.permissions.includes("*") ||
              currentUser.permissions.includes("MANAGE_INVENTORY")))
            ? [
                {
                  label: "Download Bulk Template",
                  onClick: handleOpenTemplateFilters,
                },
                { label: "Upload Filled Template", onClick: handleBulkImport },
                { label: "Add Stock", primary: true, onClick: handleOpen },
              ]
            : []
        }
        searchPlaceholder="Search any column..."
        searchValue={filters.search}
        onSearchChange={(value) =>
          setFilters((current) => ({ ...current, search: value }))
        }
        filters={
          <>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  dateFrom: e.target.value,
                }))
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-700"
              title="From date"
            />
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  dateTo: e.target.value,
                }))
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-700"
              title="To date"
            />
            <select
              value={filters.source}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  source: e.target.value,
                }))
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-700"
            >
              <option value="">All Sources</option>
              <option value="product">Product</option>
              <option value="purchase_order">GRN / Purchase Order</option>
            </select>
            <select
              value={filters.destination}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  destination: e.target.value,
                }))
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-700"
            >
              <option value="">All destinations</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <select
              value={filters.brand}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  brand: e.target.value,
                }))
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-700"
            >
              <option value="">All brands</option>
              {stockInBrandOptions.map((brand) => (
                <option key={brand.id || brand.name} value={brand.name}>
                  {brand.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={downloadConsolidatedExcel}
              className="rounded-lg border border-emerald-200 px-3 py-2 text-[12.5px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Consolidated Excel
            </button>
            {isSuperAdmin ||
            (Array.isArray(currentUser?.permissions) &&
              (currentUser.permissions.includes("*") ||
                currentUser.permissions.includes("MANAGE_INVENTORY"))) ? (
              <div className="relative">
                <button
                  type="button"
                  disabled={editExcelBusy}
                  onClick={() => setEditExcelOpen((open) => !open)}
                  className="rounded-lg border border-blue-200 px-3 py-2 text-[12.5px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                >
                  {editExcelBusy ? "Processing..." : "Edit Excel"}
                </button>
                {editExcelOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
                    <button
                      type="button"
                      onClick={openEditableStockInChooser}
                      className="block w-full px-3 py-2 text-left text-[12.5px] font-semibold text-gray-700 hover:bg-blue-50"
                    >
                      Choose & Download Excel
                    </button>
                    <button
                      type="button"
                      onClick={uploadEditableStockInExcel}
                      className="block w-full border-t border-gray-100 px-3 py-2 text-left text-[12.5px] font-semibold text-gray-700 hover:bg-blue-50"
                    >
                      Upload Edited Excel
                    </button>
                  </div>
                )}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() =>
                setFilters({
                  search: "",
                  dateFrom: "",
                  dateTo: "",
                  source: "",
                  destination: "",
                  brand: "",
                })
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
          </>
        }
        onDownload={() => downloadCsv(tableData)}
        tableHeaders={tableHeaders}
        tableData={loadingList ? [] : tableData}
        emptyMessage={loadingList ? "Loading records…" : "No Records Found"}
        rowActions={(row) => {
          const userPermissions = Array.isArray(currentUser?.permissions)
            ? currentUser.permissions
            : [];
          const canManage =
            isSuperAdmin ||
            userPermissions.includes("*") ||
            userPermissions.includes("MANAGE_INVENTORY");
          const canView =
            canManage || userPermissions.includes("VIEW_INVENTORY");
          if (!canView) return null;
          return (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => openStockPreview(row)}
                className="rounded-lg border border-blue-100 px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
              >
                Preview
              </button>
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => editStockIn(row)}
                    className="rounded-lg border border-red-100 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteStockIn(row)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Delete
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => downloadEntryExcel(row)}
                className="rounded-lg border border-emerald-200 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Excel
              </button>
            </div>
          );
        }}
      />
      <input
        ref={editExcelInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleEditableStockInUpload}
      />

      {editExcelChooserOpen && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/45 px-4">
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Choose Stock In entries
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Select only the entries you want to edit in Excel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditExcelChooserOpen(false)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <i className="ti ti-x text-[18px]" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-3">
              <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <i className="ti ti-search text-[16px] text-gray-400" />
                <input
                  type="text"
                  value={editExcelChooserSearch}
                  onChange={(event) =>
                    setEditExcelChooserSearch(event.target.value)
                  }
                  placeholder="Search transaction, invoice, vendor, destination, status..."
                  className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                />
              </div>
              <div className="text-sm font-semibold text-gray-700">
                {selectedStockInEditRows.length} selected from{" "}
                {filteredEditableStockInRows.length} result
                {filteredEditableStockInRows.length === 1 ? "" : "s"}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedStockInEditIds(
                      Object.fromEntries(
                        filteredEditableStockInRows.map((row) => [
                          String(row._id),
                          true,
                        ]),
                      ),
                    )
                  }
                  disabled={!filteredEditableStockInRows.length}
                  className="rounded-lg border border-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Select Results
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStockInEditIds({})}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-bold uppercase text-gray-500">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={
                          filteredEditableStockInRows.length > 0 &&
                          filteredEditableStockInRows.every(
                            (row) => selectedStockInEditIds[String(row._id)],
                          )
                        }
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedStockInEditIds(
                              Object.fromEntries(
                                filteredEditableStockInRows.map((row) => [
                                  String(row._id),
                                  true,
                                ]),
                              ),
                            );
                          } else {
                            setSelectedStockInEditIds((current) => {
                              const next = { ...current };
                              filteredEditableStockInRows.forEach((row) => {
                                delete next[String(row._id)];
                              });
                              return next;
                            });
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3">GRN No</th>
                    <th className="px-4 py-3">Inward Date</th>
                    <th className="px-4 py-3">Challan / Invoice</th>
                    <th className="px-4 py-3">Supplier / Vendor</th>
                    <th className="px-4 py-3">Site / Warehouse</th>
                    <th className="px-4 py-3 text-right">Received Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEditableStockInRows.map((row) => {
                    const rowId = String(row._id);
                    return (
                      <tr key={rowId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={!!selectedStockInEditIds[rowId]}
                            onChange={(event) =>
                              setSelectedStockInEditIds((current) => {
                                const next = { ...current };
                                if (event.target.checked) next[rowId] = true;
                                else delete next[rowId];
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {row["GRN / Inward No"]}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {row["Inward Date"] || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {row["Challan / Invoice No"] || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {row["Supplier / Vendor"] || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {row["Site / Warehouse"] || "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {row["Received Quantity"] || 0}
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredEditableStockInRows.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm font-semibold text-gray-500"
                      >
                        No stock-in entries match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditExcelChooserOpen(false)}
                disabled={editExcelBusy}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadEditableStockInExcel(selectedStockInEditRows)
                }
                disabled={editExcelBusy || selectedStockInEditRows.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {editExcelBusy ? "Preparing..." : "Download Editable Excel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDialog.open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <i className="ti ti-trash text-[20px]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Delete Material Inward / GRN?
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {deleteDialog.row?.["GRN / Inward No"] || "This inward entry"}{" "}
                    will be permanently removed if its quantity has not been
                    used.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                This action cannot be undone. Used stock-in records will be
                protected automatically.
              </div>
              {deleteDialog.error && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {deleteDialog.error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deleteDialog.loading}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteStockIn}
                disabled={deleteDialog.loading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteDialog.loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(stockPreview || loadingStockPreview) && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-4">
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Stock In Preview
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {stockPreview?.transactionId || "Loading..."} ·{" "}
                  {stockPreview?.destinationName || ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStockPreview(null)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="grid gap-3 border-b border-gray-100 px-6 py-4 text-sm text-gray-600 sm:grid-cols-4">
              <div>
                <span className="block text-xs text-gray-400">Invoice</span>
                {stockPreview?.invoice_number || "—"}
              </div>
              <div>
                <span className="block text-xs text-gray-400">Date</span>
                {formatDate(stockPreview?.invoice_date)}
              </div>
              <div>
                <span className="block text-xs text-gray-400">Source</span>
                {stockPreview?.referenceType || "—"}
              </div>
              <div>
                <span className="block text-xs text-gray-400">Status</span>
                {stockPreview?.status || "—"}
              </div>
            </div>
            <div className="overflow-auto p-4">
              {loadingStockPreview ? (
                <div className="py-16 text-center text-sm text-gray-500">
                  Loading preview...
                </div>
              ) : (
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Barcode</th>
                      <th className="px-3 py-2">Batch</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">MRP</th>
                      <th className="px-3 py-2">Selling</th>
                      <th className="px-3 py-2">Tax</th>
                      <th className="px-3 py-2">Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stockPreview?.items || []).map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-50 text-[13px] text-gray-700"
                      >
                        <td className="px-3 py-2 font-semibold text-gray-900">
                          {item.name}
                        </td>
                        <td className="px-3 py-2">
                          {item.barcode || item.sku || "—"}
                        </td>
                        <td className="px-3 py-2">{item.batch_no || "—"}</td>
                        <td className="px-3 py-2">{item.qty}</td>
                        <td className="px-3 py-2">
                          {formatCost(item.cost_price)}
                        </td>
                        <td className="px-3 py-2">{formatCost(item.mrp)}</td>
                        <td className="px-3 py-2">
                          {formatCost(item.selling_price)}
                        </td>
                        <td className="px-3 py-2">
                          {formatCost(item.tax_value)}
                        </td>
                        <td className="px-3 py-2">
                          {formatDate(item.expiry_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Destination Picker Modal (bulk import flow) ── */}
      {showDestinationPicker && (
        <DestinationPickerModal
          stores={destinationPickerStores}
          onConfirm={handleDestinationPickerConfirm}
          onCancel={handleDestinationPickerCancel}
        />
      )}

      {bulkImportIssue && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {bulkImportIssue.title}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {bulkImportIssue.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkImportIssue(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                title="Close"
              >
                <i className="ti ti-x text-[18px]" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              <div className="space-y-3">
                {bulkImportIssue.rows.map((row, index) => (
                  <div
                    key={`${row.row_number || index}-${row.sku || row.barcode || index}`}
                    className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm"
                  >
                    <div className="font-semibold text-red-800">
                      Row {row.row_number}: {row.message}
                    </div>
                    <div className="mt-2 grid gap-2 text-gray-700 sm:grid-cols-2">
                      <div>
                        Excel product:{" "}
                        <span className="font-medium">
                          {row.productName || "-"}
                        </span>
                      </div>
                      {row.catalogName && (
                        <div>
                          Catalog product:{" "}
                          <span className="font-medium">{row.catalogName}</span>
                        </div>
                      )}
                      <div>Barcode: {row.barcode || "-"}</div>
                      <div>SKU: {row.sku || "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
              {bulkImportIssue.extraCount > 0 && (
                <p className="mt-4 text-sm text-gray-500">
                  Plus {bulkImportIssue.extraCount} more row(s).
                </p>
              )}
            </div>
            <div className="flex items-center justify-end border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setBulkImportIssue(null)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkUploadReview &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/65 px-4 py-6 sm:py-8">
            <div className="flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
              <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <i className="ti ti-file-spreadsheet text-base" />
                      </span>
                      <h2 className="text-lg font-bold text-slate-900">
                        Review & Confirm Material Inward (Excel)
                      </h2>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Uploaded file:{" "}
                      <span className="font-semibold text-slate-700">
                        {bulkUploadReview.fileName}
                      </span>{" "}
                      · Review details, select destination site, and confirm
                      inwarding.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBulkUploadReview(null)}
                    disabled={bulkUploadReviewBusy}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                  >
                    <i className="ti ti-x text-lg" />
                  </button>
                </div>

                {/* Summary Stat Pills */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <span className="block text-[11px] font-medium text-slate-500">
                      Total Materials
                    </span>
                    <span className="text-base font-bold text-slate-900">
                      {bulkUploadReview.items.length}
                    </span>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2">
                    <span className="block text-[11px] font-medium text-blue-600">
                      Total Received Qty
                    </span>
                    <span className="text-base font-bold text-blue-900">
                      {bulkUploadReview.items
                        .filter((_, i) => bulkUploadReview.selectedMap[i])
                        .reduce((sum, item) => sum + Number(item.qty || 0), 0)
                        .toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                    <span className="block text-[11px] font-medium text-emerald-600">
                      Estimated Value
                    </span>
                    <span className="text-base font-bold text-emerald-900">
                      ₹
                      {bulkUploadReview.items
                        .filter((_, i) => bulkUploadReview.selectedMap[i])
                        .reduce(
                          (sum, item) =>
                            sum +
                            Number(item.qty || 0) *
                              Number(item.costPrice || 0),
                          0,
                        )
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                    </span>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
                    <span className="block text-[11px] font-medium text-amber-700">
                      New In Catalog
                    </span>
                    <span className="text-base font-bold text-amber-900">
                      {
                        bulkUploadReview.items.filter((item) => item.isNew)
                          .length
                      }{" "}
                      materials
                    </span>
                  </div>
                </div>

                {/* Inward Details Form Controls */}
                <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Destination Site / Store *
                    </label>
                    <select
                      value={bulkUploadReview.destinationId}
                      onChange={(e) =>
                        setBulkUploadReview((curr) => ({
                          ...curr,
                          destinationId: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="">Select Warehouse / Site...</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}{" "}
                          {isWarehouseLocation(store) ? "(Warehouse)" : "(Store)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Supplier / Vendor Name
                    </label>
                    <input
                      type="text"
                      value={bulkUploadReview.vendorName}
                      onChange={(e) =>
                        setBulkUploadReview((curr) => ({
                          ...curr,
                          vendorName: e.target.value,
                        }))
                      }
                      placeholder="e.g. UltraTech / Tata Steel"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Challan / Invoice No
                    </label>
                    <input
                      type="text"
                      value={bulkUploadReview.invoiceNumber}
                      onChange={(e) =>
                        setBulkUploadReview((curr) => ({
                          ...curr,
                          invoiceNumber: e.target.value,
                        }))
                      }
                      placeholder="e.g. DC-98431"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Inward / Challan Date
                    </label>
                    <input
                      type="date"
                      value={bulkUploadReview.invoiceDate}
                      onChange={(e) =>
                        setBulkUploadReview((curr) => ({
                          ...curr,
                          invoiceDate: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="min-h-0 flex-1 overflow-auto px-5 py-3 sm:px-6">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase text-slate-600">
                    <tr>
                      <th className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={
                            bulkUploadReview.items.length > 0 &&
                            bulkUploadReview.items.every(
                              (_, i) => bulkUploadReview.selectedMap[i],
                            )
                          }
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setBulkUploadReview((curr) => ({
                              ...curr,
                              selectedMap: Object.fromEntries(
                                curr.items.map((_, i) => [i, checked]),
                              ),
                            }));
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Material & Category</th>
                      <th className="px-3 py-2.5">SKU / Code</th>
                      <th className="px-3 py-2.5">Unit</th>
                      <th className="px-3 py-2.5">Batch / Lot No</th>
                      <th className="px-3 py-2.5">Expiry / Warranty</th>
                      <th className="px-3 py-2.5 text-right">Inward Qty</th>
                      <th className="px-3 py-2.5 text-right">Rate / Unit (₹)</th>
                      <th className="px-3 py-2.5 text-right">Total (₹)</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkUploadReview.items.map((item, idx) => {
                      const isSelected = !!bulkUploadReview.selectedMap[idx];
                      const lineTotal =
                        Number(item.qty || 0) * Number(item.costPrice || 0);

                      return (
                        <tr
                          key={item.rowId || idx}
                          className={`transition hover:bg-slate-50 ${
                            isSelected ? "bg-white" : "bg-slate-50/50 opacity-60"
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setBulkUploadReview((curr) => ({
                                  ...curr,
                                  selectedMap: {
                                    ...curr.selectedMap,
                                    [idx]: checked,
                                  },
                                }));
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-slate-900">
                              {item.productName}
                            </div>
                            <div className="flex flex-wrap gap-1 text-[10px] text-slate-500">
                              {item.category && (
                                <span className="rounded bg-slate-100 px-1 py-0.5">
                                  {item.category}
                                </span>
                              )}
                              {item.brand && (
                                <span className="rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-700">
                                  Make: {item.brand}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                            {item.sku || item.barcode || "—"}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-700">
                            {item.unit || "PCS"}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                            {item.batchNo || "Auto Batch"}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {item.expiryDate
                              ? formatIndianDate(item.expiryDate)
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                            {Number(item.qty || 0).toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700">
                            ₹{Number(item.costPrice || 0).toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                            ₹
                            {lineTotal.toLocaleString("en-IN", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {item.isNew ? (
                              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                New Item
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                Matched
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-5 py-3.5 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-slate-900">
                      {
                        bulkUploadReview.items.filter(
                          (_, i) => bulkUploadReview.selectedMap[i],
                        ).length
                      }
                    </span>{" "}
                    of {bulkUploadReview.items.length} materials selected for
                    inwarding
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkUploadReview(null)}
                      disabled={bulkUploadReviewBusy}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmBulkUpload}
                      disabled={
                        bulkUploadReviewBusy ||
                        !bulkUploadReview.items.some(
                          (_, i) => bulkUploadReview.selectedMap[i],
                        )
                      }
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {bulkUploadReviewBusy ? (
                        <>
                          <svg
                            className="h-3.5 w-3.5 animate-spin"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8H4z"
                            />
                          </svg>
                          <span>Creating Inward Draft...</span>
                        </>
                      ) : (
                        <>
                          <i className="ti ti-check text-sm" />
                          <span>Confirm & Inward Stock</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {showTemplateFilters && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleCloseTemplateFilters}
          />
          <div className="relative mt-16 w-full max-w-lg rounded-md bg-white shadow-lg">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Download Bulk Template
              </h3>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                Download a construction material receipt template directly.
                Brand or make is optional and can be filled only when
                applicable.
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-800">
                  Category
                </label>
                <select
                  value={templateFilters.categoryId}
                  onChange={(event) =>
                    setTemplateFilters((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                  disabled={loadingTemplateOptions || downloadingTemplate}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-red-300 focus:ring-1 focus:ring-red-200"
                >
                  <option value="">All Categories</option>
                  {templateCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={handleCloseTemplateFilters}
                disabled={downloadingTemplate}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownloadBulkTemplate}
                disabled={loadingTemplateOptions || downloadingTemplate}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {downloadingTemplate
                  ? "Downloading..."
                  : loadingTemplateOptions
                    ? "Loading..."
                    : "Download"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
          <div className="relative bg-white w-full max-w-2xl rounded-md shadow-lg overflow-hidden max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex min-h-0 flex-col">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Step 1 : Stock In Method
              </h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <div className="flex items-center gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setActiveTab("new")}
                  className={`px-4 py-2 rounded-md border ${activeTab === "new" ? "bg-blue-50 border-blue-200 text-gray-900" : "bg-white border-gray-200 text-gray-700"}`}
                >
                  New Stock Received
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("po")}
                  className={`px-4 py-2 rounded-md border ${activeTab === "po" ? "bg-blue-50 border-blue-200 text-gray-900" : "bg-white border-gray-200 text-gray-700"}`}
                >
                  Purchase Order
                </button>
              </div>

              {activeTab === "new" ? (
                <div>
                  <div className="mb-5">
                    <label className="block text-sm text-gray-800 mb-2">
                      Stock Source*
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSourceType("warehouse")}
                        className={`rounded-lg border px-4 py-3 text-left ${sourceType === "warehouse" ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-700"}`}
                      >
                        <span className="block text-sm font-bold">
                          Warehouse
                        </span>
                        <span className="block text-xs text-gray-500">
                          Show available warehouse stock
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSourceType("vendor")}
                        className={`rounded-lg border px-4 py-3 text-left ${sourceType === "vendor" ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-700"}`}
                      >
                        <span className="block text-sm font-bold">
                          Direct Vendor
                        </span>
                        <span className="block text-xs text-gray-500">
                          Show products supplied by vendor
                        </span>
                      </button>
                    </div>
                  </div>

                  {sourceType === "vendor" && (
                    <div className="mb-5">
                      <label className="block text-sm text-gray-800 mb-2">
                        Vendors*
                      </label>
                      <input
                        value={vendorQuery}
                        onChange={(e) => setVendorQuery(e.target.value)}
                        placeholder="Search vendor..."
                        className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500"
                      />
                      <select
                        multiple
                        value={selectedVendorIds}
                        onChange={(e) =>
                          setSelectedVendorIds(
                            Array.from(e.target.selectedOptions).map(
                              (option) => option.value,
                            ),
                          )
                        }
                        className="h-32 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700"
                      >
                        {filteredVendors.map((vendor) => (
                          <option key={vendor.id} value={String(vendor.id)}>
                            {vendor.name}
                            {vendor.company ? ` - ${vendor.company}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Use Ctrl or Shift to select multiple vendors.
                      </p>
                    </div>
                  )}

                  <div className="mb-6">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        if (f && f.size > MAX_INVOICE_UPLOAD_BYTES) {
                          alert(
                            `Invoice file must be ${formatFileSize(MAX_INVOICE_UPLOAD_BYTES)} or smaller.`,
                          );
                          e.target.value = "";
                          setSelectedFile(null);
                          return;
                        }
                        setSelectedFile(f);
                      }}
                    />

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") fileInputRef.current?.click();
                      }}
                      className="rounded-lg border-dashed border-2 border-gray-300 p-6 text-center text-gray-700 cursor-pointer"
                    >
                      <div className="mb-2 font-medium text-gray-800">
                        {selectedFile ? selectedFile.name : "Upload invoice"}
                      </div>
                      <div className="text-sm text-gray-600">
                        Drop a PDF or image to pre-fill line items
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        Max size: {formatFileSize(MAX_INVOICE_UPLOAD_BYTES)}
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm text-gray-800 mb-2">
                      Destination*
                    </label>
                    <SearchableSelect
                      value={destination}
                      onChange={setDestination}
                      placeholder={
                        loadingStores ? "Loading..." : "Select Destination"
                      }
                      searchPlaceholder="Search destination..."
                      options={destinationStores.map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                      disabled={loadingStores}
                    />
                    <p className="mt-1.5 text-xs text-amber-600 font-medium">
                      Note: Direct stock-in to stores is not allowed. Stock must
                      be received at a Warehouse first, then transferred to a
                      store.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={applyTaxes}
                        onChange={(e) => setApplyTaxes(e.target.checked)}
                      />
                      <span className="text-sm font-semibold text-gray-800">
                        Apply Taxes On This Transaction
                      </span>
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-4">
                    <label className="block text-sm text-gray-800 mb-2">
                      Purchase order ID
                    </label>
                    <input
                      className="w-full border border-gray-300 rounded px-3 py-2 text-gray-700"
                      placeholder="Enter Purchase order ID"
                      value={purchaseOrderId}
                      onChange={(e) => setPurchaseOrderId(e.target.value)}
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm text-gray-800 mb-2">
                      Invoice Number
                    </label>
                    <input
                      className="w-full border border-gray-300 rounded px-3 py-2 text-gray-700"
                      placeholder="Enter Invoice Number"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={applyTaxes}
                        onChange={(e) => setApplyTaxes(e.target.checked)}
                      />
                      <span className="text-sm font-semibold text-gray-800">
                        Apply Taxes On This Transaction
                      </span>
                    </label>
                  </div>
                  <div className="mt-4">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addProductsPrefill}
                        onChange={(e) =>
                          setAddProductsPrefill(e.target.checked)
                        }
                      />
                      <span className="text-sm font-semibold text-gray-800">
                        Add products to cart by default with prefilled quantity.
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t bg-white px-6 py-4">
              <button
                type="button"
                className="px-4 py-2 rounded border border-gray-200"
                onClick={handleClose}
              >
                Close
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded bg-blue-600 text-white"
                onClick={handleNext}
                disabled={submitting}
              >
                {submitting ? "..." : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingMissingProduct && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-[17px] font-bold text-gray-900">
              Product not found
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-gray-600">
              "{pendingMissingProduct.productName}" does not exist. Do you want
              to create a new product?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const remainingRows =
                    pendingMissingProduct.existingRows || [];
                  window.sessionStorage.removeItem(PENDING_STOCK_IN_BULK_KEY);
                  setPendingMissingProduct(null);
                  await processBulkRows(remainingRows);
                }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  if (Array.isArray(pendingMissingProduct.originalRows)) {
                    window.sessionStorage.setItem(
                      PENDING_STOCK_IN_BULK_KEY,
                      JSON.stringify(pendingMissingProduct.originalRows),
                    );
                  }
                  window.location.assign(
                    buildCreateProductUrl(pendingMissingProduct.originalRow),
                  );
                }}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

async function downloadInventoryEntryWorkbook(kind, entry) {
  const XLSX = await import("xlsx");
  const summaryHeaders = [
    "Transaction ID",
    "Invoice Number",
    "Invoice Date",
    "Destination",
    "Brand",
    "Vendor",
    "Status",
    "Other Charges",
    "Remarks",
  ];
  const summaryValues = [
    entry.transactionId || entry.id || "",
    entry.invoice_number || "",
    formatDate(entry.invoice_date),
    entry.destinationName || entry.destination || "",
    [
      ...new Set(
        (entry.items || []).map((item) => item.brand_name).filter(Boolean),
      ),
    ].join(", "),
    entry.vendor_name || "",
    entry.status || "",
    Number(entry.other_charges || 0),
    entry.remarks || "",
  ];
  const summaryRows = [summaryHeaders, summaryValues];
  const itemRows = (entry.items || []).map((item, index) => ({
    "S.No.": index + 1,
    Product: item.name || "",
    Brand: item.brand_name || "",
    SKU: item.sku || "",
    Barcode: item.barcode || "",
    "Batch No": item.batch_no || "",
    Expiry: formatDate(item.expiry_date),
    Qty: Number(item.qty || 0),
    "Cost Price": Number(item.cost_price || 0),
    MRP: Number(item.mrp || 0),
    "Selling Price": Number(item.selling_price || 0),
    Tax: Number(item.tax_value || 0),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(summaryRows),
    "Summary",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(itemRows),
    "Products",
  );
  XLSX.writeFile(
    workbook,
    `${kind}-${entry.transactionId || entry.id || "entry"}.xlsx`,
  );
}

function firstNonEmpty(values = []) {
  return values.find((value) => String(value ?? "").trim()) || "";
}

function boolFromExcel(value) {
  return ["yes", "y", "true", "1"].includes(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

function excelDateToInput(value) {
  const normalized = toDateInputValue(value);
  return normalized || "";
}

function buildEditableStockInRows(entries) {
  return (entries || []).flatMap((entry) =>
    (entry.items || []).map((item, index) => ({
      "Stock In ID": entry.id,
      "Transaction ID": entry.transactionId || "",
      "Stock In Item ID": item.id || "",
      "Line No": index + 1,
      "Create New Product": "",
      "Product DB ID": item.product_id || "",
      "Catalog Product ID": item.catalog_product_id || "",
      "Product Name": item.name || "",
      SKU: item.sku || "",
      Barcode: item.barcode || "",
      Brand: item.brand_name || "",
      "Batch No": item.batch_no || "",
      "MFG Date": excelDateToInput(item.mfg_date),
      "Expiry Date": excelDateToInput(item.expiry_date),
      Qty: Number(item.qty || 0),
      "Cost Price": Number(item.cost_price || 0),
      MRP: Number(item.mrp || 0),
      "Selling Price": Number(item.selling_price || 0),
      Tax: Number(item.tax_value || 0),
      Vendor: entry.vendor_name || "",
      "Invoice Number": entry.invoice_number || "",
      "Invoice Date": excelDateToInput(entry.invoice_date),
      Remarks: entry.remarks || "",
      "Do Not Edit Scope Key": `stock-in:${entry.id}`,
    })),
  );
}

async function downloadEditableStockInWorkbook(entries, filters = {}) {
  const XLSX = await import("xlsx");
  const rows = buildEditableStockInRows(entries);
  if (!rows.length) throw new Error("No stock-in items found to edit.");

  const manifestRows = [
    ["Workbook Type", "stock-in-edit"],
    ["Generated At", new Date().toISOString()],
    ["Allowed Stock In IDs", entries.map((entry) => entry.id).join(",")],
    ["Filters", JSON.stringify(filters || {})],
  ];

  const workbook = XLSX.utils.book_new();
  const instructionRows = [
    {
      Rule: "Edit only rows in the Stock In Items sheet.",
      Notes:
        "Rows outside the downloaded Stock In IDs are rejected during upload. Qty may be increased; it may be reduced only up to the quantity not already used.",
    },
    {
      Rule: "To add an item to a stock-in, add a new row with the same Stock In ID.",
      Notes:
        "Leave Stock In Item ID blank. Product DB ID must be filled, unless Create New Product is YES.",
    },
    {
      Rule: "To create a new catalog product, set Create New Product = YES.",
      Notes: "Product Name is required. SKU/barcode should be unique.",
    },
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(instructionRows),
    "Instructions",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows),
    STOCK_IN_EDIT_ITEMS_SHEET,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(manifestRows),
    STOCK_IN_EDIT_MANIFEST_SHEET,
  );
  const manifestIndex = workbook.SheetNames.indexOf(
    STOCK_IN_EDIT_MANIFEST_SHEET,
  );
  workbook.Workbook = workbook.Workbook || {};
  workbook.Workbook.Sheets = workbook.Workbook.Sheets || [];
  workbook.Workbook.Sheets[manifestIndex] = {
    ...(workbook.Workbook.Sheets[manifestIndex] || {}),
    Hidden: 1,
  };
  XLSX.writeFile(
    workbook,
    `stock-in-edit-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

async function parseEditableStockInWorkbook(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const itemSheet = workbook.Sheets[STOCK_IN_EDIT_ITEMS_SHEET];
  const manifestSheet = workbook.Sheets[STOCK_IN_EDIT_MANIFEST_SHEET];
  if (!itemSheet || !manifestSheet) {
    throw new Error(
      "Invalid stock-in edit workbook. Please upload the Excel downloaded from Edit Excel.",
    );
  }

  const manifest = XLSX.utils.sheet_to_json(manifestSheet, {
    header: 1,
    defval: "",
  });
  const manifestMap = new Map(
    manifest.map((row) => [String(row[0] || "").trim(), String(row[1] || "")]),
  );
  if (manifestMap.get("Workbook Type") !== "stock-in-edit") {
    throw new Error("This Excel file is not a Stock In edit workbook.");
  }
  const allowedStockInIds = String(
    manifestMap.get("Allowed Stock In IDs") || "",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const rawRows = XLSX.utils.sheet_to_json(itemSheet, {
    defval: "",
    raw: false,
  });
  const rows = rawRows.map((row, index) => ({
    rowKey: `row-${index + 2}`,
    stockInId: String(row["Stock In ID"] || "").trim(),
    transactionId: String(row["Transaction ID"] || "").trim(),
    stockInItemId: String(row["Stock In Item ID"] || "").trim(),
    createNewProduct: boolFromExcel(row["Create New Product"]),
    productId: String(row["Product DB ID"] || "").trim(),
    catalogProductId: String(row["Catalog Product ID"] || "").trim(),
    productName: String(row["Product Name"] || "").trim(),
    sku: String(row.SKU || "").trim(),
    barcode: String(row.Barcode || "").trim(),
    brand: String(row.Brand || "").trim(),
    batchNo: String(row["Batch No"] || "").trim(),
    mfgDate: excelDateToInput(row["MFG Date"]),
    expiryDate: excelDateToInput(row["Expiry Date"]),
    qty: Number(row.Qty || 0),
    costPrice: Number(row["Cost Price"] || 0),
    mrp: Number(row.MRP || 0),
    sellingPrice: Number(row["Selling Price"] || 0),
    tax: Number(row.Tax || 0),
    vendor: String(row.Vendor || "").trim(),
    invoiceNumber: String(row["Invoice Number"] || "").trim(),
    invoiceDate: excelDateToInput(row["Invoice Date"]),
    remarks: String(row.Remarks || "").trim(),
    scopeKey: String(row["Do Not Edit Scope Key"] || "").trim(),
  }));

  for (const row of rows) {
    if (row.scopeKey && row.scopeKey !== `stock-in:${row.stockInId}`) {
      throw new Error(`Scope key mismatch in ${row.rowKey}.`);
    }
    if (
      !row.createNewProduct &&
      !row.productId &&
      !row.catalogProductId &&
      !row.sku &&
      !row.barcode &&
      !row.productName
    ) {
      throw new Error(
        `${row.rowKey}: Product DB ID, SKU, barcode, or product name is required unless Create New Product is YES.`,
      );
    }
    if (row.createNewProduct && !row.productName) {
      throw new Error(
        `${row.rowKey}: Product Name is required for new product.`,
      );
    }
    if (!Number.isFinite(row.qty) || row.qty <= 0) {
      throw new Error(`${row.rowKey}: Qty must be greater than zero.`);
    }
  }

  return { allowedStockInIds, rows };
}

async function resolveStockInEditProducts(rows) {
  const unresolved = rows.filter(
    (row) => !row.createNewProduct && !row.productId,
  );
  if (!unresolved.length) return;

  const res = await fetch("/api/inventory/stockin/product-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_ids: unresolved.map((row) => row.productId).filter(Boolean),
      catalog_product_ids: unresolved
        .map((row) => row.catalogProductId)
        .filter(Boolean),
      skus: unresolved.map((row) => row.sku).filter(Boolean),
      barcodes: unresolved.map((row) => row.barcode).filter(Boolean),
      product_names: unresolved.map((row) => row.productName).filter(Boolean),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || "Unable to verify products from Excel.");
  }

  const records = Array.isArray(json.records) ? json.records : [];
  const byCatalogId = new Map(
    records.map((product) => [
      String(product.productId || product.product_id || "").trim(),
      product,
    ]),
  );
  const bySku = new Map(
    records.map((product) => [
      String(product.sku || "")
        .trim()
        .toLowerCase(),
      product,
    ]),
  );
  const byBarcode = new Map(
    records.map((product) => [
      String(product.barcode || "")
        .trim()
        .toLowerCase(),
      product,
    ]),
  );
  const byName = new Map(
    records.map((product) => [
      String(product.productName || product.name || "")
        .trim()
        .toLowerCase(),
      product,
    ]),
  );

  for (const row of unresolved) {
    const match =
      byCatalogId.get(row.catalogProductId) ||
      bySku.get(row.sku.toLowerCase()) ||
      byBarcode.get(row.barcode.toLowerCase()) ||
      byName.get(row.productName.toLowerCase());
    if (!match?.id) {
      throw new Error(
        `${row.rowKey}: Product not found. Fill Product DB ID or set Create New Product = YES.`,
      );
    }
    row.productId = String(match.id);
  }
}

async function createProductFromStockInEditRow(row) {
  const res = await fetch("/api/catalog/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: row.catalogProductId || null,
      name: row.productName,
      sku: row.sku || null,
      barcode: row.barcode || null,
      cost_price: row.costPrice || 0,
      mrp: row.mrp || 0,
      selling_price: row.sellingPrice || 0,
      unit: "PCS",
      stock_item_type: row.batchNo || row.expiryDate ? "BATCHED" : "UNBATCHED",
      inventory_method: "direct",
      is_active: true,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json.message ||
        json.error ||
        `${row.rowKey}: Failed to create new product`,
    );
  }
  const product = json.data?.product || json.product || json.data || json;
  if (!product?.id) {
    throw new Error(`${row.rowKey}: Product created but ID was not returned.`);
  }
  return product;
}

function buildStockInItemRows(entry) {
  return (entry.items || []).map((item, index) => {
    const qty = Number(item.qty || 0);
    const costPrice = Number(item.cost_price || 0);
    const sellingPrice = Number(item.selling_price || 0);
    return {
      "S.No.": index + 1,
      "Transaction ID": entry.transactionId || entry.id || "",
      "Invoice Number": entry.invoice_number || "",
      "Invoice Date": formatDate(entry.invoice_date),
      Destination: entry.destinationName || entry.destination || "",
      Brand: item.brand_name || "",
      Vendor: entry.vendor_name || "",
      Status: entry.status || "",
      "Product ID": item.product_id || "",
      Product: item.name || "",
      SKU: item.sku || "",
      Barcode: item.barcode || "",
      "Batch No": item.batch_no || "",
      Expiry: formatDate(item.expiry_date),
      Qty: qty,
      "Cost Price": costPrice,
      MRP: Number(item.mrp || 0),
      "Selling Price": sellingPrice,
      Tax: Number(item.tax_value || 0),
      "Line Cost": qty * costPrice,
      "Line Selling Value": qty * sellingPrice,
    };
  });
}

async function downloadStockInItemsWorkbook(entries, filters = {}) {
  const XLSX = await import("xlsx");
  const itemRows = (entries || []).flatMap(buildStockInItemRows);
  if (!itemRows.length) {
    throw new Error("No stock-in items found for selected filters.");
  }

  const consolidated = new Map();
  itemRows.forEach((row) => {
    const productKey =
      row["Product ID"] ||
      row.SKU ||
      row.Barcode ||
      `${row.Destination}|${row.Product}`.toLowerCase();
    const key = `${row.Destination}|${productKey}`;
    const current = consolidated.get(key) || {
      Destination: row.Destination,
      Product: row.Product,
      SKU: row.SKU,
      Barcode: row.Barcode,
      "Stock In Count": 0,
      "Transaction IDs": new Set(),
      "Total Qty": 0,
      "Total Cost": 0,
      "Total Selling Value": 0,
      "Total Tax": 0,
    };
    current["Transaction IDs"].add(row["Transaction ID"]);
    current["Stock In Count"] = current["Transaction IDs"].size;
    current["Total Qty"] += Number(row.Qty || 0);
    current["Total Cost"] += Number(row["Line Cost"] || 0);
    current["Total Selling Value"] += Number(row["Line Selling Value"] || 0);
    current["Total Tax"] += Number(row.Tax || 0) * Number(row.Qty || 0);
    consolidated.set(key, current);
  });

  const consolidatedRows = Array.from(consolidated.values())
    .map((row, index) => ({
      "S.No.": index + 1,
      Destination: row.Destination,
      Product: row.Product,
      SKU: row.SKU,
      Barcode: row.Barcode,
      "Stock In Count": row["Stock In Count"],
      "Transaction IDs": Array.from(row["Transaction IDs"]).join(", "),
      "Total Qty": row["Total Qty"],
      "Avg Cost Price": row["Total Qty"]
        ? row["Total Cost"] / row["Total Qty"]
        : 0,
      "Total Cost": row["Total Cost"],
      "Total Selling Value": row["Total Selling Value"],
      "Total Tax": row["Total Tax"],
    }))
    .sort((a, b) =>
      `${a.Destination}|${a.Product}`.localeCompare(
        `${b.Destination}|${b.Product}`,
      ),
    );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(consolidatedRows),
    "Consolidated",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(itemRows),
    "Stock In Details",
  );
  const suffix = [filters.dateFrom, filters.dateTo, filters.source]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  XLSX.writeFile(
    workbook,
    `stock-in-consolidated${suffix ? `-${suffix}` : ""}.xlsx`,
  );
}
