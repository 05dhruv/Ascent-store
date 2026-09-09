"use client";
import { useEffect, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

function getProductUnit(product) {
  return String(
    product?.unit || product?.unit_name || product?.measurement_unit || "UNIT",
  )
    .trim()
    .toUpperCase();
}

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function PromotionForm({
  onClose,
  initial = null,
  onSaved = null,
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Conditional");
  const [discount, setDiscount] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [storeId, setStoreId] = useState("");
  const [discountAppliedOn, setDiscountAppliedOn] = useState("ORDER");
  const [maxRepeatCount, setMaxRepeatCount] = useState(0);
  const [useForCustomer, setUseForCustomer] = useState(false);
  const [removeOtherDiscounts, setRemoveOtherDiscounts] = useState(false);
  const [isAutoApplied, setIsAutoApplied] = useState(true);
  const [minCartValue, setMinCartValue] = useState("0");
  const [maxDiscountValue, setMaxDiscountValue] = useState("0");
  const [applyAfterTax, setApplyAfterTax] = useState(false);
  const [allowMerging, setAllowMerging] = useState(false);
  const [applyOnProductMrp, setApplyOnProductMrp] = useState(false);
  const [products, setProducts] = useState("");
  const [freeProductId, setFreeProductId] = useState("");
  const [freeProductQty, setFreeProductQty] = useState("1");
  const [couponEnabled, setCouponEnabled] = useState(false);
  const [promotionSlotsEnabled, setPromotionSlotsEnabled] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [freeProductSearch, setFreeProductSearch] = useState("");
  const [freeProductResults, setFreeProductResults] = useState([]);
  const [selectedFreeProduct, setSelectedFreeProduct] = useState(null);
  const [productSearching, setProductSearching] = useState(false);
  const [productSearchMessage, setProductSearchMessage] = useState("");

  useEffect(() => {
    let ignore = false;
    setStoresLoading(true);
    fetch("/api/stores", { cache: "no-store", credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        if (ignore) return;
        const rows = json.data?.stores || json.data?.records || [];
        setStores(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!ignore) setStores([]);
      })
      .finally(() => {
        if (!ignore) setStoresLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!initial) return;
    try {
      setName(initial.name ?? initial.title ?? "");
      setType(initial.promotion_type || initial.type || "Conditional");
      setDiscount(initial.discount_value ?? initial.discount ?? "0");
      setStartDate(initial.start_date ?? initial.start ?? "");
      setEndDate(initial.end_date ?? initial.end ?? "");
      setStoreId(initial.store_id ?? "");
      setDiscountAppliedOn(initial.discount_applied_on ?? "ORDER");
      setMaxRepeatCount(initial.max_repeat_count ?? 0);
      setUseForCustomer(!!initial.use_for_customer);
      setRemoveOtherDiscounts(!!initial.remove_other_discounts);
      setIsAutoApplied(initial.is_auto_applied !== false);
      setMinCartValue(initial.min_cart_value ?? 0);
      setMaxDiscountValue(initial.max_discount_value ?? 0);
      setApplyAfterTax(!!initial.apply_after_tax);
      setAllowMerging(!!initial.allow_merging);
      setApplyOnProductMrp(!!initial.apply_on_product_mrp);

      const initialProducts = initial.products || {};
      if (
        initialProducts &&
        typeof initialProducts === "object" &&
        !Array.isArray(initialProducts)
      ) {
        setProducts(
          Array.isArray(initialProducts.eligibleProductIds)
            ? initialProducts.eligibleProductIds.join(",")
            : "",
        );
        setFreeProductId(initialProducts.freeProductId || "");
        setFreeProductQty(initialProducts.freeProductQty || "1");
      } else {
        setProducts(
          Array.isArray(initialProducts)
            ? initialProducts.join(",")
            : initialProducts || "",
        );
        setFreeProductId("");
        setFreeProductQty("1");
      }

      setCouponEnabled(!!initial.coupon_enabled);
      setPromotionSlotsEnabled(!!initial.promotion_slots_enabled);
      setDescription(initial.description || "");
      setStatus(initial.status || "Active");
    } catch {}
  }, [initial]);

  useEffect(() => {
    if (!freeProductId) {
      setSelectedFreeProduct(null);
      return;
    }
    let ignore = false;
    fetch(`/api/catalog/products?ids=${freeProductId}&pageSize=1`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((res) => res.json())
      .then((json) => {
        if (ignore) return;
        const product = json.data?.records?.[0];
        if (product) {
          setSelectedFreeProduct(product);
          setFreeProductSearch(
            (current) =>
              current || product.barcode || product.sku || product.name || "",
          );
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [freeProductId]);

  useEffect(() => {
    const query = freeProductSearch.trim();
    if (
      !query ||
      (selectedFreeProduct?.id === Number(freeProductId) &&
        query ===
          (selectedFreeProduct.barcode ||
            selectedFreeProduct.sku ||
            selectedFreeProduct.name ||
            ""))
    ) {
      setFreeProductResults([]);
      setProductSearchMessage("");
      return;
    }

    let ignore = false;
    const timer = window.setTimeout(() => {
      setProductSearching(true);
      setProductSearchMessage("");
      const params = new URLSearchParams({
        search: query,
        pageSize: "8",
        includeAllProducts: "true",
      });
      if (storeId) params.set("store_id", String(storeId));

      fetch(`/api/catalog/products?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(json.message || "Unable to search products");
          }
          return json;
        })
        .then((json) => {
          if (ignore) return;
          const records = json.data?.records || [];
          setFreeProductResults(records);
          setProductSearchMessage(
            records.length ? "" : "No product found for this barcode or name.",
          );
        })
        .catch((searchError) => {
          if (!ignore) {
            setFreeProductResults([]);
            setProductSearchMessage(
              searchError.message || "Unable to search products",
            );
          }
        })
        .finally(() => {
          if (!ignore) setProductSearching(false);
        });
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [freeProductSearch, freeProductId, selectedFreeProduct?.id, storeId]);

  const selectFreeProduct = (product) => {
    setSelectedFreeProduct(product);
    setFreeProductId(String(product.id));
    setFreeProductSearch(product.barcode || product.sku || product.name || "");
    setFreeProductResults([]);
  };

  const freeProductUnit = selectedFreeProduct
    ? getProductUnit(selectedFreeProduct)
    : "UNIT";
  const freeQtyStep = ["PCS", "PC", "PIECE", "PIECES", "UNIT"].includes(
    freeProductUnit,
  )
    ? "1"
    : "0.001";
  const isNewPromotion = !initial?.id;
  const today = getLocalDateValue();

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) return setError("Promotion name is required");
    if (!startDate || !endDate) return setError("Date range is required");
    if (isNewPromotion && startDate < today) {
      return setError("Start date cannot be before today");
    }
    if (endDate < startDate) {
      return setError("End date cannot be before start date");
    }
    if (!storeId) return setError("Store is required");
    if (freeProductId && Number(freeProductQty || 0) <= 0) {
      return setError("Free product quantity must be greater than zero");
    }

    setSaving(true);
    try {
      const isEdit = initial && initial.id;
      const url = isEdit
        ? `/api/catalog/promotions/${initial.id}`
        : "/api/catalog/promotions";
      const method = isEdit ? "PUT" : "POST";
      const bodyStatus = isEdit ? status : "Pending";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          promotion_type: type,
          discount_value: discount,
          start_date: startDate,
          end_date: endDate,
          status: bodyStatus,
          store_id: storeId || null,
          discount_applied_on: discountAppliedOn,
          max_repeat_count: Number(maxRepeatCount || 0),
          use_for_customer: useForCustomer,
          remove_other_discounts: removeOtherDiscounts,
          is_auto_applied: isAutoApplied,
          min_cart_value: Number(minCartValue || 0),
          max_discount_value: Number(maxDiscountValue || 0),
          apply_after_tax: applyAfterTax,
          allow_merging: allowMerging,
          apply_on_product_mrp: applyOnProductMrp,
          description: description || null,
          products: freeProductId
            ? {
                eligibleProductIds: products
                  ? products
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                  : [],
                freeProductId: Number(freeProductId),
                freeProductQty: Number(freeProductQty || 1),
              }
            : products || null,
          coupon_enabled: couponEnabled,
          promotion_slots_enabled: promotionSlotsEnabled,
        }),
      });

      const json = await res.json();
      if (json.success) {
        if (onSaved) {
          onSaved(json.data, isEdit);
        } else if (!isEdit) {
          alert("Your promotion has been sent for approval");
          onClose?.();
        } else {
          window.location.reload();
        }
      } else {
        setError(json.message || "Save failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {initial?.id ? "Edit Promotion" : "Create Promotion"}
            </h3>
            <p className="text-xs text-slate-500">
              Store-wise auto scheme with free product on billing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <section className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Promotion Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Scheme Name"
                />
              </div>
              <div>
                <label className={labelClass}>
                  Date Range <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={startDate}
                    min={isNewPromotion ? today : undefined}
                    onChange={(e) => {
                      const nextStartDate = e.target.value;
                      setStartDate(nextStartDate);
                      if (endDate && endDate < nextStartDate) setEndDate("");
                    }}
                    className={inputClass}
                  />
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || (isNewPromotion ? today : undefined)}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  Store <span className="text-red-500">*</span>
                </label>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">
                    {storesLoading ? "Loading stores..." : "Select store"}
                  </option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                      {store.city ? ` - ${store.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Min Cart Value</label>
                <input
                  type="number"
                  min="0"
                  value={minCartValue}
                  onChange={(e) => setMinCartValue(e.target.value)}
                  className={inputClass}
                  placeholder="1999"
                />
              </div>
            </div>
          </section>

          <section className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <h4 className="mb-3 text-sm font-bold text-slate-900">
              Free Product
            </h4>
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <div className="relative">
                <label className={labelClass}>Search / scan barcode</label>
                <input
                  value={freeProductSearch}
                  onChange={(e) => {
                    setFreeProductSearch(e.target.value);
                    setSelectedFreeProduct(null);
                    setFreeProductId("");
                    setProductSearchMessage("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && freeProductResults.length === 1) {
                      e.preventDefault();
                      selectFreeProduct(freeProductResults[0]);
                    }
                  }}
                  className={inputClass}
                  placeholder="Scan barcode or search Sugar by name/SKU"
                />
                {(productSearching ||
                  freeProductResults.length > 0 ||
                  productSearchMessage) && (
                  <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                    {productSearching ? (
                      <div className="px-3 py-3 text-xs font-semibold text-slate-500">
                        Searching products...
                      </div>
                    ) : productSearchMessage ? (
                      <div className="px-3 py-3 text-xs font-semibold text-amber-700">
                        {productSearchMessage}
                      </div>
                    ) : (
                      freeProductResults.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => selectFreeProduct(product)}
                          className="block w-full border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-blue-50 last:border-0"
                        >
                          <span className="block font-semibold text-slate-900">
                            {product.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            Barcode: {product.barcode || "-"} | SKU:{" "}
                            {product.sku || "-"} | Unit:{" "}
                            {getProductUnit(product)} | ID: {product.id}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {selectedFreeProduct && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                    Selected: <b>{selectedFreeProduct.name}</b> | Barcode:{" "}
                    {selectedFreeProduct.barcode || "-"} | Product ID:{" "}
                    {selectedFreeProduct.id} | Unit: {freeProductUnit}
                  </div>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Free Qty {selectedFreeProduct ? `(${freeProductUnit})` : ""}
                </label>
                <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                  <input
                    type="number"
                    min={freeQtyStep}
                    step={freeQtyStep}
                    value={freeProductQty}
                    onChange={(e) => setFreeProductQty(e.target.value)}
                    className="min-w-0 flex-1 px-3 py-2.5 text-sm text-slate-900 outline-none"
                  />
                  <span className="flex min-w-16 items-center justify-center border-l border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600">
                    {freeProductUnit}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-800">
              Advanced promotion options
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Discount Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className={inputClass}
                >
                  <option>Discount</option>
                  <option>Conditional</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Discount Value</label>
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Discount Applied On</label>
                <select
                  value={discountAppliedOn}
                  onChange={(e) => setDiscountAppliedOn(e.target.value)}
                  className={inputClass}
                >
                  <option value="ORDER">Order</option>
                  <option value="PRODUCT">Product</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Max Repeat Count</label>
                <input
                  type="number"
                  value={maxRepeatCount}
                  onChange={(e) => setMaxRepeatCount(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Maximum discount value</label>
                <input
                  value={maxDiscountValue}
                  onChange={(e) => setMaxDiscountValue(e.target.value)}
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isAutoApplied}
                  onChange={(e) => setIsAutoApplied(e.target.checked)}
                />
                Auto apply
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={removeOtherDiscounts}
                  onChange={(e) => setRemoveOtherDiscounts(e.target.checked)}
                />
                Remove other discounts
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useForCustomer}
                  onChange={(e) => setUseForCustomer(e.target.checked)}
                />
                Use for customer
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={applyAfterTax}
                  onChange={(e) => setApplyAfterTax(e.target.checked)}
                />
                Apply after tax
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allowMerging}
                  onChange={(e) => setAllowMerging(e.target.checked)}
                />
                Allow merging
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={applyOnProductMrp}
                  onChange={(e) => setApplyOnProductMrp(e.target.checked)}
                />
                Apply on product MRP
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={couponEnabled}
                  onChange={(e) => setCouponEnabled(e.target.checked)}
                />
                Coupon enabled
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={promotionSlotsEnabled}
                  onChange={(e) => setPromotionSlotsEnabled(e.target.checked)}
                />
                Promotion slots
              </label>
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Eligible Products (comma-separated IDs, optional)
                </label>
                <textarea
                  value={products}
                  onChange={(e) => setProducts(e.target.value)}
                  className={inputClass}
                  rows={2}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClass}
                  rows={3}
                />
              </div>
            </div>
          </details>
        </div>

        {error && (
          <div className="px-6 pb-2 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
