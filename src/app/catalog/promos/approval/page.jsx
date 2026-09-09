"use client";
import CatalogDataPage from "@/components/CatalogDataPage";
import { useCallback } from "react";

const columns = [
  { key: "sno", label: "S. No.", sortable: true },
  { key: "promotion", label: "Promotion", sortable: true },
  { key: "requestedBy", label: "Requested By", sortable: true },
  { key: "date", label: "Date", sortable: true },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (v) => (
      <span
        className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full
        ${v === "Active" ? "bg-green-50 text-green-600" : v === "Pending" ? "bg-yellow-50 text-yellow-600" : "bg-red-50 text-red-500"}`}
      >
        {v === "Active" ? "Approved" : v}
      </span>
    ),
  },
  { key: "actions", label: "Action" },
];

// Note: actions column is rendered inline via mapRecord below to avoid passing objects to table cells.

export default function PromotionApprovalPage() {
  const approve = useCallback(async (row) => {
    if (!confirm("Approve this promotion?")) return;
    try {
      const res = await fetch(`/api/catalog/promotions/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Active" }),
      });
      const json = await res.json();
      if (json.success) {
        alert("Promotion approved");
        window.location.reload();
      } else {
        alert(json.message || "Approve failed");
      }
    } catch (e) {
      alert("Network error");
    }
  }, []);

  const remove = useCallback(async (row) => {
    if (!confirm("Reject/delete this promotion?")) return;
    try {
      const res = await fetch(`/api/catalog/promotions/${row.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        alert("Promotion removed");
        window.location.reload();
      } else {
        alert(json.message || "Delete failed");
      }
    } catch (e) {
      alert("Network error");
    }
  }, []);

  return (
    <CatalogDataPage
      endpoint="/api/catalog/promotions"
      extraQueryParams={{ status: "Pending" }}
      showRowActions={false}
      breadcrumbs={[
        { label: "Catalog", href: "/catalog" },
        { label: "Promotional Products" },
        { label: "Promotion Approval" },
      ]}
      title="Promotion Approval"
      description="Review and approve promotion requests from your team."
      columns={columns}
      totalLabel="Approval(s)"
      emptyMessage="No approval requests found"
      mapRecord={(record, index, page, pageSize) => ({
        id: record.id,
        sno: (page - 1) * pageSize + index + 1,
        promotion: record.name,
        requestedBy:
          record.requested_by ||
          (record.requested_by_user_id
            ? `${record.requested_by_name || "User"} (ID: ${record.requested_by_user_id})`
            : "Not captured"),
        date: record.created_at,
        status: record.status,
        actions: (
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 text-sm bg-green-600 text-white rounded"
              onClick={() => approve(record)}
            >
              Approve
            </button>
            <button
              className="px-3 py-1 text-sm bg-red-600 text-white rounded"
              onClick={() => remove(record)}
            >
              Reject
            </button>
          </div>
        ),
      })}
    />
  );
}
