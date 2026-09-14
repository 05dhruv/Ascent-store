"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";
import { formatIndianDate } from "@/lib/dateUtils";
import { createPortal } from "react-dom";

function formatCurrency(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUnitPrice(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function generateBatchNo() {
  return `BATCH-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function getProductSku(product) {
  return (
    product?.sku ||
    product?.barcode ||
    product?.product_id ||
    product?.productId ||
    ""
  );
}

function LineItemsContent() {
  const search = useSearchParams();
  const router = useRouter();
  const id = search.get("id");

  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Cart & Item management
  const [cart, setCart] = useState([]);
  const [cartFilter, setCartFilter] = useState("");

  // Inward Details Form
  const [form, setForm] = useState({
    vendor: "",
    invoice_date: "",
    invoice_number: "",
    vehicleNumber: "",
    checkedBy: "",
    receiptEvidence: "",
    inspectionConfirmed: true,
    other_charges: "",
    remarks: "",
  });

  const [vendors, setVendors] = useState([]);
  const [selectedVendorIds, setSelectedVendorIds] = useState([]);

  // Add Product Modal states
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedBrandFilter, setSelectedBrandFilter] = useState("");

  const isConfirmedStockIn =
    String(draft?.status || "").toLowerCase() === "confirmed";
  const destinationLabel = draft?.destinationName || "Warehouse / Site";

  // Initial Data Load
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/inventory/stockin/${encodeURIComponent(id)}`, {
        cache: "no-store",
      }).then((r) => r.json()),
      fetch("/api/vendors?pageSize=500", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/catalog/brands?pageSize=500", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({})),
    ])
      .then(([d, v, b]) => {
        setDraft(d);
        setVendors(Array.isArray(v?.records || v) ? v.records || v : []);
        setBrands(Array.isArray(b?.data?.records || b?.records) ? b.data?.records || b.records : []);

        if (d && !d.error) {
          setForm({
            vendor:
              d.vendor_name ||
              (Array.isArray(d.meta?.vendorNames)
                ? d.meta.vendorNames.join(", ")
                : ""),
            invoice_date: d.invoice_date || new Date().toISOString().slice(0, 10),
            invoice_number: d.invoice_number || "",
            vehicleNumber: d.meta?.vehicleNumber || d.meta?.vehicle_number || "",
            checkedBy: d.meta?.checkedBy || d.meta?.checked_by || d.meta?.createdByName || "",
            receiptEvidence: d.meta?.receiptEvidence || d.meta?.receipt_evidence || "",
            inspectionConfirmed: d.meta?.inspectionConfirmed ?? true,
            other_charges: d.other_charges ?? "",
            remarks: d.remarks || "",
          });
          setSelectedVendorIds(
            (Array.isArray(d.meta?.vendorIds) ? d.meta.vendorIds : []).map(String),
          );

          if (Array.isArray(d.items) && d.items.length) {
            setCart(
              d.items.map((item, index) => {
                const qty = Number(item.qty || 1);
                const damaged = Number(item.damaged_qty || 0);
                const rejected = Number(item.rejected_qty || 0);
                return {
                  line_id: `${item.product_id}-${item.id || index}-${Date.now()}`,
                  stock_in_item_id: item.id || null,
                  product_id: item.product_id,
                  name: item.name || item.product_name || `Item ${index + 1}`,
                  sku: getProductSku(item),
                  brand: item.brand_name || item.brand || "",
                  unit: item.unit || "PCS",
                  cost_price: Number(item.cost_price || 0),
                  tax_value: Number(item.tax_value || 0),
                  mrp: Number(item.mrp || 0),
                  selling_price: Number(item.selling_price || 0),
                  qty,
                  damaged_qty: damaged,
                  rejected_qty: rejected,
                  batch_no: item.batch_no || generateBatchNo(),
                  expiry_date: item.expiry_date || "",
                  remarks: item.remarks || "",
                };
              }),
            );
          }
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Product Search for Modal
  useEffect(() => {
    if (!showAddProductModal) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoadingProducts(true);
      const params = new URLSearchParams({ pageSize: "40" });
      if (productSearchTerm.trim()) params.set("search", productSearchTerm.trim());
      if (selectedBrandFilter) params.set("brandId", selectedBrandFilter);

      fetch(`/api/catalog/products?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((json) => {
          const records = json.data?.records || json.records || [];
          setAvailableProducts(Array.isArray(records) ? records : []);
        })
        .catch(() => setAvailableProducts([]))
        .finally(() => setLoadingProducts(false));
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [showAddProductModal, productSearchTerm, selectedBrandFilter]);

  // Add Product to Cart
  const addProductToInward = (product) => {
    setCart((current) => {
      const existing = current.find(
        (it) => String(it.product_id) === String(product.id || product.product_id),
      );
      if (existing) {
        return current.map((it) =>
          it === existing ? { ...it, qty: Number(it.qty || 1) + 1 } : it,
        );
      }

      return [
        ...current,
        {
          line_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          stock_in_item_id: null,
          product_id: product.id || product.product_id,
          name: product.name || product.productName,
          sku: getProductSku(product),
          brand: product.brand_name || product.brand || "",
          unit: product.unit || "PCS",
          cost_price: Number(product.cost_price || product.costPerUnit || 0),
          tax_value: 0,
          mrp: Number(product.mrp || 0),
          selling_price: Number(product.selling_price || product.sellingPrice || 0),
          qty: 1,
          damaged_qty: 0,
          rejected_qty: 0,
          batch_no: generateBatchNo(),
          expiry_date: "",
          remarks: "",
        },
      ];
    });
  };

  const updateCartRow = (lineId, updates) => {
    setCart((curr) =>
      curr.map((item) => (item.line_id === lineId ? { ...item, ...updates } : item)),
    );
  };

  const removeCartRow = (lineId) => {
    setCart((curr) => curr.filter((item) => item.line_id !== lineId));
  };

  // Filtered Cart for Search
  const filteredCart = useMemo(() => {
    const q = cartFilter.trim().toLowerCase();
    if (!q) return cart;
    return cart.filter((item) =>
      [item.name, item.sku, item.brand, item.batch_no]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q)),
    );
  }, [cart, cartFilter]);

  // Totals Calculation
  const totals = useMemo(() => {
    let totalItems = cart.length;
    let totalReceivedQty = 0;
    let totalDamagedQty = 0;
    let totalRejectedQty = 0;
    let totalAcceptedQty = 0;
    let totalCost = 0;

    cart.forEach((item) => {
      const rQty = Number(item.qty || 0);
      const dQty = Number(item.damaged_qty || 0);
      const rejQty = Number(item.rejected_qty || 0);
      const accQty = Math.max(0, rQty - dQty - rejQty);
      const cost = Number(item.cost_price || 0);

      totalReceivedQty += rQty;
      totalDamagedQty += dQty;
      totalRejectedQty += rejQty;
      totalAcceptedQty += accQty;
      totalCost += accQty * cost;
    });

    return {
      totalItems,
      totalReceivedQty,
      totalDamagedQty,
      totalRejectedQty,
      totalAcceptedQty,
      totalCost,
    };
  }, [cart]);

  // Payload Builder
  const buildItemsPayload = () =>
    cart.map((item) => {
      const qty = Number(item.qty || 0);
      const damaged = Number(item.damaged_qty || 0);
      const rejected = Number(item.rejected_qty || 0);
      const accepted = Math.max(0, qty - damaged - rejected);
      const batchNo = item.batch_no || generateBatchNo();

      return {
        stock_in_item_id: item.stock_in_item_id || undefined,
        product_id: item.product_id,
        product_name: item.name,
        sku: item.sku || "",
        qty,
        damaged_qty: damaged,
        rejected_qty: rejected,
        accepted_qty: accepted,
        cost_price: Number(item.cost_price || 0),
        tax_value: Number(item.tax_value || 0),
        mrp: Number(item.mrp || 0),
        selling_price: Number(item.selling_price || 0),
        batch_no: batchNo,
        expiry_date: item.expiry_date || null,
        batches: [
          {
            batch_no: batchNo,
            qty,
            damaged_qty: damaged,
            rejected_qty: rejected,
            accepted_qty: accepted,
            expiry_date: item.expiry_date || null,
          },
        ],
        remarks: item.remarks || "",
      };
    });

  // Save Draft
  const handleSaveDraft = async () => {
    if (!id) return;
    setSavingDraft(true);
    try {
      const items = buildItemsPayload();
      const res = await fetch(`/api/inventory/stockin/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form: {
            vendor: form.vendor || null,
            invoice_number: form.invoice_number || null,
            invoice_date: form.invoice_date || null,
            other_charges: Number(form.other_charges || 0),
            remarks: form.remarks || "",
            vehicleNumber: form.vehicleNumber || "",
            checkedBy: form.checkedBy || "",
            receiptEvidence: form.receiptEvidence || "",
            inspectionConfirmed: form.inspectionConfirmed,
          },
          items,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save draft.");
      alert("Material Inward draft saved successfully.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Confirm & Finalize GRN
  const handleConfirmGRN = async () => {
    if (!id) return alert("Missing stock in ID");
    if (cart.length === 0) return alert("Please add at least one material.");
    if (!form.inspectionConfirmed) {
      return alert("Please check the physical count and inspection confirmation box.");
    }

    setConfirming(true);
    try {
      const items = buildItemsPayload();

      // First ensure draft items are up to date
      await fetch(`/api/inventory/stockin/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form: {
            vendor: form.vendor || null,
            invoice_number: form.invoice_number || null,
            invoice_date: form.invoice_date || null,
            remarks: form.remarks || "",
            vehicleNumber: form.vehicleNumber || "",
            checkedBy: form.checkedBy || "",
            receiptEvidence: form.receiptEvidence || "",
            inspectionConfirmed: true,
          },
          items,
        }),
      });

      // Call confirm endpoint
      const res = await fetch(
        `/api/inventory/stockin/${encodeURIComponent(id)}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            form: {
              ...form,
              inspectionConfirmed: true,
              checkedBy: form.checkedBy || "Storekeeper",
              receiptEvidence: form.receiptEvidence || form.invoice_number || "Verified Inward",
            },
            items,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to confirm GRN.");

      alert("Material Inward (GRN) confirmed and stock posted successfully!");
      router.push("/inventory/stockin");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to confirm GRN.");
    } finally {
      setConfirming(false);
    }
  };

  if (!id) {
    return (
      <MainLayout>
        <div className="p-8 text-center text-slate-500">
          <p>Missing stock in ID. Please select a record from the list.</p>
          <Link
            href="/inventory/stockin"
            className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Go to Material Inward List
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl space-y-4 pb-12">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link href="/inventory/stockin" className="text-blue-600 hover:underline">
                Material Inward (GRN)
              </Link>
              <i className="ti ti-chevron-right text-[10px] text-slate-400" />
              <span className="font-semibold text-slate-800">
                Inward #{draft?.transactionId || `GRN-${id}`}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">
                Material Inward & Inspection
              </h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isConfirmedStockIn
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConfirmedStockIn ? "bg-emerald-600" : "bg-amber-600"
                  }`}
                />
                {isConfirmedStockIn ? "Confirmed & Posted" : "Draft / Inspection"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/inventory/stockin"
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ← Back to List
            </Link>
            {!isConfirmedStockIn && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 shadow-sm hover:bg-blue-100"
                >
                  <i className="ti ti-plus text-sm" />
                  <span>Add Material</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft || confirming}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {savingDraft ? "Saving..." : "Save Draft"}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmGRN}
                  disabled={confirming || savingDraft || cart.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 disabled:opacity-50"
                >
                  {confirming ? "Confirming..." : "Confirm & Post GRN"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inward Details Card (Clean 4-6 Column Responsive Grid) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <i className="ti ti-truck-delivery text-blue-600 text-sm" />
              <span>Inward & Receipt Details</span>
            </div>
            <div className="text-xs text-slate-500">
              Destination: <strong className="text-slate-900">{destinationLabel}</strong>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Supplier / Vendor
              </label>
              <input
                type="text"
                list="vendor-options"
                value={form.vendor}
                disabled={isConfirmedStockIn}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                placeholder="Select or enter supplier..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
              <datalist id="vendor-options">
                {vendors.map((v) => (
                  <option key={v.id || v.name} value={v.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Challan / Invoice No
              </label>
              <input
                type="text"
                value={form.invoice_number}
                disabled={isConfirmedStockIn}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                placeholder="e.g. DC-9872"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Inward / Challan Date
              </label>
              <input
                type="date"
                value={form.invoice_date}
                disabled={isConfirmedStockIn}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Vehicle / Gate Entry No
              </label>
              <input
                type="text"
                value={form.vehicleNumber}
                disabled={isConfirmedStockIn}
                onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
                placeholder="e.g. DL-01-A-1234"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Checked / Received By
              </label>
              <input
                type="text"
                value={form.checkedBy}
                disabled={isConfirmedStockIn}
                onChange={(e) => setForm({ ...form, checkedBy: e.target.value })}
                placeholder="Storekeeper name"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Remarks / Notes
              </label>
              <input
                type="text"
                value={form.remarks}
                disabled={isConfirmedStockIn}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Optional remarks"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Materials Table Section */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-700 text-xs font-bold">
                {cart.length}
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Materials for Inward Receipt
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter materials..."
                  value={cartFilter}
                  onChange={(e) => setCartFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              {!isConfirmedStockIn && (
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(true)}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  <i className="ti ti-plus text-xs" />
                  <span>Add Material</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-100/70 text-[11px] font-bold uppercase text-slate-600">
                <tr>
                  <th className="w-10 px-3.5 py-3">#</th>
                  <th className="min-w-[200px] px-3.5 py-3">Material & Specification</th>
                  <th className="px-3.5 py-3">Unit</th>
                  <th className="min-w-[130px] px-3.5 py-3">Batch / Heat No</th>
                  <th className="min-w-[130px] px-3.5 py-3">Expiry / Warranty</th>
                  <th className="w-24 px-3.5 py-3 text-right">Received Qty</th>
                  <th className="w-20 px-3.5 py-3 text-right">Damaged</th>
                  <th className="w-20 px-3.5 py-3 text-right">Rejected</th>
                  <th className="w-24 px-3.5 py-3 text-right">Accepted Qty</th>
                  <th className="w-28 px-3.5 py-3 text-right">Purchase Rate (₹)</th>
                  <th className="w-28 px-3.5 py-3 text-right">Total (₹)</th>
                  {!isConfirmedStockIn && <th className="w-10 px-3 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCart.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400">
                      <i className="ti ti-box text-3xl mb-1 block opacity-40" />
                      <p className="font-semibold text-slate-600">No materials added yet.</p>
                      <p className="mt-1 text-[11px]">
                        Click &ldquo;Add Material&rdquo; above to select items from catalog.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredCart.map((item, index) => {
                    const rQty = Number(item.qty || 0);
                    const dQty = Number(item.damaged_qty || 0);
                    const rejQty = Number(item.rejected_qty || 0);
                    const accQty = Math.max(0, rQty - dQty - rejQty);
                    const cost = Number(item.cost_price || 0);
                    const lineTotal = accQty * cost;

                    return (
                      <tr key={item.line_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3.5 py-3 font-medium text-slate-400">{index + 1}</td>
                        <td className="px-3.5 py-3">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-slate-500">
                            {item.sku && <span>SKU: {item.sku}</span>}
                            {item.brand && (
                              <span className="rounded bg-slate-100 px-1 py-0.2 font-medium text-slate-700">
                                Make: {item.brand}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 font-medium text-slate-700">{item.unit || "PCS"}</td>
                        <td className="px-3.5 py-3">
                          {isConfirmedStockIn ? (
                            <span className="font-mono text-slate-700">{item.batch_no || "—"}</span>
                          ) : (
                            <input
                              type="text"
                              value={item.batch_no}
                              onChange={(e) => updateCartRow(item.line_id, { batch_no: e.target.value })}
                              placeholder="Batch/Lot No"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-500"
                            />
                          )}
                        </td>
                        <td className="px-3.5 py-3">
                          {isConfirmedStockIn ? (
                            <span className="text-slate-700">
                              {item.expiry_date ? formatIndianDate(item.expiry_date) : "—"}
                            </span>
                          ) : (
                            <input
                              type="date"
                              value={item.expiry_date}
                              onChange={(e) => updateCartRow(item.line_id, { expiry_date: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-500"
                            />
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          {isConfirmedStockIn ? (
                            <span className="font-bold text-slate-900">{rQty}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.qty}
                              onChange={(e) => updateCartRow(item.line_id, { qty: e.target.value })}
                              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                            />
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          {isConfirmedStockIn ? (
                            <span className={dQty > 0 ? "font-bold text-amber-700" : "text-slate-400"}>
                              {dQty}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              max={rQty}
                              step="any"
                              value={item.damaged_qty}
                              onChange={(e) => updateCartRow(item.line_id, { damaged_qty: e.target.value })}
                              className="w-16 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-right text-xs text-amber-800 outline-none focus:border-amber-500"
                            />
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          {isConfirmedStockIn ? (
                            <span className={rejQty > 0 ? "font-bold text-red-700" : "text-slate-400"}>
                              {rejQty}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              max={rQty}
                              step="any"
                              value={item.rejected_qty}
                              onChange={(e) => updateCartRow(item.line_id, { rejected_qty: e.target.value })}
                              className="w-16 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-right text-xs text-red-800 outline-none focus:border-red-500"
                            />
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right font-bold text-emerald-800">
                          {accQty.toLocaleString("en-IN")}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          {isConfirmedStockIn ? (
                            <span className="text-slate-700">₹{formatUnitPrice(cost)}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.cost_price}
                              onChange={(e) => updateCartRow(item.line_id, { cost_price: e.target.value })}
                              className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-800 outline-none focus:border-blue-500"
                            />
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right font-bold text-slate-900">
                          ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        {!isConfirmedStockIn && (
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeCartRow(item.line_id)}
                              className="rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Remove item"
                            >
                              <i className="ti ti-trash text-sm" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Physical Count & Inspection Confirmation Checkbox */}
          {!isConfirmedStockIn && (
            <div className="border-t border-slate-100 bg-slate-50/70 p-4">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={form.inspectionConfirmed}
                  onChange={(e) => setForm({ ...form, inspectionConfirmed: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="leading-tight font-medium">
                  <strong>Physical verification & quality check completed:</strong> I confirm the physical count, material condition, and that acceptable quantities are verified for posting into inventory.
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="sticky bottom-4 z-20 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600">
              <div>
                <span>Total Materials: </span>
                <strong className="text-slate-900">{totals.totalItems}</strong>
              </div>
              <div>
                <span>Total Received Qty: </span>
                <strong className="text-slate-900">{totals.totalReceivedQty.toLocaleString("en-IN")}</strong>
              </div>
              <div>
                <span>Accepted Usable Qty: </span>
                <strong className="text-emerald-700 font-bold">{totals.totalAcceptedQty.toLocaleString("en-IN")}</strong>
              </div>
              <div>
                <span>Total Inward Value: </span>
                <strong className="text-base text-slate-900 font-bold">
                  ₹{totals.totalCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isConfirmedStockIn && (
                <>
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    disabled={cart.length === 0}
                    className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    title="Clear all materials"
                  >
                    <i className="ti ti-trash text-base" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={savingDraft || confirming}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {savingDraft ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmGRN}
                    disabled={confirming || savingDraft || cart.length === 0}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {confirming ? (
                      <>
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Confirming & Posting...</span>
                      </>
                    ) : (
                      <>
                        <i className="ti ti-check text-sm" />
                        <span>Confirm & Post GRN</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddProductModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add Materials to Inward</h3>
                  <p className="text-xs text-slate-500">Search products from catalog by name, code, or brand.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <i className="ti ti-x text-base" />
                </button>
              </div>

              {/* Search & Filter bar */}
              <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/50 p-4">
                <div className="relative flex-1 min-w-[200px]">
                  <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                  <input
                    type="text"
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    placeholder="Search material by name or SKU..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>

                <select
                  value={selectedBrandFilter}
                  onChange={(e) => setSelectedBrandFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="">All Brands / Makes</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Product Results */}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {loadingProducts ? (
                  <div className="py-12 text-center text-xs text-slate-400">Loading catalog items...</div>
                ) : availableProducts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No products found matching your search.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {availableProducts.map((p) => {
                      const isAdded = cart.some(
                        (it) => String(it.product_id) === String(p.id || p.product_id),
                      );
                      return (
                        <div
                          key={p.id || p.product_id}
                          className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50 transition-colors"
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-900">{p.name}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                              <span>SKU: {getProductSku(p) || "—"}</span>
                              {p.brand_name && (
                                <span className="rounded bg-slate-100 px-1 font-medium text-slate-700">
                                  {p.brand_name}
                                </span>
                              )}
                              <span>Rate: ₹{formatUnitPrice(p.cost_price || p.costPerUnit || 0)}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => addProductToInward(p)}
                            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              isAdded
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-blue-600 text-white hover:bg-blue-700"
                            }`}
                          >
                            <i className={isAdded ? "ti ti-check" : "ti ti-plus"} />
                            <span>{isAdded ? "Added (+1)" : "Add"}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </MainLayout>
  );
}

export default function StockInLineItemsPage() {
  return (
    <Suspense
      fallback={
        <MainLayout>
          <div className="text-gray-500 p-8 text-center text-xs">Loading Material Inward Inspector…</div>
        </MainLayout>
      }
    >
      <LineItemsContent />
    </Suspense>
  );
}
