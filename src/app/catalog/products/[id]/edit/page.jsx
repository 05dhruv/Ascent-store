"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import SearchableSelect from "@/components/SearchableSelect";
import {
  prepareProductImageDataUrl,
  readJsonResponse,
} from "@/lib/clientImage";

const COLOR_OPTIONS = [
  { name: "Red", value: "#ef4444" },
  { name: "Navy", value: "#1A476C" },
  { name: "Green", value: "#539D62" },
  { name: "Orange", value: "#f97316" },
  { name: "Black", value: "#111827" },
  { name: "Gray", value: "#6b7280" },
];

const initialForm = {
  name: "",
  description: "",
  barcode: "",
  sku: "",
  hsn_code: "",
  category_id: "",
  sub_category_id: "",
  brand_id: "",
  manufacturer_id: "",
  department_id: "",
  tax_id: "",
  charge_id: "",
  mrp: "",
  selling_price: "",
  cost_price: "",
  unit: "PCS",
  length: "",
  width: "",
  height: "",
  dimension_unit: "MM",
  dimensions: "",
  weight_per_unit: "",
  is_active: true,
  is_service: false,
  is_sellable_on_pos: true,
  allow_variable_pricing: false,
  allow_discount_on_pos: false,
  include_tax: false,
  default_low_stock_value: "",
  minimum_base_quantity: "",
  inventory_method: "direct",
  stock_item_type: "unbatched",
  image_url: "",
};

const UNIT_OPTIONS = [
  "PCS",
  "BAGS",
  "KG",
  "TONNE",
  "MTR",
  "RFT",
  "SQFT",
  "SQMT",
  "CUM",
  "CFT",
  "LTR",
  "BUNDLE",
  "BOX",
  "GRAMS",
  "NOS",
  "SET",
  "COIL",
  "ROLL",
  "PKT",
  "TRIP",
  "BRASS",
];

const DIMENSION_UNIT_OPTIONS = [
  { value: "MM", label: "Millimeter (mm)" },
  { value: "CM", label: "Centimeter (cm)" },
  { value: "INCH", label: "Inch (in)" },
  { value: "FEET", label: "Feet (ft)" },
  { value: "MTR", label: "Meter (m)" },
];

const compactPrice = (value) => {
  if (value === null || value === undefined) return "";

  const text = String(value).trim();
  if (!text || !/^-?\d+(?:\.\d+)?$/.test(text) || !text.includes(".")) {
    return text;
  }

  const compact = text.replace(/0+$/, "").replace(/\.$/, "");
  return compact === "-0" ? "0" : compact;
};

const createEmptyStoreRow = () => ({
  // A product must only be assigned when the user explicitly enables a store.
  // Defaulting to true made every visible store part of an unrelated product save.
  enabled: false,
  isExisting: false,
  isDirty: false,
  selling_price: "",
  mrp: "",
  original_selling_price: "",
  original_mrp: "",
  low_stock_value: "",
  minimum_base_quantity: "",
});

function Card({ title, description, children, action, id }) {
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
        <div>
          <h2 className="text-[15px] font-semibold text-blue-600">{title}</h2>
          {description && (
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function Label({ children, required = false }) {
  return (
    <label className="mb-1 block text-sm font-medium text-gray-700">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const fileRef = useRef(null);
  const requestedReturnTo = searchParams.get("returnTo") || "";
  const returnTo = requestedReturnTo.startsWith("/catalog/products")
    ? requestedReturnTo
    : "/catalog/products";

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [errors, setErrors] = useState({});
  const [imagePreview, setImagePreview] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0].value);

  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [charges, setCharges] = useState([]);
  const [stores, setStores] = useState([]);
  const [storeRows, setStoreRows] = useState({});
  const [batches, setBatches] = useState([]);
  const [batchStatusSaving, setBatchStatusSaving] = useState(null);
  const [batchSyncNotice, setBatchSyncNotice] = useState("");
  const [saveResult, setSaveResult] = useState(null);
  const [form, setForm] = useState(initialForm);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(null), 3000);
  };

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const loadRecords = async (url, setter) => {
    try {
      const response = await fetch(url);
      const json = await response.json();
      if (json.success) setter(json.data.records || []);
    } catch {
      setter([]);
    }
  };

  useEffect(() => {
    (async () => {
      setLoadError("");
      setPageLoading(true);
      try {
        await Promise.all([
          loadRecords("/api/catalog/categories?pageSize=200", setCategories),
          loadRecords("/api/catalog/brands?pageSize=200", setBrands),
          loadRecords(
            "/api/catalog/manufacturers?pageSize=200",
            setManufacturers,
          ),
          loadRecords("/api/catalog/departments?pageSize=200", setDepartments),
          loadRecords("/api/catalog/taxes?pageSize=200", setTaxes),
          loadRecords("/api/catalog/charges?pageSize=200", setCharges),
          loadRecords("/api/stores", setStores),
        ]);

        if (params?.id) {
          const response = await fetch(`/api/catalog/products/${params.id}`);
          const json = await response.json().catch(() => ({}));
          if (json.success) {
            const product = json.data || {};
            setForm((prev) => ({
              ...prev,
              name: product.name || "",
              description: product.description || "",
              barcode: product.barcode || "",
              sku: product.sku || "",
              hsn_code: product.hsn_code || "",
              category_id: product.category_id || "",
              sub_category_id: product.sub_category_id || "",
              brand_id: product.brand_id || "",
              manufacturer_id: product.manufacturer_id || "",
              department_id: product.department_id || "",
              tax_id: product.tax_id || "",
              mrp: compactPrice(product.mrp),
              selling_price: compactPrice(product.selling_price),
              cost_price: compactPrice(product.cost_price),
              unit: UNIT_OPTIONS.includes(
                String(product.unit || "").toUpperCase(),
              )
                ? String(product.unit).toUpperCase()
                : "PCS",
              length: product.length ?? "",
              width: product.width ?? "",
              height: product.height ?? "",
              dimension_unit: product.dimension_unit || "MM",
              dimensions: product.dimensions || "",
              weight_per_unit: product.weight_per_unit ?? "",
              is_active: product.is_active ?? true,
              is_service: product.is_service ?? false,
              allow_discount_on_pos: product.allow_discount_on_pos ?? false,
              include_tax: product.include_tax ?? false,
              default_low_stock_value: product.default_low_stock_value ?? "",
              minimum_base_quantity: product.minimum_base_quantity ?? "",
              inventory_method: product.inventory_method || "direct",
              stock_item_type: product.stock_item_type || "unbatched",
              image_url: product.image_url || "",
            }));
            setBatches(Array.isArray(product.batches) ? product.batches : []);
            setBatchSyncNotice(product.batchLoadWarning || "");
            if (product.image_url) setImagePreview(product.image_url);
          } else {
            const message =
              json.message || json.error || "Unable to load this product.";
            // Never discard the user's edit intent automatically. This also
            // makes an occasional missing/stale row diagnosable instead of
            // looking like the pencil click did nothing.
            setLoadError(message);
          }
        }
      } catch (error) {
        setLoadError(error.message || "Unable to load product");
      } finally {
        setPageLoading(false);
      }
    })();
  }, [params?.id, router, returnTo]);

  useEffect(() => {
    if (!saveResult) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [saveResult]);

  useEffect(() => {
    if (!form.category_id) {
      setSubCategories([]);
      return;
    }

    (async () => {
      try {
        const response = await fetch(
          `/api/catalog/sub-categories?category_id=${form.category_id}&pageSize=200`,
        );
        const json = await response.json();
        setSubCategories(json.success ? json.data.records || [] : []);
      } catch {
        setSubCategories([]);
      }
    })();
  }, [form.category_id]);

  useEffect(() => {
    if (!stores.length) return;
    setStoreRows(
      stores.reduce((acc, store) => {
        acc[store.id] = acc[store.id] || createEmptyStoreRow();
        return acc;
      }, {}),
    );
  }, [stores]);

  useEffect(() => {
    if (!params?.id || !stores.length) return;

    (async () => {
      try {
        const response = await fetch(
          `/api/catalog/product-saleability?product_id=${params.id}&pageSize=1000`,
        );
        const json = await response.json();
        if (!json.success) return;
        const rows = json.data?.records || [];
        setStoreRows((prev) => {
          const next = { ...prev };
          for (const record of rows) {
            if (!record.store_id) continue;
            next[record.store_id] = {
              ...(next[record.store_id] || createEmptyStoreRow()),
              enabled: record.is_active ?? true,
              isExisting: true,
              isDirty: false,
              selling_price: compactPrice(record.selling_price),
              mrp: compactPrice(record.mrp),
              original_selling_price: compactPrice(record.selling_price),
              original_mrp: compactPrice(record.mrp),
              low_stock_value: record.low_stock_value ?? "",
              minimum_base_quantity: record.minimum_base_quantity ?? "",
            };
          }
          return next;
        });
      } catch {
        // Store rows can still be edited with defaults if saleability lookup fails.
      }
    })();
  }, [params?.id, stores]);

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const value = await prepareProductImageDataUrl(file);
      setImagePreview(value);
      set("image_url", value);
    } catch (error) {
      showToast(error.message || "Unable to upload product image", "error");
      event.target.value = "";
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Product name is required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const updateStoreRow = (storeId, key, value) => {
    setStoreRows((prev) => ({
      ...prev,
      [storeId]: {
        ...(prev[storeId] || createEmptyStoreRow()),
        [key]: value,
        isDirty: true,
      },
    }));
  };

  const toggleStore = (storeId) => {
    setStoreRows((prev) => ({
      ...prev,
      [storeId]: {
        ...(prev[storeId] || createEmptyStoreRow()),
        enabled: !(prev[storeId]?.enabled ?? true),
        isDirty: true,
      },
    }));
  };

  const updateBatchStatus = async (batchId, status) => {
    setBatchStatusSaving(batchId);
    try {
      const response = await fetch(`/api/inventory/batches/${batchId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await readJsonResponse(
        response,
        "Unable to update batch status",
      );
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Unable to update batch status");
      }
      setBatches((current) =>
        current.map((batch) =>
          String(batch.id) === String(batchId) ? { ...batch, status } : batch,
        ),
      );
      showToast(`Batch marked ${status}. Stock quantity was not changed.`);
    } catch (error) {
      showToast(error.message || "Unable to update batch status", "error");
    } finally {
      setBatchStatusSaving(null);
    }
  };

  const handleSubmit = async () => {
    if (!validate()) {
      showToast("Please fill the required fields", "error");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/catalog/products/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          category_id: form.category_id || null,
          sub_category_id: form.sub_category_id || null,
          brand_id: form.brand_id || null,
          manufacturer_id: form.manufacturer_id || null,
          department_id: form.department_id || null,
          tax_id: form.tax_id || null,
          charge_id: form.charge_id || null,
          mrp: form.mrp || 0,
          selling_price: form.selling_price || 0,
          cost_price: form.cost_price || 0,
          unit: form.unit || "PCS",
          length: form.length ? Number(form.length) : null,
          width: form.width ? Number(form.width) : null,
          height: form.height ? Number(form.height) : null,
          dimension_unit: form.dimension_unit || "MM",
          dimensions: form.dimensions?.trim() || null,
          weight_per_unit: form.weight_per_unit ? Number(form.weight_per_unit) : null,
          is_active: form.is_active,
          is_service: form.is_service,
          image_url: form.image_url || null,
          selected_color: selectedColor,
          hsn_code: form.hsn_code || null,
          include_tax: form.include_tax,
          is_sellable_on_pos: form.is_sellable_on_pos,
          allow_variable_pricing: form.allow_variable_pricing,
          allow_discount_on_pos: form.allow_discount_on_pos,
          default_low_stock_value: Number(form.default_low_stock_value || 0),
          minimum_base_quantity: Number(form.minimum_base_quantity || 0),
          inventory_method: form.inventory_method,
          stock_item_type: form.stock_item_type,
        }),
      });
      const json = await readJsonResponse(response, "Failed to update product");

      if (!json.success) {
        const apiErrors = Array.isArray(json.errors)
          ? Object.assign({}, ...json.errors)
          : json.errors || {};
        if (Object.keys(apiErrors).length) setErrors(apiErrors);
        const exactError = Object.values(apiErrors).find(Boolean);
        showToast(exactError || json.message || "Failed to update product", "error");
        return;
      }

      const productId = json.data?.id || params.id;
      // Do not touch store assignment while saving unrelated product fields like image.
      const storeEntries = Object.entries(storeRows).filter(
        ([, row]) => row.isDirty,
      );
      const batchSyncMessages = [];
      if (productId && storeEntries.length) {
        await Promise.all(
          storeEntries.map(async ([storeId, row]) => {
            const previousMrp = Number(row.original_mrp || 0);
            const previousSellingPrice = Number(
              row.original_selling_price || 0,
            );
            const nextMrp = Number(row.mrp || form.mrp || 0);
            const nextSellingPrice = Number(
              row.selling_price || form.selling_price || 0,
            );
            const pricesChanged =
              row.enabled &&
              row.isExisting &&
              (previousMrp !== nextMrp ||
                previousSellingPrice !== nextSellingPrice);
            const storeResponse = await fetch(
              "/api/catalog/assign-products-store",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  productId,
                  storeId,
                  assign: row.enabled,
                  ...(row.enabled
                    ? {
                        selling_price: Number(
                          row.selling_price || form.selling_price || 0,
                        ),
                        mrp: Number(row.mrp || form.mrp || 0),
                        low_stock_value: Number(
                          row.low_stock_value ||
                            form.default_low_stock_value ||
                            0,
                        ),
                        minimum_base_quantity: Number(
                          row.minimum_base_quantity ||
                            form.minimum_base_quantity ||
                            0,
                        ),
                      }
                    : {}),
                }),
              },
            );
            const storeJson = await storeResponse.json().catch(() => ({}));
            if (!storeResponse.ok || !storeJson.success) {
              const storeName =
                stores.find((store) => String(store.id) === String(storeId))
                  ?.name || `Store ${storeId}`;
              throw new Error(
                `${storeName}: ${storeJson.message || "failed to save store pricing"}`,
              );
            }
            if (pricesChanged) {
              const syncResponse = await fetch(
                "/api/inventory/batches/sync-store-price",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    productId,
                    storeId,
                    oldMrp: previousMrp,
                    oldSellingPrice: previousSellingPrice,
                    newMrp: nextMrp,
                    newSellingPrice: nextSellingPrice,
                  }),
                },
              );
              const syncJson = await readJsonResponse(
                syncResponse,
                "Unable to sync matching batch prices",
              );
              if (!syncResponse.ok || !syncJson.success) {
                throw new Error(syncJson.message || "Unable to sync matching batch prices");
              }
              const storeName =
                stores.find((store) => String(store.id) === String(storeId))
                  ?.name || `Store ${storeId}`;
              batchSyncMessages.push(`${storeName}: ${syncJson.message}`);
              const updatedBatches = syncJson.data?.batches || [];
              if (updatedBatches.length) {
                setBatches((current) =>
                  current.map((batch) => {
                    const replacement = updatedBatches.find(
                      (updated) => String(updated.id) === String(batch.id),
                    );
                    return replacement ? { ...batch, ...replacement } : batch;
                  }),
                );
              }
            }
          }),
        );
      }

      setStoreRows((current) =>
        Object.fromEntries(
          Object.entries(current).map(([storeId, row]) => [
            storeId,
            {
              ...row,
              isDirty: false,
              original_mrp: row.mrp || form.mrp || 0,
              original_selling_price:
                row.selling_price || form.selling_price || 0,
            },
          ]),
        ),
      );
      showToast(
        batchSyncMessages.length
          ? `Product saved. ${batchSyncMessages.join(" ")}`
          : "Product updated successfully!",
      );
      setBatchSyncNotice(batchSyncMessages.join(" "));
      setSaveResult({
        productName: form.name,
        storeRowsSaved: storeEntries.length,
        batchSyncMessages,
      });
    } catch (error) {
      showToast(error?.message || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(
    (item) => String(item.id) === String(form.category_id),
  );
  const selectedSubCategory = subCategories.find(
    (item) => String(item.id) === String(form.sub_category_id),
  );
  const selectedBrand = brands.find(
    (item) => String(item.id) === String(form.brand_id),
  );
  const selectedManufacturer = manufacturers.find(
    (item) => String(item.id) === String(form.manufacturer_id),
  );
  const selectedDepartment = departments.find(
    (item) => String(item.id) === String(form.department_id),
  );
  const selectedTax = taxes.find(
    (item) => String(item.id) === String(form.tax_id),
  );
  const selectedCharge = charges.find(
    (item) => String(item.id) === String(form.charge_id),
  );

  const formatBatchDate = (value) => {
    const date = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "No expiry";
    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year.slice(-2)}`;
  };

  const activeStoreBatches = (storeId) => {
    const today = new Date().toISOString().slice(0, 10);
    return batches.filter((batch) => {
      const expiry = String(batch.expiry_date || "").slice(0, 10);
      return (
        String(batch.store_id) === String(storeId) &&
        String(batch.status).toLowerCase() === "active" &&
        (!expiry || expiry >= today)
      );
    });
  };

  if (pageLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading product...</div>;
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm text-gray-700">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h1 className="text-base font-semibold text-red-800">
            Product could not be loaded
          </h1>
          <p className="mt-2 text-red-700">{loadError}</p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to products
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-sm text-gray-800 sm:px-6 lg:px-8">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}
        >
          {toast.msg}
        </div>
      )}

      {saveResult &&
        typeof document !== "undefined" &&
        createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-lg text-green-700">
                  ✓
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Product saved successfully
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {saveResult.productName || "Product"} has been updated.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-gray-700">
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                Product master details and default price have been saved.
              </div>
              {saveResult.storeRowsSaved > 0 && (
                <div className="rounded-lg bg-gray-50 px-4 py-3">
                  {saveResult.storeRowsSaved} store assignment
                  {saveResult.storeRowsSaved === 1 ? "" : "s"} saved.
                </div>
              )}
              {saveResult.batchSyncMessages.length > 0 && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 leading-5 text-blue-900">
                  <p className="mb-1 font-semibold">Batch price result</p>
                  {saveResult.batchSyncMessages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setSaveResult(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Stay on this product
              </button>
              <button
                type="button"
                onClick={() => window.location.assign(returnTo)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Back to products
              </button>
            </div>
          </div>
        </div>
        ,
        document.body,
      )}

      <div className="mx-auto max-w-7xl space-y-5">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <Link href="/catalog" className="text-blue-600 hover:underline">
            Home
          </Link>
          <span>›</span>
          <Link href="/catalog" className="text-blue-600 hover:underline">
            Catalog
          </Link>
          <span>›</span>
          <Link href={returnTo} className="text-blue-600 hover:underline">
            Products
          </Link>
          <span>›</span>
          <span className="font-semibold text-gray-700">Edit product</span>
        </nav>

        <div className="flex flex-col gap-4 rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-gray-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Edit Product
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Update product details, pricing and store availability.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => router.push(returnTo)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 4l-4 4 4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <Card
          title="Product Representation"
          description="Update the product image and color marker."
        >
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="flex h-56 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Product preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <svg className="h-12 w-12" viewBox="0 0 40 40" fill="none">
                      <rect
                        x="4"
                        y="4"
                        width="32"
                        height="32"
                        rx="6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M20 13v14M13 20h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-xs font-medium">
                      Upload Product Image
                    </span>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                Choose Color
              </p>
              <div className="flex flex-wrap gap-3">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setSelectedColor(color.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${selectedColor === color.value ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-white shadow"
                      style={{ backgroundColor: color.value }}
                    />
                    <span className="text-xs font-medium text-gray-700">
                      {color.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="Basic Information"
          description="Provide the product identity and classification information."
        >
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label required>Product Name</Label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 ${errors.name ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-500">{errors.name}</p>
                  )}
                </div>
                <div>
                  <Label>Barcode <span className="text-xs font-normal text-gray-400">(Optional)</span></Label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(event) => set("barcode", event.target.value)}
                    placeholder="Scan or enter barcode (optional)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>SKU</Label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(event) => set("sku", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <Label>HSN / SAC Code</Label>
                  <input
                    type="text"
                    value={form.hsn_code}
                    onChange={(event) => set("hsn_code", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <textarea
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Category</Label>
                <SearchableSelect
                  value={form.category_id}
                  onChange={(value) => set("category_id", value)}
                  placeholder="Select category"
                  searchPlaceholder="Search category..."
                  options={categories.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                />
              </div>
              <div>
                <Label>Sub Category</Label>
                <SearchableSelect
                  value={form.sub_category_id}
                  onChange={(value) => set("sub_category_id", value)}
                  placeholder="Select sub category"
                  searchPlaceholder="Search sub category..."
                  options={subCategories.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                  disabled={!form.category_id}
                />
              </div>
              <div>
                <Label>Brand</Label>
                <SearchableSelect
                  value={form.brand_id}
                  onChange={(value) => set("brand_id", value)}
                  placeholder="Select brand"
                  searchPlaceholder="Search brand..."
                  options={brands.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                />
              </div>
              <div>
                <Label>Manufacturer</Label>
                <SearchableSelect
                  value={form.manufacturer_id}
                  onChange={(value) => set("manufacturer_id", value)}
                  placeholder="Select manufacturer"
                  searchPlaceholder="Search manufacturer..."
                  options={manufacturers.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="Special Attributes"
          description="Flags that control catalog and POS behavior."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <Label>Department</Label>
              <SearchableSelect
                value={form.department_id}
                onChange={(value) => set("department_id", value)}
                placeholder="Select department"
                searchPlaceholder="Search department..."
                options={departments.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </div>
            <div>
              <Label required>Unit</Label>
              <select
                value={form.unit}
                onChange={(event) => set("unit", event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Standard measurement unit for material consumption and estimation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-6">
              {[
                ["is_active", "Active"],
                ["is_service", "Service / Labour Item"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="inline-flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(event) => set(key, event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title="Rates & Valuation"
          description="Maintain reference, issue and estimated purchase rates for project material control."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Reference Rate / Unit</Label>
                  <input
                    type="number"
                    value={form.mrp}
                    onChange={(event) => set("mrp", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <Label>Issue Rate / Unit</Label>
                  <input
                    type="number"
                    value={form.selling_price}
                    onChange={(event) =>
                      set("selling_price", event.target.value)
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <Label>Estimated Purchase Rate / Unit</Label>
                  <input
                    type="number"
                    value={form.cost_price}
                    onChange={(event) => set("cost_price", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>GST</Label>
                  <select
                    value={form.tax_id}
                    onChange={(event) => set("tax_id", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select GST</option>
                    {taxes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Charge</Label>
                  <select
                    value={form.charge_id}
                    onChange={(event) => set("charge_id", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select charge</option>
                    {charges.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["is_sellable_on_pos", "Can Be Issued to Site"],
                ["allow_variable_pricing", "Allow Issue Rate Override"],
                ["allow_discount_on_pos", "Require Rate Approval"],
                ["include_tax", "GST Included"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(event) => set(key, event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block font-medium text-gray-800">
                      {label}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {label === "Is Sellable on POS"
                        ? "Allow product to be sellable on POS"
                        : label === "Allow Variable Pricing"
                          ? "Allow product for variable pricing"
                          : label === "Allow Discount on POS"
                            ? "Permit admin discount while billing this product"
                            : "Selling price already includes GST"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Review
            </p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Product", form.name || "—"],
                ["Barcode", form.barcode || "—"],
                ["SKU", form.sku || "—"],
                ["MRP", form.mrp || "—"],
                ["Selling Price", form.selling_price || "—"],
                ["Category", selectedCategory?.name || "—"],
                ["Sub Category", selectedSubCategory?.name || "—"],
                ["Brand", selectedBrand?.name || "—"],
                ["Manufacturer", selectedManufacturer?.name || "—"],
                ["Department", selectedDepartment?.name || "—"],
                ["GST", selectedTax?.name || "—"],
                ["Charge", selectedCharge?.name || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <span className="w-32 shrink-0 text-gray-400">{label}</span>
                  <span className="font-medium text-gray-800">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card
          id="batch-management"
          title="Batch Management"
          description="All batches for this product across every store. Status is manual: changing it never changes stock quantity."
        >
          {batchSyncNotice && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
              <span className="font-semibold">Latest store price update:</span>{" "}
              {batchSyncNotice}
            </div>
          )}
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
            Active batches with zero available quantity remain active and visible
            here, but POS cannot bill them until stock is available. Mark a
            batch inactive only when it must be removed from POS selection.
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Store</th>
                  <th className="px-4 py-3 text-left">Batch</th>
                  <th className="px-4 py-3 text-left">Expiry</th>
                  <th className="px-4 py-3 text-right">CP</th>
                  <th className="px-4 py-3 text-right">SP</th>
                  <th className="px-4 py-3 text-right">MRP</th>
                  <th className="px-4 py-3 text-left">Price Source</th>
                  <th className="px-4 py-3 text-right">Received</th>
                  <th className="px-4 py-3 text-right">Available</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="px-4 py-8 text-center text-gray-400">
                      No inventory batch exists for this product yet.
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => {
                    const isActive = String(batch.status).toLowerCase() === "active";
                    const nextStatus = isActive ? "inactive" : "active";
                    const isSaving = String(batchStatusSaving) === String(batch.id);
                    const hasInvalidPrice =
                      Number(batch.selling_price || 0) > Number(batch.mrp || 0) ||
                      Number(batch.cost_price || 0) > Number(batch.mrp || 0);
                    return (
                      <tr key={batch.id} className={!isActive ? "bg-gray-50" : ""}>
                        <td className="px-4 py-3 font-medium text-gray-800">{batch.store_name || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{batch.batch_no || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : "—"}</td>
                        <td className="px-4 py-3 text-right">{Number(batch.cost_price || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</td>
                        <td className="px-4 py-3 text-right">{Number(batch.selling_price || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</td>
                        <td className="px-4 py-3 text-right">{Number(batch.mrp || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</td>
                        <td className="px-4 py-3 text-left">
                          <div className="text-xs font-medium text-gray-700">{batch.price_source || "Product Master"}</div>
                          {hasInvalidPrice && (
                            <div className="mt-1 text-xs font-semibold text-red-600">Invalid: CP/SP exceeds MRP</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">{Number(batch.received_qty || 0).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-right font-medium">{Number(batch.available_qty || 0).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"}`}>
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => updateBatchStatus(batch.id, nextStatus)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${isActive ? "border-red-200 text-red-700 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                          >
                            {isSaving ? "Saving..." : `Mark ${isActive ? "Inactive" : "Active"}`}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Store Details"
          description="Enable the product for specific stores and capture per-store values."
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Store</th>
                    <th className="px-4 py-3 text-left">Enable</th>
                    <th className="px-4 py-3 text-left">Active Batch / Expiry</th>
                    <th className="px-4 py-3 text-left">Selling Price</th>
                    <th className="px-4 py-3 text-left">M.R.P.</th>
                    <th className="px-4 py-3 text-left">Low Stock Qty</th>
                    <th className="px-4 py-3 text-left">MBQ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {stores.length === 0 ? (
                    <tr>
                      <td
                        colSpan="7"
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        No stores available
                      </td>
                    </tr>
                  ) : (
                    stores.map((store) => {
                      const row = storeRows[store.id] || createEmptyStoreRow();
                      const storeBatches = activeStoreBatches(store.id);
                      return (
                        <tr
                          key={store.id}
                          className={!row.enabled ? "bg-gray-50" : ""}
                        >
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {store.name}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={() => toggleStore(store.id)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="min-w-64 px-4 py-3">
                            {storeBatches.length ? (
                              <div className="space-y-1.5">
                                <div className="text-xs font-semibold text-gray-700">
                                  {storeBatches.length} active {storeBatches.length === 1 ? "batch" : "batches"}
                                </div>
                                {storeBatches.map((batch) => (
                                  <div
                                    key={batch.id}
                                    className="flex items-center justify-between gap-3 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900"
                                  >
                                    <span className="max-w-40 truncate font-medium" title={batch.batch_no || ""}>
                                      {batch.batch_no || "Batch"}
                                    </span>
                                    <span className="shrink-0">
                                      Exp: {formatBatchDate(batch.expiry_date)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">
                                No active unexpired batch
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={row.selling_price}
                              onChange={(event) =>
                                updateStoreRow(
                                  store.id,
                                  "selling_price",
                                  event.target.value,
                                )
                              }
                              disabled={!row.enabled}
                              className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none disabled:bg-gray-100"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={row.mrp}
                              onChange={(event) =>
                                updateStoreRow(
                                  store.id,
                                  "mrp",
                                  event.target.value,
                                )
                              }
                              disabled={!row.enabled}
                              className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none disabled:bg-gray-100"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={row.low_stock_value}
                              onChange={(event) =>
                                updateStoreRow(
                                  store.id,
                                  "low_stock_value",
                                  event.target.value,
                                )
                              }
                              disabled={!row.enabled}
                              className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none disabled:bg-gray-100"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={row.minimum_base_quantity}
                              onChange={(event) =>
                                updateStoreRow(
                                  store.id,
                                  "minimum_base_quantity",
                                  event.target.value,
                                )
                              }
                              disabled={!row.enabled}
                              className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none disabled:bg-gray-100"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-500">
              Store rows are saved as product saleability records after the
              product is updated.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
