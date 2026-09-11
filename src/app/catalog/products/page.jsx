"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import CatalogDataPage from "@/components/CatalogDataPage";
import SearchableMultiSelect from "@/components/SearchableMultiSelect";
import SearchableSelect from "@/components/SearchableSelect";
import { useUser } from "@/hooks/useUser";
import { fetchAllCatalogProducts } from "@/lib/productPagination";
import {
  OPTIONS_SHEET_NAME,
  addOptionNamedRanges,
  buildOptionsSheet,
  hideOptionsSheet,
  optionFormula,
  saveWorkbookWithValidations,
  sortOptions,
  uniqueOptions,
} from "@/lib/xlsxDropdowns";

const columns = [
  { key: "sno", label: "S. No.", sortable: true },
  { key: "image", label: "Image", sortable: false },
  { key: "name", label: "Material Name", sortable: true },
  { key: "barcode", label: "Barcode", sortable: true },
  { key: "category", label: "Category", sortable: true },
  { key: "brand", label: "Brand", sortable: true },
  { key: "hsn", label: "HSN / SAC", sortable: true },
  { key: "gst", label: "GST", sortable: true },
  { key: "mrp", label: "Reference Rate", sortable: true },
  { key: "costPrice", label: "Cost Price", sortable: true },
  { key: "sellingPrice", label: "Issue Rate", sortable: true },
  { key: "stock", label: "Stock", sortable: true },
];

const UNIT_OPTIONS = [
  "PCS", "NOS", "BAG", "KG", "MT", "CUM", "CFT", "MTR", "SQM", "RMT", "LTR", "SET", "ROLL",
];
const INVENTORY_METHOD_OPTIONS = ["direct", "indirect"];
const STOCK_ITEM_TYPE_OPTIONS = ["unbatched", "batched"];
// This is a UI-only value. It is deliberately never sent as a store ID.
const ALL_ASSIGNED_STORES_VALUE = "__all_assigned_stores__";
const ASCENT_TEMPLATE_HEADERS = [
  "Material Name",
  "Opening Quantity",
  "Estimated Rate / Unit",
  "Opening Material Value",
  "Unit of Measure",
  "Specification / Grade",
];
const BULK_EDIT_HEADERS = [
  "Product ID",
  "Product Name",
  "Description",
  "Image URL",
  "Barcode",
  "SKU",
  "Brand ID",
  "Brand",
  "Category ID",
  "Category",
  "Department ID",
  "Department",
  "Tax ID",
  "Tax",
  "MRP",
  "Cost Price",
  "Selling Price",
  "Unit",
  "Status",
  "Price Includes Tax",
  "Allow Discount On POS",
  "Inventory Method",
  "Stock Item Type",
];

const initialBulkValues = {
  category_id: "",
  brand_id: "",
  department_id: "",
  tax_id: "",
  mrp: "",
  selling_price: "",
  cost_price: "",
  unit: "PCS",
  is_active: "true",
  allow_discount_on_pos: "false",
  include_tax: "false",
  inventory_method: "direct",
  stock_item_type: "unbatched",
};

const bulkFieldLabels = {
  category_id: "Category",
  brand_id: "Brand",
  department_id: "Department",
  tax_id: "Tax",
  mrp: "MRP",
  selling_price: "Selling Price",
  cost_price: "Cost Price",
  unit: "Unit",
  is_active: "Status",
  allow_discount_on_pos: "Allow Discount On POS",
  include_tax: "Price Includes Tax",
  inventory_method: "Inventory Method",
  stock_item_type: "Stock Item Type",
};

function getInitialQueryParam(key) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) || "";
}

function getInitialStoreFilter() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("all_assigned_stores") === "true"
    ? ALL_ASSIGNED_STORES_VALUE
    : params.get("store_id") || "";
}

async function fetchCatalogOptions(path, fallback = []) {
  try {
    const response = await fetch(
      `${path}${path.includes("?") ? "&" : "?"}pageSize=5000`,
      {
        cache: "no-store",
      },
    );
    const json = await response.json().catch(() => ({}));
    return json.success ? json.data?.records || [] : fallback;
  } catch {
    return fallback;
  }
}

function formatPriceRange(minimum, maximum, fallback) {
  const hasPriceRange =
    minimum !== null &&
    minimum !== undefined &&
    minimum !== "" &&
    maximum !== null &&
    maximum !== undefined &&
    maximum !== "";
  const min = Number(minimum);
  const max = Number(maximum);
  const value = Number(fallback);
  const withPricePrecision = (price) =>
    Number.isFinite(price) ? price.toFixed(5) : "0.00000";
  // PostgreSQL returns null when a product has no active batch. Number(null)
  // becomes 0 in JavaScript, which must not override product-master pricing.
  if (!(hasPriceRange && min > 0 && max > 0)) {
    return `${String.fromCharCode(8377)}${withPricePrecision(value)}`;
  }
  return min === max
    ? `${String.fromCharCode(8377)}${withPricePrecision(min)}`
    : `${String.fromCharCode(8377)}${withPricePrecision(min)}-${String.fromCharCode(8377)}${withPricePrecision(max)}`;
}

export default function ProductsPage() {
  const { user, loading: userLoading } = useUser();
  const [departmentId, setDepartmentId] = useState(() =>
    getInitialQueryParam("department_id"),
  );
  const [brandId, setBrandId] = useState(() =>
    getInitialQueryParam("brand_id"),
  );
  const [categoryId, setCategoryId] = useState(() =>
    getInitialQueryParam("category_id"),
  );
  const [departments, setDepartments] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(getInitialStoreFilter);
  const [warehouseId, setWarehouseId] = useState(() =>
    getInitialQueryParam("warehouse_id"),
  );
  // A Super Admin always has global store access. Requiring a literal "*"
  // permission here incorrectly treated some Super Admin profiles as store
  // restricted and replaced their selected store with the first assigned one
  // after returning from Product Edit.
  const hasGlobalStoreAccess = Boolean(
    user?.role === "super_admin" ||
      user?.system_role === "super_admin" ||
      user?.permissions?.includes("*"),
  );
  const isStoreRestricted = Boolean(user && !hasGlobalStoreAccess);
  const assignedStoreIds = useMemo(
    () => (user?.assigned_stores || []).map(String),
    [user?.assigned_stores],
  );
  const visibleStores = useMemo(
    () =>
      isStoreRestricted
        ? stores.filter((store) => assignedStoreIds.includes(String(store.id)))
        : stores,
    [assignedStoreIds, isStoreRestricted, stores],
  );
  const storeOptions = useMemo(
    () =>
      isStoreRestricted
        ? [
            {
              value: ALL_ASSIGNED_STORES_VALUE,
              label: "All assigned stores",
            },
            ...visibleStores.map((store) => ({
              value: store.id,
              label: store.name,
            })),
          ]
        : visibleStores.map((store) => ({
            value: store.id,
            label: store.name,
          })),
    [isStoreRestricted, visibleStores],
  );
  const canManageCatalog = Boolean(
    user?.permissions?.includes("*") ||
      user?.permissions?.includes("MANAGE_CATALOG"),
  );

  useEffect(() => {
    if (userLoading || !isStoreRestricted) return;
    if (!assignedStoreIds.length) return;
    setWarehouseId("");
    if (
      storeId !== ALL_ASSIGNED_STORES_VALUE &&
      (!storeId || !assignedStoreIds.includes(String(storeId)))
    ) {
      setStoreId(assignedStoreIds[0]);
    }
  }, [assignedStoreIds, isStoreRestricted, storeId, userLoading]);
  const [templateWarehouseOpen, setTemplateWarehouseOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditSaving, setBulkEditSaving] = useState(false);
  const [bulkEditIds, setBulkEditIds] = useState([]);
  const [bulkEditValues, setBulkEditValues] = useState(initialBulkValues);
  const [bulkEditFields, setBulkEditFields] = useState({});
  const [bulkActionContext, setBulkActionContext] = useState(null);
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);
  const [bulkSheetBusy, setBulkSheetBusy] = useState(false);
  const [bulkSheetBrandIds, setBulkSheetBrandIds] = useState([]);
  const [bulkSheetRows, setBulkSheetRows] = useState([]);
  const [bulkSheetPreview, setBulkSheetPreview] = useState(null);
  const [bulkSheetNotice, setBulkSheetNotice] = useState(null);
  const bulkSheetFileRef = useRef(null);
  const defaultTemplateDownloadRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [deptRes, brandRes, catRes, taxRes, storesRes] = await Promise.all([
          fetch("/api/catalog/departments?pageSize=200"),
          fetch("/api/catalog/brands?pageSize=5000"),
          fetch("/api/catalog/categories?pageSize=200"),
          fetch("/api/catalog/taxes?pageSize=200"),
          fetch("/api/stores"),
        ]);
        const deptJson = await deptRes.json();
        const brandJson = await brandRes.json();
        const catJson = await catRes.json();
        const taxJson = await taxRes.json();
        const storesJson = await storesRes.json();
        if (deptJson.success) setDepartments(deptJson.data.records || []);
        if (brandJson.success) setBrands(brandJson.data.records || []);
        if (catJson.success) setCategories(catJson.data.records || []);
        if (taxJson.success) setTaxes(taxJson.data.records || []);
        if (storesJson.success) setStores(storesJson.data?.stores || storesJson.data?.records || []);
      } catch {
        setDepartments([]);
        setBrands([]);
        setCategories([]);
        setTaxes([]);
      }
    })();
  }, []);

  useEffect(() => {
    fetch("/api/catalog/products/ascent-template", { cache: "no-store" })
      .then((response) => response.json())
      .then((json) =>
        setWarehouses(json.success ? json.data?.records || [] : []),
      )
      .catch(() => setWarehouses([]));
  }, []);

  const filters = useMemo(
    () => (
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Warehouse
          </label>
          <SearchableSelect
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder={isStoreRestricted ? "Store access only" : "ALL"}
            searchPlaceholder="Search warehouse..."
            disabled={isStoreRestricted}
            options={warehouses.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Store</label>
          <SearchableSelect
            value={storeId}
            onChange={(value) => {
              if (isStoreRestricted && !value) return;
              setStoreId(value);
            }}
            placeholder={isStoreRestricted ? "Select assigned store" : "ALL"}
            searchPlaceholder="Search store..."
            options={storeOptions}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Department
          </label>
          <SearchableSelect
            value={departmentId}
            onChange={setDepartmentId}
            placeholder="ALL"
            searchPlaceholder="Search department..."
            options={departments.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Brand
          </label>
          <SearchableSelect
            value={brandId}
            onChange={setBrandId}
            placeholder="ALL"
            searchPlaceholder="Search brand..."
            options={brands.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Category
          </label>
          <SearchableSelect
            value={categoryId}
            onChange={setCategoryId}
            placeholder="ALL"
            searchPlaceholder="Search category..."
            options={categories.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </div>
      </div>
    ),
    [
      brandId,
      brands,
      categoryId,
      categories,
      departmentId,
      departments,
      warehouseId,
      warehouses,
      storeId,
      storeOptions,
      isStoreRestricted,
    ],
  );

  const resetBulkEdit = () => {
    setBulkEditValues(initialBulkValues);
    setBulkEditFields({});
  };

  const openBulkEdit = ({ selectedIds, showToast, refresh }) => {
    setBulkEditIds(selectedIds);
    setBulkActionContext({ showToast, refresh });
    setBulkSheetOpen(true);
    setBulkSheetBrandIds([]);
    setBulkSheetRows([]);
    setBulkSheetPreview(null);
    setBulkSheetNotice(null);
  };

  const mapProductToBulkEditRow = (product) => ({
    "Product ID": product.id || "",
    "Product Name": product.name || "",
    Description: product.description || "",
    "Image URL": product.image_url || "",
    Barcode: product.barcode || "",
    SKU: product.sku || "",
    "Brand ID": product.brand_id || "",
    Brand: product.brand_name || "",
    "Category ID": product.category_id || "",
    Category: product.category_name || "",
    "Department ID": product.department_id || "",
    Department: product.department_name || "",
    "Tax ID": product.tax_id || "",
    Tax: product.tax_name || "",
    MRP: product.mrp ?? 0,
    "Cost Price": product.cost_price ?? 0,
    "Selling Price": product.selling_price ?? product.mrp ?? 0,
    Unit: product.unit || "PCS",
    Status: product.is_active === false ? "Inactive" : "Active",
    "Price Includes Tax": product.include_tax ? "Yes" : "No",
    "Allow Discount On POS": product.allow_discount_on_pos ? "Yes" : "No",
    "Inventory Method": product.inventory_method || "direct",
    "Stock Item Type": product.stock_item_type || "unbatched",
  });

  const selectedWarehouse = warehouses.find(
    (warehouse) => String(warehouse.id) === String(warehouseId),
  );
  const isAscentWarehouse = !!selectedWarehouse?.isAscent;

  const downloadAscentTemplate = async (targetWarehouseId = warehouseId) => {
    if (!targetWarehouseId) {
      bulkActionContext?.showToast?.("Select Ascent warehouse first", "error");
      return;
    }
    setBulkSheetBusy(true);
    try {
      const response = await fetch(
        `/api/catalog/products/ascent-template?warehouse_id=${encodeURIComponent(targetWarehouseId)}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success)
        throw new Error(
          json.message || json.error || "Unable to prepare Ascent template",
        );
      const existingRows = (json.data?.records || []).map((row) => [
        row.name,
        row.quantity,
        row.rate,
        row.value,
        row.unit,
        row.size,
      ]);
      const rowCount = Math.max(existingRows.length + 100, 101);
      const rows = [ASCENT_TEMPLATE_HEADERS, ...existingRows];
      while (rows.length < rowCount) rows.push(["", "", "", "", "", ""]);
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      for (let index = 2; index <= rowCount; index += 1) {
        worksheet[`D${index}`] = { t: "n", f: `B${index}*C${index}` };
      }
      worksheet["!cols"] = [
        { wch: 36 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 12 },
        { wch: 18 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Ascent Products");
      XLSX.writeFile(
        workbook,
        `ascent-product-update-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      bulkActionContext?.showToast?.("Ascent template downloaded");
    } catch (error) {
      bulkActionContext?.showToast?.(
        error.message || "Failed to download Ascent template",
        "error",
      );
    } finally {
      setBulkSheetBusy(false);
    }
  };

  const openTemplateWarehousePicker = (downloadDefaultTemplate) => {
    defaultTemplateDownloadRef.current = downloadDefaultTemplate;
    setTemplateWarehouseOpen(true);
  };

  const chooseTemplateWarehouse = async (warehouse) => {
    setWarehouseId(String(warehouse.id));
    setTemplateWarehouseOpen(false);
    if (warehouse.isAscent) {
      await downloadAscentTemplate(warehouse.id);
      return;
    }
    defaultTemplateDownloadRef.current?.();
  };

  const downloadBulkEditSheet = async ({ brandOnly = false } = {}) => {
    if (brandOnly && !bulkSheetBrandIds.length) {
      bulkActionContext?.showToast?.(
        "Select at least one brand first",
        "error",
      );
      return;
    }

    setBulkSheetBusy(true);
    try {
      const products = await fetchAllCatalogProducts({
        pageSize: 1000,
        params: {
          brand_ids: brandOnly ? bulkSheetBrandIds.join(",") : "",
        },
        fetchOptions: { cache: "no-store" },
      });
      if (!products.length) {
        bulkActionContext?.showToast?.(
          "No products found to download",
          "error",
        );
        return;
      }

      const [freshBrands, freshCategories, freshDepartments, freshTaxes] =
        await Promise.all([
          fetchCatalogOptions("/api/catalog/brands", brands),
          fetchCatalogOptions("/api/catalog/categories", categories),
          fetchCatalogOptions("/api/catalog/departments", departments),
          fetchCatalogOptions("/api/catalog/taxes", taxes),
        ]);

      const worksheet = XLSX.utils.json_to_sheet(
        products.map(mapProductToBulkEditRow),
        { header: BULK_EDIT_HEADERS },
      );
      worksheet["!cols"] = BULK_EDIT_HEADERS.map((header) => ({
        wch:
          header === "Product Name"
            ? 34
            : header === "Description"
              ? 40
              : header === "Image URL"
                ? 48
                : ["Barcode", "SKU"].includes(header)
                  ? 18
                  : Math.max(12, Math.min(24, header.length + 2)),
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Product Master");
      const optionGroups = [
        {
          key: "brands",
          name: "ProductMasterBrands",
          values: sortOptions(
            uniqueOptions(freshBrands.map((item) => item.name)),
          ),
        },
        {
          key: "categories",
          name: "ProductMasterCategories",
          values: sortOptions(
            uniqueOptions(freshCategories.map((item) => item.name)),
          ),
        },
        {
          key: "departments",
          name: "ProductMasterDepartments",
          values: sortOptions(
            uniqueOptions(freshDepartments.map((item) => item.name)),
          ),
        },
        {
          key: "taxes",
          name: "ProductMasterTaxes",
          values: sortOptions(
            uniqueOptions(freshTaxes.map((item) => item.name)),
          ),
        },
        {
          key: "units",
          name: "ProductMasterUnits",
          values: UNIT_OPTIONS,
        },
        {
          key: "status",
          name: "ProductMasterStatus",
          values: ["Active", "Inactive", "true", "false"],
        },
        {
          key: "yes_no",
          name: "ProductMasterYesNo",
          values: ["Yes", "No", "true", "false"],
        },
        {
          key: "inventory_methods",
          name: "ProductMasterInventoryMethods",
          values: INVENTORY_METHOD_OPTIONS,
        },
        {
          key: "stock_item_types",
          name: "ProductMasterStockItemTypes",
          values: STOCK_ITEM_TYPE_OPTIONS,
        },
      ];
      const rowLimit = Math.max(products.length + 1, 5001);
      const validations = [
        ["Brand", "brands"],
        ["Category", "categories"],
        ["Department", "departments"],
        ["Tax", "taxes"],
        ["Unit", "units"],
        ["Status", "status"],
        ["Price Includes Tax", "yes_no"],
        ["Allow Discount On POS", "yes_no"],
        ["Inventory Method", "inventory_methods"],
        ["Stock Item Type", "stock_item_types"],
      ]
        .map(([header, optionKey]) => {
          const columnIndex = BULK_EDIT_HEADERS.indexOf(header);
          const formula = optionFormula(optionGroups, optionKey);
          if (columnIndex < 0 || !formula) return null;
          const column = XLSX.utils.encode_col(columnIndex);
          return { range: `${column}2:${column}${rowLimit}`, formula };
        })
        .filter(Boolean);
      XLSX.utils.book_append_sheet(
        workbook,
        buildOptionsSheet(optionGroups),
        OPTIONS_SHEET_NAME,
      );
      addOptionNamedRanges(workbook, optionGroups);
      hideOptionsSheet(workbook);
      const selectedBrands = brands.filter((brand) =>
        bulkSheetBrandIds.includes(String(brand.id)),
      );
      const suffix = !brandOnly
        ? "full"
        : selectedBrands.length === 1
          ? selectedBrands[0].name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
          : `${bulkSheetBrandIds.length}-brands`;
      await saveWorkbookWithValidations(
        workbook,
        `product-master-bulk-edit-${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        validations,
      );
      bulkActionContext?.showToast?.("Bulk edit sheet downloaded");
    } catch (err) {
      bulkActionContext?.showToast?.(
        err.message || "Failed to download bulk edit sheet",
        "error",
      );
    } finally {
      setBulkSheetBusy(false);
    }
  };

  const uploadBulkEditSheet = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBulkSheetBusy(true);
    setBulkSheetRows([]);
    setBulkSheetPreview(null);
    setBulkSheetNotice(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
      });
      if (!rows.length) {
        setBulkSheetNotice({
          type: "error",
          message: "Uploaded sheet has no product rows",
        });
        return;
      }

      if (isAscentWarehouse) {
        const response = await fetch("/api/catalog/products/ascent-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ warehouse_id: warehouseId, rows }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success)
          throw new Error(
            json.message || json.error || "Failed to upload Ascent template",
          );
        bulkActionContext?.refresh?.();
        setBulkSheetNotice({
          type: "success",
          message: `${json.data?.processed || rows.length} Ascent product(s) saved.`,
        });
        return;
      }

      const response = await fetch("/api/catalog/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, preview: true }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setBulkSheetNotice({
          type: "error",
          message:
            json.message || json.error || "Failed to read bulk edit sheet",
        });
        return;
      }

      const data = json.data || {};
      setBulkSheetRows(rows);
      setBulkSheetPreview(data);
      setBulkSheetNotice({
        type: data.skipped ? "warning" : "success",
        message: `Review ready: ${data.changed || 0} changed, ${data.unchanged || 0} unchanged, ${data.skipped || 0} skipped.`,
      });
    } catch (err) {
      setBulkSheetNotice({
        type: "error",
        message: err.message || "Failed to upload bulk edit sheet",
      });
    } finally {
      setBulkSheetBusy(false);
    }
  };

  const confirmBulkEditUpload = async () => {
    if (!bulkSheetRows.length) return;
    setBulkSheetBusy(true);
    setBulkSheetNotice(null);
    try {
      const response = await fetch("/api/catalog/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bulkSheetRows }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setBulkSheetNotice({
          type: "error",
          message:
            json.message || json.error || "Failed to update product master",
        });
        return;
      }

      const data = json.data || {};
      setBulkSheetPreview(data);
      setBulkSheetRows([]);
      bulkActionContext?.refresh?.();
      bulkActionContext?.showToast?.(
        `Product master updated successfully: ${data.updated || 0} updated, ${data.unchanged || 0} unchanged, ${data.skipped || 0} skipped.`,
      );
      closeBulkSheet();
    } catch (err) {
      setBulkSheetNotice({
        type: "error",
        message: err.message || "Failed to update product master",
      });
    } finally {
      setBulkSheetBusy(false);
    }
  };

  const closeBulkSheet = () => {
    setBulkSheetOpen(false);
    setBulkSheetRows([]);
    setBulkSheetPreview(null);
    setBulkSheetNotice(null);
  };

  const closeBulkReview = () => {
    setBulkSheetRows([]);
    setBulkSheetPreview(null);
    setBulkSheetNotice(null);
  };

  const setBulkField = (key, value) => {
    setBulkEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleBulkField = (key) => {
    setBulkEditFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleBulkEditSave = async () => {
    const updates = {};
    Object.entries(bulkEditFields).forEach(([key, enabled]) => {
      if (!enabled) return;
      const value = bulkEditValues[key];
      updates[key] =
        key === "is_active" ||
        key === "allow_discount_on_pos" ||
        key === "include_tax"
          ? value === "true"
          : value;
    });

    if (!Object.keys(updates).length) {
      bulkActionContext?.showToast?.(
        "Choose at least one field to update",
        "error",
      );
      return;
    }

    setBulkEditSaving(true);
    try {
      const response = await fetch("/api/catalog/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: bulkEditIds, updates }),
      });
      const json = await response.json();

      if (!json.success) {
        bulkActionContext?.showToast?.(
          json.message || "Failed to update selected products",
          "error",
        );
        return;
      }

      setBulkEditOpen(false);
      resetBulkEdit();
      bulkActionContext?.showToast?.(json.message || "Products updated");
      bulkActionContext?.refresh?.();
    } catch {
      bulkActionContext?.showToast?.(
        "Failed to update selected products",
        "error",
      );
    } finally {
      setBulkEditSaving(false);
    }
  };

  const renderBulkSelect = (key, options, placeholder) => (
    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={!!bulkEditFields[key]}
          onChange={() => toggleBulkField(key)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {bulkFieldLabels[key]}
      </label>
      <SearchableSelect
        value={bulkEditValues[key]}
        onChange={(value) => setBulkField(key, value)}
        placeholder={placeholder}
        searchPlaceholder={`Search ${bulkFieldLabels[key].toLowerCase()}...`}
        disabled={!bulkEditFields[key]}
        options={options.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
      />
    </div>
  );

  const renderBulkInput = (key, type = "text") => (
    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={!!bulkEditFields[key]}
          onChange={() => toggleBulkField(key)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {bulkFieldLabels[key]}
      </label>
      <input
        type={type}
        value={bulkEditValues[key]}
        onChange={(event) => setBulkField(key, event.target.value)}
        disabled={!bulkEditFields[key]}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "0.01" : undefined}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
      />
    </div>
  );

  const renderBulkNativeSelect = (key, options) => (
    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={!!bulkEditFields[key]}
          onChange={() => toggleBulkField(key)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {bulkFieldLabels[key]}
      </label>
      <select
        value={bulkEditValues[key]}
        onChange={(event) => setBulkField(key, event.target.value)}
        disabled={!bulkEditFields[key]}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      {templateWarehouseOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[1100] flex items-end bg-slate-950/55 sm:items-center sm:justify-center sm:p-4">
            <button
              type="button"
              aria-label="Close warehouse selection"
              className="absolute inset-0 cursor-default"
              onClick={() => setTemplateWarehouseOpen(false)}
            />
            <div className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Choose warehouse
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Select the warehouse for the product template.
                </p>
              </div>
              <div className="max-h-[58vh] space-y-2 overflow-y-auto p-4">
                {warehouses.map((warehouse) => (
                  <button
                    key={warehouse.id}
                    type="button"
                    onClick={() => chooseTemplateWarehouse(warehouse)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:border-blue-400 hover:bg-blue-50"
                  >
                    <span>{warehouse.name}</span>
                    <span className="shrink-0 text-xs font-medium text-slate-500">
                      {warehouse.isAscent
                        ? "Ascent template"
                        : "Normal template"}
                    </span>
                  </button>
                ))}
                {!warehouses.length && (
                  <p className="py-6 text-center text-sm text-slate-500">
                    No warehouse is assigned to you.
                  </p>
                )}
              </div>
              <div className="border-t border-slate-100 p-4">
                <button
                  type="button"
                  onClick={() => setTemplateWarehouseOpen(false)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {bulkEditOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Bulk Edit Products
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Updating {bulkEditIds.length} selected product(s). Only checked
                fields will be changed.
              </p>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
              {renderBulkSelect(
                "department_id",
                departments,
                "No change / Clear",
              )}
              {renderBulkSelect("category_id", categories, "No change / Clear")}
              {renderBulkSelect("brand_id", brands, "No change / Clear")}
              {renderBulkSelect("tax_id", taxes, "No change / Clear")}
              {renderBulkInput("mrp", "number")}
              {renderBulkInput("selling_price", "number")}
              {renderBulkInput("cost_price", "number")}
              {renderBulkNativeSelect(
                "unit",
                UNIT_OPTIONS.map((value) => ({ value, label: value })),
              )}
              {renderBulkNativeSelect("is_active", [
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ])}
              {renderBulkNativeSelect("allow_discount_on_pos", [
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
              ])}
              {renderBulkNativeSelect("include_tax", [
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
              ])}
              {renderBulkNativeSelect(
                "inventory_method",
                INVENTORY_METHOD_OPTIONS.map((value) => ({
                  value,
                  label: value,
                })),
              )}
              {renderBulkNativeSelect(
                "stock_item_type",
                STOCK_ITEM_TYPE_OPTIONS.map((value) => ({
                  value,
                  label: value,
                })),
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setBulkEditOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkEditSave}
                disabled={bulkEditSaving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkEditSaving ? "Updating..." : "Update Selected"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkSheetOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-slate-950/55 px-4 py-6 sm:py-8">
            <div className="flex max-h-[min(92vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
              <div className="shrink-0 border-b border-gray-100 bg-white px-5 py-4 sm:px-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  Bulk Edit Product Master
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {isAscentWarehouse
                    ? "Download the Ascent sheet, fill required values, then upload it here."
                    : "Download products, edit the Excel, then upload it here. Only matched and changed products will be updated."}
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                {bulkSheetNotice && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                      bulkSheetNotice.type === "success"
                        ? "border-green-200 bg-green-50 text-green-800"
                        : bulkSheetNotice.type === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {bulkSheetNotice.message}
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <h3 className="text-sm font-bold text-slate-900">
                    Download edit sheet
                  </h3>
                  {isAscentWarehouse ? (
                    <div className="mt-3 grid gap-3">
                      <button
                        type="button"
                        onClick={downloadAscentTemplate}
                        disabled={bulkSheetBusy}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Download Ascent update template
                      </button>
                      <p className="text-xs text-slate-500">
                        Required: Item Name, Quantity, Rate, Unit (PCS/PKT), and
                        Size. Value is calculated automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          downloadBulkEditSheet({ brandOnly: false })
                        }
                        disabled={bulkSheetBusy}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Download full product master
                      </button>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <SearchableMultiSelect
                          values={bulkSheetBrandIds}
                          onChange={setBulkSheetBrandIds}
                          placeholder="Select brands"
                          searchPlaceholder="Search brands..."
                          selectionNoun="brands"
                          options={brands.map((brand) => ({
                            value: String(brand.id),
                            label: brand.name,
                          }))}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            downloadBulkEditSheet({ brandOnly: true })
                          }
                          disabled={bulkSheetBusy}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {bulkSheetBrandIds.length > 1
                            ? `Download ${bulkSheetBrandIds.length} brands`
                            : "Brand Excel"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <h3 className="text-sm font-bold text-slate-900">
                    Upload edited sheet
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {isAscentWarehouse
                      ? "Required: Item Name, Quantity, Rate, Unit (PCS/PKT), and Size. Value is recalculated from Quantity × Rate."
                      : "Product ID is preferred for matching. Barcode or SKU will be used as fallback."}
                  </p>
                  <input
                    ref={bulkSheetFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={uploadBulkEditSheet}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => bulkSheetFileRef.current?.click()}
                    disabled={bulkSheetBusy}
                    className="mt-3 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {bulkSheetBusy ? "Processing..." : "Upload Edited Excel"}
                  </button>
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-3 sm:px-6">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeBulkSheet}
                    disabled={bulkSheetBusy}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {bulkSheetPreview &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/65 px-4 py-6 sm:py-8">
            <div className="flex max-h-[min(90vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
              <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Review Uploaded Sheet
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Check edited, non-edited, and warning rows before updating
                      product master.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeBulkReview}
                    disabled={bulkSheetBusy}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                {bulkSheetNotice && (
                  <div
                    className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
                      bulkSheetNotice.type === "success"
                        ? "border-green-200 bg-green-50 text-green-800"
                        : bulkSheetNotice.type === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {bulkSheetNotice.message}
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                    <p className="text-xs font-medium text-green-700">Edited</p>
                    <p className="text-2xl font-bold text-green-900">
                      {bulkSheetPreview.changed ||
                        bulkSheetPreview.updated ||
                        0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium text-slate-600">
                      Non-edited
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                      {bulkSheetPreview.unchanged || 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-xs font-medium text-red-700">
                      Warning / skipped
                    </p>
                    <p className="text-2xl font-bold text-red-900">
                      {bulkSheetPreview.skipped || 0}
                    </p>
                  </div>
                </div>

                <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {(bulkSheetPreview.rows || []).slice(0, 120).map((row) => (
                    <div
                      key={`${row.row}-${row.productId || row.barcode}`}
                      className={`rounded-xl border px-3 py-2 ${
                        row.status === "changed" || row.status === "updated"
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
                            row.status === "changed" || row.status === "updated"
                              ? "bg-green-100 text-green-700"
                              : row.status === "skipped"
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {row.status === "updated"
                            ? "Updated"
                            : row.status === "changed"
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
                          {row.changes.slice(0, 6).map((change) => (
                            <p key={`${row.row}-${change.field}`}>
                              <span className="font-semibold">
                                {change.label}:
                              </span>{" "}
                              {String(change.from)} -&gt; {String(change.to)}
                            </p>
                          ))}
                          {row.changes.length > 6 && (
                            <p className="font-medium text-slate-500">
                              +{row.changes.length - 6} more changes
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {(bulkSheetPreview.rows || []).length > 120 && (
                    <p className="text-center text-xs text-slate-500">
                      Showing first 120 rows. Confirm will process all rows.
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 sm:px-6">
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeBulkReview}
                    disabled={bulkSheetBusy}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  {bulkSheetRows.length > 0 && (
                    <button
                      type="button"
                      onClick={confirmBulkEditUpload}
                      disabled={
                        bulkSheetBusy || !(bulkSheetPreview.changed > 0)
                      }
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {bulkSheetBusy ? "Updating..." : "Confirm Update"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <CatalogDataPage
        endpoint="/api/catalog/products"
        breadcrumbs={[
          { label: "Catalog", href: "/catalog" },
          { label: "Product", href: "/catalog/products" },
          { label: "Products" },
        ]}
        title="Products"
        description="Manage all products in your catalog."
        columns={columns}
        filters={filters}
        createLabel={canManageCatalog ? "Create Product" : null}
        onCreateClick={
          canManageCatalog
            ? () => (window.location.href = "/catalog/products/create")
            : undefined
        }
        bulkOperations={canManageCatalog}
        showRowActions={canManageCatalog}
        onEdit={
          canManageCatalog
            ? (row, context = {}) => {
                // Build this from the current filter state, not only from the
                // URL. A user can select a store and immediately click Edit
                // before the list component has written that selection into
                // browser history.
                const returnParams = new URLSearchParams({
                  page: String(context.page || 1),
                  pageSize: String(context.pageSize || 10),
                });
                const currentParams = {
                  search: context.search,
                  store_id:
                    storeId === ALL_ASSIGNED_STORES_VALUE ? "" : storeId,
                  all_assigned_stores:
                    storeId === ALL_ASSIGNED_STORES_VALUE ? "true" : "",
                  warehouse_id: warehouseId,
                  department_id: departmentId,
                  brand_id: brandId,
                  category_id: categoryId,
                };
                Object.entries(currentParams).forEach(([key, value]) => {
                  if (value !== undefined && value !== null && String(value).trim()) {
                    returnParams.set(key, String(value));
                  }
                });
                const returnTo = `/catalog/products?${returnParams.toString()}`;
                window.location.href = `/catalog/products/${row.id}/edit?returnTo=${encodeURIComponent(returnTo)}`;
              }
            : undefined
        }
        onDelete={(row) => {
          /* delete handled by CatalogDataPage */
        }}
        totalLabel="Product(s)"
        emptyMessage="No products found"
        bulkImportType="products"
        onDownloadTemplate={openTemplateWarehousePicker}
        customBulkActions={canManageCatalog ? [
          {
            label: "Bulk Edit Selected",
            action: openBulkEdit,
          },
          {
            label: "View / Download Barcodes",
            action: ({ selectedIds, showToast }) => {
              if (!selectedIds.length) {
                showToast(
                  "Select products to view or download barcodes",
                  "error",
                );
                return;
              }
              window.open(
                `/catalog/products/barcodes?ids=${selectedIds.join(",")}`,
                "_blank",
              );
            },
          },
        ] : []}
        extraQueryParams={{
          department_id: departmentId,
          brand_id: brandId,
          category_id: categoryId,
          // Empty store_id makes the API use the current user's permitted stores.
          store_id:
            storeId === ALL_ASSIGNED_STORES_VALUE ? "" : storeId,
          all_assigned_stores:
            storeId === ALL_ASSIGNED_STORES_VALUE ? "true" : "",
          warehouse_id: warehouseId,
        }}
        mapRecord={(record, index, page, pageSize) => ({
          id: record.id,
          sno: (page - 1) * pageSize + index + 1,
          image: record.image_url ? (
            <img
              src={record.image_url}
              alt={record.name}
              className="w-10 h-10 object-cover rounded-lg border border-gray-200"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src =
                  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-300">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          ),
          name: record.name,
          barcode: record.barcode || "—",
          category: record.category_name || "—",
          brand: record.brand_name || "—",
          hsn: record.hsn_code || "—",
          gst: record.tax_name
            ? `${record.tax_name}${Number(record.tax_rate || 0) ? ` (${Number(record.tax_rate)}%)` : ""}`
            : Number(record.tax_rate || 0)
              ? `${Number(record.tax_rate)}%`
              : "—",
          mrp: formatPriceRange(record.min_mrp, record.max_mrp, record.mrp),
          costPrice: formatPriceRange(
            record.min_cost_price,
            record.max_cost_price,
            record.cost_price,
          ),
          sellingPrice: formatPriceRange(
            record.min_selling_price,
            record.max_selling_price,
            record.selling_price ?? record.mrp,
          ),
          stock: record.actual_stock ?? "—",
          unit: record.unit || "PCS",
        })}
      />
    </>
  );
}
