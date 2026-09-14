"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";
import { formatIndianDateTime } from "@/lib/dateUtils";

function InfoGrid({ items }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="text-[12px] font-medium text-gray-500">{label}</div>
          <div className="mt-1 text-sm font-semibold text-gray-900 break-words">
            {value || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function documentName(doc) {
  return doc?.name || "";
}

const DOCUMENT_FIELDS = [
  { key: "siteWorkOrder", label: "Work Order / Sanction Letter" },
  { key: "siteLayoutPlan", label: "Site Storage Layout / Plot Plan" },
  { key: "safetyClearance", label: "Safety & Environmental Clearance" },
  { key: "landLeaseAgreement", label: "Site Land / Lease Agreement" },
  { key: "inchargeIdProof", label: "Site In-Charge ID (Aadhaar / PAN)" },
  { key: "agreement", label: "Agreement (Legacy)" },
  { key: "aadhaar", label: "Aadhaar (Legacy)" },
  { key: "panCard", label: "PAN Card (Legacy)" },
  { key: "rentAgreement", label: "Electricity Bill / Rent Agreement (Legacy)" },
];

const FACILITY_LABELS = {
  cementGodown: "Cement Godown (Moisture-Proof & Raised Plinth)",
  steelYard: "Steel & Rebar Fabrication Yard",
  aggregateBins: "Aggregates & Sand Storage Bins",
  coveredShed: "Covered Tool & Hardware Store Room",
  fuelChemicalStore: "Fuel, Paint & Chemical Storage Area (Hazardous)",
  weighbridge: "Weighbridge / Heavy Platform Weighing Scale",
  materialHandlingEquip: "Material Handling Equipment (Hydra/Forklift/Hoist)",
  cctvSecurity: "CCTV Surveillance & 24x7 Security Gate",
  backupGenerator: "Backup Diesel Generator (DG Set) & Power Backup",
  fireSafetyStation: "Fire Safety Equipment & Hydrant Points",
  materialTestingLab: "On-site Material QA & Testing Desk",
  siteOfficeInventory: "Site Office Computer, Printer & Barcode Setup",
  safetyBarricading: "Perimeter Barricading & Safety Warning Signages",
  firstAidStation: "First Aid & Emergency Safety Station",
  // Legacy labels
  ac: "AC",
  refrigerator: "Refrigerator",
  deepFreezer: "Deep Freezer",
  racks: "Racks",
  sealingMachine: "Sealing Machine",
  weighingMachine: "Weighing Machine",
  palletBoard: "Pallet Board",
  posMachine: "POS Machine",
};

const STORE_TYPE_LABELS = {
  MAIN_SITE_STORE: "Main Project Site Store",
  CENTRAL_WAREHOUSE: "Central / Regional Materials Yard",
  STEEL_FABRICATION_YARD: "Steel & Rebar Fabrication Yard",
  TRANSIT_SUB_STORE: "Transit / Sub-Store",
  BATCHING_PLANT_STORE: "Batching & Ready-Mix Plant Store",
  SITE_MATERIAL_SHED: "Covered Material Shed",
};

function facilityItemsForDisplay(items = {}) {
  return Object.entries(FACILITY_LABELS)
    .filter(([key]) => items?.[key]?.enabled)
    .map(([key, label]) => {
      const item = items[key] || {};
      return [
        label,
        `${Number(item.units || 1)} unit(s) x ${formatMoney(item.amount || 0)} = ${formatMoney(item.total || (Number(item.units || 1) * Number(item.amount || 0)))}`,
      ];
    });
}

export default function StoreDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewLabel, setPreviewLabel] = useState("");
  const [previewLoadingKey, setPreviewLoadingKey] = useState("");
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/stores/${params.id}`);
        const json = await res.json();
        if (!mounted) return;
        if (res.ok && json.success) {
          setStore(json.data.store);
        } else {
          setError(json.message || "Unable to load site store");
        }
      } catch {
        if (mounted) setError("Network error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [params.id]);

  const openDocumentPreview = async (field) => {
    setPreviewError("");
    setPreviewLoadingKey(field.key);
    try {
      const res = await fetch(`/api/stores/${params.id}/documents/${field.key}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success || !json.data?.document?.dataUrl) {
        throw new Error(json.message || "Preview is not available");
      }
      setPreviewDocument(json.data.document);
      setPreviewLabel(field.label);
    } catch (err) {
      setPreviewError(err.message || "Preview is not available");
    } finally {
      setPreviewLoadingKey("");
    }
  };

  const storeTypeDisplay = STORE_TYPE_LABELS[store?.meta?.franchiseType] || store?.meta?.franchiseType || "Main Site Store";

  const presentDocuments = DOCUMENT_FIELDS.filter(
    (field) => store?.meta?.documents?.[field.key],
  );

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">
            <Link
              href="/settings/stores"
              className="text-blue-600 hover:underline"
            >
              Site Stores
            </Link>{" "}
            <span className="mx-1">/</span> Site Store Details
          </div>
          <h1 className="text-xl font-bold text-gray-900">Site Store Details</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/settings/stores/${params.id}/edit`)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 shadow-sm transition"
          >
            Edit Site Store
          </button>
          <button
            onClick={() => router.push("/settings/stores")}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading site store...</p>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : store ? (
        <div className="space-y-5">
          <section className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded">
                    {storeTypeDisplay}
                  </span>
                  <h2 className="text-lg font-bold text-emerald-800">
                    {store.name}
                  </h2>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Registered on {formatIndianDateTime(store.created_at, "—")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-gray-600">
                  <div>Site Code: <strong>{store.meta?.storeCode || store.meta?.shortCode || "—"}</strong></div>
                  <div>Project: <strong>{store.meta?.projectName || "Standalone"}</strong></div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${store.is_active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                >
                  {store.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
            <h3 className="mb-4 text-sm font-bold text-blue-700 uppercase tracking-wide">
              Site Location & Project Assignment
            </h3>
            <InfoGrid
              items={[
                ["Site Store Code", store.meta?.storeCode || store.meta?.shortCode],
                ["Site Store Name", store.name],
                ["Associated Project", store.meta?.projectName ? `${store.meta.projectName} (${store.meta?.projectCode || ""})` : "Standalone Site Store"],
                ["Site Storage Format", storeTypeDisplay],
                ["Location Type", store.meta?.locationType || "Project Site Store"],
                ["Address Line 1", store.address_line1],
                ["Address Line 2", store.address_line2],
                ["City / District", store.city],
                ["State", store.state],
                ["Pincode", store.pincode],
                ["Country", store.country],
                ["GPS Coordinates", store.meta?.deliveryLatitude && store.meta?.deliveryLongitude ? `${store.meta.deliveryLatitude}, ${store.meta.deliveryLongitude}` : "—"],
                ["Service / Supply Radius", `${store.meta?.deliveryRadiusKm || 10} km`],
                ["PAN Number", store.meta?.panNumber],
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
            <h3 className="mb-4 text-sm font-bold text-blue-700 uppercase tracking-wide">
              Site In-Charge & Storage Specifications
            </h3>
            <InfoGrid
              items={[
                ["Site In-Charge / Store Keeper", store.manager_name],
                ["In-Charge Mobile Number", store.manager_mobile],
                ["In-Charge Email Address", store.manager_email],
                ["Site Gate Opening Time", store.opening_time],
                ["Site Gate Closing Time", store.closing_time],
                [
                  "Site Storage Area",
                  store.meta?.storeAreaSqFt
                    ? `${store.meta.storeAreaSqFt} sq ft`
                    : store.meta?.storeArea,
                ],
                ["Storage Category", store.meta?.storeFormat],
                [
                  "Estimated Cost / sq ft",
                  store.meta?.costPerSqFt
                    ? formatMoney(store.meta.costPerSqFt)
                    : "—",
                ],
                [
                  "Storage Facility Valuation",
                  store.meta?.totalStoreAmount
                    ? formatMoney(store.meta.totalStoreAmount)
                    : "—",
                ],
                [
                  "Storage Infrastructure Total",
                  store.meta?.interiorGrandTotal
                    ? formatMoney(store.meta.interiorGrandTotal)
                    : "—",
                ],
                [
                  "Voucher Validation",
                  store.meta?.enableVoucherValidation ? "Enabled" : "Disabled",
                ],
                ["Auto MRN Print", store.meta?.automaticPrint ? "Enabled" : "Disabled"],
                [
                  "Min-Max Stock Alert",
                  store.meta?.enableStoreStockAlert ? "Enabled" : "Disabled",
                ],
                [
                  "Direct Site Requisition Only",
                  store.meta?.enableStoreOnlineBillingOnly ? "Yes" : "No",
                ],
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wide">
                Site Storage Infrastructure & Handling Facilities
              </h3>
              <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                Equipment Total: {formatMoney(store.meta?.interiorGrandTotal || 0)}
              </span>
            </div>
            <InfoGrid
              items={
                facilityItemsForDisplay(store.meta?.interiorItems).length
                  ? facilityItemsForDisplay(store.meta?.interiorItems)
                  : [["Configured Facilities", "No special infrastructure/facilities recorded"]]
              }
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
            <h3 className="mb-4 text-sm font-bold text-blue-700 uppercase tracking-wide">
              Site & Project Documents
            </h3>
            {presentDocuments.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {presentDocuments.map((field) => {
                  const document = store.meta?.documents?.[field.key];
                  const name = documentName(document);
                  return (
                    <div
                      key={field.key}
                      className="rounded-lg border border-gray-200 bg-white p-4"
                    >
                      <div className="text-[12px] font-medium text-gray-500">
                        {field.label}
                      </div>
                      <div className="mt-1 min-h-[1.25rem] break-words text-sm font-semibold text-gray-900">
                        {name || "-"}
                      </div>
                      {name ? (
                        <button
                          type="button"
                          onClick={() => openDocumentPreview(field)}
                          disabled={previewLoadingKey === field.key}
                          className="mt-3 text-xs font-semibold text-blue-700 hover:underline disabled:text-gray-400"
                        >
                          {previewLoadingKey === field.key
                            ? "Loading Preview..."
                            : "👁 Show Document"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic bg-white p-4 rounded-lg border border-gray-200">
                No site layout or project sanction documents uploaded.
              </p>
            )}
            {previewError ? (
              <p className="mt-3 text-sm font-medium text-red-600">
                {previewError}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
            <h3 className="mb-4 text-sm font-bold text-blue-700 uppercase tracking-wide">
              Tax, GST & Material Requisition Prefixes
            </h3>
            <InfoGrid
              items={[
                ["GST Number", store.meta?.gstNumber],
                ["PAN Number", store.meta?.panNumber],
                ["CIN", store.meta?.cin],
                ["TIN", store.meta?.tin],
                ["MRN (Receipt) Prefix", store.meta?.customStoreOrderPrefix || "MRN"],
                ["MIN (Issue) Prefix", store.meta?.ncCustomStoreOrderPrefix || "MIN"],
                ["STR (Transfer) Prefix", store.meta?.rwiCustomStoreOrderPrefix || "STR"],
                ["Tax Rule Information", store.meta?.taxInformation],
              ]}
            />
          </section>
        </div>
      ) : null}

      {previewDocument?.dataUrl ? (
        <DocumentPreviewModal
          label={previewLabel}
          document={previewDocument}
          onClose={() => {
            setPreviewDocument(null);
            setPreviewLabel("");
          }}
        />
      ) : null}
    </MainLayout>
  );
}

function DocumentPreviewModal({ label, document, onClose }) {
  const documentType = String(document?.type || "").toLowerCase();
  const isPdf = documentType.includes("pdf");
  const isImage = documentType.startsWith("image/");

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-gray-50">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-gray-900">
              {label}
            </h3>
            <p className="truncate text-xs text-gray-500">{document.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
        <div className="h-[70vh] bg-gray-100 p-3">
          {isImage ? (
            <img
              src={document.dataUrl}
              alt={`${label} preview`}
              className="h-full w-full object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={document.dataUrl}
              title={`${label} preview`}
              className="h-full w-full rounded border border-gray-200 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Preview is not available for this file.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
