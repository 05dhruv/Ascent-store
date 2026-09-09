"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import InventoryShell from "@/components/inventory/InventoryShell";
import {
  getBulkField,
  parseBulkSheet,
  pickSpreadsheetFile,
} from "@/lib/bulkSheet";
import { fetchAllInventoryProducts } from "@/lib/productPagination";
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

async function fetchValidations() {
  const res = await fetch("/api/inventory/stockvalidation");
  if (!res.ok) throw new Error("Failed to fetch stock validations");
  return res.json();
}

async function postValidation(payload) {
  const res = await fetch("/api/inventory/stockvalidation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to create stock validation");
  return data;
}

async function fetchValidationDetails(id) {
  const res = await fetch(
    `/api/inventory/stockvalidation/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load stock validation");
  return data;
}

async function updateValidationDetails(id, payload) {
  const res = await fetch(
    `/api/inventory/stockvalidation/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to update stock validation");
  return data;
}

async function deleteValidationDraft(id) {
  const res = await fetch(
    `/api/inventory/stockvalidation/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to delete stock validation draft");
  return data;
}

const tableHeaders = [
  "Transaction ID",
  "Status",
  "Rack No",
  "Source Name",
  "Total Item Number",
  "Cost",
];

const BULK_HEADERS = [
  "Destination",
  "Barcode",
  "SKU",
  "Product Name",
  "Batch No",
  "Physical Qty",
  "Remarks",
];
const BULK_TEMPLATE_ROW_LIMIT = 500;

function formatDate(value) {
  const normalized = parseDateInputValue(value);
  if (!normalized) return "-";
  const [year, month, day] = normalized.split("-");
  return `${day}-${month}-${year}`;
}

function formatCost(value) {
  const n = Number(value || 0);
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toQty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 1000) / 1000;
}

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

function formatDateInputValue(value) {
  if (!value) return "";
  const parsed = parseDateInputValue(value);
  const iso = parsed || String(value).slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function toDateInputIsoValue(value) {
  if (!value) return "";
  const parsed = parseDateInputValue(value);
  if (parsed) return parsed;
  const iso = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}

function normalizeTypedDateValue(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));
  return parts.join("-");
}

function parseDateInputValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso && isValidDateParts(iso[1], iso[2], iso[3])) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const isoTimestamp = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (
    isoTimestamp &&
    isValidDateParts(isoTimestamp[1], isoTimestamp[2], isoTimestamp[3])
  ) {
    return `${isoTimestamp[1]}-${isoTimestamp[2]}-${isoTimestamp[3]}`;
  }
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return isValidDateParts(year, month, day) ? `${year}-${month}-${day}` : null;
}

function DateTextInput({ value, onChange, className = "" }) {
  const [textValue, setTextValue] = useState(() => formatDateInputValue(value));
  const calendarRef = useRef(null);

  useEffect(() => {
    setTextValue(formatDateInputValue(value));
  }, [value]);

  const commitTextValue = () => {
    const parsed = parseDateInputValue(textValue);
    if (parsed === null) {
      setTextValue(formatDateInputValue(value));
      return;
    }
    onChange(parsed);
  };

  const handleTextChange = (event) => {
    const nextText = normalizeTypedDateValue(event.target.value);
    setTextValue(nextText);
    const parsed = parseDateInputValue(nextText);
    if (parsed) onChange(parsed);
  };

  const openCalendar = () => {
    const input = calendarRef.current;
    if (!input) return;
    try {
      input.showPicker?.();
    } catch {
      input.click();
    }
  };

  return (
    <div className="relative flex w-[152px] items-center">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd-mm-yyyy"
        value={textValue}
        onChange={handleTextChange}
        onBlur={commitTextValue}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        maxLength={10}
        className={`w-full rounded border border-gray-200 px-1.5 py-1 pr-8 text-[12px] text-gray-700 outline-none focus:border-blue-400 ${className}`}
      />
      <input
        ref={calendarRef}
        type="date"
        value={toDateInputIsoValue(value)}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0"
      />
      <button
        type="button"
        onClick={openCalendar}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
        title="Open calendar"
      >
        <i className="ti ti-calendar text-[14px]" />
      </button>
    </div>
  );
}

function parseDestinationId(value, stores = []) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const leadingId = Number(raw.match(/^\d+/)?.[0] || 0);
  if (leadingId) return leadingId;
  const match = stores.find(
    (store) => normalizeText(store.name) === normalizeText(raw),
  );
  return match ? Number(match.id) : null;
}

function formatDestinationOption(store) {
  return `${store.id} - ${store.name}`;
}

function getValidationItemKey(item) {
  return String(
    item.variantKey ||
      item.variant_key ||
      item.batch_id ||
      item.batchId ||
      item.product_id,
  );
}

function getBatchNo(item) {
  return item?.batch_no || item?.batchNo || item?.batch_no_text || "";
}

function normalizeValidationCartItem(item) {
  const batchId = item.batch_id || item.batchId || null;
  const productId = item.product_id || item.productId;
  const batchNo = getBatchNo(item);
  return {
    ...item,
    variantKey:
      item.variantKey ||
      item.variant_key ||
      `${productId}:batch:${batchId || "stock"}`,
    product_id: productId,
    batch_id: batchId,
    batch_no: batchNo,
    batchNo,
    name: item.name || item.product_name || "",
    product_name: item.product_name || item.name || "",
    qty: item.qty ?? 0,
    existing_qty: Number(item.existing_qty ?? item.existingQty ?? 0),
    cost_price: Number(item.cost_price ?? item.costPrice ?? 0),
    tax_value: Number(item.tax_value ?? item.taxValue ?? 0),
    mrp: Number(item.mrp ?? 0),
    selling_price: Number(item.selling_price ?? item.sellingPrice ?? 0),
    expiry_date: item.expiry_date || item.expiryDate || "",
  };
}

function mapValidationsToTable(records) {
  return (records || []).map((row) => ({
    "Transaction ID": row.transactionId
      ? `#${row.transactionId}`
      : `#AUD-${row.id}`,
    Status: row.status === "confirmed" ? "Confirmed" : "Pending",
    "Rack No": row.rackNo || "-",
    "Source Name": row.sourceName || "None",
    "Total Item Number": row.totalItems ?? 0,
    Cost: formatCost(row.cost),
    _id: row.id,
    _status: row.status || "draft",
    _invoiceDate: row.invoiceDate || "",
    _source: row.sourceName || "None",
  }));
}

export default function StockValidationPage() {
  const [showModal, setShowModal] = useState(false);
  const [stores, setStores] = useState([]);
  const [destination, setDestination] = useState("none");
  const [rackNo, setRackNo] = useState("");
  const [applyTaxes, setApplyTaxes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [tableData, setTableData] = useState([]);
  const [draftId, setDraftId] = useState(null);
  const [listFilters, setListFilters] = useState({
    dateFrom: "",
    dateTo: "",
    source: "",
  });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkIssue, setBulkIssue] = useState("");
  const [downloadingConsolidated, setDownloadingConsolidated] = useState(false);
  const [previewEntry, setPreviewEntry] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [editForm, setEditForm] = useState({
    invoice_date: "",
    invoice_number: "",
    other_charges: "",
    remarks: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null);

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
        String(row._source || "") !== listFilters.source
      )
        return false;
      return true;
    });
  }, [tableData, listFilters]);

  const sourceOptions = useMemo(
    () =>
      Array.from(
        new Set(tableData.map((row) => row._source).filter(Boolean)),
      ).sort(),
    [tableData],
  );

  const loadList = () => {
    setLoadingList(true);
    fetchValidations()
      .then((records) => setTableData(mapValidationsToTable(records)))
      .catch(() => setTableData([]))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    loadList();
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
    setDestination("none");
    setRackNo("");
    setApplyTaxes(true);
    setShowModal(true);
  };

  const handleDeleteDraft = async (row) => {
    if (row._status === "confirmed") {
      alert("Confirmed stock validations cannot be deleted.");
      return;
    }
    setPendingDeleteRow(row);
  };

  const confirmDeleteDraft = async () => {
    if (!pendingDeleteRow) return;

    setDeletingDraftId(pendingDeleteRow._id);
    try {
      await deleteValidationDraft(pendingDeleteRow._id);
      setPendingDeleteRow(null);
      loadList();
    } catch (err) {
      alert(err.message || "Failed to delete pending stock validation.");
    } finally {
      setDeletingDraftId(null);
    }
  };

  const ensureStoresLoaded = async () => {
    if (stores.length) return stores;
    const data = await fetchStores();
    const list = Array.isArray(data) ? data : [];
    setStores(list);
    return list;
  };

  const openBulkModal = async () => {
    setBulkOpen(true);
    setBulkIssue("");
    setBulkPreview([]);
    try {
      await ensureStoresLoaded();
    } catch {
      setBulkIssue("Failed to load destinations. Try again.");
    }
  };

  const downloadBulkTemplate = async () => {
    setBulkBusy(true);
    try {
      const storeList = await ensureStoresLoaded();
      const XLSX = await import("xlsx");
      const rows = [
        BULK_HEADERS,
        ...Array.from({ length: 25 }, () =>
          Array(BULK_HEADERS.length).fill(""),
        ),
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 34 },
        { wch: 22 },
        { wch: 18 },
        { wch: 32 },
        { wch: 18 },
        { wch: 14 },
        { wch: 32 },
      ];
      applyTextFormatToColumns(
        worksheet,
        BULK_HEADERS,
        ["Barcode", "SKU", "Batch No"],
        BULK_TEMPLATE_ROW_LIMIT + 1,
      );

      const optionGroups = [
        {
          key: "Destinations",
          name: "Destinations",
          values: sortOptions(
            uniqueOptions(storeList.map(formatDestinationOption)),
          ),
        },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Validation");
      XLSX.utils.book_append_sheet(
        workbook,
        buildOptionsSheet(optionGroups),
        "Options",
      );
      addOptionNamedRanges(workbook, optionGroups);
      hideOptionsSheet(workbook);

      await saveWorkbookWithValidations(
        workbook,
        `stock-validation-bulk-template-${new Date().toISOString().slice(0, 10)}.xlsx`,
        [
          {
            range: `A2:A${BULK_TEMPLATE_ROW_LIMIT}`,
            formula: optionFormula(optionGroups, "Destinations"),
            promptTitle: "Destination",
            prompt: "Select store or warehouse to audit.",
            errorTitle: "Invalid destination",
            error: "Select a destination from the dropdown.",
          },
        ],
        "xl/worksheets/sheet1.xml",
        {
          quotePrefixRanges: [
            `B2:C${BULK_TEMPLATE_ROW_LIMIT}`,
            `E2:E${BULK_TEMPLATE_ROW_LIMIT}`,
          ],
        },
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to download stock validation template");
    } finally {
      setBulkBusy(false);
    }
  };

  const fetchDestinationProducts = async (destinationId) => {
    return fetchAllInventoryProducts({
      params: {
        batch_variants: "true",
        include_master: "true",
        include_expired: "true",
        store_id: String(destinationId),
      },
      pageSize: 500,
      fetchOptions: { cache: "no-store" },
    });
  };

  const matchBulkProduct = (row, products) => {
    const barcode = normalizeText(getBulkField(row, ["barcode"]));
    const sku = normalizeText(getBulkField(row, ["sku"]));
    const productName = normalizeText(
      getBulkField(row, ["product_name", "product"]),
    );
    const batchNo = normalizeText(getBulkField(row, ["batch_no", "batch"]));

    const candidates = products.filter((product) => {
      const identityMatches =
        (barcode && normalizeText(product.barcode) === barcode) ||
        (sku && normalizeText(product.sku) === sku) ||
        (productName && normalizeText(product.name) === productName);
      if (!identityMatches) return false;
      if (!batchNo) return true;
      return normalizeText(product.batchNo || product.batch_no) === batchNo;
    });

    if (candidates.length === 1) return { product: candidates[0] };
    if (candidates.length > 1) {
      return {
        error: "Multiple matching batches found. Fill Batch No in the sheet.",
      };
    }
    return { error: "Product not found in selected destination stock." };
  };

  const handleBulkImport = async () => {
    try {
      setBulkBusy(true);
      setBulkIssue("");
      const file = await pickSpreadsheetFile();
      if (!file) return;

      const storeList = await ensureStoresLoaded();
      const rows = await parseBulkSheet(file);
      if (!rows.length) {
        setBulkIssue("No rows found in selected file.");
        return;
      }

      const productCache = new Map();
      const preview = [];

      for (const row of rows.slice(0, 10000)) {
        const rowNumber = Number(row.__row_index || 0) + 2;
        const destinationRaw = getBulkField(row, [
          "destination",
          "store",
          "warehouse",
        ]);
        const destinationId = parseDestinationId(destinationRaw, storeList);
        const physicalQty = toQty(
          getBulkField(row, ["physical_qty", "qty", "counted_qty"]),
        );
        const remarks = String(getBulkField(row, ["remarks"], "") || "").trim();

        if (!destinationId) {
          preview.push({
            rowNumber,
            status: "error",
            error: "Destination is required or invalid.",
            raw: row,
          });
          continue;
        }
        if (!productCache.has(destinationId)) {
          productCache.set(
            destinationId,
            await fetchDestinationProducts(destinationId),
          );
        }
        const products = productCache.get(destinationId) || [];
        const match = matchBulkProduct(row, products);
        if (match.error) {
          preview.push({
            rowNumber,
            status: "error",
            destinationId,
            destinationName:
              storeList.find(
                (store) => Number(store.id) === Number(destinationId),
              )?.name || destinationRaw,
            error: match.error,
            raw: row,
          });
          continue;
        }

        const product = match.product;
        const existingQty = toQty(
          product.existingQty ?? product.availableStock,
        );
        const variance = Math.round((physicalQty - existingQty) * 1000) / 1000;
        preview.push({
          rowNumber,
          status: "ready",
          destinationId,
          destinationName:
            storeList.find(
              (store) => Number(store.id) === Number(destinationId),
            )?.name || destinationRaw,
          product_id: product.id ?? product.product_id,
          batch_id: product.batchId || product.batch_id || null,
          batch_no: product.batchNo || product.batch_no || "",
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          existing_qty: existingQty,
          qty: String(physicalQty),
          variance,
          cost_price: Number(product.cost_price || 0),
          mrp: Number(product.mrp || 0),
          selling_price: Number(
            product.selling_price || product.sellingPrice || product.mrp || 0,
          ),
          tax_value: 0,
          remarks,
          variantKey:
            product.variantKey ||
            `${product.id}:batch:${product.batchId || product.batch_id || "stock"}`,
        });
      }

      setBulkPreview(preview);
      if (!preview.some((row) => row.status === "ready")) {
        setBulkIssue(
          "No valid rows found. Check destination, barcode/SKU/product name, batch, and physical qty.",
        );
      }
    } catch (err) {
      console.error(err);
      setBulkIssue(
        err.message || "Bulk import failed. Please use a valid Excel/CSV file.",
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulkAudit = async () => {
    const readyRows = bulkPreview.filter((row) => row.status === "ready");
    if (!readyRows.length) {
      setBulkIssue("No valid rows to confirm.");
      return;
    }

    setBulkBusy(true);
    setBulkIssue("");
    try {
      const groups = new Map();
      readyRows.forEach((row) => {
        const key = String(row.destinationId);
        groups.set(key, [...(groups.get(key) || []), row]);
      });

      let confirmed = 0;
      for (const [destinationId, rows] of groups.entries()) {
        const draft = await postValidation({
          destination: destinationId,
          applyTaxes: true,
          meta: { bulkValidation: true },
        });

        const res = await fetch(
          `/api/inventory/stockvalidation/${encodeURIComponent(draft.id)}/confirm`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              form: {
                invoice_date: new Date().toISOString().slice(0, 10),
                invoice_number: "",
                other_charges: 0,
                remarks: "Created from bulk stock validation template",
              },
              items: rows,
            }),
          },
        );
        const json = await res.json();
        if (!res.ok)
          throw new Error(
            json.error ||
              `Failed to confirm audit for destination ${destinationId}`,
          );
        confirmed += rows.length;
      }

      alert(`Bulk stock validation confirmed for ${confirmed} product row(s).`);
      setBulkOpen(false);
      setBulkPreview([]);
      loadList();
    } catch (err) {
      console.error(err);
      setBulkIssue(err.message || "Failed to confirm bulk audit.");
    } finally {
      setBulkBusy(false);
    }
  };

  const openPreview = async (row) => {
    if (!row?._id) return;
    setPreviewLoading(true);
    setPreviewEntry({
      id: row._id,
      transactionId: String(row["Transaction ID"] || "").replace(/^#/, ""),
    });
    try {
      setPreviewEntry(await fetchValidationDetails(row._id));
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to load stock validation preview");
      setPreviewEntry(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openEdit = async (row) => {
    if (!row?._id) return;
    try {
      const details = await fetchValidationDetails(row._id);
      setEditEntry(details);
      setEditForm({
        invoice_date: details.invoice_date || "",
        invoice_number: details.invoice_number || "",
        rack_no: details.rack_no || "",
        other_charges: details.other_charges ?? "",
        remarks: details.remarks || "",
        items: details.items || [],
      });
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to load stock validation edit");
    }
  };

  const saveEdit = async () => {
    if (!editEntry?.id) return;
    setSavingEdit(true);
    try {
      await updateValidationDetails(editEntry.id, editForm);
      setEditEntry(null);
      loadList();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to update stock validation");
    } finally {
      setSavingEdit(false);
    }
  };

  const downloadEntryExcel = async (row) => {
    if (!row?._id) return;
    try {
      const details = await fetchValidationDetails(row._id);
      await downloadInventoryEntryWorkbook("stock-validation", details);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to download stock validation Excel");
    }
  };

  const downloadConsolidatedExcel = async () => {
    if (downloadingConsolidated) return;
    const rows = visibleTableData.filter((row) => row?._id);
    if (!rows.length) return alert("No audit records available to export.");
    setDownloadingConsolidated(true);
    try {
      const entries = [];
      for (const row of rows) {
        entries.push(await fetchValidationDetails(row._id));
      }
      await downloadStockValidationConsolidatedWorkbook(entries);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to download consolidated audit sheet");
    } finally {
      setDownloadingConsolidated(false);
    }
  };

  const next = async () => {
    setSubmitting(true);
    try {
      const created = await postValidation({
        destination,
        rack_no: rackNo,
        applyTaxes,
      });
      setShowModal(false);
      setDraftId(created.id);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create stock validation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <InventoryShell
        breadcrumb={[{ label: "Inventory" }, { label: "Stock Validation" }]}
        title="Stock Validation"
        subtitle="Stock Validation transaction history of last 7 days. Need Help?"
        actions={[
          { label: "Audit In Bulk (Excel)", onClick: openBulkModal },
          {
            label: downloadingConsolidated
              ? "Downloading..."
              : "Download Consolidated Excel",
            onClick: downloadConsolidatedExcel,
            disabled: downloadingConsolidated,
          },
          { label: "Audit", primary: true, onClick: openModal },
        ]}
        searchPlaceholder="Search"
        filters={
          <>
            <DateTextInput
              value={listFilters.dateFrom}
              onChange={(value) =>
                setListFilters((current) => ({
                  ...current,
                  dateFrom: value,
                }))
              }
              className="rounded-xl px-3 py-2 text-[12.5px] text-slate-600"
            />
            <DateTextInput
              value={listFilters.dateTo}
              onChange={(value) =>
                setListFilters((current) => ({
                  ...current,
                  dateTo: value,
                }))
              }
              className="rounded-xl px-3 py-2 text-[12.5px] text-slate-600"
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
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setListFilters({ dateFrom: "", dateTo: "", source: "" })
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
        rowActions={(row) => (
          <div className="flex justify-end">
            <div className="hidden flex-wrap justify-end gap-2 sm:flex">
              {row._status !== "confirmed" && (
                <>
                  <button
                    type="button"
                    onClick={() => setDraftId(row._id)}
                    className="rounded-lg border border-indigo-200 px-3 py-1.5 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-50"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDraft(row)}
                    disabled={deletingDraftId === row._id}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingDraftId === row._id ? "Deleting..." : "Delete"}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => openPreview(row)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => openEdit(row)}
                disabled={row._status !== "confirmed"}
                className="rounded-lg border border-blue-200 px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
              >
                Edit
              </button>
            </div>
            <details className="relative sm:hidden">
              <summary className="list-none rounded-lg border border-slate-200 px-3 py-1.5 text-[16px] font-black text-slate-700">
                ...
              </summary>
              <div className="absolute right-0 z-20 mt-2 flex min-w-36 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                {row._status !== "confirmed" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDraftId(row._id)}
                      className="rounded px-3 py-2 text-left text-[12px] font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(row)}
                      disabled={deletingDraftId === row._id}
                      className="rounded px-3 py-2 text-left text-[12px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => openPreview(row)}
                  className="rounded px-3 py-2 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  disabled={row._status !== "confirmed"}
                  className="rounded px-3 py-2 text-left text-[12px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  Edit
                </button>
              </div>
            </details>
          </div>
        )}
      />

      {pendingDeleteRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
                <i className="ti ti-alert-triangle text-[20px]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black text-slate-950">
                  Delete pending validation?
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  This will delete{" "}
                  <span className="text-slate-900">
                    {pendingDeleteRow["Transaction ID"]}
                  </span>{" "}
                  and its saved line items.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteRow(null)}
                disabled={deletingDraftId === pendingDeleteRow._id}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close"
              >
                <i className="ti ti-x text-[18px]" />
              </button>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4">
              <button
                type="button"
                onClick={() => setPendingDeleteRow(null)}
                disabled={deletingDraftId === pendingDeleteRow._id}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteDraft}
                disabled={deletingDraftId === pendingDeleteRow._id}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingDraftId === pendingDeleteRow._id
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  Bulk Stock Validation
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Download blank template, fill physical qty, upload, preview,
                  then confirm audit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <i className="ti ti-x text-[18px]" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={downloadBulkTemplate}
                disabled={bulkBusy}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Download Template
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={bulkBusy}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {bulkBusy ? "Working..." : "Upload Filled Sheet"}
              </button>
              <button
                type="button"
                onClick={confirmBulkAudit}
                disabled={
                  bulkBusy || !bulkPreview.some((row) => row.status === "ready")
                }
                className="ml-auto rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                Confirm Audit
              </button>
            </div>

            {bulkIssue && (
              <div className="mx-6 mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {bulkIssue}
              </div>
            )}

            <div className="min-h-[360px] overflow-auto p-6">
              {bulkPreview.length ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Row</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Destination</th>
                      <th className="px-3 py-3">Product</th>
                      <th className="px-3 py-3">Batch</th>
                      <th className="px-3 py-3">System Qty</th>
                      <th className="px-3 py-3">Physical Qty</th>
                      <th className="px-3 py-3">Difference</th>
                      <th className="px-3 py-3">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkPreview.map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.destinationId || "x"}-${row.product_id || row.error}`}
                        className={row.status === "error" ? "bg-red-50/60" : ""}
                      >
                        <td className="px-3 py-3 font-semibold">
                          {row.rowNumber}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold ${row.status === "ready" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                          >
                            {row.status === "ready" ? "Ready" : "Error"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {row.destinationName || "-"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-bold text-slate-900">
                            {row.name || "-"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.sku || row.barcode || ""}
                          </div>
                        </td>
                        <td className="px-3 py-3">{row.batch_no || "-"}</td>
                        <td className="px-3 py-3">
                          {row.status === "ready" ? row.existing_qty : "-"}
                        </td>
                        <td className="px-3 py-3">
                          {row.status === "ready" ? row.qty : "-"}
                        </td>
                        <td
                          className={`px-3 py-3 font-bold ${Number(row.variance || 0) < 0 ? "text-red-700" : Number(row.variance || 0) > 0 ? "text-emerald-700" : "text-slate-700"}`}
                        >
                          {row.status === "ready" ? row.variance : "-"}
                        </td>
                        <td className="px-3 py-3 text-red-700">
                          {row.error || row.remarks || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm font-semibold text-slate-400">
                  Download the blank template and upload filled sheet to preview
                  audit rows.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-[570px] overflow-hidden rounded bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-[22px] py-6">
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

            <div className="px-[22px] py-[38px]">
              <div className="mb-6">
                <label className="mb-2 block text-[15px] text-gray-700">
                  Destination{" "}
                  <span className="font-semibold text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="h-10 w-full appearance-none rounded border border-gray-300 bg-white px-3 pr-12 text-[15px] text-gray-700 outline-none focus:border-blue-400"
                  >
                    <option value="none">None</option>
                    {loadingStores ? (
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
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-[15px] text-gray-700">
                  Rack No
                </label>
                <input
                  value={rackNo}
                  onChange={(e) => setRackNo(e.target.value)}
                  placeholder="Example: Rack A-12"
                  className="h-10 w-full rounded border border-gray-300 px-3 text-[15px] text-gray-700 outline-none focus:border-blue-400"
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

      {draftId && (
        <ValidationLineItemsWindow
          id={draftId}
          onClose={() => {
            setDraftId(null);
            loadList();
          }}
          onConfirmed={() => {
            setDraftId(null);
            loadList();
          }}
        />
      )}

      {(previewEntry || previewLoading) && (
        <InventoryEntryPreviewDialog
          title="Stock Validation Preview"
          entry={previewEntry}
          loading={previewLoading}
          onClose={() => {
            if (!previewLoading) setPreviewEntry(null);
          }}
        />
      )}

      {editEntry && (
        <StockValidationEditDialog
          form={editForm}
          onChange={setEditForm}
          saving={savingEdit}
          onCancel={() => {
            if (!savingEdit) setEditEntry(null);
          }}
          onSave={saveEdit}
        />
      )}
    </>
  );
}

async function downloadInventoryEntryWorkbook(kind, entry) {
  const XLSX = await import("xlsx");
  const summaryHeaders = [
    "Transaction ID",
    "Rack No",
    "Destination",
    "Other Charges",
    "Remarks",
  ];
  const summaryValues = [
    entry.transactionId || entry.id || "",
    entry.rack_no || "",
    entry.destinationName || entry.destination || "",
    Number(entry.other_charges || 0),
    entry.remarks || "",
  ];
  const summaryRows = [summaryHeaders, summaryValues];
  const itemRows = (entry.items || []).map((item, index) => {
    const physicalQty = Number(item.qty || 0);
    const existingQty = Number(item.existing_qty || 0);
    const costPrice = Number(item.report_cost_price || item.cost_price || 0);
    const mrp = Number(item.report_mrp || item.mrp || 0);
    const sellingPrice = Number(
      item.report_selling_price || item.selling_price || 0,
    );
    return {
      "S.No.": index + 1,
      Product: item.product_name || item.name || "",
      SKU: item.sku || "",
      Barcode: item.barcode || "",
      "Batch No": item.batch_no || "",
      Expiry: formatDate(item.expiry_date),
      "System Qty": existingQty,
      "Physical Qty": physicalQty,
      Variance: physicalQty - existingQty,
      "Cost Price": costPrice,
      MRP: mrp,
      "Selling Price": sellingPrice,
      "Stock Value": physicalQty * costPrice,
      "Selling Value": physicalQty * sellingPrice,
      "Margin %": marginPercent(costPrice, sellingPrice),
      Tax: Number(item.tax_value || 0),
    };
  });
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

function marginPercent(costPrice, sellingPrice) {
  const cost = Number(costPrice || 0);
  const selling = Number(sellingPrice || 0);
  if (!cost) return 0;
  return Number((((selling - cost) / cost) * 100).toFixed(4));
}

async function downloadStockValidationConsolidatedWorkbook(entries) {
  const XLSX = await import("xlsx");
  const summaryRows = [];
  const productWise = new Map();
  const productRows = [];

  entries.forEach((entry) => {
    const items = entry.items || [];
    const transactionId = entry.transactionId || entry.id || "";
    const destination = entry.destinationName || entry.destination || "";
    const rackNo = entry.rack_no || "";
    const totalPhysical = items.reduce(
      (sum, item) => sum + Number(item.qty || 0),
      0,
    );
    const totalSystem = items.reduce(
      (sum, item) => sum + Number(item.existing_qty || 0),
      0,
    );
    summaryRows.push({
      "Transaction ID": transactionId,
      Status: entry.status || "",
      "Rack No": rackNo,
      Destination: destination,
      "Total Products": items.length,
      "System Qty": totalSystem,
      "Physical Qty": totalPhysical,
      Variance: totalPhysical - totalSystem,
      Remarks: entry.remarks || "",
    });

    items.forEach((item, index) => {
      const physicalQty = Number(item.qty || 0);
      const existingQty = Number(item.existing_qty || 0);
      const productName = item.product_name || item.name || "";
      const sku = item.sku || "";
      const barcode = item.barcode || "";
      const batchNo = item.batch_no || "";
      const expiry = formatDate(item.expiry_date);
      const costPrice = Number(item.report_cost_price || item.cost_price || 0);
      const mrp = Number(item.report_mrp || item.mrp || 0);
      const sellingPrice = Number(
        item.report_selling_price || item.selling_price || 0,
      );
      const productKey = [
        destination,
        rackNo,
        item.product_id || "",
        productName,
        sku,
        barcode,
        batchNo,
        expiry,
      ].join("||");
      const current = productWise.get(productKey) || {
        Destination: destination,
        "Rack No": rackNo,
        Product: productName,
        SKU: sku,
        Barcode: barcode,
        "Batch No": batchNo,
        Expiry: expiry,
        "System Qty": 0,
        "Physical Qty": 0,
        Variance: 0,
        "Cost Price": costPrice,
        MRP: mrp,
        "Selling Price": sellingPrice,
        "Stock Value": 0,
        "Selling Value": 0,
        "Margin %": 0,
        "Audit Count": 0,
        "Transaction IDs": [],
      };
      current["System Qty"] += existingQty;
      current["Physical Qty"] += physicalQty;
      current.Variance = current["Physical Qty"] - current["System Qty"];
      current["Stock Value"] += physicalQty * costPrice;
      current["Selling Value"] += physicalQty * sellingPrice;
      current["Margin %"] = marginPercent(
        current["Stock Value"],
        current["Selling Value"],
      );
      current["Audit Count"] += 1;
      if (
        transactionId &&
        !current["Transaction IDs"].includes(transactionId)
      ) {
        current["Transaction IDs"].push(transactionId);
      }
      productWise.set(productKey, current);

      productRows.push({
        "Transaction ID": transactionId,
        Status: entry.status || "",
        Destination: destination,
        "Rack No": rackNo,
        "S.No.": index + 1,
        Product: productName,
        SKU: sku,
        Barcode: barcode,
        "Batch No": batchNo,
        Expiry: expiry,
        "System Qty": existingQty,
        "Physical Qty": physicalQty,
        Variance: physicalQty - existingQty,
        "Cost Price": costPrice,
        MRP: mrp,
        "Selling Price": sellingPrice,
        "Stock Value": physicalQty * costPrice,
        "Selling Value": physicalQty * sellingPrice,
        "Margin %": marginPercent(costPrice, sellingPrice),
      });
    });
  });

  const productWiseRows = Array.from(productWise.values())
    .map((row, index) => ({
      "S.No.": index + 1,
      ...row,
      "Transaction IDs": row["Transaction IDs"].join(", "),
    }))
    .sort((a, b) => {
      const destinationCompare = String(a.Destination || "").localeCompare(
        String(b.Destination || ""),
      );
      if (destinationCompare) return destinationCompare;
      const rackCompare = String(a["Rack No"] || "").localeCompare(
        String(b["Rack No"] || ""),
      );
      if (rackCompare) return rackCompare;
      return String(a.Product || "").localeCompare(String(b.Product || ""));
    });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(productWiseRows),
    "Product Wise Audit",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(summaryRows),
    "Audit Summary",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(productRows),
    "Audit Products",
  );
  XLSX.writeFile(
    workbook,
    `stock-validation-consolidated-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

function InventoryEntryPreviewDialog({ title, entry, loading, onClose }) {
  const items = entry?.items || [];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">{title}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {entry?.transactionId || "Loading entry details..."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>
        <div className="overflow-auto p-6">
          {loading && !items.length ? (
            <div className="py-16 text-center text-sm font-semibold text-slate-500">
              Loading details...
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PreviewStat
                  label="Invoice"
                  value={entry?.invoice_number || "-"}
                />
                <PreviewStat
                  label="Date"
                  value={formatDate(entry?.invoice_date)}
                />
                <PreviewStat
                  label="Destination"
                  value={entry?.destinationName || "-"}
                />
                <PreviewStat label="Rack No" value={entry?.rack_no || "-"} />
                <PreviewStat label="Items" value={items.length} />
              </div>
              <div className="mt-5 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                <div>
                  <span className="font-bold text-slate-500">
                    Other Charges:
                  </span>{" "}
                  Rs. {formatCurrency(entry?.other_charges)}
                </div>
                <div>
                  <span className="font-bold text-slate-500">Remarks:</span>{" "}
                  {entry?.remarks || "-"}
                </div>
              </div>
              <InventoryItemsTable items={items} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black text-slate-900">
        {value || "-"}
      </div>
    </div>
  );
}

function InventoryItemsTable({ items }) {
  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
      <div className="max-h-[44vh] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              {[
                "Product",
                "SKU",
                "Barcode",
                "Batch",
                "Expiry",
                "System",
                "Physical",
                "Variance",
                "Cost",
                "MRP",
              ].map((header) => (
                <th key={header} className="px-3 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length ? (
              items.map((item, index) => {
                const physicalQty = Number(item.qty || 0);
                const existingQty = Number(item.existing_qty || 0);
                const variance = physicalQty - existingQty;
                return (
                  <tr key={item.id || `${item.product_id}-${index}`}>
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {item.product_name || item.name || "-"}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.sku || "-"}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.barcode || "-"}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.batch_no || "-"}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(item.expiry_date)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{existingQty}</td>
                    <td className="px-3 py-3 text-slate-700">{physicalQty}</td>
                    <td
                      className={`px-3 py-3 font-bold ${variance < 0 ? "text-red-700" : variance > 0 ? "text-emerald-700" : "text-slate-700"}`}
                    >
                      {variance}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      Rs. {formatCurrency(item.cost_price)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      Rs. {formatCurrency(item.mrp)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-10 text-center text-slate-500"
                >
                  No product rows found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockValidationEditDialog({
  form,
  onChange,
  saving,
  onCancel,
  onSave,
}) {
  const updateItem = (index, field, value) => {
    onChange((current) => ({
      ...current,
      items: (current.items || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">
              Edit Stock Validation
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Only stock increase/decrease, MRP, and expiry can be edited.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>
        <div className="min-h-0 overflow-auto p-6">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Batch</th>
                <th className="px-3 py-3">System Qty</th>
                <th className="px-3 py-3">Physical Qty</th>
                <th className="px-3 py-3">MRP</th>
                <th className="px-3 py-3">Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(form.items || []).map((item, index) => (
                <tr key={item.id || `${item.product_id}-${index}`}>
                  <td className="px-3 py-3">
                    <div className="font-bold text-slate-900">
                      {item.product_name || item.name || "-"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.sku || item.barcode || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-slate-700">
                    {getBatchNo(item) || "-"}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-700">
                    {Number(item.existing_qty || 0)}
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      value={item.qty ?? ""}
                      onChange={(e) => updateItem(index, "qty", e.target.value)}
                      className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      value={item.mrp ?? ""}
                      onChange={(e) => updateItem(index, "mrp", e.target.value)}
                      className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <DateTextInput
                      value={item.expiry_date || ""}
                      onChange={(value) =>
                        updateItem(index, "expiry_date", value)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CAMERA_BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "codabar",
];

function ValidationLineItemsWindow({ id, onClose, onConfirmed }) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cartFilter, setCartFilter] = useState("");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [cart, setCart] = useState([]);
  const [form, setForm] = useState({
    invoice_date: "",
    invoice_number: "",
    rack_no: "",
    other_charges: "",
    remarks: "",
  });
  const [confirming, setConfirming] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const [scannerError, setScannerError] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [batchChoice, setBatchChoice] = useState(null);
  const [customBatchProduct, setCustomBatchProduct] = useState(null);
  const [customBatchForm, setCustomBatchForm] = useState({
    batch_no: "",
    mrp: "",
    selling_price: "",
    cost_price: "",
    expiry_date: "",
    qty: "1",
  });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scannerStopRef = useRef(false);
  const scannerProcessingRef = useRef(false);

  const saveDraft = useCallback(
    async (nextForm = form, nextCart = cart) => {
      const res = await fetch(
        `/api/inventory/stockvalidation/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...nextForm,
            items: nextCart,
          }),
        },
      );
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    [cart, form, id],
  );

  const closeAfterSave = async () => {
    if (isInitialLoad || loadError) {
      onClose();
      return;
    }
    setSaveStatus("Saving...");
    try {
      await saveDraft(form, cart);
      setSaveStatus("Saved");
    } catch (err) {
      console.error("Draft close save error:", err);
      setSaveStatus("Sync error");
    } finally {
      onClose();
    }
  };

  useEffect(() => {
    setLoading(true);
    setIsInitialLoad(true);
    setLoadError("");
    fetch(`/api/inventory/stockvalidation/${encodeURIComponent(id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to load stock validation");
        }
        return data;
      })
      .then((data) => {
        setDraft(data);
        setForm({
          invoice_date: data.invoice_date || "",
          invoice_number: data.invoice_number || "",
          rack_no: data.rack_no || "",
          other_charges: data.other_charges ?? "",
          remarks: data.remarks || "",
        });
        if (Array.isArray(data.items)) {
          setCart(data.items.map(normalizeValidationCartItem));
        }
      })
      .catch((err) => {
        console.error("Stock validation resume error:", err);
        setLoadError(err.message || "Failed to resume stock validation");
        setDraft(null);
        setCart([]);
      })
      .finally(() => {
        setLoading(false);
        setIsInitialLoad(false);
      });
  }, [id]);

  useEffect(() => {
    if (isInitialLoad) return;

    setSaveStatus("Saving...");
    const timer = setTimeout(async () => {
      try {
        await saveDraft(form, cart);
        setSaveStatus("Saved");
      } catch (err) {
        console.error("Auto-save error:", err);
        setSaveStatus("Sync error");
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [cart, form, isInitialLoad, saveDraft]);

  useEffect(() => {
    if (!scannerOpen) return undefined;
    let detector = null;
    let rafId = 0;

    const stopScanner = () => {
      scannerStopRef.current = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    const startScanner = async () => {
      scannerStopRef.current = false;
      scannerProcessingRef.current = false;
      setScannerError("");
      setScannerStatus("Opening camera...");
      try {
        if (
          typeof window === "undefined" ||
          !navigator?.mediaDevices?.getUserMedia
        ) {
          throw new Error("Camera access is not available in this browser.");
        }
        if (!window.isSecureContext) {
          throw new Error(
            "Camera scanning needs HTTPS or localhost. Open this page from a secure mobile URL.",
          );
        }
        if (!("BarcodeDetector" in window)) {
          throw new Error(
            "Live camera barcode scanning is not supported in this browser. On mobile, use Chrome or Edge if available, or use the manual scan box below.",
          );
        }
        let formats = CAMERA_BARCODE_FORMATS;
        if (typeof window.BarcodeDetector.getSupportedFormats === "function") {
          const supportedFormats =
            await window.BarcodeDetector.getSupportedFormats();
          formats = CAMERA_BARCODE_FORMATS.filter((format) =>
            supportedFormats.includes(format),
          );
        }
        detector = formats.length
          ? new window.BarcodeDetector({ formats })
          : new window.BarcodeDetector();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScannerStatus("Point camera at the barcode");

        const scanFrame = async () => {
          if (
            scannerStopRef.current ||
            scannerProcessingRef.current ||
            !videoRef.current ||
            !detector
          )
            return;
          try {
            const codes = await detector.detect(videoRef.current);
            const code = codes?.[0]?.rawValue;
            if (code) {
              scannerProcessingRef.current = true;
              setScannerStatus("Barcode found. Fetching product...");
              stopScanner();
              setScannerOpen(false);
              setScanCode(code);
              await handleBarcodeScanned(code);
              return;
            }
          } catch {}
          rafId = requestAnimationFrame(scanFrame);
        };
        rafId = requestAnimationFrame(scanFrame);
      } catch (err) {
        setScannerStatus("");
        setScannerError(err.message || "Unable to start camera scanner.");
      }
    };

    startScanner();
    return stopScanner;
  }, [scannerOpen, draft?.destination]);

  const handleBarcodeScanned = async (scannedBarcode) => {
    const destinationId = draft?.destination;
    if (!destinationId || destinationId === "none") {
      alert("Select destination store first");
      return;
    }
    try {
      setLoadingProducts(true);
      const records = await fetchAllInventoryProducts({
        params: {
          search: scannedBarcode.trim(),
          batch_variants: "true",
          include_master: "true",
          include_expired: "true",
          store_id: String(destinationId),
        },
        pageSize: 500,
      });

      const matches = records.filter(
        (p) =>
          (p.barcode && p.barcode.trim() === scannedBarcode.trim()) ||
          (p.sku && p.sku.trim() === scannedBarcode.trim()),
      );

      if (matches.length === 0) {
        alert(`No product found with barcode/SKU: ${scannedBarcode}`);
      } else if (matches.length === 1) {
        addToCart(matches[0]);
      } else {
        setBatchChoice({
          code: scannedBarcode.trim(),
          matches,
        });
        setProducts([]);
        setSearchTerm("");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to search scanned barcode");
    } finally {
      setLoadingProducts(false);
    }
  };

  const updateExpiry = (itemKey, expiryDate) => {
    setCart((current) =>
      current.map((item) =>
        getValidationItemKey(item) === String(itemKey)
          ? { ...item, expiry_date: expiryDate }
          : item,
      ),
    );
  };

  const updateMrp = (itemKey, mrp) => {
    setCart((current) =>
      current.map((item) =>
        getValidationItemKey(item) === String(itemKey)
          ? { ...item, mrp }
          : item,
      ),
    );
  };

  const openCreateBatch = (product) => {
    const productId = product.id ?? product.product_id;
    const mrp = Number(product.mrp || 0);
    const sellingPrice = Number(
      product.selling_price || product.sellingPrice || product.mrp || 0,
    );
    setCustomBatchProduct(product);
    setCustomBatchForm({
      batch_no: `AUD-${productId}-${Date.now().toString().slice(-5)}`,
      mrp: mrp ? String(mrp) : "",
      selling_price: sellingPrice ? String(sellingPrice) : "",
      cost_price: product.cost_price ? String(product.cost_price) : "",
      expiry_date: toDateInputIsoValue(
        product.expiryDate || product.expiry_date,
      ),
      qty: "1",
    });
  };

  const closeCreateBatch = () => {
    setCustomBatchProduct(null);
    setCustomBatchForm({
      batch_no: "",
      mrp: "",
      selling_price: "",
      cost_price: "",
      expiry_date: "",
      qty: "1",
    });
  };

  const addCustomBatchToCart = () => {
    if (!customBatchProduct) return;
    const productId = customBatchProduct.id ?? customBatchProduct.product_id;
    const qty = Math.max(0, Number(customBatchForm.qty || 0));
    if (!qty) {
      alert("Enter physical quantity for the new batch");
      return;
    }
    addToCart({
      ...customBatchProduct,
      variantKey: `${productId}:audit-batch:${Date.now()}`,
      batchId: null,
      batch_id: null,
      batchNo: customBatchForm.batch_no,
      batch_no: customBatchForm.batch_no,
      existingQty: 0,
      availableStock: 0,
      qty,
      mrp: Number(customBatchForm.mrp || 0),
      selling_price: Number(
        customBatchForm.selling_price || customBatchForm.mrp || 0,
      ),
      sellingPrice: Number(
        customBatchForm.selling_price || customBatchForm.mrp || 0,
      ),
      cost_price: Number(
        customBatchForm.cost_price || customBatchProduct.cost_price || 0,
      ),
      expiryDate: customBatchForm.expiry_date,
      expiry_date: customBatchForm.expiry_date,
      auditCreatedBatch: true,
    });
    closeCreateBatch();
  };

  useEffect(() => {
    const destinationId = draft?.destination;
    if (!destinationId || destinationId === "none") {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }
    const query = searchTerm.trim();
    if (!query) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    const timer = setTimeout(() => {
      setLoadingProducts(true);
      fetchAllInventoryProducts({
        params: {
          search: query,
          batch_variants: "true",
          include_master: "true",
          include_expired: "true",
          store_id: String(destinationId),
        },
        pageSize: 500,
      })
        .then((records) => setProducts(records))
        .catch(() => setProducts([]))
        .finally(() => setLoadingProducts(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, draft?.destination]);

  const filteredCart = cartFilter.trim()
    ? cart.filter((item) =>
        (item.name || "").toLowerCase().includes(cartFilter.toLowerCase()),
      )
    : cart;

  const totals = cart.reduce(
    (acc, item) => {
      const qty = Number(item.qty || 0);
      const mrp = Number(item.mrp || 0);
      acc.totalItems += qty;
      acc.totalCost += qty * mrp;
      acc.totalTax += Number(item.tax_value || 0) * qty;
      return acc;
    },
    { totalItems: 0, totalCost: Number(form.other_charges || 0), totalTax: 0 },
  );

  const addToCart = (product) => {
    const productId = product.id ?? product.product_id;
    const batchNo = getBatchNo(product);
    const variantKey =
      product.variantKey ||
      `${productId}:batch:${product.batchId || product.batch_id || "stock"}`;
    const productExpiryDate = toDateInputIsoValue(
      product.expiryDate || product.expiry_date,
    );
    setCart((current) => {
      const existing = current.find(
        (item) => getValidationItemKey(item) === String(variantKey),
      );
      if (existing) {
        const updated = {
          ...existing,
          qty: String(Number(existing.qty || 0) + 1),
          expiry_date: existing.expiry_date || productExpiryDate,
        };
        return [
          updated,
          ...current.filter(
            (item) => getValidationItemKey(item) !== String(variantKey),
          ),
        ];
      }
      const cost = Number(product.cost_price || 0);
      const mrp = Number(product.mrp || 0);
      const sellingPrice = Number(
        product.selling_price || product.sellingPrice || product.mrp || 0,
      );
      const taxRate = Number(product.tax_rate || 0);
      const existingQty = Number(
        product.existingQty ?? product.availableStock ?? 0,
      );
      return [
        {
          variantKey,
          product_id: productId,
          batch_id: product.batchId || product.batch_id || null,
          batch_no: batchNo,
          batchNo,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          existing_qty: existingQty,
          cost_price: cost,
          mrp,
          selling_price: sellingPrice,
          tax_value: draft?.applyTaxes ? (cost * taxRate) / 100 : 0,
          qty: String(
            product.auditCreatedBatch
              ? product.qty || 1
              : existingQty > 0
                ? existingQty
                : 1,
          ),
          expiry_date: productExpiryDate,
        },
        ...current,
      ];
    });
    setSearchTerm("");
    setProducts([]);
  };

  const updateQty = (itemKey, qty) => {
    const nextQty = qty === "" ? "" : Math.max(0, Number(qty) || 0);
    setCart((current) =>
      current.map((item) =>
        getValidationItemKey(item) === String(itemKey)
          ? { ...item, qty: nextQty }
          : item,
      ),
    );
  };

  const incrementQty = (itemKey, delta) => {
    setCart((current) =>
      current.map((item) => {
        if (getValidationItemKey(item) !== String(itemKey)) return item;
        const currentQty = Number(item.qty || 0);
        return { ...item, qty: String(Math.max(0, currentQty + delta)) };
      }),
    );
  };

  const removeCartItem = (itemKey) => {
    setCart((current) =>
      current.filter((item) => getValidationItemKey(item) !== String(itemKey)),
    );
  };

  const confirm = async () => {
    if (cart.length === 0) return alert("Add at least one product");

    setConfirming(true);
    try {
      const res = await fetch(
        `/api/inventory/stockvalidation/${encodeURIComponent(id)}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form, items: cart }),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to confirm stock validation");
      onConfirmed();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to confirm stock validation");
    } finally {
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
            <span className="font-semibold text-gray-900">
              Stock Validation
            </span>
            {saveStatus && (
              <span
                className={`ml-3 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  saveStatus === "Saving..."
                    ? "bg-amber-100 text-amber-700 animate-pulse"
                    : saveStatus === "Saved"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                }`}
              >
                {saveStatus}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={closeAfterSave}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close line items"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        <div className="absolute bottom-[88px] left-0 right-0 top-12 grid grid-cols-[350px_minmax(520px,1fr)] gap-6 overflow-auto px-9 py-6 max-lg:grid-cols-1 max-lg:gap-3 max-lg:px-4 max-lg:py-3">
          {loadError ? (
            <div className="col-span-full flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-rose-100 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <p className="text-sm font-semibold text-rose-700">{loadError}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Back to list
              </button>
            </div>
          ) : (
            <>
              <aside className="h-full min-h-0 overflow-auto rounded-lg border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] max-lg:h-auto max-lg:p-4">
                <h3 className="mb-5 text-[15px] font-semibold text-blue-600 max-lg:mb-3">
                  Stock Information
                </h3>

                <div className="mb-4">
                  <label className="mb-1 block text-[12px] text-gray-500">
                    Destination
                  </label>
                  <p className="text-[13px] font-medium text-gray-900">
                    {loading ? "..." : draft?.destinationName || "None"}
                  </p>
                </div>

                <Field label="Rack No">
                  <input
                    value={form.rack_no}
                    onChange={(e) =>
                      setForm({ ...form, rack_no: e.target.value })
                    }
                    placeholder="Rack No"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400"
                  />
                </Field>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <Field label="Invoice Date">
                    <DateTextInput
                      value={form.invoice_date}
                      onChange={(value) =>
                        setForm({ ...form, invoice_date: value })
                      }
                      className="rounded-lg px-3 py-2 text-[13px]"
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
                    onChange={(e) =>
                      setForm({ ...form, remarks: e.target.value })
                    }
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
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 focus:outline-none"
                    title="Scan barcode with camera"
                  >
                    <i className="ti ti-camera text-[20px]" />
                  </button>
                </div>

                <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
                    <div>
                      <h2 className="text-[14px] font-semibold text-gray-900">
                        Inventory - Stock Validation
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

                  <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
                    {loadingProducts && (
                      <p className="py-8 text-center text-[13px] text-gray-500">
                        Loading products...
                      </p>
                    )}

                    {!loadingProducts && products.length > 0 && (
                      <div className="max-h-[240px] shrink-0 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
                        {products.map((product) => {
                          const batchNo = getBatchNo(product);
                          return (
                            <div
                              key={
                                product.variantKey ||
                                `${product.id}-${product.batchId || product.batch_id || ""}-${product.mrp || ""}`
                              }
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-50/60"
                            >
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-gray-900">
                                  {product.name}
                                </div>
                                <div className="text-[12px] text-gray-500">
                                  SKU: {product.sku || "-"} · Existing:{" "}
                                  {Number(
                                    product.existingQty ??
                                      product.availableStock ??
                                      0,
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  MRP: {formatCurrency(product.mrp)} · SP:{" "}
                                  {formatCurrency(
                                    product.selling_price ||
                                      product.sellingPrice ||
                                      product.mrp,
                                  )}
                                  {product.batchNo || product.batch_no
                                    ? ` · Batch: ${product.batchNo || product.batch_no}`
                                    : ""}
                                </div>
                                <div className="mt-1">
                                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                                    Batch: {batchNo || "No batch"}
                                  </span>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => addToCart(product)}
                                  className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                                >
                                  Add
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCreateBatch(product)}
                                  className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100"
                                >
                                  Create Batch
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!loadingProducts &&
                      products.length === 0 &&
                      searchTerm.trim() &&
                      !loading &&
                      draft?.destination &&
                      draft.destination !== "none" && (
                        <p className="py-8 text-center text-[13px] text-gray-500">
                          No products found
                        </p>
                      )}

                    {filteredCart.length > 0 ? (
                      <div className="min-h-[220px] flex-1 overflow-auto rounded-lg border border-gray-100">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                Product
                              </th>
                              <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                Batch
                              </th>
                              <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                Existing
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
                                Tax
                              </th>
                              <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                Expiry
                              </th>
                              <th className="w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCart.map((item) => {
                              const itemKey = getValidationItemKey(item);
                              const batchNo = getBatchNo(item);
                              return (
                                <tr
                                  key={itemKey}
                                  className="border-b border-gray-50 hover:bg-gray-50/50"
                                >
                                  <td className="px-2 py-3">
                                    <div className="text-[13px] font-medium text-gray-900">
                                      {item.name}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      {item.sku || item.barcode || "-"}
                                    </div>
                                  </td>
                                  <td className="px-2 py-3">
                                    <span className="inline-flex max-w-[180px] rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                                      {batchNo || "-"}
                                    </span>
                                  </td>
                                  <td className="px-2 py-3 text-[13px] font-semibold text-gray-700">
                                    {Number(item.existing_qty || 0)}
                                  </td>
                                  <td className="px-2 py-3">
                                    <div className="flex w-32 items-center overflow-hidden rounded border border-gray-200 bg-white">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          incrementQty(itemKey, -1)
                                        }
                                        className="h-8 w-8 text-[15px] font-semibold text-gray-600 hover:bg-gray-50"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        min={0}
                                        value={item.qty}
                                        onChange={(e) =>
                                          updateQty(itemKey, e.target.value)
                                        }
                                        className="h-8 w-16 border-x border-gray-200 text-center text-[13px] text-gray-700 outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => incrementQty(itemKey, 1)}
                                        className="h-8 w-8 text-[15px] font-semibold text-gray-600 hover:bg-gray-50"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={item.mrp ?? ""}
                                      onChange={(e) =>
                                        updateMrp(itemKey, e.target.value)
                                      }
                                      className="h-8 w-24 rounded border border-gray-200 px-2 text-[13px] text-gray-700 outline-none focus:border-blue-400"
                                    />
                                  </td>
                                  <td className="px-2 py-3 text-[13px] font-semibold text-red-700">
                                    {formatCurrency(item.selling_price)}
                                  </td>
                                  <td className="px-2 py-3 text-[13px] text-gray-700">
                                    {formatCurrency(item.tax_value)}
                                  </td>
                                  <td className="px-2 py-3">
                                    <DateTextInput
                                      value={item.expiry_date || ""}
                                      onChange={(value) =>
                                        updateExpiry(itemKey, value)
                                      }
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <button
                                      type="button"
                                      onClick={() => removeCartItem(itemKey)}
                                      className="rounded p-1.5 text-red-500 hover:bg-red-50"
                                    >
                                      <i className="ti ti-trash text-[16px]" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      products.length === 0 &&
                      !loadingProducts && <div className="min-h-[240px]" />
                    )}
                  </div>
                </section>
              </main>
            </>
          )}
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
                Total MRP:{" "}
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
                {confirming ? "Confirming..." : "Confirm Transaction"}
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

        {customBatchProduct && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Create Audit Batch
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {customBatchProduct.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCreateBatch}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <i className="ti ti-x text-[18px]" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Batch No">
                  <input
                    value={customBatchForm.batch_no}
                    onChange={(e) =>
                      setCustomBatchForm({
                        ...customBatchForm,
                        batch_no: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                  />
                </Field>
                <Field label="Physical Qty">
                  <input
                    type="number"
                    min={0}
                    value={customBatchForm.qty}
                    onChange={(e) =>
                      setCustomBatchForm({
                        ...customBatchForm,
                        qty: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                  />
                </Field>
                <Field label="MRP">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={customBatchForm.mrp}
                    onChange={(e) =>
                      setCustomBatchForm({
                        ...customBatchForm,
                        mrp: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                  />
                </Field>
                <Field label="Selling Price">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={customBatchForm.selling_price}
                    onChange={(e) =>
                      setCustomBatchForm({
                        ...customBatchForm,
                        selling_price: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                  />
                </Field>
                <Field label="Cost Price">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={customBatchForm.cost_price}
                    onChange={(e) =>
                      setCustomBatchForm({
                        ...customBatchForm,
                        cost_price: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                  />
                </Field>
                <Field label="Expiry">
                  <DateTextInput
                    value={customBatchForm.expiry_date}
                    onChange={(value) =>
                      setCustomBatchForm({
                        ...customBatchForm,
                        expiry_date: value,
                      })
                    }
                  />
                </Field>
              </div>

              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                On confirm, this line will create/update stock as a separate
                batch with the selected MRP and expiry.
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateBatch}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addCustomBatchToCart}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Add Batch
                </button>
              </div>
            </div>
          </div>
        )}

        {batchChoice && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/55 p-4">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Select Batch
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Barcode/SKU: {batchChoice.code}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchChoice(null)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <i className="ti ti-x text-[18px]" />
                </button>
              </div>

              <div className="min-h-0 overflow-y-auto p-4">
                <div className="grid gap-3">
                  {batchChoice.matches.map((product) => {
                    const batchNo = getBatchNo(product);
                    const availableQty = Number(
                      product.existingQty ?? product.availableStock ?? 0,
                    );
                    return (
                      <button
                        key={
                          product.variantKey ||
                          `${product.id}-${product.batchId || product.batch_id || ""}-${product.mrp || ""}`
                        }
                        type="button"
                        onClick={() => {
                          addToCart(product);
                          setBatchChoice(null);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-200 hover:bg-blue-50"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-black text-slate-900">
                            {product.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[12px] font-semibold text-slate-500">
                            <span>SKU: {product.sku || "-"}</span>
                            <span>Stock: {availableQty}</span>
                            <span>MRP: {formatCurrency(product.mrp)}</span>
                            <span>
                              Expiry:{" "}
                              {formatDate(
                                product.expiryDate || product.expiry_date,
                              )}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                          {batchNo || "No batch"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {scannerOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Scan Barcode
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {scannerStatus || "Mobile camera scanner"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  Close
                </button>
              </div>
              <div className="bg-slate-950">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-72 w-full object-cover"
                />
              </div>
              {scannerError && (
                <div className="px-4 py-3 text-xs font-semibold text-rose-600">
                  {scannerError}
                </div>
              )}
              <div className="px-4 pb-4 pt-3">
                <input
                  type="text"
                  value={scanCode}
                  onChange={(event) => setScanCode(event.target.value)}
                  onKeyDown={async (event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setScannerOpen(false);
                      await handleBarcodeScanned(event.currentTarget.value);
                    }
                  }}
                  placeholder="Or type / hardware scan barcode"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
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
