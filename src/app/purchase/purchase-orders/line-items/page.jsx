"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { toDateInputValue } from "@/lib/dateUtils";
import { addCalendarDays, normalizeDateOnly } from "@/lib/vendorCreditTerms";

function formatCurrency(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function displayText(value) {
  const text = String(value ?? "").trim();
  if (!text || text.includes("â") || text.includes("Ã")) return "-";
  return text;
}

function LineItemsContent() {
  const search = useSearchParams();
  const router = useRouter();
  const id = search.get("id");

  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartFilter, setCartFilter] = useState("");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
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
  const [confirming, setConfirming] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const isSuperAdmin = currentUser?.role === "super_admin";

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setCurrentUser(json.data?.user || json.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  const userPermissions = Array.isArray(currentUser?.permissions)
    ? currentUser.permissions
    : [];
  const canManage =
    isSuperAdmin ||
    userPermissions.includes("*") ||
    userPermissions.includes("MANAGE_PURCHASE_ORDERS");
  const readOnly = !canManage;
  const poDate = normalizeDateOnly(draft?.createdAt);
  const vendorCreditDays = Number(draft?.vendorCreditDays || 0);
  const maximumPaymentDueDate = poDate && vendorCreditDays > 0
    ? addCalendarDays(poDate, vendorCreditDays)
    : "";
  const paymentDueDateInvalid = Boolean(
    form.payment_due_date && maximumPaymentDueDate && form.payment_due_date > maximumPaymentDueDate,
  );

  useEffect(() => {
    if (!id) return;

    fetch(`/api/purchase-orders/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        setDraft(d);
        if (d && !d.error) {
          setForm({
            destination: d.destination || "",
            vendor: d.vendor || "",
            invoice_date: toDateInputValue(d.invoice_date || d.invoiceDate),
            expected_delivery_date: toDateInputValue(
              d.expected_delivery_date || d.expectedDeliveryDate,
            ),
            payment_due_date: toDateInputValue(d.payment_due_date || d.paymentDueDate),
            shipment_mode: d.shipment_mode || d.shipmentMode || "",
            invoice_number: d.invoice_number || d.invoiceNumber || "",
            cc_emails: d.cc_emails || d.ccEmails || "",
          });
          if (Array.isArray(d.items) && d.items.length) {
            setCart(
              d.items.map((item) => ({
                product_id: item.product_id,
                name: item.name,
                sku: item.sku,
                barcode: item.barcode,
                available_qty: Number(
                  item.available_qty ?? item.availableQty ?? 0,
                ),
                cost_price: Number(item.cost_price || 0),
                mrp: Number(item.mrp || 0),
                selling_price: Number(item.selling_price || 0),
                expiry_date: item.expiry_date || null,
                brand_name: item.brand_name || "",
                current_stock: Number(item.current_stock || 0),
                last_grn_date: item.last_grn_date || null,
                last_grn_qty: Number(item.last_grn_qty || 0),
                avg_daily_sales: Number(item.avg_daily_sales || 0),
                sale_22_to_30: Number(item.sale_22_to_30 || 0),
                sale_15_to_21: Number(item.sale_15_to_21 || 0),
                sale_8_to_14: Number(item.sale_8_to_14 || 0),
                sale_1_to_7: Number(item.sale_1_to_7 || 0),
                mbq: Number(item.mbq || 0),
                required_qty: Number(item.required_qty || item.qty || 0),
                variant_key:
                  item.variant_key ||
                  `${item.product_id}:${item.mrp || 0}:${item.selling_price || 0}:${item.expiry_date || ""}`,
                tax_value: Number(item.tax_value || 0),
                qty: Number(item.qty || 1),
              })),
            );
          }
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const storeId = form.destination || draft?.destination || "";
      if (!storeId) {
        setProducts([]);
        return;
      }
      const q = searchTerm.trim();
      const params = new URLSearchParams({
        all: "true",
        includeAllProducts: "true",
      });
      if (q) params.set("search", q);
      if (storeId) params.set("store_id", storeId);
      fetch(`/api/catalog/products?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((res) => {
          const records = res?.data?.records ?? res?.records ?? [];
          setProducts(records);
        })
        .catch((err) => {
          if (err.name !== "AbortError") setProducts([]);
        });
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, form.destination, draft?.destination]);

  const filteredCart = useMemo(() => {
    if (!cartFilter.trim()) return cart;
    const q = cartFilter.toLowerCase();
    return cart.filter((item) => (item.name || "").toLowerCase().includes(q));
  }, [cart, cartFilter]);

  const totals = useMemo(() => {
    let totalItems = 0;
    let totalCost = 0;
    let totalTax = 0;

    for (const item of cart) {
      const qty = Number(item.qty || 0);
      const cost = Number(item.cost_price || 0);
      totalItems += qty;
      totalCost += qty * cost;
      totalTax += Number(item.tax_value || 0) * qty;
    }

    return { totalItems, totalCost, totalTax };
  }, [cart]);

  const addToCart = (product) => {
    const productId = product.id ?? product.product_id;
    const variantKey = `${productId}:${product.mrp || 0}:${product.selling_price || 0}:${product.expiry_date || ""}`;
    setCart((current) => {
      const existing = current.find(
        (item) => String(item.variant_key) === variantKey,
      );
      if (existing) {
        return current.map((item) =>
          String(item.variant_key) === variantKey
            ? { ...item, qty: Number(item.qty) + 1 }
            : item,
        );
      }

      const cost = Number(product.cost_price || 0);
      const taxRate = Number(product.tax_rate || 0);
      const availableQty = Number(
        product.availableQty ??
          product.availableStock ??
          product.available_qty ??
          product.actual_stock ??
          product.stock ??
          0,
      );
      return [
        ...current,
        {
          product_id: productId,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          available_qty: availableQty,
          cost_price: cost,
          mrp: Number(product.mrp || 0),
          selling_price: Number(product.selling_price || 0),
          expiry_date: product.expiry_date || null,
          variant_key: variantKey,
          tax_value: (cost * taxRate) / 100,
          qty: 1,
        },
      ];
    });
    setSearchTerm("");
    setProducts([]);
  };

  const updateQty = (variantKey, qty) => {
    setCart((current) =>
      current.map((item) =>
        String(item.variant_key) === String(variantKey)
          ? { ...item, qty: Math.max(1, Number(qty) || 1) }
          : item,
      ),
    );
  };

  const removeItem = (variantKey) => {
    setCart((current) =>
      current.filter((item) => String(item.variant_key) !== String(variantKey)),
    );
  };

  const confirm = async () => {
    if (!id) return alert("Missing purchase order id");
    if (cart.length === 0) return alert("Add at least one product");
    if (vendorCreditDays > 0 && !form.payment_due_date) return alert("Payment due date is required");
    if (paymentDueDateInvalid) return alert(`Payment due date cannot be after ${maximumPaymentDueDate}`);

    setConfirming(true);
    try {
      const res = await fetch(
        `/api/purchase-orders/${encodeURIComponent(id)}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form, items: cart }),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to confirm purchase order");
      router.push("/purchase/purchase-orders");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to confirm purchase order");
    } finally {
      setConfirming(false);
    }
  };

  const downloadReorderSheet = async () => {
    if (!cart.length) return alert("No PO items available to download");
    const XLSX = await import("xlsx");
    const rows = cart.map((item) => ({
      "PRODUCT ID": item.product_id || "",
      BRAND: item.brand_name || "",
      "ITEM NAME": item.name || "",
      BARCODE: item.barcode || item.sku || "",
      MRP: Number(item.mrp || 0),
      CP: Number(item.cost_price || 0),
      SP: Number(item.selling_price || 0),
      "EXPIRY DATE": item.expiry_date
        ? String(item.expiry_date).slice(0, 10)
        : "",
      "STOCK LEVEL": Number(item.current_stock || item.available_qty || 0),
      "LAST GRN DONE ON": item.last_grn_date
        ? String(item.last_grn_date).slice(0, 10)
        : "",
      "LAST GRN QTY": Number(item.last_grn_qty || 0),
      "AVERAGE SELLING RATIO OF 30DAYS": Number(item.avg_daily_sales || 0),
      "22 TO 30 SALE": Number(item.sale_22_to_30 || 0),
      "15 TO 21 SALE": Number(item.sale_15_to_21 || 0),
      "8 TO 14 SALE": Number(item.sale_8_to_14 || 0),
      "1 TO 7 SALE": Number(item.sale_1_to_7 || 0),
      MBQ: Number(item.mbq || 0),
      "REQ QTY": Number(item.required_qty || item.qty || 0),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = Object.keys(rows[0]).map((header) => ({
      wch: header === "ITEM NAME" ? 36 : Math.max(12, header.length + 2),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PO Reorder Sheet");
    XLSX.writeFile(
      workbook,
      `${draft?.transactionId || `PO-${id}`}-reorder-sheet.xlsx`,
    );
  };

  if (!id) {
    return (
      <MainLayout>
        <div className="text-gray-600">
          Missing purchase order id. Go back and start a new purchase order.
        </div>
      </MainLayout>
    );
  }

  const destinationLabel = draft?.destinationName || "—";
  const vendorLabel = draft?.vendorName || "—";

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Purchase</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">
          Purchase Order - line items
        </span>
      </div>

      <div className="flex gap-5 pb-28">
        <div className="w-[280px] flex-shrink-0 bg-white rounded-lg border border-gray-200 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <h3 className="text-[15px] font-semibold text-blue-600 mb-5">
            Purchase Order Information
          </h3>

          <div className="mb-4">
            <label className="block text-[12px] text-gray-500 mb-1">
              Destination
            </label>
            <p className="text-[13px] font-medium text-gray-900">
              {loading ? "…" : destinationLabel}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-[12px] text-gray-500 mb-1">
              Payment Due Date {vendorCreditDays > 0 ? "*" : ""}
            </label>
            <input
              type="date"
              min={poDate || undefined}
              max={maximumPaymentDueDate || undefined}
              value={form.payment_due_date}
              onChange={(e) => setForm({ ...form, payment_due_date: e.target.value })}
              disabled={readOnly}
              className={`w-full border rounded-lg px-3 py-2 text-[13px] text-gray-700 outline-none disabled:bg-gray-50 disabled:text-gray-500 ${paymentDueDateInvalid ? "border-red-500" : "border-gray-200 focus:border-blue-400"}`}
            />
            {vendorCreditDays > 0 && (
              <p className={`mt-1 text-[11px] ${paymentDueDateInvalid ? "text-red-600" : "text-gray-500"}`}>
                {vendorCreditDays}-day vendor term. Latest allowed: {maximumPaymentDueDate}.
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-[12px] text-gray-500 mb-1">
              Vendor Name
            </label>
            <p className="text-[13px] font-medium text-gray-900">
              {loading ? "…" : vendorLabel}
            </p>
          </div>

          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-[12px] text-gray-500 mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={(e) =>
                  setForm({ ...form, invoice_date: e.target.value })
                }
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[12px] text-gray-500 mb-1">
                Expected Delivery
              </label>
              <input
                type="date"
                value={form.expected_delivery_date}
                onChange={(e) =>
                  setForm({ ...form, expected_delivery_date: e.target.value })
                }
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[12px] text-gray-500 mb-1">
              Shipment Mode
            </label>
            <input
              value={form.shipment_mode}
              onChange={(e) =>
                setForm({ ...form, shipment_mode: e.target.value })
              }
              placeholder="Shipment mode"
              disabled={readOnly}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-[12px] text-gray-500 mb-1">
              Invoice Number
            </label>
            <input
              value={form.invoice_number}
              onChange={(e) =>
                setForm({ ...form, invoice_number: e.target.value })
              }
              placeholder="Invoice number"
              disabled={readOnly}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-[12px] text-gray-500 mb-1">
              CC Email
            </label>
            <textarea
              value={form.cc_emails}
              onChange={(e) => setForm({ ...form, cc_emails: e.target.value })}
              placeholder="CC emails"
              rows={5}
              disabled={readOnly}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-blue-400 resize-none disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {!readOnly && (
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2.5 mb-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <i className="ti ti-search text-gray-400 text-[16px]" />
              <input
                type="text"
                placeholder="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 shadow-[0_1px_2px_rgba(15,23,42,0.03)] min-h-[calc(100vh-220px)] flex flex-col">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-[14px] font-semibold text-gray-900">
                  Purchase Order - Line Items
                </h2>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  Search products and confirm the transaction
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadReorderSheet}
                  disabled={!cart.length}
                  className="rounded-lg border border-green-300 px-3 py-2 text-[12px] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  Download Reorder Sheet
                </button>
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search"
                    value={cartFilter}
                    onChange={(e) => setCartFilter(e.target.value)}
                    className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
                  />
                  <i className="ti ti-search text-gray-400 text-[15px]" />
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto">
              {products.length > 0 && (
                <div className="mb-4 max-h-[360px] overflow-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-50/60 transition-colors"
                    >
                      <div>
                        <div className="text-[13px] font-medium text-gray-900">
                          {product.name}
                        </div>
                        <div className="text-[12px] text-gray-500">
                          Barcode: {displayText(product.barcode)}
                        </div>
                      </div>
                      <span className="text-[12px] font-medium text-blue-600">
                        Add
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {products.length === 0 && (
                <p className="text-[13px] text-gray-500 text-center py-8">
                  No products found
                </p>
              )}

              {filteredCart.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide py-2 px-2">
                        Product
                      </th>
                      <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide py-2 px-2">
                        Available Qty
                      </th>
                      <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide py-2 px-2">
                        MRP / SP / Expiry
                      </th>
                      <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide py-2 px-2">
                        Qty
                      </th>
                      <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide py-2 px-2">
                        Cost
                      </th>
                      <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide py-2 px-2">
                        Tax
                      </th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCart.map((item) => (
                      <tr
                        key={item.variant_key}
                        className="border-b border-gray-50 hover:bg-gray-50/50"
                      >
                        <td className="py-3 px-2">
                          <div className="text-[13px] font-medium text-gray-900">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {displayText(item.barcode)}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-[13px] text-gray-700">
                          {Number(item.available_qty || 0).toLocaleString(
                            "en-IN",
                          )}
                        </td>
                        <td className="py-3 px-2 text-[12px] text-gray-700">
                          <div>
                            MRP {formatCurrency(item.mrp)} · SP{" "}
                            {formatCurrency(item.selling_price)}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {item.expiry_date
                              ? String(item.expiry_date).slice(0, 10)
                              : "No expiry"}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <input
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={(e) =>
                              updateQty(item.variant_key, e.target.value)
                            }
                            disabled={readOnly}
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-[13px] text-gray-700 disabled:bg-gray-50 disabled:text-gray-500"
                          />
                        </td>
                        <td className="py-3 px-2 text-[13px] text-gray-700">
                          {formatCurrency(item.cost_price)}
                        </td>
                        <td className="py-3 px-2 text-[13px] text-gray-700">
                          {formatCurrency(item.tax_value)}
                        </td>
                        <td className="py-3 px-2">
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => removeItem(item.variant_key)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                            >
                              <i className="ti ti-trash text-[16px]" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="min-h-[400px]" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed left-[218px] right-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] max-md:left-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-10 flex-wrap">
            <span className="text-[13px] text-gray-600">
              Total Items:{" "}
              <strong className="text-gray-900 font-semibold">
                {totals.totalItems}
              </strong>
            </span>
            <span className="text-[13px] text-gray-600">
              Total Cost:{" "}
              <strong className="text-gray-900 font-semibold">
                {formatCurrency(totals.totalCost)}
              </strong>
            </span>
            <span className="text-[13px] text-gray-600">
              Total Tax Value:{" "}
              <strong className="text-gray-900 font-semibold">
                {formatCurrency(totals.totalTax)}
              </strong>
            </span>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCart([])}
                className="p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                title="Clear cart"
              >
                <i className="ti ti-trash text-[18px]" />
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={confirming || cart.length === 0}
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {confirming ? "Confirming…" : "Confirm Transaction"}
              </button>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

export default function PurchaseOrderLineItemsPage() {
  return (
    <Suspense
      fallback={
        <MainLayout>
          <div className="text-gray-500 p-4">Loading…</div>
        </MainLayout>
      }
    >
      <LineItemsContent />
    </Suspense>
  );
}
