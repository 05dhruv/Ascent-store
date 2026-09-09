"use client";

import { useState } from "react";
import ReportsListPage from "@/components/ReportListPage";

const filters = [
  {
    key: "store",
    label: "Store",
    type: "select",
    options: [],
  },
];

const columns = [
  { key: "store", label: "Store" },
  { key: "product", label: "Product" },
  { key: "barcode", label: "Barcode" },
  { key: "sku", label: "SKU" },
  { key: "batch_no", label: "Batch No" },
  { key: "mfg_date", label: "MFG Date" },
  { key: "expiry_date", label: "Expiry Date" },
  { key: "received_qty", label: "Received Qty" },
  { key: "available_qty", label: "Available Qty" },
  { key: "unit", label: "Unit" },
  { key: "cost_price", label: "Cost Price" },
  { key: "selling_price", label: "Selling Price" },
  { key: "mrp", label: "MRP" },
  { key: "stock_value", label: "Stock Value" },
  { key: "status", label: "Status" },
  { key: "source_type", label: "Source" },
  { key: "price_action", label: "Price Action" },
];

function editablePrice(value) {
  return String(value ?? "")
    .replace(/[₹,\s]/g, "")
    .replace(/[^\d.-]/g, "")
    .replace(/(?!^)-/g, "");
}

function cleanEditablePrice(value) {
  return String(value ?? "")
    .replace(/[\u20b9,\s]/g, "")
    .replace(/[^\d.-]/g, "")
    .replace(/(?!^)-/g, "");
}

export default function StoreWiseBatchReportPage() {
  const [editingBatch, setEditingBatch] = useState(null);
  const [costPrice, setCostPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const openPriceEditor = (row) => {
    if (
      String(row.status).toLowerCase() !== "active" ||
      Number(row.available_qty) <= 0
    ) {
      setMessage("Only an active batch with available stock can be repriced.");
      return;
    }
    setEditingBatch(row);
    setCostPrice(cleanEditablePrice(row.cost_price));
    setMrp(cleanEditablePrice(row.mrp));
    setSellingPrice(cleanEditablePrice(row.selling_price));
    setMessage("");
  };

  const savePrice = async () => {
    const nextCostPrice = Number(costPrice);
    const nextMrp = Number(mrp);
    const nextSellingPrice = Number(sellingPrice);
    if (
      !editingBatch ||
      !Number.isFinite(nextCostPrice) ||
      nextCostPrice < 0 ||
      !(nextMrp > 0) ||
      !(nextSellingPrice > 0)
    ) {
      setMessage("Enter valid cost price, MRP and selling price.");
      return;
    }
    if (nextSellingPrice > nextMrp) {
      setMessage("Selling price cannot be greater than MRP.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/inventory/batches/${editingBatch.batch_id}/price`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            costPrice: nextCostPrice,
            mrp: nextMrp,
            sellingPrice: nextSellingPrice,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.message || "Unable to update batch price");
      setEditingBatch(null);
      setMessage(
        "Batch prices updated. Refresh or apply the report to see the new values.",
      );
    } catch (error) {
      setMessage(error.message || "Unable to update batch price");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {message && (
        <div className="fixed right-5 top-24 z-[100] rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl">
          {message}
        </div>
      )}
      <ReportsListPage
        breadcrumbs={[
          { label: "Reports Dashboard", href: "/reports" },
          { label: "Inventory" },
          { label: "Store Wise Batch Report" },
        ]}
        title="Store Wise Batch Report"
        description="Batch-level stock and price report by store"
        filters={filters}
        columns={columns}
        reportKey="inventory/store-wise-batch-report"
        stickyFilters
        totalLabel="Batches"
        emptyMessage="No batches found"
        renderCell={(row, column) => {
          if (column.key !== "price_action") return row[column.key] ?? "-";
          const editable =
            String(row.status).toLowerCase() === "active" &&
            Number(row.available_qty) > 0;
          return (
            <button
              type="button"
              disabled={!editable}
              onClick={() => openPriceEditor(row)}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Edit Prices
            </button>
          );
        }}
      />
      {editingBatch && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900">
              Edit Batch Prices
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {editingBatch.product} · Available stock:{" "}
              {editingBatch.available_qty}
            </p>
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-semibold text-slate-700">
                Cost Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  onChange={(event) => setCostPrice(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                MRP
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mrp}
                  onChange={(event) => setMrp(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Selling Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellingPrice}
                  onChange={(event) => setSellingPrice(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              This changes batch prices only; stock quantity and batch details
              remain unchanged.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePrice}
                disabled={saving}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Prices"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
