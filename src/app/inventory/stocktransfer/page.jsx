"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import InventoryShell from "@/components/inventory/InventoryShell";
import {
  getBulkField,
  parseBulkSheet,
  pickSpreadsheetFile,
  toBoolean,
} from "@/lib/bulkSheet";
import { formatIndianDate, toDateInputValue } from "@/lib/dateUtils";
import {
  addOptionNamedRanges,
  applyTextFormatToColumns,
  buildOptionsSheet,
  hideOptionsSheet,
  optionFormula,
  saveWorkbookWithValidations,
  sortOptions,
  uniqueOptions,
} from "@/lib/xlsxDropdowns";

async function fetchStores() {
  const res = await fetch("/api/stores");
  if (!res.ok) throw new Error("Failed to fetch stores");
  const json = await res.json();
  return json.data?.records || json.data?.stores || json.stores || [];
}

async function fetchTransfers(sourceId = "", destinationId = "") {
  const params = new URLSearchParams();
  if (sourceId) params.set("sourceId", sourceId);
  if (destinationId) params.set("destinationId", destinationId);
  const query = params.size ? `?${params.toString()}` : "";
  const res = await fetch(`/api/inventory/stocktransfer${query}`);
  if (!res.ok) throw new Error("Failed to fetch stock transfers");
  return res.json();
}

async function fetchTransferFilterOptions() {
  const res = await fetch("/api/inventory/stocktransfer?filterOptions=1");
  if (!res.ok) throw new Error("Failed to fetch transfer filter options");
  return res.json();
}

async function fetchInventoryProducts(storeId, searchTerm, options = {}) {
  if (!storeId) return [];
  const pageSize = 250;
  const records = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      store_id: String(storeId),
      search: searchTerm,
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await fetch(`/api/inventory/products?${params.toString()}`, {
      signal: options.signal,
    });
    if (!res.ok) throw new Error("Failed to fetch inventory products");
    const json = await res.json();
    const pageRecords = json.data?.records || json.records || [];
    records.push(...pageRecords);
    totalPages = Number(json.data?.totalPages || json.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return records;
}

async function fetchBulkInventoryProducts(storeId, identifiers) {
  const res = await fetch("/api/inventory/products/bulk-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store_id: getNumericId(storeId), ...identifiers }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || "Failed to look up source inventory");
  return {
    records: Array.isArray(data.records) ? data.records : [],
    heldRecords: Array.isArray(data.heldRecords) ? data.heldRecords : [],
  };
}

async function postTransfer(payload) {
  const res = await fetch("/api/inventory/stocktransfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create stock transfer");
  return data;
}

async function confirmTransfer(id, payload) {
  const res = await fetch(
    `/api/inventory/stocktransfer/${encodeURIComponent(id)}/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to confirm stock transfer");
  return data;
}

async function revertTransfer(id) {
  const res = await fetch(
    `/api/inventory/stocktransfer/${encodeURIComponent(id)}/revert`,
    {
      method: "POST",
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to revert stock transfer");
  return data;
}

async function fetchTransferDetails(id) {
  const res = await fetch(
    `/api/inventory/stocktransfer/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load stock transfer");
  return data;
}

async function updateTransferDetails(id, payload) {
  const res = await fetch(
    `/api/inventory/stocktransfer/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update stock transfer");
  return data;
}

const tableHeaders = [
  "Transaction ID",
  "Status",
  "Invoice Number",
  "Brand",
  "Source Name",
  "Destination Name",
  "Invoice Date",
  "Item Count",
  "Total Quantity",
  "Cost",
];

function formatDate(value) {
  return formatIndianDate(value, "-");
}

function hasSourceStockReleaseError(transfer) {
  const releaseError = String(
    transfer?.meta?.marginHoldReleaseError || "",
  ).toLowerCase();

  return (
    releaseError.includes("insufficient source batch stock") ||
    releaseError.includes("source batch stock is no longer sufficient") ||
    releaseError.includes("source stock is no longer sufficient")
  );
}

function getTransferDisplayStatus(transfer) {
  const status = String(transfer?.status || "").toLowerCase();

  if (status === "margin_hold") {
    return hasSourceStockReleaseError(transfer)
      ? "Approved - Source Stock Unavailable"
      : "Awaiting Approval / Release";
  }

  if (!status) return "-";
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatCost(value) {
  const n = Number(value || 0);
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function mapTransfersToTable(records) {
  return (records || []).map((row) => ({
    _id: row.id,
    Status: getTransferDisplayStatus(row),
    "Transaction ID": row.transactionId
      ? `#${row.transactionId}`
      : `#TRN-${row.id}`,
    "Invoice Number": row.invoiceNumber || "-",
    Brand: row.brandNames || "-",
    "Source Name": row.sourceName || "-",
    "Destination Name": row.destinationName || "-",
    "Invoice Date": formatDate(row.invoiceDate),
    "Item Count": row.itemCount ?? 0,
    "Total Quantity": row.totalItems ?? 0,
    Cost: formatCost(row.cost),
    _invoiceDate: row.invoiceDate || "",
    _source: row.sourceName || "",
    _sourceId: row.sourceId ? String(row.sourceId) : "",
    _destination: row.destinationName || "",
    _destinationId: row.destinationId ? String(row.destinationId) : "",
    _brands: row.brandNames || "",
    _revertedAt: row.revertedAt || "",
  }));
}

function getLocationType(location) {
  return String(location?.meta?.locationType || "Store").trim() || "Store";
}

function getLocationOption(location) {
  return `${location.id} - ${location.name} (${getLocationType(location)})`;
}

function normalizeCompare(value) {
  return String(value || "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeLocationName(value) {
  return normalizeCompare(value)
    .replace(/^\d+\s*-\s*/, "")
    .replace(/\s*\((?:store|warehouse)\)\s*$/i, "")
    .trim();
}

function extractLocationParts(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^\s*'?(\d+)\s*-\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/);
  if (!match) {
    return {
      id: raw.match(/^\s*'?(\d+)/)?.[1] || "",
      name: normalizeLocationName(raw),
      type: "",
    };
  }
  return {
    id: match[1],
    name: normalizeLocationName(match[2]),
    type: normalizeCompare(match[3] || ""),
  };
}

function normalizeProductName(value) {
  return normalizeCompare(value).replace(/[^a-z0-9]+/g, "");
}

function productNamesMatch(left, right) {
  const a = normalizeProductName(left);
  const b = normalizeProductName(right);
  if (!a || !b) return false;
  return (
    a === b ||
    (Math.min(a.length, b.length) >= 10 && (a.includes(b) || b.includes(a)))
  );
}

function resolveLocationId(value, locations) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = extractLocationParts(raw);
  const normalizedRaw = normalizeCompare(raw);
  const compactRaw = normalizedRaw.replace(/[^a-z0-9]+/g, "");

  const exact = locations.find((location) => {
    const id = String(location.id);
    const name = normalizeCompare(location.name);
    const option = normalizeCompare(getLocationOption(location));
    const compactOption = option.replace(/[^a-z0-9]+/g, "");
    return (
      normalizedRaw === id ||
      name === normalizedRaw ||
      option === normalizedRaw ||
      compactOption === compactRaw
    );
  });
  if (exact) return String(exact.id);

  const nameMatch = locations.find((location) => {
    const locationName = normalizeLocationName(location.name);
    const locationType = normalizeCompare(getLocationType(location));
    return (
      parsed.name &&
      locationName === parsed.name &&
      (!parsed.type || locationType === parsed.type)
    );
  });
  if (nameMatch) return String(nameMatch.id);

  const leadingId = parsed.id;
  if (leadingId) {
    const idMatch = locations.find(
      (location) => String(location.id) === String(leadingId),
    );
    if (idMatch) return String(idMatch.id);
  }

  return raw;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getNumericId(value) {
  const raw = String(value ?? "").trim();
  const leading = raw.match(/^\d+/)?.[0];
  return leading || raw;
}

function getBatchId(product) {
  const direct = product?.batchId ?? product?.batch_id;
  if (direct) return String(direct).match(/\d+/g)?.pop() || direct;
  const composite = String(product?.id ?? product?.product_id ?? "").trim();
  const parts = composite.match(/\d+/g) || [];
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

function getRowDate(value) {
  if (!value) return "";
  const normalized = toDateInputValue(value);
  if (normalized) return normalized;

  const raw = String(value).trim();
  const parts = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (parts) {
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    const year = expandImportYear(parts[3]);
    if (first >= 1 && first <= 12 && second > 12 && second <= 31) {
      return formatImportDateParts(year, first, second);
    }
  }

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial >= 30000 && serial <= 80000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + serial * 86400000);
    return formatImportDateParts(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }

  return "";
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

function buildTransferGroupKey(row) {
  return [
    row.sourceId,
    row.destinationId,
    row.invoiceDate,
    row.invoiceNumber,
    row.otherCharges,
    row.remarks,
    row.applyTaxes ? "tax" : "no-tax",
  ].join("|");
}

function buildInventoryProductIndex(records) {
  const index = {
    barcode: new Map(),
    sku: new Map(),
    name: new Map(),
    records: Array.isArray(records) ? records : [],
  };
  for (const product of index.records) {
    const barcode = normalizeCompare(product.barcode);
    const sku = normalizeCompare(product.sku);
    const name = normalizeProductName(product.name);
    if (barcode)
      index.barcode.set(barcode, [
        ...(index.barcode.get(barcode) || []),
        product,
      ]);
    if (sku) index.sku.set(sku, [...(index.sku.get(sku) || []), product]);
    if (name) index.name.set(name, [...(index.name.get(name) || []), product]);
  }
  return index;
}

function getUniqueIdentifierMatch(matches, label, value) {
  if (!matches?.length) return null;
  if (matches.length > 1) {
    throw new Error(
      `${label} ${value} matches multiple products in source inventory.`,
    );
  }
  return matches[0];
}

function findIndexedProduct(index, { barcode, sku, productName }) {
  const barcodeKey = normalizeCompare(barcode);
  const skuKey = normalizeCompare(sku);
  const nameKey = normalizeProductName(productName);

  // SKU is the primary identifier. A repeated product name or barcode must
  // never merge two different SKUs into the same transfer item.
  const skuMatches = skuKey ? index.sku.get(skuKey) || [] : [];
  const barcodeMatches = barcodeKey ? index.barcode.get(barcodeKey) || [] : [];

  if (skuMatches.length && barcodeMatches.length) {
    const barcodeProductIds = new Set(
      barcodeMatches.map((product) => String(product.id)),
    );
    const commonMatches = skuMatches.filter((product) =>
      barcodeProductIds.has(String(product.id)),
    );
    if (!commonMatches.length) {
      throw new Error(
        `SKU ${sku} and barcode ${barcode} belong to different products.`,
      );
    }
    return getUniqueIdentifierMatch(
      commonMatches,
      "SKU/barcode combination",
      `${sku}/${barcode}`,
    );
  }

  const skuMatch = getUniqueIdentifierMatch(skuMatches, "SKU", sku);
  if (skuMatch) return skuMatch;

  const barcodeMatch = getUniqueIdentifierMatch(
    barcodeMatches,
    "Barcode",
    barcode,
  );
  if (barcodeMatch) return barcodeMatch;

  const exactNameMatches = nameKey ? index.name.get(nameKey) || [] : [];
  const nameMatches = exactNameMatches.length
    ? exactNameMatches
    : index.records.filter(
        (product) => nameKey && productNamesMatch(product.name, productName),
      );

  // Bulk sheets sometimes carry stale barcode/SKU values while the product
  // name is still the exact catalog name. Use the unique name match as a safe
  // fallback instead of rejecting the entire row.
  if ((skuKey || barcodeKey) && nameMatches.length) {
    return getUniqueIdentifierMatch(nameMatches, "Product name", productName);
  }

  if (skuKey || barcodeKey) return null;

  return getUniqueIdentifierMatch(nameMatches, "Product name", productName);
}

export default function StockTransferPage() {
  const [showModal, setShowModal] = useState(false);
  const [stores, setStores] = useState([]);
  const [transferFilterOptions, setTransferFilterOptions] = useState({
    sources: [],
    destinations: [],
  });
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [applyTaxes, setApplyTaxes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const createTransferLockRef = useRef(false);
  const createTransferRequestKeyRef = useRef(null);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [tableData, setTableData] = useState([]);
  const [draftId, setDraftId] = useState(null);
  const [listFilters, setListFilters] = useState({
    dateFrom: "",
    dateTo: "",
    source: "",
    destination: "",
    brand: "",
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkImportLockRef = useRef(false);
  const [pendingRevert, setPendingRevert] = useState(null);
  const [revertingId, setRevertingId] = useState(null);
  const [previewTransfer, setPreviewTransfer] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editTransfer, setEditTransfer] = useState(null);
  const [editForm, setEditForm] = useState({
    invoice_date: "",
    invoice_number: "",
    other_charges: "",
    remarks: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const isSuperAdmin = currentUser?.role === "super_admin";

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setCurrentUser(json.data?.user || json.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  const visibleTableData = useMemo(() => {
    return tableData.filter((row) => {
      const invoiceTime = row._invoiceDate
        ? new Date(row._invoiceDate).getTime()
        : null;
      if (
        listFilters.dateFrom &&
        invoiceTime &&
        invoiceTime < new Date(listFilters.dateFrom).getTime()
      )
        return false;
      if (
        listFilters.dateTo &&
        invoiceTime &&
        invoiceTime > new Date(`${listFilters.dateTo}T23:59:59`).getTime()
      )
        return false;
      if (
        listFilters.source &&
        String(row._sourceId || "") !== listFilters.source
      )
        return false;
      if (
        listFilters.destination &&
        String(row._destinationId || "") !== listFilters.destination
      )
        return false;
      if (
        listFilters.brand.trim() &&
        !String(row._brands || "")
          .toLowerCase()
          .includes(listFilters.brand.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [tableData, listFilters]);

  const sourceOptions = useMemo(() => {
    const options = new Map();
    stores.forEach((store) => {
      if (store?.id && store?.name) options.set(String(store.id), store.name);
    });
    transferFilterOptions.sources.forEach((store) => {
      if (store?.id && store?.name) options.set(String(store.id), store.name);
    });
    tableData.forEach((row) => {
      if (row._sourceId && row._source) options.set(row._sourceId, row._source);
    });
    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [stores, tableData, transferFilterOptions.sources]);

  const destinationOptions = useMemo(() => {
    const options = new Map();
    stores.forEach((store) => {
      if (store?.id && store?.name) options.set(String(store.id), store.name);
    });
    transferFilterOptions.destinations.forEach((store) => {
      if (store?.id && store?.name) options.set(String(store.id), store.name);
    });
    tableData.forEach((row) => {
      if (row._destinationId && row._destination) {
        options.set(row._destinationId, row._destination);
      }
    });
    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [stores, tableData, transferFilterOptions.destinations]);

  const brandOptions = useMemo(
    () =>
      Array.from(
        new Set(
          tableData.flatMap((row) =>
            String(row._brands || "")
              .split(",")
              .map((brand) => brand.trim())
              .filter(Boolean),
          ),
        ),
      ).sort(),
    [tableData],
  );

  const loadList = (sourceId = "", destinationId = "") => {
    setLoadingList(true);
    fetchTransfers(sourceId, destinationId)
      .then((records) => setTableData(mapTransfersToTable(records)))
      .catch(() => setTableData([]))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    loadList(listFilters.source, listFilters.destination);
  }, [listFilters.source, listFilters.destination]);

  useEffect(() => {
    fetchStores()
      .then((data) => setStores(Array.isArray(data) ? data : []))
      .catch(() => setStores([]));
    fetchTransferFilterOptions()
      .then((data) =>
        setTransferFilterOptions({
          sources: Array.isArray(data?.sources) ? data.sources : [],
          destinations: Array.isArray(data?.destinations)
            ? data.destinations
            : [],
        }),
      )
      .catch(() => setTransferFilterOptions({ sources: [], destinations: [] }));
  }, []);

  useEffect(() => {
    if (!showModal) return;
    setLoadingStores(true);
    fetchStores()
      .then((data) => setStores(Array.isArray(data) ? data : []))
      .catch(() => setStores([]))
      .finally(() => setLoadingStores(false));
  }, [showModal]);

  const openModal = () => {
    setSource("");
    setDestination("");
    setApplyTaxes(true);
    setShowModal(true);
  };

  const loadLocations = async () => {
    const data = await fetchStores();
    const locations = Array.isArray(data) ? data : [];
    setStores(locations);
    return locations;
  };

  const handleDownloadBulkTemplate = async () => {
    setBulkBusy(true);
    try {
      const XLSX = await import("xlsx");
      const locations = stores.length ? stores : await loadLocations();
      const locationOptions = sortOptions(
        uniqueOptions(locations.map(getLocationOption)),
      );
      const yesNoOptions = ["Yes", "No"];
      const headers = [
        "Source",
        "Destination",
        "Barcode",
        "SKU",
        "Product Name",
        "Quantity",
        "MRP On Destination",
        "Selling Price On Destination",
        "Cost/Unit",
        "Invoice Date",
        "Invoice Number",
        "Other Charges",
        "Remarks",
        "Apply Taxes",
      ];
      const rows = [headers];

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 34 },
        { wch: 34 },
        { wch: 18 },
        { wch: 18 },
        { wch: 30 },
        { wch: 12 },
        { wch: 20 },
        { wch: 26 },
        { wch: 14 },
        { wch: 14 },
        { wch: 18 },
        { wch: 16 },
        { wch: 26 },
        { wch: 14 },
      ];
      applyTextFormatToColumns(worksheet, headers, [
        "Barcode",
        "SKU",
        "Invoice Number",
      ]);

      const optionGroups = [
        {
          key: "locations",
          name: "TransferLocations",
          values: locationOptions,
        },
        { key: "yes_no", name: "YesNoOptions", values: yesNoOptions },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Bulk Stock Transfer");
      XLSX.utils.book_append_sheet(
        workbook,
        buildOptionsSheet(optionGroups),
        "Options",
      );
      addOptionNamedRanges(workbook, optionGroups);
      hideOptionsSheet(workbook);

      await saveWorkbookWithValidations(
        workbook,
        "stock-transfer-bulk-template.xlsx",
        [
          {
            range: "A2:A501",
            formula: optionFormula(optionGroups, "locations"),
            errorTitle: "Invalid source",
            error: "Select a source from the dropdown.",
            promptTitle: "Source",
            prompt: "Select source store or warehouse.",
          },
          {
            range: "B2:B501",
            formula: optionFormula(optionGroups, "locations"),
            errorTitle: "Invalid destination",
            error: "Select a destination from the dropdown.",
            promptTitle: "Destination",
            prompt: "Select destination store or warehouse.",
          },
          {
            range: "N2:N501",
            formula: optionFormula(optionGroups, "yes_no"),
            errorTitle: "Invalid tax option",
            error: "Select Yes or No.",
            promptTitle: "Apply Taxes",
            prompt: "Choose whether tax should be applied.",
          },
        ],
        "xl/worksheets/sheet1.xml",
        { quotePrefixRanges: ["C2:C501", "D2:D501", "K2:K501"] },
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to download stock transfer template");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkImport = async () => {
    if (bulkImportLockRef.current) return;
    bulkImportLockRef.current = true;
    setBulkBusy(true);

    // Open the native picker while this function still has the user's click
    // activation. Browsers may block it after awaiting a network request.
    const file = await pickSpreadsheetFile();
    if (!file) {
      bulkImportLockRef.current = false;
      setBulkBusy(false);
      return;
    }

    setBulkImportResult(null);
    try {
      const bulkRunKey = crypto.randomUUID();
      const locations = stores.length ? stores : await loadLocations();
      const rows = await parseBulkSheet(file);
      if (!rows.length) {
        alert("No rows found in selected file.");
        return;
      }

      const preparedRows = [];
      const errors = [];
      const sourceInventory = new Map();
      const heldSourceInventory = new Map();

      const identifiersBySource = new Map();
      for (const row of rows) {
        const sourceId = resolveLocationId(
          getBulkField(row, ["source_id", "source"]),
          locations,
        );
        if (!sourceId) continue;
        const key = String(sourceId);
        const identifiers = identifiersBySource.get(key) || {
          barcodes: [],
          skus: [],
          product_names: [],
        };
        identifiers.barcodes.push(getBulkField(row, ["barcode", "bar_code"]));
        identifiers.skus.push(getBulkField(row, ["sku"]));
        identifiers.product_names.push(
          getBulkField(row, ["product_name", "product"]),
        );
        identifiersBySource.set(key, identifiers);
      }

      await Promise.all(
        Array.from(identifiersBySource.entries()).map(
          async ([sourceId, identifiers]) => {
            const lookup = await fetchBulkInventoryProducts(
              sourceId,
              identifiers,
            );
            sourceInventory.set(
              sourceId,
              buildInventoryProductIndex(lookup.records),
            );
            heldSourceInventory.set(
              sourceId,
              buildInventoryProductIndex(lookup.heldRecords),
            );
          },
        ),
      );

      for (const row of rows) {
        const rowNumber = Number(row.__row_index || 0) + 2;
        const sourceId = resolveLocationId(
          getBulkField(row, ["source_id", "source"]),
          locations,
        );
        const destinationId = resolveLocationId(
          getBulkField(row, ["destination_id", "destination"]),
          locations,
        );
        const barcode = getBulkField(row, ["barcode", "bar_code"]);
        const sku = getBulkField(row, ["sku"]);
        const productName = getBulkField(row, ["product_name", "product"]);
        const qty = toNumber(getBulkField(row, ["quantity", "qty"]), 0);
        const invoiceDate = getRowDate(
          getBulkField(row, ["invoice_date", "date"]),
        );
        const invoiceNumber = getBulkField(row, [
          "invoice_number",
          "invoice_no",
        ]);
        const otherCharges = toNumber(getBulkField(row, ["other_charges"]), 0);
        const remarks = getBulkField(row, ["remarks", "remark"]);
        const applyTaxes = toBoolean(getBulkField(row, ["apply_taxes"]), true);

        const sourceExists = locations.some(
          (location) => String(location.id) === String(sourceId),
        );
        const destinationExists = locations.some(
          (location) => String(location.id) === String(destinationId),
        );

        if (!sourceId || !destinationId) {
          errors.push(`Row ${rowNumber}: source and destination are required.`);
          continue;
        }
        if (!sourceExists || !destinationExists) {
          errors.push(
            `Row ${rowNumber}: source or destination does not match an existing store/warehouse.`,
          );
          continue;
        }
        if (String(sourceId) === String(destinationId)) {
          errors.push(
            `Row ${rowNumber}: source and destination cannot be the same.`,
          );
          continue;
        }
        if (!barcode && !sku && !productName) {
          errors.push(
            `Row ${rowNumber}: barcode, SKU or product name is required.`,
          );
          continue;
        }
        if (qty <= 0) {
          errors.push(`Row ${rowNumber}: quantity must be greater than zero.`);
          continue;
        }

        try {
          const inventoryIndex =
            sourceInventory.get(String(sourceId)) ||
            buildInventoryProductIndex([]);
          const product = findIndexedProduct(inventoryIndex, {
            barcode,
            sku,
            productName,
          });
          if (!product) {
            const heldIndex =
              heldSourceInventory.get(String(sourceId)) ||
              buildInventoryProductIndex([]);
            const heldProduct = findIndexedProduct(heldIndex, {
              barcode,
              sku,
              productName,
            });
            if (heldProduct) {
              const reference = heldProduct.transactionId ||
                `Stock In #${heldProduct.stockInId}`;
              const approvalState = Number(heldProduct.rejectedApprovalCount || 0) > 0
                ? "has a rejected margin approval"
                : Number(heldProduct.pendingApprovalCount || 0) > 0
                  ? "is waiting for margin approval"
                  : "is on margin hold and needs an administrator review";
              errors.push(
                `Row ${rowNumber}: ${barcode || sku || productName} is in ${reference}, but ${approvalState}. Approve/correct that Stock In before transferring it.`,
              );
              continue;
            }
            errors.push(
              `Row ${rowNumber}: product not found in source inventory (${barcode || sku || productName}).`,
            );
            continue;
          }
          // Barcode/SKU is the inventory identity.  Never silently transfer a
          // different product merely because an old sheet has a stale name.
          // This also makes a duplicate/mislabelled spreadsheet immediately
          // actionable before any stock can move.
          if (
            productName &&
            (barcode || sku) &&
            normalizeProductName(productName) !== normalizeProductName(product.name)
          ) {
            const identifier = sku ? `SKU ${sku}` : `barcode ${barcode}`;
            errors.push(
              `Row ${rowNumber}: sheet product name "${productName}" does not match "${product.name}" in the selected source for ${identifier}. Correct the product name/identifier using a fresh bulk-transfer template.`,
            );
            continue;
          }
          const availableStock = toNumber(
            product.availableStock ?? product.available_stock,
            0,
          );

          const costPrice = toNumber(
            getBulkField(row, [
              "cost_unit",
              "cost_per_unit",
              "cost_price",
              "cost",
            ]),
            toNumber(product.cost_price, 0),
          );
          const mrp = toNumber(
            getBulkField(row, [
              "mrp",
              "mrp_on_destination",
              "mrp_on_destination_store",
              "destination_mrp",
            ]),
            toNumber(product.mrp, 0),
          );
          const sellingPrice = toNumber(
            getBulkField(row, [
              "selling_price",
              "selling_price_on_destination",
              "destination_selling_price",
            ]),
            toNumber(product.selling_price || product.sellingPrice, mrp),
          );
          const taxRate = toNumber(product.taxRate ?? product.tax_rate, 0);

          preparedRows.push({
            sourceId: String(sourceId),
            destinationId: String(destinationId),
            invoiceDate,
            invoiceNumber,
            otherCharges,
            remarks,
            applyTaxes,
            item: {
              product_id: getNumericId(product.id ?? product.product_id),
              batch_id: getBatchId(product),
              name: product.name || productName,
              sku: product.sku || sku,
              barcode: product.barcode || barcode,
              qty,
              cost_price: costPrice,
              mrp,
              destination_mrp: mrp,
              selling_price: sellingPrice,
              tax_value: applyTaxes ? (costPrice * taxRate) / 100 : 0,
              available_stock: availableStock,
              meta: { bulkTransfer: true, sourceRow: rowNumber },
            },
          });
        } catch (err) {
          errors.push(
            `Row ${rowNumber}: ${err.message || "product lookup failed"}`,
          );
        }
      }

      if (!preparedRows.length) {
        setBulkImportResult({
          status: "error",
          title: "Bulk transfer needs correction",
          message:
            "No rows were imported. Please fix the rows below and upload again.",
          counts: {
            totalRows: rows.length,
            readyRows: 0,
            confirmedGroups: 0,
            approvalGroups: 0,
            failedRows: errors.length,
          },
          rows: errors,
        });
        return;
      }

      if (errors.length) {
        setBulkImportResult({
          status: "error",
          title: "Bulk transfer needs correction",
          message:
            "No stock was transferred because some rows need correction. This prevents partial transfer from the same sheet.",
          counts: {
            totalRows: rows.length,
            readyRows: preparedRows.length,
            confirmedGroups: 0,
            approvalGroups: 0,
            failedRows: errors.length,
          },
          rows: errors,
        });
        return;
      }

      const groups = new Map();
      for (const row of preparedRows) {
        const key = buildTransferGroupKey(row);
        if (!groups.has(key)) groups.set(key, { ...row, items: [] });
        groups.get(key).items.push(row.item);
      }

      const quantityErrors = [];
      for (const group of groups.values()) {
        const productTotals = new Map();
        for (const item of group.items) {
          const key = String(item.product_id);
          const existing = productTotals.get(key) || {
            name: item.name || `Product ${item.product_id}`,
            sku: item.sku || "",
            barcode: item.barcode || "",
            available: toNumber(item.available_stock, 0),
            qty: 0,
            rows: [],
          };
          existing.qty += toNumber(item.qty, 0);
          existing.available = Math.min(
            existing.available,
            toNumber(item.available_stock, 0),
          );
          if (item.meta?.sourceRow) existing.rows.push(item.meta.sourceRow);
          productTotals.set(key, existing);
        }
        for (const entry of productTotals.values()) {
          if (entry.qty > entry.available) {
            const identifier = entry.sku
              ? ` (SKU: ${entry.sku})`
              : entry.barcode
                ? ` (Barcode: ${entry.barcode})`
                : "";
            quantityErrors.push(
              `Row ${entry.rows.join(", ") || "-"}: ${entry.name}${identifier} has sheet quantity ${entry.qty}; only ${entry.available} is available in the source. Change the sheet quantity to ${entry.available} or less.`,
            );
          }
        }
      }
      if (quantityErrors.length) {
        setBulkImportResult({
          status: "error",
          title: "Bulk transfer has insufficient stock",
          message:
            "No stock was transferred. Please reduce the quantity or add stock in the source first.",
          counts: {
            totalRows: rows.length,
            readyRows: preparedRows.length,
            confirmedGroups: 0,
            approvalGroups: 0,
            failedRows: quantityErrors.length,
          },
          rows: quantityErrors,
        });
        return;
      }

      const confirmed = [];
      const approvalHolds = [];
      const failedGroups = [];
      let groupIndex = 0;
      for (const group of groups.values()) {
        groupIndex += 1;
        let draft = null;
        try {
          draft = await postTransfer({
            source: group.sourceId,
            destination: group.destinationId,
            applyTaxes: group.applyTaxes,
            bulkImport: true,
            requestKey: `bulk-${bulkRunKey}-${groupIndex}`,
          });
          const result = await confirmTransfer(draft.id, {
            form: {
              invoice_date: group.invoiceDate,
              invoice_number: group.invoiceNumber,
              other_charges: group.otherCharges,
              remarks: group.remarks,
              bulk_import: true,
            },
            items: group.items,
          });
          if (result.requiresMarginApproval) approvalHolds.push(draft);
          else confirmed.push(draft);
        } catch (err) {
          const rowNumbers = group.items
            .map((item) => item.meta?.sourceRow)
            .filter(Boolean)
            .join(", ");
          failedGroups.push(
            `Row ${rowNumbers || "-"}: ${err.message || "Failed to confirm this transfer group"}${
              draft?.transactionId ? ` (${draft.transactionId})` : ""
            }`,
          );
          break;
        }
      }

      setBulkImportResult({
        status: failedGroups.length ? "warning" : "success",
        title: failedGroups.length
          ? "Bulk transfer partially processed"
          : "Bulk transfer processed",
        message: failedGroups.length
          ? "Some transfer groups were processed before a later group failed. Please review the failed rows below."
          : "All validated rows were processed successfully.",
        counts: {
          totalRows: rows.length,
          readyRows: preparedRows.length,
          confirmedGroups: confirmed.length,
          approvalGroups: approvalHolds.length,
          failedRows: failedGroups.length,
        },
        rows: failedGroups,
        confirmed,
        approvalHolds,
      });
      loadList(listFilters.source, listFilters.destination);
    } catch (err) {
      console.error(err);
      setBulkImportResult({
        status: "error",
        title: "Bulk import failed",
        message: err.message || "Please use a valid Excel/CSV file.",
        counts: {
          totalRows: 0,
          readyRows: 0,
          confirmedGroups: 0,
          approvalGroups: 0,
          failedRows: 1,
        },
        rows: [err.message || "Bulk import failed."],
      });
    } finally {
      bulkImportLockRef.current = false;
      setBulkBusy(false);
    }
  };

  const next = async () => {
    if (createTransferLockRef.current) return;
    if (!source) return alert("Please select a source");
    if (!destination) return alert("Please select a destination");
    if (String(source) === String(destination))
      return alert("Source and destination cannot be the same");

    createTransferLockRef.current = true;
    const requestKey =
      createTransferRequestKeyRef.current || crypto.randomUUID();
    createTransferRequestKeyRef.current = requestKey;
    setSubmitting(true);
    try {
      const created = await postTransfer({
        source,
        destination,
        applyTaxes,
        requestKey,
      });
      setShowModal(false);
      setDraftId(created.id);
      createTransferRequestKeyRef.current = null;
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create stock transfer");
    } finally {
      createTransferLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleRevert = async (row) => {
    if (!row?._id) return;
    setPendingRevert(row);
  };

  const openPreview = async (row) => {
    if (!row?._id) return;
    setPreviewLoading(true);
    setPreviewTransfer({
      id: row._id,
      transactionId: String(row["Transaction ID"] || "").replace(/^#/, ""),
    });
    try {
      const details = await fetchTransferDetails(row._id);
      setPreviewTransfer(details);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to load stock transfer preview");
      setPreviewTransfer(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openEdit = async (row) => {
    if (!row?._id) return;
    try {
      const details = await fetchTransferDetails(row._id);
      setEditTransfer(details);
      setEditForm({
        invoice_date: details.invoice_date || "",
        invoice_number: details.invoice_number || "",
        other_charges: details.other_charges ?? "",
        remarks: details.remarks || "",
      });
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to load stock transfer");
    }
  };

  const saveEdit = async () => {
    if (!editTransfer?.id) return;
    setSavingEdit(true);
    try {
      await updateTransferDetails(editTransfer.id, editForm);
      setEditTransfer(null);
      alert("Stock transfer updated successfully.");
      loadList(listFilters.source, listFilters.destination);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to update stock transfer");
    } finally {
      setSavingEdit(false);
    }
  };

  const downloadEntryExcel = async (row) => {
    if (!row?._id) return;
    try {
      const transfer = await fetchTransferDetails(row._id);
      await downloadTransferWorkbook(transfer, listFilters.brand);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to download stock transfer Excel");
    }
  };

  const downloadVisibleBrandExcel = async () => {
    if (!visibleTableData.length) {
      alert("No stock transfers found for selected filters.");
      return;
    }
    try {
      const transfers = await Promise.all(
        visibleTableData.map((row) => fetchTransferDetails(row._id)),
      );
      await downloadTransferItemsWorkbook(transfers, listFilters.brand);
    } catch (err) {
      console.error(err);
      alert(
        err.message || "Failed to download brand-wise stock transfer Excel",
      );
    }
  };

  const confirmRevert = async () => {
    const row = pendingRevert;
    const id = row?._id;
    if (!id) return;
    setRevertingId(id);
    setLoadingList(true);
    try {
      const result = await revertTransfer(id);
      setPendingRevert(null);
      alert(result.message || "Stock transfer reverted successfully.");
      loadList(listFilters.source, listFilters.destination);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to revert stock transfer");
      setLoadingList(false);
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <>
      <InventoryShell
        breadcrumb={[{ label: "Inventory" }, { label: "Stock Transfer" }]}
        title="Stock Transfer"
        subtitle="Stock Transfer transaction history of last 7 days. Need Help?"
        actions={
          isSuperAdmin ||
          (Array.isArray(currentUser?.permissions) &&
            (currentUser.permissions.includes("*") ||
              currentUser.permissions.includes("MANAGE_INVENTORY")))
            ? [
                { label: "Movement Tracker / Receive", href: "/inventory/movement-tracker" },
                {
                  label: bulkBusy ? "Working..." : "Upload Bulk Sheet",
                  onClick: handleBulkImport,
                  disabled: bulkBusy,
                },
                {
                  label: "Download Template",
                  onClick: handleDownloadBulkTemplate,
                },
                { label: "Stock Transfer", primary: true, onClick: openModal },
              ]
            : [{ label: "Movement Tracker", href: "/inventory/movement-tracker" }]
        }
        searchPlaceholder="Search"
        filters={
          <>
            <input
              type="date"
              value={listFilters.dateFrom}
              onChange={(e) =>
                setListFilters((current) => ({
                  ...current,
                  dateFrom: e.target.value,
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600"
              title="From date"
            />
            <input
              type="date"
              value={listFilters.dateTo}
              onChange={(e) =>
                setListFilters((current) => ({
                  ...current,
                  dateTo: e.target.value,
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600"
              title="To date"
            />
            <select
              value={listFilters.source}
              onChange={(e) =>
                setListFilters((current) => ({
                  ...current,
                  source: e.target.value,
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600"
            >
              <option value="">All sources</option>
              {sourceOptions.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            <select
              value={listFilters.destination}
              onChange={(e) =>
                setListFilters((current) => ({
                  ...current,
                  destination: e.target.value,
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600"
            >
              <option value="">All destinations</option>
              {destinationOptions.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name}
                </option>
              ))}
            </select>
            <input
              type="search"
              list="stock-transfer-brand-options"
              value={listFilters.brand}
              onChange={(e) =>
                setListFilters((current) => ({
                  ...current,
                  brand: e.target.value,
                }))
              }
              placeholder="Search brand"
              className="rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600"
            />
            <datalist id="stock-transfer-brand-options">
              {brandOptions.map((brand) => (
                <option key={brand} value={brand} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={downloadVisibleBrandExcel}
              className="rounded-xl border border-emerald-200 px-3 py-2 text-[12.5px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Consolidated Excel
            </button>
            <button
              type="button"
              onClick={() =>
                setListFilters({
                  dateFrom: "",
                  dateTo: "",
                  source: "",
                  destination: "",
                  brand: "",
                })
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600 hover:bg-slate-50"
            >
              Reset
            </button>
          </>
        }
        tableHeaders={tableHeaders}
        tableData={loadingList ? [] : visibleTableData}
        emptyMessage={loadingList ? "Loading records..." : "No Records Found"}
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
            <div className="inline-flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
              <button
                type="button"
                onClick={() => openPreview(row)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Preview
              </button>
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevert(row)}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50"
                  >
                    Revert
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => downloadEntryExcel(row)}
                className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Excel
              </button>
            </div>
          );
        }}
      />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-[668px] overflow-hidden rounded bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-[22px] py-5">
              <h3 className="text-[24px] font-semibold leading-none text-gray-900">
                Step 1: Fill Details
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <i className="ti ti-x text-[24px]" />
              </button>
            </div>

            <div className="px-[22px] py-[34px]">
              <button
                type="button"
                className="mb-9 h-[45px] w-[294px] rounded border border-blue-500 bg-cyan-100 text-[15px] font-semibold text-gray-800"
              >
                Stock Transfer
              </button>

              <div className="mb-6">
                <label className="mb-2 block text-[15px] text-gray-700">
                  Source <span className="font-semibold text-red-500">*</span>
                </label>
                <SelectBox
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Please Select a Source."
                  stores={stores}
                  loading={loadingStores}
                />
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-[15px] text-gray-700">
                  Destination{" "}
                  <span className="font-semibold text-red-500">*</span>
                </label>
                <SelectBox
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Please select a destination."
                  stores={stores}
                  loading={loadingStores}
                />
              </div>

              <label className="inline-flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={applyTaxes}
                  onChange={(e) => setApplyTaxes(e.target.checked)}
                  className="h-5 w-5 accent-amber-400"
                />
                <span className="text-[16px] font-semibold text-gray-900">
                  Apply Taxes On This Transaction
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-5 border-t border-gray-200 px-4 py-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded border border-blue-600 px-4 py-2 text-[14px] font-medium text-blue-600 hover:bg-blue-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={next}
                disabled={submitting}
                className="rounded bg-blue-600 px-5 py-2 text-[14px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "..." : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkImportResult && (
        <BulkTransferResultDialog
          result={bulkImportResult}
          onClose={() => setBulkImportResult(null)}
        />
      )}

      {draftId && (
        <TransferLineItemsWindow
          id={draftId}
          onClose={() => setDraftId(null)}
          onConfirmed={() => {
            setDraftId(null);
            loadList(listFilters.source, listFilters.destination);
          }}
        />
      )}

      {pendingRevert && (
        <RevertConfirmDialog
          row={pendingRevert}
          busy={revertingId === pendingRevert._id}
          onCancel={() => {
            if (!revertingId) setPendingRevert(null);
          }}
          onConfirm={confirmRevert}
        />
      )}

      {(previewTransfer || previewLoading) && (
        <StockTransferPreviewDialog
          transfer={previewTransfer}
          loading={previewLoading}
          onReleaseApproved={async () => {
            if (!previewTransfer?.id || previewLoading) return;
            setPreviewLoading(true);
            try {
              const result = await confirmTransfer(previewTransfer.id, {});
              const details = await fetchTransferDetails(previewTransfer.id);
              setPreviewTransfer(details);
              loadList(listFilters.sourceId, listFilters.destinationId);
              alert(
                result?.success
                  ? "Approved transfer released and destination batches created."
                  : "Transfer release completed.",
              );
            } catch (err) {
              const message = err.message || "Unable to release this transfer";
              setPreviewTransfer((current) =>
                current
                  ? {
                      ...current,
                      meta: {
                        ...(current.meta || {}),
                        marginHoldReleaseError: message,
                      },
                    }
                  : current,
              );
              alert(message);
            } finally {
              setPreviewLoading(false);
            }
          }}
          onClose={() => {
            if (!previewLoading) setPreviewTransfer(null);
          }}
        />
      )}

      {editTransfer && (
        <StockTransferEditDialog
          transfer={editTransfer}
          form={editForm}
          onChange={setEditForm}
          saving={savingEdit}
          onCancel={() => {
            if (!savingEdit) setEditTransfer(null);
          }}
          onSave={saveEdit}
        />
      )}
    </>
  );
}

function getBrandFilteredItems(items, brandFilter = "") {
  const query = String(brandFilter || "")
    .trim()
    .toLowerCase();
  const rows = Array.isArray(items) ? items : [];
  if (!query) return rows;
  return rows.filter((item) =>
    String(item.brand_name || item.brandName || "")
      .toLowerCase()
      .includes(query),
  );
}

function marginPercent(costPrice, sellingPrice) {
  const cost = Number(costPrice || 0);
  const selling = Number(sellingPrice || 0);
  if (!cost) return 0;
  return Number((((selling - cost) / cost) * 100).toFixed(4));
}

function buildTransferItemRows(transfer, items) {
  return (items || []).map((item, index) => {
    const meta = typeof item.meta === "object" && item.meta ? item.meta : {};
    const reportCost = Number(item.franchise_cost || item.cost_price || 0);
    const reportMrp = Number(
      item.report_mrp || item.destination_mrp || item.mrp || 0,
    );
    const reportSellingPrice = Number(
      item.report_selling_price || item.selling_price || 0,
    );
    const qty = Number(item.qty || 0);
    return {
      "S.No.": index + 1,
      "Transaction ID": transfer.transactionId || transfer.id || "",
      "Invoice Number": transfer.invoice_number || "",
      "Invoice Date": formatDate(transfer.invoice_date),
      Source: transfer.sourceName || transfer.source || "",
      Destination: transfer.destinationName || transfer.destination || "",
      Brand: item.brand_name || item.brandName || "",
      "Product ID": item.product_id || "",
      Product: item.product_name || item.name || "",
      SKU: item.sku || "",
      Barcode: item.barcode || "",
      "Batch No": item.batch_no || meta.batchNo || meta.batch_no || "",
      Expiry: formatDate(
        item.expiry_date || meta.expiryDate || meta.expiry_date,
      ),
      Qty: qty,
      MRP: reportMrp,
      "Selling Price": reportSellingPrice,
      "Destination MRP": reportMrp,
      "Cost Price": reportCost,
      Tax: Number(item.tax_value || 0),
      "Line Cost": qty * reportCost,
      "Margin %": marginPercent(reportCost, reportSellingPrice),
    };
  });
}

async function downloadTransferWorkbook(transfer, brandFilter = "") {
  const XLSX = await import("xlsx");
  const summaryHeaders = [
    "Transaction ID",
    "Invoice Number",
    "Invoice Date",
    "Source",
    "Destination",
    "Status",
    "Other Charges",
    "Remarks",
  ];
  const summaryValues = [
    transfer.transactionId || transfer.id || "",
    transfer.invoice_number || "",
    formatDate(transfer.invoice_date),
    transfer.sourceName || transfer.source || "",
    transfer.destinationName || transfer.destination || "",
    getTransferDisplayStatus(transfer),
    Number(transfer.other_charges || 0),
    transfer.remarks || "",
  ];
  const summaryRows = [summaryHeaders, summaryValues];
  const itemRows = buildTransferItemRows(
    transfer,
    getBrandFilteredItems(transfer.items, brandFilter),
  );
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
    `stock-transfer-${transfer.transactionId || transfer.id || "entry"}.xlsx`,
  );
}

async function downloadTransferItemsWorkbook(transfers, brandFilter = "") {
  const XLSX = await import("xlsx");
  const itemRows = (transfers || []).flatMap((transfer) =>
    buildTransferItemRows(
      transfer,
      getBrandFilteredItems(transfer.items, brandFilter),
    ),
  );
  if (!itemRows.length) {
    throw new Error("No items found for selected brand/filter.");
  }
  const consolidated = new Map();
  itemRows.forEach((row) => {
    const productKey =
      row["Product ID"] ||
      row.SKU ||
      row.Barcode ||
      `${row.Brand}|${row.Product}`.toLowerCase();
    const key = `${row.Destination}|${productKey}`;
    const current = consolidated.get(key) || {
      Destination: row.Destination,
      Brand: row.Brand,
      Product: row.Product,
      SKU: row.SKU,
      Barcode: row.Barcode,
      "Transfer Count": 0,
      "Transaction IDs": new Set(),
      "Total Qty": 0,
      "Total Cost": 0,
      "Total Selling Value": 0,
      "Total Tax": 0,
    };
    current["Transaction IDs"].add(row["Transaction ID"]);
    current["Transfer Count"] = current["Transaction IDs"].size;
    current["Total Qty"] += Number(row.Qty || 0);
    current["Total Cost"] += Number(row["Line Cost"] || 0);
    current["Total Selling Value"] +=
      Number(row.Qty || 0) * Number(row["Selling Price"] || 0);
    current["Total Tax"] += Number(row.Tax || 0) * Number(row.Qty || 0);
    consolidated.set(key, current);
  });
  const consolidatedRows = Array.from(consolidated.values())
    .map((row, index) => ({
      "S.No.": index + 1,
      Destination: row.Destination,
      Brand: row.Brand,
      Product: row.Product,
      SKU: row.SKU,
      Barcode: row.Barcode,
      "Transfer Count": row["Transfer Count"],
      "Transaction IDs": Array.from(row["Transaction IDs"]).join(", "),
      "Total Qty": row["Total Qty"],
      "Avg Cost Price": row["Total Qty"]
        ? row["Total Cost"] / row["Total Qty"]
        : 0,
      "Total Cost": row["Total Cost"],
      "Total Selling Value": row["Total Selling Value"],
      "Margin %": marginPercent(row["Total Cost"], row["Total Selling Value"]),
      "Total Tax": row["Total Tax"],
    }))
    .sort((a, b) =>
      `${a.Destination}|${a.Brand}|${a.Product}`.localeCompare(
        `${b.Destination}|${b.Brand}|${b.Product}`,
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
    "Transfer Details",
  );
  const suffix = String(brandFilter || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  XLSX.writeFile(
    workbook,
    `stock-transfer-consolidated${suffix ? `-${suffix}` : ""}.xlsx`,
  );
}

function StockTransferPreviewDialog({
  transfer,
  loading,
  onClose,
  onReleaseApproved,
}) {
  const items = transfer?.items || [];
  const sourceStockUnavailable = hasSourceStockReleaseError(transfer);
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalCost = items.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.cost_price || 0),
    Number(transfer?.other_charges || 0),
  );
  const totalTax = items.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.tax_value || 0),
    0,
  );

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-black text-slate-900">
              Stock Transfer Preview
            </h2>
            <p className="mt-1 text-[12px] font-medium text-slate-500">
              {transfer?.transactionId
                ? `#${transfer.transactionId}`
                : transfer?.id
                  ? `#TRN-${transfer.id}`
                  : "Loading..."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close preview"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        <div className="overflow-auto px-5 py-5">
          {loading ? (
            <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-[13px] font-semibold text-slate-500">
              Loading preview...
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PreviewStat
                  label="Source"
                  value={transfer?.sourceName || "-"}
                />
                <PreviewStat
                  label="Destination"
                  value={transfer?.destinationName || "-"}
                />
                <PreviewStat
                  label="Invoice Number"
                  value={transfer?.invoice_number || "-"}
                />
                <PreviewStat
                  label="Invoice Date"
                  value={formatDate(transfer?.invoice_date)}
                />
                <PreviewStat label="Total Items" value={totalQty} />
                <PreviewStat
                  label="Cost"
                  value={`Rs. ${formatCurrency(totalCost)}`}
                />
                <PreviewStat
                  label="Tax"
                  value={`Rs. ${formatCurrency(totalTax)}`}
                />
                <PreviewStat
                  label="Status"
                  value={getTransferDisplayStatus(transfer)}
                />
              </div>

              {transfer?.meta?.marginHoldReleaseError && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                  <p className="font-bold">
                    Approved - source stock unavailable
                  </p>
                  <p className="mt-1">
                    {transfer.meta.marginHoldReleaseError}
                  </p>
                  <p className="mt-2 font-semibold">
                    Source stock restore hone ya transfer quantities correct hone
                    ke baad hi destination batches safely create ho sakte hain.
                  </p>
                </div>
              )}

              {transfer?.status === "margin_hold" &&
                !sourceStockUnavailable && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[12px] text-amber-900">
                    If all linked margin approvals are approved, release this
                    transfer to reserve the shown source batches and create
                    destination batches.
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={onReleaseApproved}
                    className="rounded-lg bg-[#b80000] px-3 py-2 text-[12px] font-bold text-white transition hover:bg-[#990000] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Release Approved Transfer
                  </button>
                </div>
                )}

              {transfer?.remarks && (
                <div className="mt-4 rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] font-bold uppercase text-slate-500">
                    Remarks
                  </p>
                  <p className="mt-1 text-[13px] text-slate-700">
                    {transfer.remarks}
                  </p>
                </div>
              )}

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-[13px]">
                  <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">
                        {transfer?.status === "margin_hold"
                          ? "Source Batch"
                          : "Batch"}
                      </th>
                      <th className="px-3 py-2">
                        {transfer?.status === "margin_hold"
                          ? "Source Expiry"
                          : "Expiry"}
                      </th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">MRP</th>
                      <th className="px-3 py-2">Selling</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Tax</th>
                      <th className="px-3 py-2">Line Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length ? (
                      items.map((item) => {
                        const meta =
                          typeof item.meta === "object" && item.meta
                            ? item.meta
                            : {};
                        return (
                          <tr key={item.id || item.product_id}>
                            <td className="px-3 py-3 text-slate-900">
                              <div className="font-semibold">
                                {item.product_name || item.name || "Product"}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                SKU: {item.sku || "-"}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {item.batch_no || meta.batchNo || "-"}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {formatDate(
                                item.expiry_date ||
                                  meta.expiryDate ||
                                  meta.expiry_date,
                              )}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {Number(item.qty || 0)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {formatCurrency(item.mrp)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {formatCurrency(item.selling_price)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {formatCurrency(item.cost_price)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {formatCurrency(item.tax_value)}
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-900">
                              {formatCurrency(
                                Number(item.qty || 0) *
                                  Number(item.cost_price || 0),
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          className="px-3 py-8 text-center text-slate-500"
                          colSpan={9}
                        >
                          No items found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StockTransferEditDialog({
  transfer,
  form,
  onChange,
  saving,
  onCancel,
  onSave,
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-black text-slate-900">
              Edit Stock Transfer
            </h2>
            <p className="mt-1 text-[12px] font-medium text-slate-500">
              #{transfer.transactionId || `TRN-${transfer.id}`} ·{" "}
              {transfer.sourceName || "-"} to {transfer.destinationName || "-"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close edit dialog"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice Date">
              <input
                type="date"
                value={form.invoice_date}
                onChange={(e) =>
                  onChange((current) => ({
                    ...current,
                    invoice_date: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-400"
              />
            </Field>
            <Field label="Invoice Number">
              <input
                value={form.invoice_number}
                onChange={(e) =>
                  onChange((current) => ({
                    ...current,
                    invoice_number: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-400"
                placeholder="Invoice number"
              />
            </Field>
          </div>

          <Field label="Other Charges">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.other_charges}
              onChange={(e) =>
                onChange((current) => ({
                  ...current,
                  other_charges: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-400"
              placeholder="Other charges"
            />
          </Field>

          <Field label="Remarks">
            <textarea
              rows={4}
              value={form.remarks}
              onChange={(e) =>
                onChange((current) => ({ ...current, remarks: e.target.value }))
              }
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-400"
              placeholder="Remarks"
            />
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-w-[96px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-w-[112px] rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-[13px] font-semibold capitalize text-slate-900">
        {value}
      </p>
    </div>
  );
}

function BulkTransferResultDialog({ result, onClose }) {
  const status = result?.status || "success";
  const isSuccess = status === "success";
  const isWarning = status === "warning";
  const tone = isSuccess
    ? {
        icon: "ti-circle-check",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
      }
    : isWarning
      ? {
          icon: "ti-alert-triangle",
          bg: "bg-amber-50",
          text: "text-amber-700",
          border: "border-amber-200",
        }
      : {
          icon: "ti-alert-circle",
          bg: "bg-red-50",
          text: "text-red-700",
          border: "border-red-200",
        };
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const counts = result?.counts || {};

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.bg} ${tone.text}`}
          >
            <i className={`ti ${tone.icon} text-[22px]`} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-black text-slate-900">
              {result?.title || "Bulk transfer result"}
            </h2>
            <p className="mt-1 text-[12.5px] font-medium leading-5 text-slate-500">
              {result?.message || "Please review the transfer result."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close dialog"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-5">
            <ResultCount label="Sheet rows" value={counts.totalRows || 0} />
            <ResultCount label="Ready rows" value={counts.readyRows || 0} />
            <ResultCount
              label="Confirmed"
              value={counts.confirmedGroups || 0}
            />
            <ResultCount
              label="Margin hold"
              value={counts.approvalGroups || 0}
            />
            <ResultCount
              label="Issues"
              value={counts.failedRows || rows.length || 0}
              tone={isSuccess ? "neutral" : "danger"}
            />
          </div>

          {rows.length ? (
            <div
              className={`mt-5 overflow-hidden rounded-xl border ${tone.border} ${tone.bg}`}
            >
              <div className="border-b border-current/10 px-4 py-3 text-[12px] font-black uppercase tracking-wide">
                Row details
              </div>
              <div className="max-h-[320px] overflow-y-auto bg-white/75">
                {rows.map((row, index) => (
                  <div
                    key={`${row}-${index}`}
                    className="border-b border-slate-200 px-4 py-3 text-[13px] font-semibold leading-5 text-slate-800 last:border-b-0"
                  >
                    {row}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">
              No skipped rows or transfer errors found.
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="min-w-[112px] rounded-xl bg-[#B00000] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_20px_rgba(176,0,0,0.22)] transition-colors hover:bg-[#930000]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultCount({ label, value, tone = "neutral" }) {
  const color =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-xl border px-3 py-3 ${color}`}>
      <p className="text-[10.5px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-[20px] font-black">{value}</p>
    </div>
  );
}

function RevertConfirmDialog({ row, busy, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="revert-dialog-title"
        aria-describedby="revert-dialog-message"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <i className="ti ti-rotate-2 text-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="revert-dialog-title"
              className="text-[15px] font-black text-slate-900"
            >
              Revert stock transfer?
            </h2>
            <p className="mt-1 text-[12px] font-medium text-slate-500">
              This action will reverse the selected transfer.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p
            id="revert-dialog-message"
            className="text-[14px] font-semibold leading-6 text-slate-800"
          >
            Revert {row["Transaction ID"]}?
          </p>
          <p className="mt-2 text-[13px] leading-6 text-slate-600">
            Stock will be removed from{" "}
            <strong>{row["Destination Name"]}</strong> and added back to{" "}
            <strong>{row["Source Name"]}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-w-[96px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className="min-w-[112px] rounded-xl bg-[#B00000] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_20px_rgba(176,0,0,0.22)] transition-colors hover:bg-[#930000] disabled:opacity-60"
          >
            {busy ? "Reverting..." : "Revert"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectBox({ value, onChange, placeholder, stores, loading }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="h-10 w-full appearance-none rounded border border-gray-300 bg-white px-3 pr-12 text-[16px] text-gray-700 outline-none focus:border-blue-400"
      >
        <option value="">{placeholder}</option>
        {loading ? (
          <option disabled>Loading...</option>
        ) : (
          stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))
        )}
      </select>
      <span className="absolute right-10 top-2 h-6 border-l border-gray-300" />
      <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400" />
    </div>
  );
}

function TransferLineItemsWindow({ id, onClose, onConfirmed }) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartFilter, setCartFilter] = useState("");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [form, setForm] = useState({
    invoice_date: "",
    invoice_number: "",
    other_charges: "",
    remarks: "",
  });
  const [confirming, setConfirming] = useState(false);
  const confirmLockRef = useRef(false);

  useEffect(() => {
    fetch(`/api/inventory/stocktransfer/${encodeURIComponent(id)}`)
      .then((res) => res.json())
      .then((data) => {
        setDraft(data);
        if (data && !data.error) {
          setForm({
            invoice_date: data.invoice_date || "",
            invoice_number: data.invoice_number || "",
            other_charges: data.other_charges ?? "",
            remarks: data.remarks || "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const storeId = draft?.source || draft?.source_id || draft?.sourceId;
      if (!storeId) {
        setProducts([]);
        return;
      }
      fetchInventoryProducts(storeId, searchTerm, { signal: controller.signal })
        .then((records) =>
          setProducts(
            (records || []).filter(
              (product) =>
                Number(product.availableStock ?? product.available_stock ?? 0) >
                0,
            ),
          ),
        )
        .catch((error) => {
          if (error?.name !== "AbortError") setProducts([]);
        });
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchTerm, draft?.source, draft?.source_id, draft?.sourceId]);

  const filteredCart = cartFilter.trim()
    ? cart.filter((item) =>
        (item.name || "").toLowerCase().includes(cartFilter.toLowerCase()),
      )
    : cart;

  const totals = cart.reduce(
    (acc, item) => {
      const qty = Number(item.qty || 0);
      const cost = Number(item.cost_price || 0);
      acc.totalItems += qty;
      acc.totalCost += qty * cost;
      acc.totalTax += Number(item.tax_value || 0) * qty;
      return acc;
    },
    { totalItems: 0, totalCost: Number(form.other_charges || 0), totalTax: 0 },
  );

  const addToCart = (product) => {
    const productId = getNumericId(product.id ?? product.product_id);
    const availableStock = Number(
      product.availableStock ?? product.available_stock ?? 0,
    );
    if (availableStock <= 0) return;
    setCart((current) => {
      const existing = current.find(
        (item) => String(item.product_id) === String(productId),
      );
      if (existing) {
        const nextQty = Math.min(Number(existing.qty) + 1, availableStock);
        return current.map((item) =>
          String(item.product_id) === String(productId)
            ? { ...item, qty: nextQty }
            : item,
        );
      }
      const cost = Number(product.cost_price || 0);
      const mrp = Number(product.mrp || 0);
      const sellingPrice = Number(
        product.selling_price || product.sellingPrice || product.mrp || 0,
      );
      const taxRate = Number(product.tax_rate || 0);
      return [
        ...current,
        {
          product_id: productId,
          batch_id: getBatchId(product),
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          cost_price: cost,
          mrp,
          destination_mrp: mrp,
          selling_price: sellingPrice,
          tax_value: draft?.applyTaxes ? (cost * taxRate) / 100 : 0,
          available_stock: availableStock,
          qty: 1,
        },
      ];
    });
    setSearchTerm("");
    setProducts([]);
  };

  const updateQty = (productId, qty) => {
    const nextQty = toNumber(qty, 0);
    setCart((current) =>
      current.map((item) =>
        String(item.product_id) === String(productId)
          ? {
              ...item,
              qty: Math.min(
                Math.max(0.001, nextQty || 0.001),
                Number(item.available_stock || 0.001),
              ),
            }
          : item,
      ),
    );
  };

  const validateCart = () => {
    for (const item of cart) {
      const qty = Number(item.qty || 0);
      const available = Number(item.available_stock || 0);
      if (qty > available) {
        alert(
          `${item.name} only has ${available} available in the source store.`,
        );
        return false;
      }
    }
    return true;
  };

  const confirm = async () => {
    if (confirmLockRef.current) return;
    if (cart.length === 0) return alert("Add at least one product");
    if (!validateCart()) return;

    confirmLockRef.current = true;
    setConfirming(true);
    try {
      const res = await fetch(
        `/api/inventory/stocktransfer/${encodeURIComponent(id)}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form, items: cart }),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to confirm stock transfer");
      if (data.requiresMarginApproval) {
        alert(
          data.message ||
            "Stock transfer sent for margin approval. After pricing approval, submit it for dispatch approval.",
        );
      }
      onConfirmed();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to confirm stock transfer");
    } finally {
      confirmLockRef.current = false;
      setConfirming(false);
    }
  };

  return (
    <div className="fixed bottom-0 right-0 top-[104px] z-[35] bg-[#f1f2f5] md:left-[418px] max-md:left-0">
      <div className="relative h-full overflow-hidden border-t border-gray-200 bg-[#f1f2f5] shadow-[0_-4px_20px_rgba(15,23,42,0.08)]">
        <div className="flex h-12 items-center justify-between border-b border-gray-200 bg-[#f1f2f5] px-9">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-gray-500">Inventory</span>
            <i className="ti ti-chevron-right text-[11px] text-gray-400" />
            <span className="font-semibold text-gray-900">Stock Transfer</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close line items"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        <div className="absolute bottom-[88px] left-0 right-0 top-12 grid grid-cols-[350px_minmax(520px,1fr)] gap-6 overflow-auto px-9 py-6 max-lg:grid-cols-1 max-lg:px-4">
          <aside className="h-full min-h-0 overflow-auto rounded-lg border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <h3 className="mb-5 text-[15px] font-semibold text-blue-600">
              Stock Information
            </h3>

            <div className="mb-4">
              <label className="mb-1 block text-[12px] text-gray-500">
                Source
              </label>
              <p className="text-[13px] font-medium text-gray-900">
                {loading ? "..." : draft?.sourceName || "-"}
              </p>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-[12px] text-gray-500">
                Destination
              </label>
              <p className="text-[13px] font-medium text-gray-900">
                {loading ? "..." : draft?.destinationName || "-"}
              </p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <Field label="Invoice Date">
                <input
                  type="date"
                  value={form.invoice_date}
                  onChange={(e) =>
                    setForm({ ...form, invoice_date: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-blue-400"
                />
              </Field>
              <Field label="Invoice Number">
                <input
                  value={form.invoice_number}
                  onChange={(e) =>
                    setForm({ ...form, invoice_number: e.target.value })
                  }
                  placeholder="10"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400"
                />
              </Field>
            </div>

            <Field label="Other Charges">
              <input
                value={form.other_charges}
                onChange={(e) =>
                  setForm({ ...form, other_charges: e.target.value })
                }
                placeholder="Other Charges"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400"
              />
            </Field>
            <Field label="Remarks">
              <textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Remarks"
                rows={5}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400"
              />
            </Field>
          </aside>

          <main className="flex h-full min-w-0 flex-col">
            <div className="mb-4 flex flex-shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <i className="ti ti-search text-[16px] text-gray-400" />
              <input
                type="text"
                placeholder="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
                <div>
                  <h2 className="text-[14px] font-semibold text-gray-900">
                    Inventory - Stock Transfer
                  </h2>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    Select desired products & proceed
                  </p>
                </div>
                <div className="flex min-w-[200px] items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 max-sm:hidden">
                  <input
                    type="text"
                    placeholder="Search"
                    value={cartFilter}
                    onChange={(e) => setCartFilter(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
                  />
                  <i className="ti ti-search text-[15px] text-gray-400" />
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {products.length > 0 && (
                  <div className="mb-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        disabled={
                          Number(
                            product.availableStock ||
                              product.available_stock ||
                              0,
                          ) <= 0
                        }
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-blue-50/60"
                      >
                        <div>
                          <div className="text-[13px] font-medium text-gray-900">
                            {product.name}
                          </div>
                          <div className="text-[12px] text-gray-500">
                            SKU: {product.sku || "-"}
                          </div>
                          <div className="text-[12px] text-gray-500">
                            Available in source:{" "}
                            {Number(
                              product.availableStock ||
                                product.available_stock ||
                                0,
                            )}
                          </div>
                        </div>
                        <span className="text-[12px] font-medium text-blue-600">
                          Add
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {products.length === 0 && !loading && (
                  <p className="py-8 text-center text-[13px] text-gray-500">
                    No products found
                  </p>
                )}

                {filteredCart.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          Product
                        </th>
                        <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          Qty
                        </th>
                        <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          MRP
                        </th>
                        <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          Selling
                        </th>
                        <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          Cost
                        </th>
                        <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          Tax
                        </th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCart.map((item) => (
                        <tr
                          key={item.product_id}
                          className="border-b border-gray-50 hover:bg-gray-50/50"
                        >
                          <td className="px-2 py-3">
                            <div className="text-[13px] font-medium text-gray-900">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {item.sku}
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            <input
                              type="number"
                              min={0.001}
                              step={0.001}
                              inputMode="decimal"
                              value={item.qty}
                              onChange={(e) =>
                                updateQty(item.product_id, e.target.value)
                              }
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-[13px] text-gray-700"
                            />
                          </td>
                          <td className="px-2 py-3 text-[13px] text-gray-700">
                            {formatCurrency(item.mrp)}
                          </td>
                          <td className="px-2 py-3 text-[13px] font-semibold text-red-700">
                            {formatCurrency(item.selling_price)}
                          </td>
                          <td className="px-2 py-3 text-[13px] text-gray-700">
                            {formatCurrency(item.cost_price)}
                          </td>
                          <td className="px-2 py-3 text-[13px] text-gray-700">
                            {formatCurrency(item.tax_value)}
                          </td>
                          <td className="px-2 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setCart((current) =>
                                  current.filter(
                                    (cartItem) =>
                                      cartItem.product_id !== item.product_id,
                                  ),
                                )
                              }
                              className="rounded p-1.5 text-red-500 hover:bg-red-50"
                            >
                              <i className="ti ti-trash text-[16px]" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  !searchTerm.trim() && <div className="min-h-[240px]" />
                )}
              </div>
            </section>
          </main>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[88px] border-t border-gray-200 bg-white shadow-[0_-2px_8px_rgba(15,23,42,0.06)]">
          <div className="flex h-full items-center justify-between px-6 max-md:px-4">
            <div className="flex flex-wrap items-center gap-10">
              <span className="text-[13px] text-gray-600">
                Total Items:{" "}
                <strong className="font-semibold text-gray-900">
                  {totals.totalItems}
                </strong>
              </span>
              <span className="text-[13px] text-gray-600">
                Total Cost:{" "}
                <strong className="font-semibold text-gray-900">
                  {formatCurrency(totals.totalCost)}
                </strong>
              </span>
              <span className="text-[13px] text-gray-600">
                Total Tax Value:{" "}
                <strong className="font-semibold text-gray-900">
                  {formatCurrency(totals.totalTax)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={confirm}
                disabled={confirming || cart.length === 0}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirming ? "Submitting..." : "Submit Transfer"}
              </button>
              <button
                type="button"
                onClick={() => setCart([])}
                className="rounded-lg border border-gray-200 p-2.5 text-gray-600 transition-colors hover:bg-gray-50"
                title="Clear cart"
              >
                <i className="ti ti-trash text-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-[12px] text-gray-500">{label}</label>
      {children}
    </div>
  );
}
