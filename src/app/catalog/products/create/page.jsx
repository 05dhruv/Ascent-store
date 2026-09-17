"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  product_id: "",
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
  manage_inventory_enabled: true,
  inventory_store_id: "",
  opening_stock_qty: "",
  default_low_stock_value: "",
  minimum_base_quantity: "",
  disable_billing_on_zero: true,
  disable_sales_on_expiry: false,
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

const createEmptyStoreRow = () => ({
  enabled: true,
  selling_price: "",
  mrp: "",
  low_stock_value: "",
  minimum_base_quantity: "",
});

function Card({ title, description, children, action }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
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

export default function CreateProductPage() {
  const router = useRouter();
  const fileRef = useRef(null);
  const bulkPrefillAppliedRef = useRef(false);

  const [loading, setLoading] = useState(false);
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
      if (json.success) {
        if (Array.isArray(json.data?.records)) setter(json.data.records);
        else if (Array.isArray(json.data?.stores)) setter(json.data.stores);
        else setter([]);
      }
    } catch {
      setter([]);
    }
  };

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("name");
    const source = params.get("source");
    if (source !== "stock-in-bulk") {
      if (name) setForm((prev) => ({ ...prev, name }));
      return;
    }
    if (bulkPrefillAppliedRef.current) return;
    if (!categories.length && params.get("category_name")) return;
    if (!brands.length && params.get("brand_name")) return;

    const findByName = (records, value) => {
      const normalized = String(value || "")
        .trim()
        .toLowerCase();
      if (!normalized) return "";
      return (
        records.find(
          (record) =>
            String(record.name || "")
              .trim()
              .toLowerCase() === normalized,
        )?.id || ""
      );
    };
    const normalizeBulkUnit = (value) => {
      const unit = String(value || "")
        .trim()
        .toUpperCase();
      if (unit === "PIECE" || unit === "PCS") return "PCS";
      if (unit === "KG") return "KG";
      if (unit === "G" || unit === "GM" || unit === "GRAM" || unit === "GRAMS")
        return "GRAMS";
      if (unit === "LTR" || unit === "LITER" || unit === "LITRE") return "LTR";
      return "PCS";
    };
    const normalizeBulkStockType = (value) => {
      return String(value || "")
        .trim()
        .toLowerCase()
        .includes("batch")
        ? "batched"
        : "unbatched";
    };

    bulkPrefillAppliedRef.current = true;
    setForm((prev) => ({
      ...prev,
      name: params.get("name") || prev.name,
      product_id: params.get("product_id") || prev.product_id,
      barcode: params.get("barcode") || prev.barcode,
      sku: params.get("sku") || prev.sku,
      unit: normalizeBulkUnit(params.get("unit") || prev.unit),
      category_id:
        findByName(categories, params.get("category_name")) || prev.category_id,
      brand_id: findByName(brands, params.get("brand_name")) || prev.brand_id,
      mrp: params.get("mrp") || prev.mrp,
      selling_price: params.get("selling_price") || prev.selling_price,
      cost_price: params.get("cost_price") || prev.cost_price,
      opening_stock_qty:
        params.get("opening_stock_qty") || prev.opening_stock_qty,
      stock_item_type: normalizeBulkStockType(
        params.get("stock_item_type") || prev.stock_item_type,
      ),
      expiry_date: params.get("expiry_date") || prev.expiry_date,
    }));
  }, [brands, categories]);

  useEffect(() => {
    if (!form.category_id) {
      setSubCategories([]);
      setForm((prev) => ({ ...prev, sub_category_id: "" }));
      return;
    }

    (async () => {
      try {
        const response = await fetch(
          `/api/catalog/sub-categories?category_id=${form.category_id}&pageSize=200`,
        );
        const json = await response.json();
        const records = json.success ? json.data.records || [] : [];
        setSubCategories(records);
        setForm((prev) => {
          if (!prev.sub_category_id) return prev;
          const exists = records.some(
            (item) => String(item.id) === String(prev.sub_category_id),
          );
          return exists ? prev : { ...prev, sub_category_id: "" };
        });
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
    if (!form.name.trim()) nextErrors.name = "Material name is required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const updateStoreRow = (storeId, key, value) => {
    setStoreRows((prev) => ({
      ...prev,
      [storeId]: { ...(prev[storeId] || createEmptyStoreRow()), [key]: value },
    }));
  };

  const toggleStore = (storeId) => {
    setStoreRows((prev) => ({
      ...prev,
      [storeId]: {
        ...(prev[storeId] || createEmptyStoreRow()),
        enabled: !(prev[storeId]?.enabled ?? true),
      },
    }));
  };

  const handleSubmit = async () => {
    if (!validate()) {
      showToast("Please fill the required fields", "error");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/catalog/products", {
        method: "POST",
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
          manage_inventory_enabled: form.manage_inventory_enabled,
          inventory_store_id: form.inventory_store_id || null,
          opening_stock_qty: Number(form.opening_stock_qty || 0),
          default_low_stock_value: Number(form.default_low_stock_value || 0),
          minimum_base_quantity: Number(form.minimum_base_quantity || 0),
          disable_billing_on_zero: form.disable_billing_on_zero,
          disable_sales_on_expiry: form.disable_sales_on_expiry,
          inventory_method: form.inventory_method,
          stock_item_type: form.stock_item_type,
        }),
      });
      const json = await readJsonResponse(response, "Failed to create product");

      if (!json.success) {
        if (json.errors) setErrors(json.errors);
        showToast(json.message || "Failed to create product", "error");
        return;
      }

      const productId = json.data?.id;
      const activeStores = Object.entries(storeRows).filter(
        ([, row]) => row?.enabled,
      );
      if (productId && activeStores.length) {
        await Promise.allSettled(
          activeStores.map(([storeId, row]) =>
            fetch("/api/catalog/product-saleability", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                product_id: productId,
                store_id: storeId,
                is_active: row.enabled,
                selling_price: Number(
                  row.selling_price || form.selling_price || 0,
                ),
                mrp: Number(row.mrp || form.mrp || 0),
                low_stock_value: Number(
                  row.low_stock_value || form.default_low_stock_value || 0,
                ),
                minimum_base_quantity: Number(
                  row.minimum_base_quantity || form.minimum_base_quantity || 0,
                ),
              }),
            }),
          ),
        );
      }

      showToast("Material created successfully!");
      const returnTo = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      setTimeout(() => router.push(returnTo || "/catalog/products"), 900);
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

  return (
    <div className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-sm text-gray-800 sm:px-6 lg:px-8">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}
        >
          {toast.msg}
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-5">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <Link href="/catalog" className="text-blue-600 hover:underline">
            Home
          </Link>
          <span>›</span>
          <Link href="/catalog" className="text-blue-600 hover:underline">
          Materials
          </Link>
          <span>›</span>
          <Link
            href="/catalog/products"
            className="text-blue-600 hover:underline"
          >
            Material Master
          </Link>
          <span>›</span>
          <span className="font-semibold text-gray-700">New material</span>
        </nav>

        <div className="flex flex-col gap-4 rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-gray-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Create Material
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Create a construction material with its specification, rates and
              warehouse/site availability.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => router.push("/catalog/products")}
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
          title="Material Reference"
          description="Upload a material image or product data sheet reference."
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
                    alt="Material preview"
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
                      Upload Material Image
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
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>Max-size: 1.0 Mb</span>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview("");
                      set("image_url", "");
                    }}
                    className="font-medium text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                Marker Color
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
          title="Material Information"
          description="Provide the material identity, specification and classification."
        >
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label required>Material Name</Label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="e.g. OPC Cement 53 Grade"
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 ${errors.name ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-500">{errors.name}</p>
                  )}
                </div>
                <div>
                  <Label>Material Code</Label>
                  <input
                    type="text"
                    value={form.product_id}
                    onChange={(event) => set("product_id", event.target.value)}
                    placeholder="e.g. CEM-OPC-53"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <Label>Barcode / QR Code</Label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(event) => set("barcode", event.target.value)}
                    placeholder="Scan or enter barcode"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Supplier / Internal SKU</Label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(event) => set("sku", event.target.value)}
                    placeholder="Enter supplier SKU"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <Label>HSN / SAC Code</Label>
                  <input
                    type="text"
                    value={form.hsn_code}
                    onChange={(event) => set("hsn_code", event.target.value)}
                    placeholder="Select HSN"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <Label>Specification / Grade</Label>
                <textarea
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder="Grade, size, make requirement, technical specification..."
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
                <Label>Preferred Make / Brand</Label>
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
                <Label>Manufacturer / Supplier Make</Label>
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
          title="Material Attributes"
          description="Define the consumption unit and operational status."
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
                Use the unit in which the material is purchased, stored and issued.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-6">
              {[
                ["is_active", "Active"],
                ["is_service", "Non-stock Service"],
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
          title="Dimensions & Physical Specifications"
          description="Specify size, thickness, diameter, and weight for engineering and site tracking."
        >
          <div className="grid gap-5 lg:grid-cols-4">
            <div>
              <Label>Length</Label>
              <input
                type="number"
                step="any"
                value={form.length}
                onChange={(event) => {
                  const val = event.target.value;
                  set("length", val);
                  if (val && form.width) {
                    const dim = `${val} × ${form.width}${form.height ? ` × ${form.height}` : ""} ${form.dimension_unit || "MM"}`;
                    set("dimensions", dim);
                  }
                }}
                placeholder="e.g. 2400 or 8"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <Label>Width / Breadth</Label>
              <input
                type="number"
                step="any"
                value={form.width}
                onChange={(event) => {
                  const val = event.target.value;
                  set("width", val);
                  if (form.length && val) {
                    const dim = `${form.length} × ${val}${form.height ? ` × ${form.height}` : ""} ${form.dimension_unit || "MM"}`;
                    set("dimensions", dim);
                  }
                }}
                placeholder="e.g. 1200 or 4"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <Label>Height / Thickness / Dia</Label>
              <input
                type="number"
                step="any"
                value={form.height}
                onChange={(event) => {
                  const val = event.target.value;
                  set("height", val);
                  if (form.length && form.width) {
                    const dim = `${form.length} × ${form.width} × ${val} ${form.dimension_unit || "MM"}`;
                    set("dimensions", dim);
                  } else if (val) {
                    const dim = `${val} ${form.dimension_unit || "MM"} Dia/Thk`;
                    set("dimensions", dim);
                  }
                }}
                placeholder="e.g. 18 or 12"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <Label>Dimension Unit</Label>
              <select
                value={form.dimension_unit || "MM"}
                onChange={(event) => {
                  const val = event.target.value;
                  set("dimension_unit", val);
                  if (form.length && form.width) {
                    const dim = `${form.length} × ${form.width}${form.height ? ` × ${form.height}` : ""} ${val}`;
                    set("dimensions", dim);
                  }
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              >
                {DIMENSION_UNIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <Label>Dimensions / Size String</Label>
              <input
                type="text"
                value={form.dimensions || ""}
                onChange={(event) => set("dimensions", event.target.value)}
                placeholder="e.g. 2400 × 1200 × 18 MM, 8ft × 4ft, 12mm Dia, 200x100x75 mm"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Auto-computed from L × W × H or enter custom dimension specification.
              </p>
            </div>
            <div>
              <Label>Weight Per Unit (Kg)</Label>
              <input
                type="number"
                step="any"
                value={form.weight_per_unit || ""}
                onChange={(event) => set("weight_per_unit", event.target.value)}
                placeholder="e.g. 50 (for cement bag) or 0.888 (for 12mm rebar/m)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Standard unit weight in KG for transport & density calculations.
              </p>
            </div>
          </div>
        </Card>

        <Card
          title="Rates & Tax"
          description="Maintain reference, issue and purchase rates for material control."
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
                      {label === "Can Be Issued to Site"
                        ? "Allow this material to be issued or transferred to a site"
                        : label === "Allow Issue Rate Override"
                          ? "Allow an authorised user to change the issue rate"
                          : label === "Require Rate Approval"
                            ? "Require approval when an issue rate differs from the reference rate"
                            : "Reference rate includes GST"}
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
          title="Location Availability"
          description="Enable this material for a warehouse or site store and maintain location-specific controls."
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Warehouse / Site</th>
                    <th className="px-4 py-3 text-left">Enable</th>
                    <th className="px-4 py-3 text-left">Issue Rate</th>
                    <th className="px-4 py-3 text-left">Reference Rate</th>
                    <th className="px-4 py-3 text-left">Reorder Level</th>
                    <th className="px-4 py-3 text-left">Minimum Issue Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {stores.length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        No stores available
                      </td>
                    </tr>
                  ) : (
                    stores.map((store) => {
                      const row = storeRows[store.id] || createEmptyStoreRow();
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
              Location controls are saved after the material is created.
            </div>
          </div>
        </Card>

        <Card
          title="Material Stock Controls"
          description="Define opening stock and movement controls; opening stock is posted to the selected warehouse."
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Enable Inventory Controls
                </p>
                <p className="text-xs text-gray-500">
                  Turn this on to configure stock settings for this material.
                </p>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.manage_inventory_enabled}
                  onChange={(event) =>
                    set("manage_inventory_enabled", event.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>

            {form.manage_inventory_enabled && (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <Label>Opening Stock Warehouse</Label>
                    <SearchableSelect
                      value={form.inventory_store_id}
                      onChange={(value) => set("inventory_store_id", value)}
                      placeholder="Select warehouse or site"
                      searchPlaceholder="Search location..."
                      options={stores.map((store) => ({
                        value: store.id,
                        label: store.name,
                      }))}
                    />
                  </div>
                  <div>
                    <Label>Opening Stock Qty</Label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.opening_stock_qty}
                      onChange={(event) =>
                        set("opening_stock_qty", event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <Label>Reorder Level</Label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.default_low_stock_value}
                      onChange={(event) =>
                        set("default_low_stock_value", event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <Label>Minimum Issue Qty</Label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.minimum_base_quantity}
                      onChange={(event) =>
                        set("minimum_base_quantity", event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.disable_billing_on_zero}
                      onChange={(event) =>
                        set("disable_billing_on_zero", event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <span className="block font-medium text-gray-800">
                        Block material issue when available stock is zero
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        Prevent a warehouse or site issue when usable stock reaches zero.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.disable_sales_on_expiry}
                      onChange={(event) =>
                        set("disable_sales_on_expiry", event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <span className="block font-medium text-gray-800">
                        Block issue after expiry date
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        Prevents issue of expired or unusable material.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Select Inventory Method
                    </p>
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          checked={form.inventory_method === "direct"}
                          onChange={() => set("inventory_method", "direct")}
                          className="h-4 w-4 text-blue-600"
                        />
                        <span>Direct</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          checked={form.inventory_method === "indirect"}
                          onChange={() => set("inventory_method", "indirect")}
                          className="h-4 w-4 text-blue-600"
                        />
                        <span>Indirect</span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Stock Item Type
                    </p>
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          checked={form.stock_item_type === "batched"}
                          onChange={() => set("stock_item_type", "batched")}
                          className="h-4 w-4 text-blue-600"
                        />
                        <span>Batch-tracked Material</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          checked={form.stock_item_type === "unbatched"}
                          onChange={() => set("stock_item_type", "unbatched")}
                          className="h-4 w-4 text-blue-600"
                        />
                        <span>Non-batch Material</span>
                      </label>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  If opening stock qty is greater than 0, a confirmed inventory
                  stock-in entry is created automatically.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
