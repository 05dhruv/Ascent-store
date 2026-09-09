"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import CatalogListPage from "@/components/CatalogListPage";
import SearchableMultiSelect from "@/components/SearchableMultiSelect";
import {
  OPTIONS_SHEET_NAME,
  addOptionNamedRanges,
  applyTextFormatToColumns,
  buildOptionsSheet,
  hideOptionsSheet,
  optionFormula,
  saveWorkbookWithValidations,
} from "@/lib/xlsxDropdowns";

const BULK_ASSIGN_HEADERS = [
  "Product ID",
  "Product Code",
  "Product Name",
  "Barcode",
  "SKU",
  "Brand",
  "Category",
  "Safe Stock Level",
  "Low Stock Level",
  "M.R.P",
  "Franchise Cost",
  "Selling Price",
  "Sell on Store",
];
const BULK_ASSIGN_TEXT_HEADERS = [
  "Product ID",
  "Product Code",
  "Barcode",
  "SKU",
];

const columns = [
  { key: "sno", label: "S. No.", sortable: true },
  { key: "product_id", label: "Product ID", sortable: true },
  { key: "brand_name", label: "Brand", sortable: true },
  { key: "product_name", label: "Product Name", sortable: true },
  { key: "barcode", label: "Barcode", sortable: true },
  { key: "sku", label: "SKU", sortable: true },
  { key: "store_stock_qty", label: "Store Stock", sortable: true },
  { key: "vendor_name", label: "Vendor", sortable: true },
  { key: "vendor_location", label: "Vendor Location", sortable: true },
  { key: "safe_stock_level", label: "Safe Stock Level", sortable: true },
  { key: "low_stock_level", label: "Low Stock Level", sortable: true },
  { key: "mrp", label: "M.R.P", sortable: true },
  { key: "franchise_cost", label: "Franchise Cost", sortable: true },
  { key: "selling_price", label: "Selling Price", sortable: true },
  { key: "sell_on_store", label: "Sell on Store", sortable: true },
];

function mapRows(records = []) {
  return records.map((item, index) => ({
    id: item.id,
    sno: index + 1,
    product_id: item.product_id || item.id,
    brand_id: item.brand_id || "",
    brand_name: item.brand_name || "-",
    product_name: item.name,
    barcode: item.barcode || "-",
    sku: item.sku || "-",
    store_stock_qty: Number(item.store_stock_qty || 0),
    vendor_name: item.vendor_name || "-",
    vendor_location:
      item.vendor_location ||
      [item.vendor_city, item.vendor_state].filter(Boolean).join(", ") ||
      "-",
    safe_stock_level: item.safe_stock_level ?? 0,
    low_stock_level: item.low_stock_level ?? 0,
    mrp: item.store_mrp ?? item.mrp ?? 0,
    franchise_cost: item.franchise_cost ?? 0,
    selling_price: item.store_selling_price ?? item.selling_price ?? 0,
    sell_on_store: item.is_assigned ? "Yes" : "No",
    is_assigned: Boolean(item.is_assigned),
  }));
}

function safeFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export default function AssignProductsToStorePage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [storesList, setStoresList] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [catalogScope, setCatalogScope] = useState("assigned");
  const [loading, setLoading] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState({
    mrp: "",
    selling_price: "",
    is_assigned: true,
  });
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Bulk Edit States
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkBrandIds, setBulkBrandIds] = useState([]);
  const [bulkCategoryIds, setBulkCategoryIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSheetRows, setBulkSheetRows] = useState([]);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkNotice, setBulkNotice] = useState(null);
  const bulkFileRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [storesRes, brandsRes, categoriesRes] = await Promise.all([
          fetch("/api/stores"),
          fetch("/api/catalog/brands?pageSize=5000"),
          fetch("/api/catalog/categories?pageSize=5000"),
        ]);
        const [storesJson, brandsJson, categoriesJson] = await Promise.all([
          storesRes.json(),
          brandsRes.json(),
          categoriesRes.json(),
        ]);
        if (storesJson.success)
          setStoresList(
            storesJson.data.stores || storesJson.data.records || [],
          );
        if (brandsJson.success)
          setBrands(brandsJson.data.records || []);
        if (categoriesJson.success)
          setCategories(categoriesJson.data.records || []);
      } catch (e) {
        /* ignore */
      }
    })();
  }, []);

  const loadStoreProducts = async (storeId, scope = catalogScope) => {
    if (!storeId) return setRows([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/assign-products-store?storeId=${encodeURIComponent(storeId)}&scope=${encodeURIComponent(scope)}`);
      const json = await res.json();
      setRows(json.success ? mapRows(json.data.records || []) : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStoreChange = async (storeId) => {
    setSelectedStoreId(storeId || "");
    setEditingRow(null);
    setCatalogScope("assigned");
    if (!storeId) {
      setRows([]);
      return;
    }
    await loadStoreProducts(storeId, "assigned");
  };

  const handleEdit = (row) => {
    if (!selectedStoreId) return alert("Select a store first");
    setEditingRow(row);
    setEditForm({
      mrp: String(row.mrp ?? ""),
      selling_price: String(row.selling_price ?? ""),
      is_assigned: Boolean(row.is_assigned),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRow || !selectedStoreId || saving) return;
    const mrp = Number(editForm.mrp);
    const sellingPrice = Number(editForm.selling_price);
    if (
      editForm.is_assigned &&
      (!Number.isFinite(mrp) ||
        !Number.isFinite(sellingPrice) ||
        mrp < 0 ||
        sellingPrice < 0)
    ) {
      return alert("Enter valid MRP and Selling Price");
    }
    const costPrice = Number(editingRow.franchise_cost || 0);
    if (editForm.is_assigned && sellingPrice > mrp) {
      return alert("Selling Price MRP se zyada nahi ho sakta.");
    }
    if (editForm.is_assigned && costPrice > mrp) {
      return alert(
        `MRP Franchise Cost/CP (${costPrice}) se kam nahi ho sakta. Pehle CP ya MRP correct karein.`,
      );
    }
    setSaving(true);
    const res = await fetch("/api/catalog/assign-products-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: editingRow.id,
        storeId: selectedStoreId,
        assign: editForm.is_assigned,
        ...(editForm.is_assigned ? { mrp, selling_price: sellingPrice } : {}),
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || !json.success) {
      const fieldMessage = Array.isArray(json.errors)
        ? json.errors.map((error) => error?.message).filter(Boolean).join("; ")
        : "";
      return alert(
        fieldMessage || json.message || "Failed to update product assignment",
      );
    }
    setEditingRow(null);
    await loadStoreProducts(selectedStoreId);
  };

  const handleBulkCreate = () =>
    router.push("/catalog/pricing/assign-products-store/assignbulk");

  const handleDownloadExcel = async () => {
    if (!selectedStoreId) return alert("Select a store first");
    if (!rows.length) return alert("No products available to download");
    const XLSX = await import("xlsx");
    const selectedStore = storesList.find(
      (store) => String(store.id) === String(selectedStoreId),
    );
    const exportRows = rows.map((row, index) => ({
      "S. No.": index + 1,
      "Product ID": row.id || "",
      "Product Code": row.product_id || "",
      Brand: row.brand_name === "-" ? "" : row.brand_name,
      "Product Name": row.product_name || "",
      Barcode: row.barcode === "-" ? "" : row.barcode,
      SKU: row.sku === "-" ? "" : row.sku,
      "Store Stock": Number(row.store_stock_qty || 0),
      Vendor: row.vendor_name === "-" ? "" : row.vendor_name,
      "Vendor Location": row.vendor_location === "-" ? "" : row.vendor_location,
      "Safe Stock Level": Number(row.safe_stock_level || 0),
      "Low Stock Level": Number(row.low_stock_level || 0),
      "M.R.P": Number(row.mrp || 0),
      "Franchise Cost": Number(row.franchise_cost || 0),
      "Selling Price": Number(row.selling_price || 0),
      "Sell on Store": row.sell_on_store || "No",
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(exportRows),
      "Products",
    );
    const suffix = safeFilePart(selectedStore?.name || selectedStoreId);
    XLSX.writeFile(
      workbook,
      `assign-products-store${suffix ? `-${suffix}` : ""}.xlsx`,
    );
  };

  const handleBulkEditClick = () => {
    if (!selectedStoreId) return alert("Select a store first");
    setBulkBrandIds([]);
    setBulkCategoryIds([]);
    setBulkSheetRows([]);
    setBulkPreview(null);
    setBulkNotice(null);
    setShowBulkModal(true);
  };

  const closeBulkEdit = () => {
    if (bulkBusy) return;
    setShowBulkModal(false);
    setBulkSheetRows([]);
    setBulkPreview(null);
    setBulkNotice(null);
  };

  const downloadBulkEditSheet = async () => {
    if (!bulkBrandIds.length && !bulkCategoryIds.length)
      return alert("Select at least one brand or category first");
    setBulkBusy(true);
    setBulkNotice(null);
    try {
      const params = new URLSearchParams({
        storeId: String(selectedStoreId),
        scope: "all",
        brand_ids: bulkBrandIds.join(","),
        category_ids: bulkCategoryIds.join(","),
      });
      const response = await fetch(
        `/api/catalog/assign-products-store?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success)
        throw new Error(json.message || "Failed to fetch products");
      const products = json.data?.records || [];
      if (!products.length)
        throw new Error("No products found for the selected brands");

      const XLSX = await import("xlsx");
      const exportRows = products.map((product) => ({
        "Product ID": String(product.id || ""),
        "Product Code": String(product.product_id || ""),
        "Product Name": product.name || "",
        Barcode: String(product.barcode || ""),
        SKU: String(product.sku || ""),
        Brand: product.brand_name || "",
        Category: product.category_name || "",
        "Safe Stock Level": Number(product.safe_stock_level || 0),
        "Low Stock Level": Number(product.low_stock_level || 0),
        "M.R.P": Number(product.store_mrp ?? product.mrp ?? 0),
        "Franchise Cost": Number(product.franchise_cost || 0),
        "Selling Price": Number(
          product.store_selling_price ?? product.selling_price ?? 0,
        ),
        "Sell on Store": product.is_assigned ? "Yes" : "No",
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportRows, {
        header: BULK_ASSIGN_HEADERS,
      });
      worksheet["!cols"] = BULK_ASSIGN_HEADERS.map((header) => ({
        wch:
          header === "Product Name"
            ? 34
            : ["Barcode", "SKU", "Product Code"].includes(header)
              ? 18
              : Math.max(12, header.length + 2),
      }));
      worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      const rowLimit = Math.max(products.length + 1, 5001);
      applyTextFormatToColumns(
        worksheet,
        BULK_ASSIGN_HEADERS,
        BULK_ASSIGN_TEXT_HEADERS,
        rowLimit,
      );
      const optionGroups = [
        {
          key: "sell_on_store",
          name: "StoreAssignmentSellOnStore",
          values: ["Yes", "No"],
        },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Store Assignments");
      XLSX.utils.book_append_sheet(
        workbook,
        buildOptionsSheet(optionGroups),
        OPTIONS_SHEET_NAME,
      );
      addOptionNamedRanges(workbook, optionGroups);
      hideOptionsSheet(workbook);
      const sellColumn = XLSX.utils.encode_col(
        BULK_ASSIGN_HEADERS.indexOf("Sell on Store"),
      );
      const selectedBrands = brands.filter((brand) =>
        bulkBrandIds.includes(String(brand.id)),
      );
      const selectedCategories = categories.filter((category) =>
        bulkCategoryIds.includes(String(category.id)),
      );
      const brandSuffix =
        !selectedBrands.length
          ? ""
          : selectedBrands.length === 1
            ? safeFilePart(selectedBrands[0].name)
            : `${bulkBrandIds.length}-brands`;
      const categorySuffix =
        !selectedCategories.length
          ? ""
          : selectedCategories.length === 1
            ? safeFilePart(selectedCategories[0].name)
            : `${bulkCategoryIds.length}-categories`;
      const filterSuffix = [brandSuffix, categorySuffix]
        .filter(Boolean)
        .join("-");
      const store = storesList.find(
        (item) => String(item.id) === String(selectedStoreId),
      );
      await saveWorkbookWithValidations(
        workbook,
        `assign-products-store-bulk-edit-${safeFilePart(store?.name || selectedStoreId)}-${filterSuffix}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        [
          {
            range: `${sellColumn}2:${sellColumn}${rowLimit}`,
            formula: optionFormula(optionGroups, "sell_on_store"),
          },
        ],
      );
    } catch (error) {
      alert(error.message || "Failed to download edit sheet");
    } finally {
      setBulkBusy(false);
    }
  };

  const uploadBulkEditSheet = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBulkBusy(true);
    setBulkSheetRows([]);
    setBulkPreview(null);
    setBulkNotice(null);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: true,
      });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const uploadedRows = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
      });
      if (!uploadedRows.length)
        throw new Error("Uploaded sheet has no product rows");

      const response = await fetch("/api/catalog/assign-products-store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStoreId,
          rows: uploadedRows,
          preview: true,
        }),
      });
      const responseText = await response.text();
      const json = (() => {
        try {
          return JSON.parse(responseText);
        } catch {
          return {};
        }
      })();
      if (!response.ok || !json.success)
        throw new Error(
          json.message ||
            (response.status === 413
              ? "Edited sheet is too large to upload"
              : `Failed to read edited sheet (HTTP ${response.status})`),
        );
      const preview = json.data || {};
      setBulkSheetRows(uploadedRows);
      setBulkPreview(preview);
      setBulkNotice({
        type: preview.skipped ? "warning" : "success",
        message: `Review ready: ${preview.changed || 0} changed, ${preview.unchanged || 0} unchanged, ${preview.skipped || 0} skipped.`,
      });
    } catch (error) {
      setBulkNotice({
        type: "error",
        message: error.message || "Failed to upload edited sheet",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulkEdit = async () => {
    if (!bulkSheetRows.length || !bulkPreview?.changed) return;
    setBulkBusy(true);
    setBulkNotice(null);
    try {
      const response = await fetch("/api/catalog/assign-products-store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStoreId,
          rows: bulkSheetRows,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success)
        throw new Error(json.message || "Failed to update assignments");
      alert(
        `Store assignments updated: ${json.data?.updated || 0} updated, ${json.data?.unchanged || 0} unchanged, ${json.data?.skipped || 0} skipped.`,
      );
      setBulkBusy(false);
      setShowBulkModal(false);
      setBulkSheetRows([]);
      setBulkPreview(null);
      setBulkNotice(null);
      await handleStoreChange(selectedStoreId);
    } catch (error) {
      setBulkNotice({
        type: "error",
        message: error.message || "Failed to update assignments",
      });
      setBulkBusy(false);
    }
  };

  const bulkEditModal = showBulkModal ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/55 px-4 py-6 sm:py-8">
      <div className="flex max-h-[min(92vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-gray-100 bg-white px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Bulk Edit Product Assignments
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Download assignments for selected brands or categories, edit the
            Excel, then upload it here. Only matched and changed rows will be
            updated for the selected store.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {bulkNotice && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                bulkNotice.type === "success"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : bulkNotice.type === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {bulkNotice.message}
            </div>
          )}

          {!bulkPreview ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Download edit sheet
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Select one or more brands, categories, or both. When both are
                  selected, the sheet includes products matching both filters.
                </p>
                <div className="mt-3 grid gap-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SearchableMultiSelect
                      values={bulkBrandIds}
                      onChange={setBulkBrandIds}
                      placeholder="Select brands"
                      searchPlaceholder="Search brands..."
                      selectionNoun="brands"
                      disabled={bulkBusy}
                      options={brands.map((brand) => ({
                        value: String(brand.id),
                        label: brand.name,
                      }))}
                    />
                    <SearchableMultiSelect
                      values={bulkCategoryIds}
                      onChange={setBulkCategoryIds}
                      placeholder="Select categories"
                      searchPlaceholder="Search categories..."
                      selectionNoun="categories"
                      disabled={bulkBusy}
                      options={categories.map((category) => ({
                        value: String(category.id),
                        label: category.name,
                      }))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={downloadBulkEditSheet}
                    disabled={bulkBusy}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Download Edit Sheet
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Upload edited sheet
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Product ID is preferred for matching. Product Code, Barcode,
                  or SKU will be used as fallback.
                </p>
                <input
                  ref={bulkFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={uploadBulkEditSheet}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => bulkFileRef.current?.click()}
                  disabled={bulkBusy}
                  className="mt-3 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulkBusy ? "Processing..." : "Upload Edited Excel"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                  <p className="text-xs font-medium text-green-700">
                    Changed
                  </p>
                  <p className="text-2xl font-bold text-green-900">
                    {bulkPreview.changed || 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium text-slate-600">
                    Unchanged
                  </p>
                  <p className="text-2xl font-bold text-slate-900">
                    {bulkPreview.unchanged || 0}
                  </p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs font-medium text-red-700">Skipped</p>
                  <p className="text-2xl font-bold text-red-900">
                    {bulkPreview.skipped || 0}
                  </p>
                </div>
              </div>

              <div className="max-h-[48vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                {(bulkPreview.rows || []).slice(0, 120).map((row) => (
                  <div
                    key={`${row.row}-${row.productId || row.barcode}`}
                    className={`rounded-xl border px-3 py-2 ${
                      row.status === "changed"
                        ? "border-green-200 bg-green-50/80"
                        : row.status === "skipped"
                          ? "border-red-200 bg-red-50/80"
                          : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Row {row.row}: {row.productName || "-"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Barcode/SKU: {row.barcode || "-"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${
                          row.status === "changed"
                            ? "bg-green-100 text-green-700"
                            : row.status === "skipped"
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {row.status === "changed"
                          ? "Edited"
                          : row.status === "skipped"
                            ? "Warning"
                            : "Non-edited"}
                      </span>
                    </div>
                    {row.error && (
                      <p className="mt-2 text-xs font-medium text-red-700">
                        {row.error}
                      </p>
                    )}
                    {row.changes?.length > 0 && (
                      <div className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                        {row.changes.map((change) => (
                          <p key={`${row.row}-${change.field}`}>
                            <span className="font-semibold">
                              {change.label}:
                            </span>{" "}
                            {String(change.from)} -&gt; {String(change.to)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {(bulkPreview.rows || []).length > 120 && (
                  <p className="text-center text-xs text-slate-500">
                    Showing the first 120 rows. Confirm will process all rows.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-3 sm:px-6">
          <div className="flex flex-wrap justify-end gap-2">
            {bulkPreview && (
              <button
                type="button"
                onClick={() => {
                  setBulkSheetRows([]);
                  setBulkPreview(null);
                  setBulkNotice(null);
                }}
                disabled={bulkBusy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
            )}
            {!bulkPreview && (
              <button
                type="button"
                onClick={closeBulkEdit}
                disabled={bulkBusy}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Close
              </button>
            )}
            {bulkPreview && (
              <button
                type="button"
                onClick={confirmBulkEdit}
                disabled={bulkBusy || !(bulkPreview.changed > 0)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkBusy ? "Updating..." : "Confirm Update"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const editModal = editingRow ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Edit Store Pricing
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {editingRow.product_name}
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={editForm.is_assigned}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  is_assigned: event.target.checked,
                }))
              }
              className="h-4 w-4 accent-blue-600"
            />
            Sell on selected store
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              MRP
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.mrp}
                disabled={!editForm.is_assigned}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    mrp: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Selling Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.selling_price}
                disabled={!editForm.is_assigned}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    selling_price: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={() => setEditingRow(null)}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <CatalogListPage
        breadcrumbs={[
          { label: "Catalog", href: "/catalog" },
          { label: "Pricing", href: "/catalog/pricing" },
          { label: "Assign products to store" },
        ]}
        title="Assign Product To Store"
        description="Map products to stores and edit store-wise MRP/SP Need Help?"
        createLabel={"Bulk Create"}
        onCreateClick={handleBulkCreate}
        extraHeaderButtons={
          <>
            <button
              type="button"
              onClick={() => {
                const nextScope = catalogScope === "assigned" ? "all" : "assigned";
                setCatalogScope(nextScope);
                loadStoreProducts(selectedStoreId, nextScope);
              }}
              disabled={!selectedStoreId}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50 sm:w-auto"
            >
              {catalogScope === "assigned" ? "Show All Catalog" : "Show Assigned Only"}
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 sm:w-auto"
            >
              Download Excel
            </button>
            <button
              type="button"
              onClick={handleBulkEditClick}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:w-auto"
            >
              Bulk Edit
            </button>
          </>
        }
        bulkImportType={"products"}
        onImportSuccess={() => setRows([])}
        bulkOperations={false}
        showStoreSelector={true}
        selectorLabel={null}
        selectorPlaceholder="None"
        stores={storesList}
        onStoreChange={handleStoreChange}
        columns={columns}
        rows={rows}
        loading={loading}
        totalLabel="Product(s)"
        emptyMessage="No Records Found"
        showRowActions={true}
        onEdit={handleEdit}
      />

      {mounted && editModal ? createPortal(editModal, document.body) : null}
      {mounted && bulkEditModal
        ? createPortal(bulkEditModal, document.body)
        : null}
    </>
  );
}
