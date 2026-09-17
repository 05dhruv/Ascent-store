"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryShell from "@/components/inventory/InventoryShell";
import { useUser } from "@/hooks/useUser";
import { formatIndianDateTime } from "@/lib/dateUtils";
import { fetchAllCatalogProducts } from "@/lib/productPagination";

const tableHeaders = [
  "Request ID",
  "Site (Destination)",
  "Source Warehouse",
  "Requested By",
  "Request Time",
  "Total Items",
  "Stock & Shortage Status",
  "Approval Status",
  "PO / Vendor Notification",
  "Action",
];

function normalizeStores(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data?.stores)) return data.data.stores;
  if (Array.isArray(data?.stores)) return data.stores;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function normalizeProducts(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data?.records)) return data.data.records;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function formatDate(value) {
  return formatIndianDateTime(value, "-");
}

function emptyLine() {
  return { productId: "", productSearch: "", qty: 1 };
}

function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function productLabel(product) {
  if (!product) return "";
  const sku = product.sku ? `SKU: ${product.sku}` : "";
  const barcode = product.barcode ? `Barcode: ${product.barcode}` : "";
  const unit = product.unit ? `[${product.unit}]` : "";
  const dim = product.dimensions ? `(${product.dimensions})` : "";
  const meta = [sku, barcode, unit, dim].filter(Boolean).join(" | ");
  return meta
    ? `${product.name} ${meta}`
    : product.name || `Product #${product.id}`;
}

export default function StockRequisitionPage() {
  const { user } = useUser();
  const [records, setRecords] = useState([]);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [activeProductPicker, setActiveProductPicker] = useState(null);
  const [fulfillmentSources, setFulfillmentSources] = useState({});

  // Shortage Resolution Modal State
  const [selectedReq, setSelectedReq] = useState(null);
  const [shortageLoading, setShortageLoading] = useState(false);
  const [shortageData, setShortageData] = useState(null);
  const [poVendorId, setPoVendorId] = useState("");
  const [poVendorEmail, setPoVendorEmail] = useState("");
  const [poPurchaserEmails, setPoPurchaserEmails] = useState("");
  const [poExpectedDate, setPoExpectedDate] = useState("");
  const [poSendEmail, setPoSendEmail] = useState(true);
  const [poRemarks, setPoRemarks] = useState("");
  const [poCreating, setPoCreating] = useState(false);
  const [poSuccessMessage, setPoSuccessMessage] = useState(null);

  const [form, setForm] = useState({
    sourceId: "",
    destinationId: "",
    requestedBy: "",
    mailTo: "",
    remarks: "",
    items: [emptyLine()],
  });

  const userPermissions = Array.isArray(user?.permissions)
    ? user.permissions
    : [];
  const canManageRequisition =
    user?.role === "super_admin" ||
    userPermissions.includes("*") ||
    userPermissions.includes("MANAGE_INVENTORY") ||
    userPermissions.includes("SITE_REQUEST_APPROVE");

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/stockrequisition", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
    Promise.all([
      fetch("/api/stores?include_locations=all", {
        credentials: "include",
      }).then((res) => res.json()),
      fetchAllCatalogProducts({
        pageSize: 500,
        fetchOptions: { credentials: "include" },
      }),
    ])
      .then(([storeData, productData]) => {
        setStores(normalizeStores(storeData));
        setProducts(
          Array.isArray(productData)
            ? productData
            : normalizeProducts(productData),
        );
      })
      .catch(() => {
        setStores([]);
        setProducts([]);
      });
  }, []);

  const openShortageAnalysis = async (row) => {
    setSelectedReq(row);
    setShortageLoading(true);
    setShortageData(null);
    setPoSuccessMessage(null);
    setPoPurchaserEmails("");
    try {
      const res = await fetch(
        `/api/inventory/stockrequisition/${row.id}/shortage-analysis`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (data.success) {
        setShortageData(data.data);
        const topVendor = data.data?.top_recommended_vendor;
        if (topVendor) {
          setPoVendorId(String(topVendor.id));
          setPoVendorEmail(topVendor.email || "");
        } else if (data.data?.all_vendors?.length) {
          setPoVendorId(String(data.data.all_vendors[0].id));
          setPoVendorEmail(data.data.all_vendors[0].email || "");
        }
      } else {
        alert(data.error || "Failed to load shortage analysis");
      }
    } catch (err) {
      alert(err.message || "Failed to load shortage analysis");
    } finally {
      setShortageLoading(false);
    }
  };

  const handleVendorSelect = (vendorId) => {
    setPoVendorId(vendorId);
    const matched = shortageData?.all_vendors?.find(
      (v) => String(v.id) === String(vendorId),
    );
    if (matched) {
      setPoVendorEmail(matched.email || "");
    }
  };

  const handleCreateShortagePo = async () => {
    if (!poVendorId) {
      return alert("Please select a vendor for the Purchase Order");
    }
    const shortageItems = (shortageData?.items || [])
      .filter((item) => item.shortage_qty > 0)
      .map((item) => ({
        productId: item.product_id,
        productName: item.product_name,
        qty: item.shortage_qty,
        unit: item.unit,
        dimensions: item.dimensions,
        costPrice: item.cost_price,
      }));

    if (!shortageItems.length) {
      return alert("No items with shortage found to create PO");
    }

    setPoCreating(true);
    try {
      const res = await fetch("/api/purchase-orders/from-requisition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requisitionId: selectedReq.id,
          vendorId: poVendorId,
          vendorEmail: poVendorEmail,
          ccEmails: poPurchaserEmails,
          sendEmail: poSendEmail,
          expectedDeliveryDate: poExpectedDate || null,
          remarks:
            poRemarks ||
            `Auto-PO for shortage in site request ${selectedReq.transactionId}`,
          items: shortageItems,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to create Purchase Order");
      }

      setPoSuccessMessage(
        `Purchase Order ${data.transactionId} created successfully! ${data.vendorEmail ? `Material Requirement email dispatched to: ${data.vendorEmail}` : ""}`,
      );
      await loadRecords();
      // reload shortage analysis in background
      openShortageAnalysis(selectedReq);
    } catch (err) {
      alert(err.message || "Failed to create shortage PO");
    } finally {
      setPoCreating(false);
    }
  };

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const term = search.toLowerCase();
    return records.filter((row) =>
      [
        row.transactionId,
        row.sourceName,
        row.destinationName,
        row.requestedBy,
        row.requesterUserName,
        row.mailTo,
        row.status,
        row.approvalStatus,
        row.poTransactionId,
        row.vendorName,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [records, search]);

  const updateLine = (index, updates) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    }));
  };

  const getProductOptions = (item) => {
    const term = String(item.productSearch || "").trim();
    const compactTerm = normalizeSearch(term);
    const selectedId = String(item.productId || "");
    const selectedProduct = products.find(
      (product) => String(product.id) === selectedId,
    );

    if (!term) {
      return products.slice(0, 30);
    }

    const matches = products.filter((product) => {
      const fields = [
        product.id,
        product.product_id,
        product.name,
        product.sku,
        product.barcode,
        product.dimensions,
        product.brandName,
        product.categoryName,
      ];
      return fields.some((value) => {
        const text = String(value || "").toLowerCase();
        return (
          text.includes(term.toLowerCase()) ||
          normalizeSearch(text).includes(compactTerm)
        );
      });
    });

    if (
      selectedProduct &&
      !matches.some((product) => String(product.id) === selectedId)
    ) {
      return [selectedProduct, ...matches.slice(0, 29)];
    }

    return matches.slice(0, 30);
  };

  const selectProduct = (index, product) => {
    updateLine(index, {
      productId: String(product.id),
      productSearch: productLabel(product),
      unit: product.unit || "PCS",
      dimensions: product.dimensions || "",
    });
    setActiveProductPicker(null);
  };

  const removeLine = (index) => {
    setForm((current) => ({
      ...current,
      items:
        current.items.length <= 1
          ? current.items
          : current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const submit = async () => {
    if (!form.destinationId) return alert("Please select destination site");
    const items = form.items
      .map((item) => ({
        productId: item.productId,
        qty: Number(item.qty || 0),
        unit: item.unit,
        dimensions: item.dimensions,
      }))
      .filter((item) => item.productId && item.qty > 0);
    if (!items.length) return alert("Add at least one product");

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/stockrequisition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, items }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to create requisition");
      }
      setShowModal(false);
      setForm({
        sourceId: "",
        destinationId: "",
        requestedBy: "",
        mailTo: "",
        remarks: "",
        items: [emptyLine()],
      });
      await loadRecords();
    } catch (err) {
      alert(err.message || "Failed to create requisition");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, action) => {
    try {
      const res = await fetch(`/api/inventory/stockrequisition/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Update failed");
      }
      await loadRecords();
    } catch (err) {
      alert(err.message || "Update failed");
    }
  };

  const fulfillByTransfer = async (row) => {
    const sourceId = fulfillmentSources[row.id] || row.sourceId;
    if (!sourceId) return alert("Select source warehouse first");
    try {
      const res = await fetch("/api/inventory/stocktransfer/from-requisition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requisitionId: row.id, sourceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Fulfillment failed");
      }
      alert(
        `Transfer ${data.transactionId} created for available stock! Material will move upon picking & dispatch.`,
      );
      await loadRecords();
      if (selectedReq) openShortageAnalysis(selectedReq);
    } catch (err) {
      alert(err.message || "Fulfillment failed");
    }
  };

  const tableData = filteredRecords.map((row) => ({
    "Request ID": (
      <div className="font-semibold text-blue-600">{row.transactionId}</div>
    ),
    "Site (Destination)": (
      <div>
        <span className="font-semibold text-gray-900">
          {row.destinationName || "-"}
        </span>
      </div>
    ),
    "Source Warehouse": row.sourceName || "Central Warehouse",
    "Requested By": (
      <div>
        <span className="font-medium text-gray-800">
          {row.requesterUserName || row.requestedBy || "-"}
        </span>
        {row.requesterUserEmail && (
          <span className="block text-[11px] text-gray-400">
            {row.requesterUserEmail}
          </span>
        )}
      </div>
    ),
    "Request Time": formatDate(row.createdAt),
    "Total Items": (
      <span className="font-semibold text-gray-700">
        {row.totalItems} {row.items?.[0]?.unit || "Items"}
      </span>
    ),
    "Stock & Shortage Status": (
      <div>
        {row.purchaseOrderId ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
            <i className="ti ti-shopping-cart text-[12px]" /> PO Generated
          </span>
        ) : row.stockTransferId ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            <i className="ti ti-truck text-[12px]" /> Transfer Created
          </span>
        ) : (
          <button
            onClick={() => openShortageAnalysis(row)}
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 border border-amber-200 transition"
          >
            <i className="ti ti-search text-[12px]" /> Check Stock & Shortage
          </button>
        )}
      </div>
    ),
    "Approval Status": (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
          row.approvalStatus === "approved"
            ? "bg-green-50 text-green-700 border border-green-200"
            : row.approvalStatus === "rejected"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-yellow-50 text-yellow-700 border border-yellow-200"
        }`}
      >
        {row.approvalStatus?.toUpperCase()}
      </span>
    ),
    "PO / Vendor Notification": (
      <div>
        {row.poTransactionId ? (
          <div className="text-xs space-y-0.5">
            <span className="font-semibold text-purple-700 block">
              {row.poTransactionId}
            </span>
            {row.vendorName && (
              <span className="text-gray-600 block">{row.vendorName}</span>
            )}
            {row.poEmailedAt ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-green-600 font-medium">
                <i className="ti ti-mail-check" /> Emailed to Vendor
              </span>
            ) : row.vendorEmail ? (
              <span className="text-[11px] text-gray-500 block">
                {row.vendorEmail}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
    ),
    Action: (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => openShortageAnalysis(row)}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 shadow-sm"
          title="Analyze shortage & match vendor"
        >
          Details / PO
        </button>

        {row.approvalStatus === "pending" && canManageRequisition && (
          <>
            <button
              onClick={() => updateStatus(row.id, "approve")}
              className="rounded border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-100"
            >
              Approve
            </button>
            <button
              onClick={() => updateStatus(row.id, "reject")}
              className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100"
            >
              Reject
            </button>
          </>
        )}
      </div>
    ),
  }));

  return (
    <>
      <InventoryShell
        breadcrumb={[{ label: "Material Movement" }, { label: "Site Request" }]}
        title="Site Material Request & Auto-Shortage PO"
        subtitle="Manage site requisitions, stock shortage analysis, automated vendor purchase orders and vendor email dispatch."
        actions={[
          {
            label: "New Site Request",
            primary: true,
            onClick: () => setShowModal(true),
          },
        ]}
        searchPlaceholder="Search request, site, user, vendor..."
        tableHeaders={tableHeaders}
        tableData={loading ? [] : tableData}
        searchValue={search}
        onSearchChange={setSearch}
        emptyMessage={loading ? "Loading records..." : "No Records Found"}
      />

      {/* SHORTAGE ANALYSIS & VENDOR PO RESOLUTION MODAL */}
      {selectedReq && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50/80">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-gray-900">
                    Site Request #{selectedReq.transactionId}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      selectedReq.approvalStatus === "approved"
                        ? "bg-green-100 text-green-800"
                        : selectedReq.approvalStatus === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {selectedReq.approvalStatus?.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Destination Site:{" "}
                  <strong>{selectedReq.destinationName}</strong> • Source
                  Warehouse:{" "}
                  <strong>{selectedReq.sourceName || "Central"}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition"
              >
                <i className="ti ti-x text-[20px]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Audit & Requester Information Card */}
              <div className="grid gap-3 sm:grid-cols-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-gray-700">
                <div>
                  <span className="text-gray-500 block">Requested By:</span>
                  <strong className="text-gray-900">
                    {selectedReq.requesterUserName ||
                      selectedReq.requestedBy ||
                      "Site Manager"}
                  </strong>
                </div>
                <div>
                  <span className="text-gray-500 block">Requested On:</span>
                  <strong className="text-gray-900">
                    {formatDate(selectedReq.createdAt)}
                  </strong>
                </div>
                <div>
                  <span className="text-gray-500 block">
                    Approval Timestamp:
                  </span>
                  <strong className="text-gray-900">
                    {selectedReq.approvedAt
                      ? formatDate(selectedReq.approvedAt)
                      : "Pending Approval"}
                  </strong>
                </div>
                <div>
                  <span className="text-gray-500 block">Linked PO Status:</span>
                  <strong className="text-purple-700">
                    {selectedReq.poTransactionId
                      ? `${selectedReq.poTransactionId} (Generated)`
                      : "Not Generated"}
                  </strong>
                </div>
              </div>

              {poSuccessMessage && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800 flex items-start gap-2">
                  <i className="ti ti-circle-check text-[20px] text-green-600 mt-0.5" />
                  <span>{poSuccessMessage}</span>
                </div>
              )}

              {shortageLoading ? (
                <div className="py-12 text-center text-gray-500">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
                  <p className="text-sm font-medium">
                    Checking warehouse stock & matching suppliers...
                  </p>
                </div>
              ) : shortageData ? (
                <>
                  {/* Summary Bar */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <span className="text-xs text-gray-500 font-medium">
                        Total Requested
                      </span>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {shortageData.requisition?.total_requested_qty} Items
                      </p>
                    </div>
                    <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 shadow-sm">
                      <span className="text-xs text-green-700 font-medium">
                        Available at Warehouse
                      </span>
                      <p className="text-xl font-bold text-green-700 mt-1">
                        {shortageData.requisition?.total_available_qty} Items
                      </p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
                      <span className="text-xs text-red-700 font-medium">
                        Shortage / Need Purchase
                      </span>
                      <p className="text-xl font-bold text-red-700 mt-1">
                        {shortageData.requisition?.total_shortage_qty} Items
                      </p>
                    </div>
                  </div>

                  {/* Items Shortage Breakdown Table */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 font-semibold text-xs text-gray-700 flex justify-between items-center">
                      <span>MATERIAL REQUIREMENTS & STOCK BREAKDOWN</span>
                      <span className="text-gray-500 font-normal">
                        Source: {selectedReq.sourceName || "Central Warehouse"}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-700">
                        <thead className="bg-gray-100/70 border-b border-gray-200 text-[11px] text-gray-600 uppercase">
                          <tr>
                            <th className="p-3">Material & Dimensions</th>
                            <th className="p-3 text-center">Unit</th>
                            <th className="p-3 text-center">Req. Qty</th>
                            <th className="p-3 text-center">Wh. Stock</th>
                            <th className="p-3 text-center">Shortage</th>
                            <th className="p-3">Recommended Supplier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {shortageData.items?.map((item, idx) => (
                            <tr
                              key={idx}
                              className={
                                item.is_shortage ? "bg-amber-50/40" : ""
                              }
                            >
                              <td className="p-3">
                                <span className="font-semibold text-gray-900 block">
                                  {item.product_name}
                                </span>
                                {item.dimensions && (
                                  <span className="text-[11px] text-gray-500 font-mono block mt-0.5">
                                    Spec: {item.dimensions}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center font-medium">
                                {item.unit || "PCS"}
                              </td>
                              <td className="p-3 text-center font-bold text-gray-900">
                                {item.requested_qty}
                              </td>
                              <td className="p-3 text-center font-semibold text-green-700">
                                {item.available_qty}
                              </td>
                              <td className="p-3 text-center">
                                {item.shortage_qty > 0 ? (
                                  <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-700">
                                    {item.shortage_qty}
                                  </span>
                                ) : (
                                  <span className="text-green-600 font-medium">
                                    0 (Full Stock)
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                {item.primary_vendor ? (
                                  <div>
                                    <strong className="text-gray-900 block">
                                      {item.primary_vendor.name}
                                    </strong>
                                    <span className="text-[11px] text-blue-600 block">
                                      {item.primary_vendor.email || "No email"}
                                    </span>
                                    <span className="text-[10px] text-gray-500 block">
                                      {item.primary_vendor.reason}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SHORTAGE PURCHASE ORDER & EMAIL VENDOR FORM */}
                  {shortageData.requisition?.total_shortage_qty > 0 && (
                    <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5 space-y-4">
                      <div className="flex items-center gap-2 border-b border-purple-100 pb-3">
                        <i className="ti ti-file-invoice text-[22px] text-purple-700" />
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">
                            Create Purchase Order for Remaining Shortage (
                            {shortageData.requisition?.total_shortage_qty}{" "}
                            Items)
                          </h3>
                          <p className="text-xs text-gray-500">
                            Auto-matched vendor details will be used to generate
                            the PO and dispatch the requirement email.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Select Vendor / Supplier{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={poVendorId}
                            onChange={(e) => handleVendorSelect(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 outline-none focus:ring-1 focus:ring-purple-500"
                          >
                            <option value="">Choose Supplier</option>
                            {shortageData.all_vendors?.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} {v.company ? `(${v.company})` : ""}{" "}
                                {v.email ? `• ${v.email}` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Vendor Email (For PO Notification)
                          </label>
                          <input
                            type="email"
                            value={poVendorEmail}
                            onChange={(e) => setPoVendorEmail(e.target.value)}
                            placeholder="vendor@supplier.com"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Purchaser / Procurement Email (CC)
                          </label>
                          <input
                            type="text"
                            value={poPurchaserEmails}
                            onChange={(e) =>
                              setPoPurchaserEmails(e.target.value)
                            }
                            placeholder="purchaser@company.com"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <p className="mt-1 text-[10px] text-gray-500">
                            Use commas for more than one recipient.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Expected Delivery Date
                          </label>
                          <input
                            type="date"
                            value={poExpectedDate}
                            onChange={(e) => setPoExpectedDate(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Remarks / Delivery Instructions for Supplier
                        </label>
                        <input
                          type="text"
                          value={poRemarks}
                          onChange={(e) => setPoRemarks(e.target.value)}
                          placeholder={`Material requirement for site ${selectedReq.destinationName}`}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={poSendEmail}
                            onChange={(e) => setPoSendEmail(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <span>
                            Send PO email to vendor{" "}
                            {poVendorEmail
                              ? `(${poVendorEmail})`
                              : "(no email)"}
                            {poPurchaserEmails
                              ? " and copy purchaser/procurement"
                              : ""}
                          </span>
                        </label>

                        <button
                          onClick={handleCreateShortagePo}
                          disabled={poCreating || !poVendorId}
                          className="rounded-lg bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50 transition flex items-center gap-2"
                        >
                          {poCreating ? (
                            <>
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Generating PO & Sending Email...
                            </>
                          ) : (
                            <>
                              <i className="ti ti-mail-fast text-[16px]" />
                              Generate PO (
                              {
                                shortageData.requisition?.total_shortage_qty
                              }{" "}
                              Items) & Email Vendor
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* WAREHOUSE TRANSFER FOR AVAILABLE QTY */}
                  {shortageData.requisition?.total_available_qty > 0 &&
                    !selectedReq.stockTransferId && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-bold text-blue-900">
                            Fulfill Available Items (
                            {shortageData.requisition?.total_available_qty}{" "}
                            Items) from Warehouse
                          </h4>
                          <p className="text-[11px] text-blue-700">
                            Stock can be dispatched immediately to{" "}
                            {selectedReq.destinationName} via Stock Transfer.
                          </p>
                        </div>
                        <button
                          onClick={() => fulfillByTransfer(selectedReq)}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition"
                        >
                          Create Transfer for Available Stock
                        </button>
                      </div>
                    )}
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedReq(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW SITE REQUEST CREATION MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-[999] flex items-start justify-center bg-black/50 p-4 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden my-6">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">
                New Site Material Request
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200"
              >
                <i className="ti ti-x text-[18px]" />
              </button>
            </div>

            <div className="max-h-[78vh] overflow-auto p-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-700">
                    Source Warehouse
                  </span>
                  <select
                    value={form.sourceId}
                    onChange={(event) =>
                      setForm({ ...form, sourceId: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Central / All Warehouses</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-700">
                    Destination Site <span className="text-red-500">*</span>
                  </span>
                  <select
                    value={form.destinationId}
                    onChange={(event) =>
                      setForm({ ...form, destinationId: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select destination site</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-700">
                    Requested By
                  </span>
                  <input
                    value={form.requestedBy}
                    onChange={(event) =>
                      setForm({ ...form, requestedBy: event.target.value })
                    }
                    placeholder="Auto-filled from logged-in user if blank"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-700">
                    Mail Notification To (Optional)
                  </span>
                  <input
                    value={form.mailTo}
                    onChange={(event) =>
                      setForm({ ...form, mailTo: event.target.value })
                    }
                    placeholder="siteincharge@ascent.com"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <h3 className="text-xs font-bold text-gray-800">
                    MATERIAL LIST & QUANTITY
                  </h3>
                  <button
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        items: [...current.items, emptyLine()],
                      }))
                    }
                    className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 shadow-sm"
                  >
                    + Add Material
                  </button>
                </div>
                <div className="divide-y divide-gray-100 p-2">
                  {form.items.map((item, index) => (
                    <div
                      key={index}
                      className="grid gap-3 p-2 md:grid-cols-[1fr_130px_40px] items-center"
                    >
                      <div className="relative">
                        <input
                          value={
                            item.productSearch ||
                            productLabel(
                              products.find(
                                (product) =>
                                  String(product.id) === String(item.productId),
                              ),
                            )
                          }
                          onChange={(event) =>
                            updateLine(index, {
                              productId: "",
                              productSearch: event.target.value,
                            })
                          }
                          onFocus={() => setActiveProductPicker(index)}
                          onBlur={() =>
                            setTimeout(
                              () =>
                                setActiveProductPicker((current) =>
                                  current === index ? null : current,
                                ),
                              180,
                            )
                          }
                          placeholder="Search material by name, dimensions, or code..."
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {activeProductPicker === index && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-2xl">
                            {getProductOptions(item).length ? (
                              getProductOptions(item).map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  onMouseDown={(event) =>
                                    event.preventDefault()
                                  }
                                  onClick={() => selectProduct(index, product)}
                                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-blue-50"
                                >
                                  <span className="block font-semibold text-gray-900">
                                    {product.name || `Product #${product.id}`}
                                  </span>
                                  <span className="block text-[11px] text-gray-500">
                                    {[
                                      product.unit
                                        ? `Unit: ${product.unit}`
                                        : "",
                                      product.dimensions
                                        ? `Size: ${product.dimensions}`
                                        : "",
                                      product.sku ? `SKU: ${product.sku}` : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" • ") || "Standard Item"}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-4 text-center text-xs text-gray-500">
                                No materials found
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(event) =>
                            updateLine(index, { qty: event.target.value })
                          }
                          placeholder="Qty"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-center font-bold"
                        />
                        <span className="text-[11px] font-medium text-gray-500 min-w-[36px]">
                          {item.unit || "PCS"}
                        </span>
                      </div>

                      <button
                        onClick={() => removeLine(index)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 text-center"
                      >
                        <i className="ti ti-trash text-[16px]" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-700">
                  Remarks / Purpose
                </span>
                <textarea
                  rows={3}
                  value={form.remarks}
                  onChange={(event) =>
                    setForm({ ...form, remarks: event.target.value })
                  }
                  placeholder="e.g. For Tower A 5th slab casting"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Submitting..." : "Submit Site Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
