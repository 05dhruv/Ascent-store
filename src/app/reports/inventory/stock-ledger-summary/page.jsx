"use client";

import { useState } from "react";
import ReportsListPage from "@/components/ReportListPage";

const filters = [
  {
    key: "date_range",
    label: "Date Range",
    type: "date-range",
  },
  {
    key: "transaction_type",
    label: "Transaction Type",
    type: "select",
    options: [
      { value: "all", label: "ALL" },
      { value: "SALES_INVOICE", label: "SALES INVOICE" },
      { value: "SALES_RETURN", label: "SALES RETURN" },
      { value: "STOCK_IN", label: "STOCK IN" },
      { value: "STOCK_OUT", label: "STOCK OUT" },
      { value: "STOCK_TRANSFER_IN", label: "STOCK TRANSFER IN" },
      { value: "STOCK_TRANSFER_OUT", label: "STOCK TRANSFER OUT" },
    ],
  },
  {
    key: "store",
    label: "Select Inventory Source",
    type: "select",
  },
];

const columns = [
  {
    key: "ledger_id",
    label: "ID",
  },
  {
    key: "inventory_source_id",
    label: "Inventory Source ID",
  },
  {
    key: "inventory_source_type",
    label: "Inventory Source Type",
  },
  {
    key: "source_name",
    label: "Source Name",
  },
  {
    key: "user_name",
    label: "User Name",
  },
  {
    key: "transaction_party_id",
    label: "Transaction Party ID",
  },
  {
    key: "transaction_party_type",
    label: "Transaction Party Type",
  },
  {
    key: "transaction_party_name",
    label: "Transaction Party Name",
  },
  {
    key: "transaction_id",
    label: "Transaction ID",
  },
  {
    key: "transaction_type",
    label: "Transaction Type",
  },
  {
    key: "transaction_sub_type",
    label: "Transaction Sub Type",
  },
  {
    key: "trans_ref1",
    label: "Trans Ref1",
  },
  {
    key: "trans_ref2",
    label: "Trans Ref2",
  },
  {
    key: "audit_id",
    label: "Audit ID",
  },
  {
    key: "total_item_count",
    label: "Total Item Count",
  },
  {
    key: "total_item_quantity",
    label: "Total Item Quantity",
  },
  {
    key: "total_transaction_value",
    label: "Total Transaction Value",
  },
  {
    key: "transaction_user",
    label: "Transaction User",
  },
  {
    key: "transaction_time",
    label: "Transaction Time",
  },
  {
    key: "total_approved_quantity",
    label: "Total Approved Quantity",
  },
  {
    key: "total_approved_value",
    label: "Total Approved Value",
  },
  {
    key: "approval_status",
    label: "Approval Status",
  },
  {
    key: "approval_user",
    label: "Approval User",
  },
  {
    key: "approval_time",
    label: "Approval Time",
  },
  {
    key: "inventory_sync_status",
    label: "Inventory Sync Status",
  },
  {
    key: "inventory_sync_time",
    label: "Inventory Sync Time",
  },
  {
    key: "log_time",
    label: "Log Time",
  },
];

function getSourceRecordId(row) {
  const id = String(row?.id || "");
  const match = id.match(/(\d+)$/);
  return match ? match[1] : "";
}

function getPreviewEndpoint(row) {
  const sourceId = getSourceRecordId(row);
  const transactionId = String(row?.transaction_id || "").trim();
  const type = String(row?.transaction_type || "").toUpperCase();

  if (!transactionId) return null;

  if (type === "STOCK_IN" && sourceId) {
    return `/api/inventory/stockin/${encodeURIComponent(sourceId)}`;
  }
  if (type === "STOCK_OUT" && sourceId) {
    return `/api/inventory/stockout/${encodeURIComponent(sourceId)}`;
  }
  if (type === "STOCK_TRANSFER_IN" || type === "STOCK_TRANSFER_OUT") {
    return sourceId
      ? `/api/inventory/stocktransfer/${encodeURIComponent(sourceId)}`
      : null;
  }
  if (type === "SALES_INVOICE") {
    return `/api/sales-order/invoice-sales-order/${encodeURIComponent(transactionId)}`;
  }

  return null;
}

export default function InventoryStockLedgerSummaryPage() {
  const [preview, setPreview] = useState({
    open: false,
    row: null,
    data: null,
    loading: false,
    error: "",
  });

  const openPreview = async (row) => {
    const endpoint = getPreviewEndpoint(row);
    setPreview({ open: true, row, data: null, loading: Boolean(endpoint), error: "" });

    if (!endpoint) return;

    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load transaction preview");
      }
      setPreview({ open: true, row, data, loading: false, error: "" });
    } catch (err) {
      setPreview({
        open: true,
        row,
        data: null,
        loading: false,
        error: err.message || "Failed to load transaction preview",
      });
    }
  };

  const renderStockLedgerCell = (row, column) => {
    const value = row[column.key] ?? "-";
    if (column.key !== "transaction_id" || value === "-") return value;

    return (
      <button
        type="button"
        onClick={() => openPreview(row)}
        className="font-semibold text-indigo-600 underline-offset-2 transition hover:text-indigo-800 hover:underline"
        title="Preview transaction"
      >
        {value}
      </button>
    );
  };

  return (
    <>
      <ReportsListPage
        breadcrumbs={[
          { label: "Reports Dashboard", href: "/reports" },
          { label: "Inventory" },
          { label: "Stock Ledger Summary" },
        ]}
        title="Stock Ledger Summary"
        description="Detail report of stock ledger summary. Need Help?"
        filters={filters}
        columns={columns}
        actionButtons={[]}
        renderCell={renderStockLedgerCell}
      />
      {preview.open && (
        <TransactionPreviewModal
          preview={preview}
          onClose={() =>
            setPreview({
              open: false,
              row: null,
              data: null,
              loading: false,
              error: "",
            })
          }
        />
      )}
    </>
  );
}

function valueFrom(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? "-";
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
}

function getPreviewRecord(row, data) {
  return data?.record || data || row || {};
}

function getPreviewItems(data) {
  return Array.isArray(data?.items) ? data.items : [];
}

function TransactionPreviewModal({ preview, onClose }) {
  const row = preview.row || {};
  const record = getPreviewRecord(row, preview.data);
  const items = getPreviewItems(preview.data);
  const transactionId = valueFrom(
    record.transactionId,
    record.transaction_id,
    record.bill_number,
    record.invoice_id,
    row.transaction_id,
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Transaction Preview
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {transactionId}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {valueFrom(row.transaction_type, record.type)} -{" "}
              {valueFrom(row.source_name, record.destinationName, record.sourceName)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="max-h-[calc(88vh-86px)] overflow-auto p-5">
          {preview.error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {preview.error}
            </div>
          ) : preview.loading ? (
            <div className="py-14 text-center text-sm text-slate-500">
              Loading transaction preview...
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PreviewStat label="Source" value={valueFrom(row.source_name, record.sourceName, record.destinationName)} />
                <PreviewStat label="Party" value={valueFrom(row.transaction_party_name, record.vendor_name, record.customer_name)} />
                <PreviewStat label="Status" value={valueFrom(record.status, row.approval_status)} />
                <PreviewStat label="Time" value={valueFrom(row.transaction_time, record.created_at, record.invoice_date)} />
                <PreviewStat label="Items" value={items.length || row.total_item_count || 0} />
                <PreviewStat label="Quantity" value={valueFrom(row.total_item_quantity, record.totalQty)} />
                <PreviewStat label="Value" value={money(valueFrom(row.total_transaction_value, record.grand_total, record.totalCost, 0))} />
                <PreviewStat label="Reference" value={valueFrom(row.trans_ref1, record.invoice_number, record.referenceId)} />
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Barcode</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-right">MRP</th>
                      <th className="px-4 py-3 text-right">Selling</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length ? (
                      items.map((item, index) => (
                        <tr key={item.id || index}>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {valueFrom(item.product_name, item.name, item.product)}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{valueFrom(item.sku)}</td>
                          <td className="px-4 py-3 text-slate-500">{valueFrom(item.barcode)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{valueFrom(item.qty, item.quantity)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{money(valueFrom(item.cost_price, item.cost, 0))}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{money(valueFrom(item.mrp, 0))}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{money(valueFrom(item.selling_price, item.price, item.rate, 0))}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                          No line items available for this transaction.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}
