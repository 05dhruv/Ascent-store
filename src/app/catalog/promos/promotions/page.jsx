"use client";
import CatalogDataPage from "@/components/CatalogDataPage";
import { useState } from "react";
import PromotionForm from "@/components/PromotionForm";
const columns = [
  { key: "sno", label: "S. No.", sortable: true },
  { key: "name", label: "Promotion Name", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "discount", label: "Discount", sortable: true },
  { key: "start", label: "Start Date", sortable: true },
  { key: "end", label: "End Date", sortable: true },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (v) => (
      <span
        className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${v === "Active" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"}`}
      >
        {v}
      </span>
    ),
  },
];

export default function PromotionsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  return (
    <>
      <CatalogDataPage
        endpoint="/api/catalog/promotions"
        createLabel="Create Promotion"
        onCreateClick={() => {
          setEditing(null);
          setShowCreate(true);
        }}
        onEdit={(row) => {
          setEditing(row);
          setShowCreate(true);
        }}
        extraQueryParams={{}}
        onDelete={(row) => {
          /* CatalogDataPage handles delete confirm and call */
        }}
        showRowActions={true}
        breadcrumbs={[
          { label: "Catalog", href: "/catalog" },
          { label: "Promotional Products" },
          { label: "Promotions" },
        ]}
        title="Promotions"
        description="Create promotional campaigns to drive more sales."
        columns={columns}
        totalLabel="Promotion(s)"
        emptyMessage="No promotions found"
        mapRecord={(record, index, page, pageSize) => ({
          ...record,
          id: record.id,
          sno: (page - 1) * pageSize + index + 1,
          name: record.name,
          type: record.promotion_type,
          discount: record.discount_value,
          start: record.start_date || "—",
          end: record.end_date || "—",
          status: record.status,
        })}
      />
      {showCreate && (
        <PromotionForm
          initial={editing}
          onClose={() => setShowCreate(false)}
          onSaved={(data, isEdit) => {
            setShowCreate(false);
            if (!isEdit) {
              // new promotion -> sent for approval
              alert("Your promotion has been sent for approval");
            } else {
              // edit -> reload to reflect changes
              window.location.reload();
            }
          }}
        />
      )}
    </>
  );
}
