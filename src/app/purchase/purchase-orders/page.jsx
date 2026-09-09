"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import MainLayout from "@/components/MainLayout";
import {
  OPTIONS_SHEET_NAME,
  buildOptionsSheet,
  hideOptionsSheet,
  saveWorkbookWithValidations,
} from "@/lib/xlsxDropdowns";
import {
  fetchLookup,
  normalizeStores,
  normalizeVendors,
} from "@/lib/purchaseLookups";
import { formatIndianDate } from "@/lib/dateUtils";
import { addCalendarDays, getIndiaDate } from "@/lib/vendorCreditTerms";

const tableHeaders = [
  "Purchase Order ID",
  "Destination Name",
  "Vendor Name",
  "Invoice Number",
  "Invoice Date",
  "Expected Delivery Date",
  "Payment Due Date",
  "Shipment Mode",
  "Total Items",
  "Status",
  "Actions",
];

const ALL_VENDOR_ANALYSIS = "__all_vendors__";
const PO_TEMPLATE_HEADERS = [
  "Destination ID",
  "Destination Name",
  "Vendor ID",
  "Vendor Name",
  "Product ID",
  "Product Name",
  "Barcode",
  "SKU",
  "Brand",
  "Qty",
  "Cost Price",
  "MRP",
  "Selling Price",
  "Expiry Date",
  "Invoice Date",
  "Expected Delivery Date",
  "Payment Due Date",
  "Shipment Mode",
  "Invoice Number",
  "CC Emails",
];

const ALL_STORES_REORDER_HEADERS = [
  "STORE ID",
  "STORE NAME",
  "VENDOR ID",
  "VENDOR NAME",
  "PRODUCT ID",
  "BRAND",
  "ITEM NAME",
  "BARCODE",
  "MRP",
  "CP",
  "SP",
  "EXPIRY DATE",
  "STOCK LEVEL",
  "LAST GRN DONE ON",
  "LAST GRN QTY",
  "AVERAGE SELLING RATIO OF 30DAYS",
  "22 TO 30 SALE",
  "15 TO 21 SALE",
  "8 TO 14 SALE",
  "1 TO 7 SALE",
  "MBQ",
  "REQUIRED QTY",
];
const PO_TEMPLATE_ROW_LIMIT = 5001;

function toExcelDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(
      Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      ),
    );
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(parsed)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
}

function applyAllStoresSheetFormats(worksheet, rowCount) {
  const columnsByHeader = new Map(
    ALL_STORES_REORDER_HEADERS.map((header, index) => [header, index]),
  );
  const formats = {
    "STORE ID": "@",
    "VENDOR ID": "@",
    "PRODUCT ID": "@",
    BARCODE: "@",
    MRP: "0.##########",
    CP: "0.##########",
    SP: "0.##########",
    "EXPIRY DATE": "dd/mm/yyyy",
    "STOCK LEVEL": "#,##0.###",
    "LAST GRN DONE ON": "dd/mm/yyyy",
    "LAST GRN QTY": "#,##0.###",
    "AVERAGE SELLING RATIO OF 30DAYS": "#,##0.###",
    "22 TO 30 SALE": "#,##0.###",
    "15 TO 21 SALE": "#,##0.###",
    "8 TO 14 SALE": "#,##0.###",
    "1 TO 7 SALE": "#,##0.###",
    MBQ: "#,##0.###",
    "REQUIRED QTY": "#,##0.###",
  };

  Object.entries(formats).forEach(([header, format]) => {
    const column = columnsByHeader.get(header);
    if (column == null) return;
    for (let row = 1; row <= rowCount; row += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = format;
    }
  });
}

function poOptionRangeFormula(optionGroups, key) {
  const index = optionGroups.findIndex((group) => group.key === key);
  if (index < 0 || !optionGroups[index].values.length) return "";
  const column = XLSX.utils.encode_col(index);
  return `'${OPTIONS_SHEET_NAME}'!$${column}$2:$${column}$${optionGroups[index].values.length + 1}`;
}

function formatDate(value) {
  return formatIndianDate(value, "â€”");
}

function displayText(value) {
  const text = String(value ?? "").trim();
  if (!text || text.includes("â") || text.includes("Ã")) return "-";
  return text;
}

function mapRecordsToTable(records) {
  return (records || []).map((row) => ({
    "Purchase Order ID": row.transactionId
      ? `#${row.transactionId}`
      : `#PO-${String(row.id).padStart(4, "0")}`,
    "Destination Name": row.destinationName || "â€”",
    "Vendor Name": row.vendorName || "â€”",
    "Invoice Number": row.invoiceNumber || "â€”",
    "Invoice Date": row.invoiceDate ? formatDate(row.invoiceDate) : "-",
    "Expected Delivery Date": row.expectedDeliveryDate
      ? formatDate(row.expectedDeliveryDate)
      : "-",
    "Payment Due Date": row.paymentDueDate
      ? formatDate(row.paymentDueDate)
      : "-",
    "Shipment Mode": row.shipmentMode || "â€”",
    "Total Items": row.totalItems ?? 0,
    Status: row.status || "draft",
    Actions: "",
  }));
}

function parseDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getDateWindow(range) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (range === "last-7-days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (range === "last-30-days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  return { start: null, end: null };
}

function isWithinRange(value, range) {
  const date = parseDateInput(value);
  if (!date || range === "all") return true;

  if (range.type === "custom") {
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  }

  if (range.type === "preset") {
    if (!range.start || !range.end) return true;
    return date >= range.start && date <= range.end;
  }

  return true;
}

async function fetchPurchaseOrders() {
  const res = await fetch("/api/purchase-orders");
  if (!res.ok) throw new Error("Failed to fetch purchase orders");
  return res.json();
}

async function createPurchaseOrder(payload) {
  const res = await fetch("/api/purchase-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create purchase order");
  return data;
}

async function deletePurchaseOrder(id) {
  const res = await fetch(`/api/purchase-orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete purchase order");
  return data;
}

async function fetchReorderSuggestions(storeId, vendorId, includeAll = false) {
  if (!storeId) return [];
  const params = new URLSearchParams({ storeId: String(storeId) });
  if (vendorId) params.set("vendorId", String(vendorId));
  if (includeAll) params.set("includeAll", "true");
  const res = await fetch(`/api/purchase/reorder?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchAllStoresAssignedProducts() {
  const res = await fetch(
    "/api/purchase/reorder?includeAll=true&allStores=true",
    { cache: "no-store", credentials: "include" },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to load all assigned products");
  return Array.isArray(data) ? data : [];
}

async function createSuggestedPurchaseOrder(payload) {
  const res = await fetch("/api/purchase/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to create suggested purchase order");
  return data;
}
export default function PurchaseOrdersPage() {
  const [showModal, setShowModal] = useState(false);
  const [showReqModal, setShowReqModal] = useState(false);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [stores, setStores] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [reqSaving, setReqSaving] = useState(false);
  const [requisitions, setRequisitions] = useState([]);
  const [draftFilters, setDraftFilters] = useState({
    dateRange: "all",
    customStart: "",
    customEnd: "",
    destination: "all",
    status: "all",
    vendor: "all",
  });
  const [filters, setFilters] = useState({
    dateRange: "all",
    customStart: "",
    customEnd: "",
    destination: "all",
    status: "all",
    vendor: "all",
  });
  const [form, setForm] = useState({
    destination: "",
    vendor: "",
    invoice_date: "",
    expected_delivery_date: "",
    payment_due_date: "",
    shipment_mode: "",
    invoice_number: "",
    cc_emails: "",
  });
  const [reqForm, setReqForm] = useState({ requisitionId: "", vendorId: "" });
  const [suggestions, setSuggestions] = useState([]);
  const [showAllStoreProducts, setShowAllStoreProducts] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);
  const poTemplateInputRef = useRef(null);
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const isSuperAdmin = currentUser?.role === "super_admin";
  const userPermissions = Array.isArray(currentUser?.permissions)
    ? currentUser.permissions
    : [];
  const canManagePO =
    isSuperAdmin ||
    userPermissions.includes("*") ||
    userPermissions.includes("MANAGE_PURCHASE_ORDERS") ||
    userPermissions.includes("CREATE_STORE_PURCHASE_ORDER");
  const selectedVendor = useMemo(
    () => vendors.find((vendor) => String(vendor.id) === String(form.vendor)),
    [form.vendor, vendors],
  );
  const vendorCreditDays = Number(selectedVendor?.credit_days || 0);
  const poDate = getIndiaDate();
  const maximumPaymentDueDate =
    vendorCreditDays > 0 ? addCalendarDays(poDate, vendorCreditDays) : "";
  const paymentDueDateInvalid = Boolean(
    form.payment_due_date &&
    maximumPaymentDueDate &&
    form.payment_due_date > maximumPaymentDueDate,
  );

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setCurrentUser(json.data?.user || json.user || null))
      .catch(() => setCurrentUser(null));

    setLoadingList(true);
    fetchPurchaseOrders()
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    setLoadingLookups(true);
    Promise.allSettled([
      fetchLookup("/api/stores"),
      fetchLookup("/api/vendors"),
    ])
      .then(([storeResult, vendorResult]) => {
        setStores(
          storeResult.status === "fulfilled"
            ? normalizeStores(storeResult.value)
            : [],
        );
        setVendors(
          vendorResult.status === "fulfilled"
            ? normalizeVendors(vendorResult.value)
            : [],
        );
      })
      .finally(() => setLoadingLookups(false));
  }, []);

  useEffect(() => {
    if (!showModal) return;
    if (stores.length > 0 || vendors.length > 0 || loadingLookups) return;
    setLoadingLookups(true);
    Promise.allSettled([
      fetchLookup("/api/stores"),
      fetchLookup("/api/vendors"),
    ])
      .then(([storeResult, vendorResult]) => {
        setStores(
          storeResult.status === "fulfilled"
            ? normalizeStores(storeResult.value)
            : [],
        );
        setVendors(
          vendorResult.status === "fulfilled"
            ? normalizeVendors(vendorResult.value)
            : [],
        );
      })
      .finally(() => setLoadingLookups(false));
  }, [showModal, stores.length, vendors.length, loadingLookups]);

  useEffect(() => {
    if (!showModal || !form.destination || !form.vendor) {
      setSuggestions([]);
      setSelectedSuggestions([]);
      return;
    }
    let cancelled = false;
    setSuggestionsLoading(true);
    fetchReorderSuggestions(
      form.destination,
      form.vendor === ALL_VENDOR_ANALYSIS ? "" : form.vendor,
      showAllStoreProducts,
    )
      .then((rows) => {
        if (cancelled) return;
        const usable = showAllStoreProducts
          ? rows
          : rows.filter((row) => Number(row.suggestedQty || 0) > 0);
        setSuggestions(usable);
        setSelectedSuggestions(
          usable
            .filter((row) => Number(row.suggestedQty || 0) > 0)
            .map((row) => String(row.variantKey)),
        );
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showModal, form.destination, form.vendor, showAllStoreProducts]);

  const selectedSuggestionItems = useMemo(
    () =>
      suggestions.filter((row) =>
        selectedSuggestions.includes(String(row.variantKey)),
      ),
    [selectedSuggestions, suggestions],
  );

  const toggleSuggestion = (variantKey) => {
    const key = String(variantKey);
    setSelectedSuggestions((current) =>
      current.includes(key)
        ? current.filter((id) => id !== key)
        : [...current, key],
    );
  };
  const handleOpen = () => setShowModal(true);
  const handleClose = () => setShowModal(false);
  const handleOpenReqModal = async () => {
    setShowReqModal(true);
    try {
      const res = await fetch("/api/inventory/stockrequisition?for_po=true", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      setRequisitions(Array.isArray(data?.records) ? data.records : []);
    } catch {
      setRequisitions([]);
    }
  };

  const handleApplyFilters = () => {
    setFilters(draftFilters);
  };

  const filteredRecords = useMemo(() => {
    const range = (() => {
      if (filters.dateRange === "custom") {
        return {
          type: "custom",
          start: parseDateInput(filters.customStart),
          end: parseDateInput(filters.customEnd),
        };
      }

      if (filters.dateRange === "last-7-days") {
        const { start, end } = getDateWindow("last-7-days");
        return { type: "preset", start, end };
      }

      if (filters.dateRange === "last-30-days") {
        const { start, end } = getDateWindow("last-30-days");
        return { type: "preset", start, end };
      }

      return "all";
    })();

    return records.filter((row) => {
      const q = search.trim().toLowerCase();
      const searchMatch =
        !q ||
        [
          row.id,
          row.transactionId,
          row.destinationName,
          row.vendorName,
          row.invoiceNumber,
          row.shipmentMode,
          row.status,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(q),
        );
      const destinationMatch =
        filters.destination === "all" ||
        String(row.destinationId) === String(filters.destination);
      const vendorMatch =
        filters.vendor === "all" ||
        String(row.vendorId) === String(filters.vendor);
      const statusMatch =
        filters.status === "all" ||
        String(row.status || "").toLowerCase() ===
          String(filters.status).toLowerCase();
      const dateMatch = isWithinRange(
        row.confirmedAt || row.createdAt || row.invoiceDate,
        range,
      );

      return (
        searchMatch &&
        destinationMatch &&
        vendorMatch &&
        statusMatch &&
        dateMatch
      );
    });
  }, [filters, records, search]);

  const tableData = useMemo(
    () => mapRecordsToTable(filteredRecords),
    [filteredRecords],
  );

  const handleNext = async () => {
    if (!form.destination) return alert("Please select a destination");
    if (!form.vendor) return alert("Please select a vendor");
    if (form.vendor === ALL_VENDOR_ANALYSIS)
      return alert(
        "All Vendors is only for analysis. Please select one vendor before creating PO.",
      );
    if (vendorCreditDays > 0 && !form.payment_due_date)
      return alert("Please select a payment due date");
    if (paymentDueDateInvalid)
      return alert(`Payment due date cannot be after ${maximumPaymentDueDate}`);

    setSaving(true);
    try {
      const created =
        selectedSuggestionItems.length > 0
          ? await createSuggestedPurchaseOrder({
              storeId: form.destination,
              vendorId: form.vendor,
              invoiceDate: form.invoice_date || null,
              expectedDeliveryDate: form.expected_delivery_date || null,
              paymentDueDate: form.payment_due_date || null,
              shipmentMode: form.shipment_mode || null,
              invoiceNumber: form.invoice_number || null,
              ccEmails: form.cc_emails || null,
              source: "store_suggestions",
              items: selectedSuggestionItems.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                qty: Number(item.suggestedQty || 0),
                costPrice: Number(item.costPrice || 0),
                mrp: Number(item.mrp || 0),
                sellingPrice: Number(item.sellingPrice || 0),
                expiryDate: item.expiryDate || null,
                variantKey: item.variantKey,
                brandName: item.brandName || "",
                barcode: item.barcode || "",
                currentStock: Number(item.currentStock || 0),
                lastGrnDate: item.lastGrnDate || null,
                lastGrnQty: Number(item.lastGrnQty || 0),
                avgDailySales: Number(item.avgDailySales || 0),
                sale22To30: Number(item.sale22To30 || 0),
                sale15To21: Number(item.sale15To21 || 0),
                sale8To14: Number(item.sale8To14 || 0),
                sale1To7: Number(item.sale1To7 || 0),
                mbq: Number(item.mbq || 0),
                demandIds: item.demandIds || [],
              })),
            })
          : await createPurchaseOrder(form);
      setShowModal(false);
      router.push(
        `/purchase/purchase-orders/line-items?id=${encodeURIComponent(created.id)}`,
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFromRequisition = async () => {
    if (!reqForm.requisitionId) return alert("Please select a requisition");
    if (!reqForm.vendorId) return alert("Please select a vendor");

    setReqSaving(true);
    try {
      const res = await fetch("/api/purchase-orders/from-requisition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(reqForm),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to create PO from requisition");
      setShowReqModal(false);
      router.push(
        `/purchase/purchase-orders/line-items?id=${encodeURIComponent(data.id)}`,
      );
    } catch (err) {
      alert(err.message || "Failed to create PO from requisition");
    } finally {
      setReqSaving(false);
    }
  };

  const handleDownloadPoTemplate = async () => {
    const rows =
      selectedSuggestionItems.length > 0
        ? selectedSuggestionItems.map((item) => ({
            "Destination ID": form.destination || item.storeId || "",
            "Destination Name":
              stores.find(
                (store) => String(store.id) === String(form.destination),
              )?.name ||
              item.storeName ||
              "",
            "Vendor ID":
              form.vendor && form.vendor !== ALL_VENDOR_ANALYSIS
                ? form.vendor
                : item.vendorId || "",
            "Vendor Name":
              form.vendor && form.vendor !== ALL_VENDOR_ANALYSIS
                ? vendors.find(
                    (vendor) => String(vendor.id) === String(form.vendor),
                  )?.name || ""
                : item.vendorName || "",
            "Product ID": item.productId,
            "Product Name": item.productName,
            Barcode: item.barcode || "",
            SKU: item.sku || "",
            Brand: item.brandName || "",
            Qty: Number(item.suggestedQty || 0),
            "Cost Price": Number(item.costPrice || 0),
            MRP: Number(item.mrp || 0),
            "Selling Price": Number(item.sellingPrice || 0),
            "Expiry Date": item.expiryDate || "",
            "Invoice Date": form.invoice_date || "",
            "Expected Delivery Date": form.expected_delivery_date || "",
            "Payment Due Date": form.payment_due_date || "",
            "Shipment Mode": form.shipment_mode || "",
            "Invoice Number": form.invoice_number || "",
            "CC Emails": form.cc_emails || "",
          }))
        : [
            Object.fromEntries(
              PO_TEMPLATE_HEADERS.map((header) => [header, ""]),
            ),
          ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: PO_TEMPLATE_HEADERS,
    });
    worksheet["!cols"] = PO_TEMPLATE_HEADERS.map((header) => ({
      wch: Math.max(14, Math.min(28, header.length + 4)),
    }));
    const optionGroups = [
      {
        key: "stores",
        values: stores
          .map((store) => String(store.name || "").trim())
          .filter(Boolean),
      },
      {
        key: "vendors",
        values: vendors
          .map((vendor) => String(vendor.name || "").trim())
          .filter(Boolean),
      },
    ];
    const columnIndex = (header) => PO_TEMPLATE_HEADERS.indexOf(header);
    const validations = [
      {
        range: `${XLSX.utils.encode_col(columnIndex("Destination Name"))}2:${XLSX.utils.encode_col(columnIndex("Destination Name"))}${PO_TEMPLATE_ROW_LIMIT}`,
        formula: poOptionRangeFormula(optionGroups, "stores"),
      },
      {
        range: `${XLSX.utils.encode_col(columnIndex("Vendor Name"))}2:${XLSX.utils.encode_col(columnIndex("Vendor Name"))}${PO_TEMPLATE_ROW_LIMIT}`,
        formula: poOptionRangeFormula(optionGroups, "vendors"),
      },
    ].filter((validation) => validation.formula);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Order");
    if (optionGroups.some((group) => group.values.length)) {
      XLSX.utils.book_append_sheet(
        workbook,
        buildOptionsSheet(optionGroups),
        OPTIONS_SHEET_NAME,
      );
      hideOptionsSheet(workbook);
    }
    const fileName = `purchase-order-template-${new Date().toISOString().slice(0, 10)}.xlsx`;
    if (validations.length) {
      await saveWorkbookWithValidations(workbook, fileName, validations);
    } else {
      XLSX.writeFile(workbook, fileName);
    }
  };

  const handleDownloadAllStoresProducts = async () => {
    setSaving(true);
    try {
      const [allProducts, storeLookup, vendorLookup] = await Promise.all([
        fetchAllStoresAssignedProducts(),
        fetchLookup("/api/stores").then(normalizeStores),
        fetchLookup("/api/vendors").then(normalizeVendors),
      ]);
      if (!allProducts.length) {
        throw new Error("No assigned products found for accessible stores.");
      }

      setStores(storeLookup);
      setVendors(vendorLookup);
      const rows = allProducts.map((item) => ({
        "STORE ID": String(item.storeId || ""),
        "STORE NAME": item.storeName || "",
        "VENDOR ID": String(item.vendorId || ""),
        "VENDOR NAME": item.vendorName || "",
        "PRODUCT ID": String(item.productId || ""),
        BRAND: item.brandName || "",
        "ITEM NAME": item.productName || "",
        BARCODE: String(item.barcode || ""),
        MRP: Number(item.mrp || 0),
        CP: Number(item.costPrice || 0),
        SP: Number(item.sellingPrice || 0),
        "EXPIRY DATE": toExcelDate(item.expiryDate),
        "STOCK LEVEL": Number(item.currentStock || 0),
        "LAST GRN DONE ON": toExcelDate(item.lastGrnDate),
        "LAST GRN QTY": Number(item.lastGrnQty || 0),
        "AVERAGE SELLING RATIO OF 30DAYS": Number(item.avgDailySales || 0),
        "22 TO 30 SALE": Number(item.sale22To30 || 0),
        "15 TO 21 SALE": Number(item.sale15To21 || 0),
        "8 TO 14 SALE": Number(item.sale8To14 || 0),
        "1 TO 7 SALE": Number(item.sale1To7 || 0),
        MBQ: Number(item.mbq || 0),
        // This is deliberately the only blank input column in this sheet.
        // A zero here used to look prefilled and was easy to upload by mistake.
        "REQUIRED QTY": "",
      }));
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows, {
        header: ALL_STORES_REORDER_HEADERS,
        cellDates: true,
      });
      applyAllStoresSheetFormats(worksheet, rows.length);
      worksheet["!cols"] = ALL_STORES_REORDER_HEADERS.map((header) => ({
        wch: Math.max(10, Math.min(32, header.length + 3)),
      }));
      worksheet["!autofilter"] = {
        ref: `A1:${XLSX.utils.encode_col(ALL_STORES_REORDER_HEADERS.length - 1)}${rows.length + 1}`,
      };
      XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Order");
      // Store/vendor/product values are authoritative, prefilled values for
      // this export. Avoid injecting dropdown XML here: apart from allowing a
      // row to be redirected to the wrong store, malformed validation XML was
      // also making desktop Excel repair the downloaded workbook.
      XLSX.writeFile(
        workbook,
        `all-stores-purchase-order-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (error) {
      alert(error.message || "Unable to download all-store product sheet.");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPoTemplate = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaving(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!rows.length) throw new Error("Template is empty.");
      const storeByName = new Map(
        stores.map((store) => [
          String(store.name || "")
            .trim()
            .toLowerCase(),
          String(store.id),
        ]),
      );
      const vendorByName = new Map(
        vendors.map((vendor) => [
          String(vendor.name || "")
            .trim()
            .toLowerCase(),
          String(vendor.id),
        ]),
      );
      const groups = new Map();
      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const storeName = String(
          row["Destination Name"] || row["STORE NAME"] || "",
        ).trim();
        const vendorName = String(
          row["Vendor Name"] || row["VENDOR NAME"] || "",
        ).trim();
        const storeId = String(
          row["Destination ID"] ||
            row["STORE ID"] ||
            (storeName ? storeByName.get(storeName.toLowerCase()) : "") ||
            form.destination ||
            "",
        ).trim();
        const vendorId = String(
          row["Vendor ID"] ||
            row["VENDOR ID"] ||
            (vendorName ? vendorByName.get(vendorName.toLowerCase()) : "") ||
            "",
        ).trim();
        const productId = Number(row["Product ID"] || row["PRODUCT ID"] || 0);
        const rawQty = String(
          row.Qty ?? row["REQUIRED QTY"] ?? row["REQ QTY"] ?? "",
        ).trim();
        const qty = Number(rawQty || 0);
        if (!rawQty || qty === 0) return;
        if (!storeId)
          throw new Error(`Row ${rowNumber}: Destination ID is required.`);
        if (!vendorId)
          throw new Error(`Row ${rowNumber}: Vendor ID is required.`);
        if (!productId)
          throw new Error(`Row ${rowNumber}: Product ID is required.`);
        if (!(qty > 0))
          throw new Error(`Row ${rowNumber}: Qty must be greater than 0.`);
        const key = `${storeId}:${vendorId}`;
        const current = groups.get(key) || {
          storeId,
          vendorId,
          invoiceDate:
            row["Invoice Date"] ||
            row["INVOICE DATE"] ||
            form.invoice_date ||
            null,
          expectedDeliveryDate:
            row["Expected Delivery Date"] ||
            row["EXPECTED DELIVERY DATE"] ||
            form.expected_delivery_date ||
            null,
          paymentDueDate:
            row["Payment Due Date"] ||
            row["PAYMENT DUE DATE"] ||
            form.payment_due_date ||
            null,
          shipmentMode:
            row["Shipment Mode"] ||
            row["SHIPMENT MODE"] ||
            form.shipment_mode ||
            null,
          invoiceNumber:
            row["Invoice Number"] ||
            row["INVOICE NUMBER"] ||
            form.invoice_number ||
            null,
          ccEmails:
            row["CC Emails"] || row["CC EMAILS"] || form.cc_emails || null,
          source: "po_template_upload",
          items: [],
        };
        current.items.push({
          productId,
          productName: row["Product Name"] || row["ITEM NAME"] || "",
          qty,
          costPrice: Number(row["Cost Price"] || row.CP || 0),
          mrp: Number(row.MRP || 0),
          sellingPrice: Number(row["Selling Price"] || row.SP || 0),
          expiryDate: row["Expiry Date"] || row["EXPIRY DATE"] || null,
          brandName: row.Brand || row.BRAND || "",
          barcode: row.Barcode || row.BARCODE || "",
          sku: row.SKU || "",
        });
        groups.set(key, current);
      });
      if (!groups.size) {
        throw new Error(
          "Enter Required Qty for at least one product before upload.",
        );
      }
      const created = [];
      for (const payload of groups.values()) {
        created.push(await createSuggestedPurchaseOrder(payload));
      }
      alert(`Created ${created.length} purchase order(s) from template.`);
      if (created[0]?.id) {
        router.push(
          `/purchase/purchase-orders/line-items?id=${encodeURIComponent(created[0].id)}`,
        );
      }
    } catch (error) {
      alert(error.message || "Unable to upload purchase order template.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDraft = async (record) => {
    const label =
      record.transactionId || `PO-${String(record.id).padStart(4, "0")}`;
    if (!confirm(`Delete draft ${label}?`)) return;

    try {
      await deletePurchaseOrder(record.id);
      setRecords((current) =>
        current.filter((item) => String(item.id) !== String(record.id)),
      );
    } catch (err) {
      alert(err.message || "Failed to delete purchase order");
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Purchase</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">Purchase Orders</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">
            Purchase Order
          </h1>
        </div>

        {(() => {
          if (!canManagePO) return null;
          return (
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                ref={poTemplateInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleUploadPoTemplate}
              />
              <button
                onClick={handleDownloadPoTemplate}
                className="flex items-center gap-2 rounded-lg border border-green-300 px-4 py-2 text-[13px] font-medium text-green-700 transition-colors hover:bg-green-50"
              >
                <i className="ti ti-download text-[16px]" />
                Download Template
              </button>
              <button
                onClick={handleDownloadAllStoresProducts}
                className="flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-[13px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                disabled={saving}
                title="Download every assigned product for every accessible store"
              >
                <i className="ti ti-building-store text-[16px]" />
                All Stores Product Sheet
              </button>
              <button
                onClick={() => poTemplateInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-amber-300 px-4 py-2 text-[13px] font-medium text-amber-700 transition-colors hover:bg-amber-50"
                disabled={saving}
              >
                <i className="ti ti-upload text-[16px]" />
                Upload Template
              </button>
              <button
                onClick={handleOpenReqModal}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 text-[13px] font-medium text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <i className="ti ti-file-document text-[16px]" />
                Create PO Using Requisition
              </button>
              <button
                onClick={() => router.push("/purchase/grn/create")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300 text-[13px] font-medium text-green-600 hover:bg-green-50 transition-colors"
              >
                <i className="ti ti-box text-[16px]" />
                Create GRN
              </button>
              <button
                onClick={handleOpen}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <i className="ti ti-plus text-[16px]" />
                Create Purchase Order
              </button>
            </div>
          );
        })()}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-gray-800">
              Date Range:
            </label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg text-[12px] bg-white text-gray-800"
              value={draftFilters.dateRange}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, dateRange: e.target.value })
              }
            >
              <option value="all">All Records</option>
              <option value="last-7-days">Last 7 Days</option>
              <option value="last-30-days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          {draftFilters.dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={draftFilters.customStart}
                onChange={(e) =>
                  setDraftFilters({
                    ...draftFilters,
                    customStart: e.target.value,
                  })
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-[12px] bg-white text-gray-800"
              />
              <span className="text-gray-700 text-[12px] font-medium">to</span>
              <input
                type="date"
                value={draftFilters.customEnd}
                onChange={(e) =>
                  setDraftFilters({
                    ...draftFilters,
                    customEnd: e.target.value,
                  })
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-[12px] bg-white text-gray-800"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-gray-800">
              Destination:
            </label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg text-[12px] bg-white text-gray-800"
              value={draftFilters.destination}
              onChange={(e) =>
                setDraftFilters({
                  ...draftFilters,
                  destination: e.target.value,
                })
              }
            >
              <option value="all">ALL</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-gray-800">
              Status:
            </label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg text-[12px] bg-white text-gray-800"
              value={draftFilters.status}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, status: e.target.value })
              }
            >
              <option value="all">All</option>
              <option value="draft">draft</option>
              <option value="confirmed">confirmed</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-gray-800">
              Vendor:
            </label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg text-[12px] bg-white text-gray-800"
              value={draftFilters.vendor}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, vendor: e.target.value })
              }
            >
              <option value="all">ALL</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleApplyFilters}
            className="px-4 py-2 rounded-lg bg-blue-600 text-[12px] font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-[340px] bg-gray-50 rounded-lg px-3 py-2">
            <i className="ti ti-search text-gray-400 text-[16px]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-gray-100">
                {tableHeaders.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td
                    colSpan={tableHeaders.length}
                    className="px-4 py-14 text-center text-[14px] text-gray-500"
                  >
                    Loading records...
                  </td>
                </tr>
              ) : tableData.length > 0 ? (
                tableData.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors"
                  >
                    {tableHeaders.map((header, colIdx) => (
                      <td
                        key={colIdx}
                        className="px-4 py-3 text-[13px] text-gray-700"
                      >
                        {header === "Purchase Order ID" ? (
                          <button
                            onClick={() =>
                              router.push(
                                `/purchase/purchase-orders/line-items?id=${encodeURIComponent(filteredRecords[rowIdx].id)}`,
                              )
                            }
                            className="text-blue-600 hover:underline font-medium text-left"
                          >
                            {row[header]}
                          </button>
                        ) : header === "Actions" ? (
                          String(
                            filteredRecords[rowIdx]?.status || "",
                          ).toLowerCase() === "draft" && canManagePO ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteDraft(filteredRecords[rowIdx])
                              }
                              className="p-1.5 rounded text-red-600 hover:bg-red-50"
                              title="Delete draft"
                            >
                              <i className="ti ti-trash text-[16px]" />
                            </button>
                          ) : (
                            "-"
                          )
                        ) : (
                          displayText(row[header])
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={tableHeaders.length}
                    className="px-4 py-14 text-center text-[14px] text-blue-700 font-medium"
                  >
                    No Records Found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 text-[12px] text-gray-400">
          <select className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-[12px] text-gray-600">
            <option>10</option>
            <option>20</option>
            <option>50</option>
          </select>
          <span>Showing {tableData.length} Results</span>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-stretch">
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
          <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-white shadow-2xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-8 py-5">
              <h3 className="text-lg font-semibold text-gray-900">
                Create Purchase Order
              </h3>
              <button
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                onClick={handleClose}
              >
                <i className="ti ti-x text-[18px]" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto bg-slate-50 px-8 py-6">
              <section className="rounded-xl border border-gray-300 bg-white p-5 shadow-sm">
                <h4 className="text-sm text-blue-700 font-semibold mb-3">
                  Basic Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12px] text-gray-700">
                      Destination *
                    </label>
                    <select
                      value={form.destination}
                      onChange={(e) =>
                        setForm({ ...form, destination: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select Destination</option>
                      {loadingLookups ? (
                        <option>Loading...</option>
                      ) : (
                        stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="mt-1.5 text-xs text-amber-600 font-medium">
                      Note: Store destinations are allowed for Purchase Orders.
                      Direct stock-in to stores without a PO remains restricted.
                    </p>
                  </div>

                  <div>
                    <label className="text-[12px] text-gray-700">
                      Vendor *
                    </label>
                    <select
                      value={form.vendor}
                      onChange={(e) => {
                        const vendorId = e.target.value;
                        const vendor = vendors.find(
                          (item) => String(item.id) === String(vendorId),
                        );
                        const creditDays = Number(vendor?.credit_days || 0);
                        setForm({
                          ...form,
                          vendor: vendorId,
                          payment_due_date:
                            creditDays > 0
                              ? addCalendarDays(getIndiaDate(), creditDays)
                              : "",
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select Vendor</option>
                      <option value={ALL_VENDOR_ANALYSIS}>
                        All Vendors (for analysis)
                      </option>
                      {loadingLookups ? (
                        <option>Loading...</option>
                      ) : (
                        vendors.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[12px] text-gray-700">
                      Invoice Date
                    </label>
                    <input
                      type="date"
                      value={form.invoice_date}
                      onChange={(e) =>
                        setForm({ ...form, invoice_date: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[12px] text-gray-700">
                      Expected Delivery Date
                    </label>
                    <input
                      type="date"
                      value={form.expected_delivery_date}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          expected_delivery_date: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[12px] text-gray-700">
                      Payment Due Date {vendorCreditDays > 0 ? "*" : ""}
                    </label>
                    <input
                      type="date"
                      min={poDate}
                      max={maximumPaymentDueDate || undefined}
                      value={form.payment_due_date}
                      onChange={(e) =>
                        setForm({ ...form, payment_due_date: e.target.value })
                      }
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none ${
                        paymentDueDateInvalid
                          ? "border-red-500"
                          : "border-gray-300 focus:border-blue-500"
                      }`}
                    />
                    {vendorCreditDays > 0 && (
                      <p
                        className={`mt-1 text-[11px] ${
                          paymentDueDateInvalid
                            ? "text-red-600"
                            : "text-gray-500"
                        }`}
                      >
                        Payment must be completed within {vendorCreditDays}{" "}
                        days. Latest allowed date: {maximumPaymentDueDate}.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-[12px] text-gray-700">
                      Shipment Mode
                    </label>
                    <input
                      value={form.shipment_mode}
                      onChange={(e) =>
                        setForm({ ...form, shipment_mode: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                      placeholder="Enter shipment mode"
                    />
                  </div>

                  <div>
                    <label className="text-[12px] text-gray-700">
                      Invoice Number
                    </label>
                    <input
                      value={form.invoice_number}
                      onChange={(e) =>
                        setForm({ ...form, invoice_number: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                      placeholder="Invoice number"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-gray-300 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="text-sm text-blue-700 font-semibold">
                      Suggested Products for Selected Store
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Based on low stock, fast movement, and customer demand.
                      Cost shown here uses the latest confirmed stock-transfer
                      cost for this store.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAllStoreProducts((value) => !value)}
                      className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      {showAllStoreProducts
                        ? "Show suggestions only"
                        : "Show all assigned products"}
                    </button>
                    {suggestions.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedSuggestions(
                            selectedSuggestions.length === suggestions.length
                              ? []
                              : suggestions.map((row) =>
                                  String(row.variantKey),
                                ),
                          )
                        }
                        className="text-[12px] font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {selectedSuggestions.length === suggestions.length
                          ? "Clear all"
                          : "Select all"}
                      </button>
                    )}
                  </div>
                </div>
                {!form.destination ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-[12px] text-gray-500">
                    Select a destination store first to load suggestions.
                  </div>
                ) : suggestionsLoading ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-[12px] text-gray-500">
                    Loading store suggestions...
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-[12px] text-gray-500">
                    {showAllStoreProducts
                      ? "No active product assignment found for this store/vendor."
                      : "No low-stock, fast-moving, or customer-demand suggestion found for this store."}
                  </div>
                ) : (
                  <div className="max-h-[260px] overflow-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[1500px] text-[12px]">
                      <thead className="sticky top-0 bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Pick</th>
                          <th className="px-3 py-2 text-left">Product</th>
                          <th className="px-3 py-2 text-left">Brand</th>
                          <th className="px-3 py-2 text-right">MRP</th>
                          <th className="px-3 py-2 text-right">CP</th>
                          <th className="px-3 py-2 text-right">SP</th>
                          <th className="px-3 py-2 text-left">Expiry</th>
                          <th className="px-3 py-2 text-right">Stock</th>
                          <th className="px-3 py-2 text-left">Last GRN</th>
                          <th className="px-3 py-2 text-right">Last GRN Qty</th>
                          <th className="px-3 py-2 text-right">Avg/day 30d</th>
                          <th className="px-3 py-2 text-right">22-30</th>
                          <th className="px-3 py-2 text-right">15-21</th>
                          <th className="px-3 py-2 text-right">8-14</th>
                          <th className="px-3 py-2 text-right">1-7</th>
                          <th className="px-3 py-2 text-right">MBQ</th>
                          <th className="px-3 py-2 text-right">Req Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suggestions.map((item) => (
                          <tr
                            key={item.variantKey}
                            className="border-t border-gray-100"
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedSuggestions.includes(
                                  String(item.variantKey),
                                )}
                                onChange={() =>
                                  toggleSuggestion(item.variantKey)
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-gray-900">
                                {item.productName}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                SKU: {item.sku || "-"} · Barcode:{" "}
                                {item.barcode || "-"}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {item.brandName || "-"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Number(item.mrp || 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Number(item.costPrice || 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Number(item.sellingPrice || 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2">
                              {item.expiryDate
                                ? formatDate(item.expiryDate)
                                : "-"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {item.currentStock}
                            </td>
                            <td className="px-3 py-2">
                              {item.lastGrnDate
                                ? formatDate(item.lastGrnDate)
                                : "-"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {item.lastGrnQty || 0}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Number(item.avgDailySales || 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {item.sale22To30 || 0}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {item.sale15To21 || 0}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {item.sale8To14 || 0}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {item.sale1To7 || 0}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {item.mbq || 0}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {item.suggestedQty}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {selectedSuggestionItems.length > 0 && (
                  <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[12px] font-semibold text-blue-700">
                    {selectedSuggestionItems.length} suggested product(s) will
                    be added directly to this PO. Uncheck products if manager
                    wants a blank PO.
                  </div>
                )}
              </section>
              <section className="rounded-xl border border-gray-300 bg-white p-5 shadow-sm">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-[12px] text-gray-700">
                      CC Email
                    </label>
                    <textarea
                      value={form.cc_emails}
                      onChange={(e) =>
                        setForm({ ...form, cc_emails: e.target.value })
                      }
                      className="mt-1 w-full min-h-[120px] rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500 resize-none"
                      placeholder="Press enter to add multiple emails"
                    />
                  </div>
                </div>
              </section>

              <div className="sticky bottom-0 -mx-8 flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-8 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
                <button
                  className="rounded-lg border border-green-200 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50"
                  onClick={handleDownloadPoTemplate}
                  type="button"
                >
                  Download Template
                </button>
                <button
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white"
                  onClick={handleClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white"
                  onClick={handleNext}
                  disabled={saving}
                >
                  {saving ? "Creating..." : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReqModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowReqModal(false)}
          />
          <div className="relative w-full max-w-2xl rounded-lg border border-gray-300 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Create PO Using Requisition
              </h3>
              <button
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                onClick={() => setShowReqModal(false)}
              >
                <i className="ti ti-x text-[18px]" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <label className="block">
                <span className="mb-1 block text-[12px] text-gray-700">
                  Approved Requisition <span className="text-red-500">*</span>
                </span>
                <select
                  value={reqForm.requisitionId}
                  onChange={(event) =>
                    setReqForm({
                      ...reqForm,
                      requisitionId: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800"
                >
                  <option value="">Select requisition</option>
                  {requisitions.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.transactionId} - {req.destinationName} -{" "}
                      {req.totalItems} items
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] text-gray-700">
                  Vendor <span className="text-red-500">*</span>
                </span>
                <select
                  value={reqForm.vendorId}
                  onChange={(event) =>
                    setReqForm({ ...reqForm, vendorId: event.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800"
                >
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              {requisitions.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  No approved requisitions available. Create and approve a stock
                  requisition first.
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowReqModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFromRequisition}
                  disabled={reqSaving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {reqSaving ? "Creating..." : "Create PO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
