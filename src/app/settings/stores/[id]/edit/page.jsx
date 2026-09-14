"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import MainLayout from "@/components/MainLayout";

const DEFAULT_STORE_TYPES = [
  { id: null, value: "MAIN_SITE_STORE", label: "Main Project Site Store" },
  { id: null, value: "CENTRAL_WAREHOUSE", label: "Central / Regional Materials Yard" },
  { id: null, value: "STEEL_FABRICATION_YARD", label: "Steel & Rebar Fabrication Yard" },
  { id: null, value: "TRANSIT_SUB_STORE", label: "Transit / Sub-Store" },
  { id: null, value: "BATCHING_PLANT_STORE", label: "Batching & Ready-Mix Plant Store" },
  { id: null, value: "SITE_MATERIAL_SHED", label: "Covered Material Shed" },
];

const DEFAULT_LOCATION_TYPES = [
  { id: null, value: "Store", label: "Project Site Store" },
  { id: null, value: "Warehouse", label: "Central Construction Yard / Warehouse" },
  { id: null, value: "Yard", label: "Open Material Yard" },
  { id: null, value: "Outlet", label: "Transit Depot / Sub-Store" },
];

const DOCUMENT_FIELDS = [
  { key: "siteWorkOrder", label: "Work Order / Sanction Letter", required: false },
  { key: "siteLayoutPlan", label: "Site Storage Layout / Plot Plan", required: false },
  { key: "safetyClearance", label: "Safety & Environmental Clearance", required: false },
  { key: "landLeaseAgreement", label: "Site Land / Lease Agreement", required: false },
  { key: "inchargeIdProof", label: "Site In-Charge ID (Aadhaar / PAN)", required: false },
];

const INFRASTRUCTURE_FIELDS = [
  { key: "cementGodown", label: "Cement Godown (Moisture-Proof & Raised Plinth)", defaultAmount: 150000 },
  { key: "steelYard", label: "Steel & Rebar Fabrication Yard", defaultAmount: 120000 },
  { key: "aggregateBins", label: "Aggregates & Sand Storage Bins", defaultAmount: 80000 },
  { key: "coveredShed", label: "Covered Tool & Hardware Store Room", defaultAmount: 95000 },
  { key: "fuelChemicalStore", label: "Fuel, Paint & Chemical Storage Area (Hazardous)", defaultAmount: 60000 },
  { key: "weighbridge", label: "Weighbridge / Heavy Platform Weighing Scale", defaultAmount: 350000 },
  { key: "materialHandlingEquip", label: "Material Handling Equipment (Hydra/Forklift/Hoist)", defaultAmount: 250000 },
  { key: "cctvSecurity", label: "CCTV Surveillance & 24x7 Security Gate", defaultAmount: 75000 },
  { key: "backupGenerator", label: "Backup Diesel Generator (DG Set) & Power Backup", defaultAmount: 180000 },
  { key: "fireSafetyStation", label: "Fire Safety Equipment & Hydrant Points", defaultAmount: 45000 },
  { key: "materialTestingLab", label: "On-site Material QA & Testing Desk", defaultAmount: 85000 },
  { key: "siteOfficeInventory", label: "Site Office Computer, Printer & Barcode Setup", defaultAmount: 65000 },
  { key: "safetyBarricading", label: "Perimeter Barricading & Safety Warning Signages", defaultAmount: 40000 },
  { key: "firstAidStation", label: "First Aid & Emergency Safety Station", defaultAmount: 25000 },
];

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const DOCUMENT_UPLOAD_CHUNK_CHARS = 200_000;
const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".png"];
const PINCODE_CACHE_PREFIX = "store-pincode-location:v2:";

function getEmptyFacilityItem(field) {
  return {
    enabled: false,
    amount: field.defaultAmount || "",
    units: "1",
    total: 0,
  };
}

const initialForm = {
  name: "",
  projectId: "",
  projectCode: "",
  projectName: "",
  locationType: "Store",
  franchiseType: "MAIN_SITE_STORE",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "Uttar Pradesh",
  pincode: "",
  country: "India",
  deliveryLatitude: "",
  deliveryLongitude: "",
  deliveryRadiusKm: "10",
  panNumber: "",
  managerName: "",
  managerMobile: "",
  managerEmail: "",
  openingTime: "08:00 am",
  closingTime: "08:00 pm",
  defaultCustomerGroup: "Site Operations",
  storeCode: "",
  storeAreaSqFt: "2500",
  costPerSqFt: "800",
  documents: DOCUMENT_FIELDS.reduce(
    (acc, field) => ({ ...acc, [field.key]: null }),
    {},
  ),
  interiorItems: INFRASTRUCTURE_FIELDS.reduce(
    (acc, field) => ({
      ...acc,
      [field.key]: getEmptyFacilityItem(field),
    }),
    {},
  ),
  enableVoucherValidation: true,
  automaticPrint: true,
  enableStoreStockAlert: true,
  enableStoreOnlineBillingOnly: false,
  cin: "",
  tin: "",
  serviceTaxNumber: "",
  gstNumber: "",
  customerGstOrderPrefix: "GST-REQ",
  fssaiLicenseNumber: "",
  taxInformation: "Standard Construction Project Material Rules",
  customStoreOrderPrefix: "MRN",
  refundCustomStoreOrderPrefix: "MRN-RET",
  ncCustomStoreOrderPrefix: "MIN",
  ncRefundCustomStoreOrderPrefix: "MIN-RET",
  rwiCustomStoreOrderPrefix: "STR",
};

function getStoreFormat(areaValue) {
  const area = Number(areaValue || 0);
  if (!Number.isFinite(area) || area <= 0) return "";
  if (area >= 10000) return "Mega Project Site Yard";
  if (area >= 5000) return "Major Site Storage Yard";
  if (area >= 2000) return "Standard Site Store";
  if (area >= 500) return "Compact / Transit Site Store";
  return "Site Material Shed";
}

function getTotalAmount(areaValue, costValue) {
  const area = Number(areaValue || 0);
  const cost = Number(costValue || 0);
  if (
    !Number.isFinite(area) ||
    !Number.isFinite(cost) ||
    area <= 0 ||
    cost <= 0
  )
    return 0;
  return area * cost;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function getFacilityItemTotal(item) {
  if (!item?.enabled) return 0;
  const amount = Number(item.amount || 0);
  const units = Number(item.units || 0);
  return amount * units;
}

function getFacilityGrandTotal(items) {
  return Object.values(items || {}).reduce((sum, item) => {
    return sum + getFacilityItemTotal(item);
  }, 0);
}

async function fileToDocument(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        file,
        dataUrl: String(reader.result || ""),
      });
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function uploadStoreDocument(storeId, key, document) {
  if (!document) return;
  const dataUrl = String(document.dataUrl || "");
  const base64 = dataUrl.includes(",") ? dataUrl.split(",").pop() : "";
  if (!base64) {
    throw new Error(`Failed to upload ${document.name || key}`);
  }
  const uploadId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const totalChunks = Math.ceil(base64.length / DOCUMENT_UPLOAD_CHUNK_CHARS);
  const metadata = {
    name: document.name,
    type: document.type,
    size: document.size,
  };

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const chunkData = base64.slice(
      chunkIndex * DOCUMENT_UPLOAD_CHUNK_CHARS,
      (chunkIndex + 1) * DOCUMENT_UPLOAD_CHUNK_CHARS,
    );
    const res = await fetch(`/api/stores/${storeId}/documents/${key}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "chunk",
        uploadId,
        chunkIndex,
        totalChunks,
        document: metadata,
        chunkData,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(
        json.message || `Failed to upload ${document.name || key}`,
      );
    }
  }

  const res = await fetch(`/api/stores/${storeId}/documents/${key}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "finalize",
      uploadId,
      document: metadata,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to upload ${document.name || key}`);
  }
}

export default function EditStorePage() {
  const params = useParams();
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [storeTypes, setStoreTypes] = useState(DEFAULT_STORE_TYPES);
  const [locationTypes, setLocationTypes] = useState(DEFAULT_LOCATION_TYPES);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [locationStatus, setLocationStatus] = useState("");
  const [dirtyDocumentKeys, setDirtyDocumentKeys] = useState([]);

  // Manage Modal State (for both Location Types & Store Formats)
  const [manageModal, setManageModal] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);

  const handleProjectCreated = (newProject) => {
    if (!newProject) return;
    setProjects((prev) => [newProject, ...prev.filter((p) => String(p.id) !== String(newProject.id))]);
    setForm((p) => ({
      ...p,
      projectId: newProject.id,
      projectCode: newProject.project_code || "",
      projectName: newProject.name || "",
    }));
  };

  const loadStoreTypes = async () => {
    try {
      const res = await fetch("/api/settings/site-store-types?pageSize=50");
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data?.records) && json.data.records.length > 0) {
        const mapped = json.data.records.map((r) => ({
          id: r.id,
          value: r.code || r.name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
          label: r.name,
        }));
        setStoreTypes(mapped);
      }
    } catch {
      // Keep default store types
    }
  };

  const loadLocationTypes = async () => {
    try {
      const res = await fetch("/api/settings/site-location-types?pageSize=50");
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data?.records) && json.data.records.length > 0) {
        const mapped = json.data.records.map((r) => ({
          id: r.id,
          value: r.code || r.name,
          label: r.name,
        }));
        setLocationTypes(mapped);
      }
    } catch {
      // Keep default location types
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingProjects(true);
      try {
        const [projRes] = await Promise.all([
          fetch("/api/construction/projects"),
          loadStoreTypes(),
          loadLocationTypes(),
        ]);
        const json = await projRes.json();
        if (mounted && projRes.ok && json.success) {
          setProjects(json.data.records || []);
        }
      } catch {
        // Ignore
      } finally {
        if (mounted) setLoadingProjects(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/stores/${params.id}`);
        const json = await res.json();
        if (!mounted) return;

        if (!res.ok || !json.success) {
          setError(json.message || "Failed to load site store");
          return;
        }

        const store = json.data.store;
        const meta = store.meta || {};
        setDirtyDocumentKeys([]);

        // Merge loaded facility items
        const loadedInterior = { ...initialForm.interiorItems };
        if (meta.interiorItems && typeof meta.interiorItems === "object") {
          for (const [k, v] of Object.entries(meta.interiorItems)) {
            if (loadedInterior[k]) {
              loadedInterior[k] = { ...loadedInterior[k], ...v };
            }
          }
        }

        setForm({
          ...initialForm,
          name: store.name || "",
          projectId: meta.projectId ? String(meta.projectId) : "",
          projectCode: meta.projectCode || "",
          projectName: meta.projectName || "",
          addressLine1: store.address_line1 || "",
          addressLine2: store.address_line2 || "",
          city: store.city || "",
          state: store.state || "Uttar Pradesh",
          pincode: store.pincode || "",
          country: store.country || "India",
          deliveryLatitude: meta.deliveryLatitude ?? "",
          deliveryLongitude: meta.deliveryLongitude ?? "",
          deliveryRadiusKm: meta.deliveryRadiusKm || "10",
          managerName: store.manager_name || "",
          managerMobile: store.manager_mobile || "",
          managerEmail: store.manager_email || "",
          openingTime: store.opening_time || "08:00 am",
          closingTime: store.closing_time || "08:00 pm",
          locationType: meta.locationType || "Store",
          panNumber: meta.panNumber || "",
          defaultCustomerGroup: meta.defaultCustomerGroup || "Site Operations",
          storeCode: meta.storeCode || meta.shortCode || "",
          storeAreaSqFt: meta.storeAreaSqFt || meta.storeArea || "2500",
          costPerSqFt: meta.costPerSqFt || "800",
          franchiseType: meta.franchiseType || "MAIN_SITE_STORE",
          documents: {
            ...initialForm.documents,
            ...(meta.documents && typeof meta.documents === "object"
              ? meta.documents
              : {}),
          },
          interiorItems: loadedInterior,
          enableVoucherValidation: !!meta.enableVoucherValidation,
          automaticPrint: !!meta.automaticPrint,
          enableStoreStockAlert: !!meta.enableStoreStockAlert,
          enableStoreOnlineBillingOnly: !!meta.enableStoreOnlineBillingOnly,
          cin: meta.cin || "",
          tin: meta.tin || "",
          serviceTaxNumber: meta.serviceTaxNumber || "",
          gstNumber: meta.gstNumber || "",
          customerGstOrderPrefix: meta.customerGstOrderPrefix || "GST-REQ",
          fssaiLicenseNumber: meta.fssaiLicenseNumber || "",
          taxInformation: meta.taxInformation || "Standard Construction Project Material Rules",
          customStoreOrderPrefix: meta.customStoreOrderPrefix || "MRN",
          refundCustomStoreOrderPrefix: meta.refundCustomStoreOrderPrefix || "MRN-RET",
          ncCustomStoreOrderPrefix: meta.ncCustomStoreOrderPrefix || "MIN",
          ncRefundCustomStoreOrderPrefix:
            meta.ncRefundCustomStoreOrderPrefix || "MIN-RET",
          rwiCustomStoreOrderPrefix: meta.rwiCustomStoreOrderPrefix || "STR",
        });
      } catch {
        if (mounted) setError("Failed to load site store");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [params.id]);

  const onChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    if (name === "managerMobile") {
      nextValue = value.replace(/\D/g, "").slice(0, 10);
    } else if (name === "pincode") {
      nextValue = value.replace(/\D/g, "").slice(0, 6);
    } else if (["storeAreaSqFt", "costPerSqFt", "deliveryRadiusKm"].includes(name)) {
      nextValue = value.replace(/[^\d.]/g, "");
    }

    if (name === "projectId") {
      const selected = projects.find((p) => String(p.id) === String(value));
      setForm((p) => ({
        ...p,
        projectId: value,
        projectCode: selected?.project_code || "",
        projectName: selected?.name || "",
      }));
      return;
    }

    setForm((p) => ({ ...p, [name]: nextValue }));
    setFieldErrors((p) => ({ ...p, [name]: "" }));
  };

  const onCheck = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.checked }));

  const captureStoreLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not supported by this browser");
      return;
    }
    setLocationStatus("Getting site GPS coordinates...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((current) => ({
          ...current,
          deliveryLatitude: coords.latitude.toFixed(7),
          deliveryLongitude: coords.longitude.toFixed(7),
        }));
        setLocationStatus("Site GPS coordinates captured successfully");
      },
      () => setLocationStatus("Allow location access and try again"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const onDocumentChange = async (key, file) => {
    if (!file) {
      setForm((p) => ({ ...p, documents: { ...p.documents, [key]: null } }));
      setDirtyDocumentKeys((keys) => [...new Set([...keys, key])]);
      setFieldErrors((p) => ({ ...p, [`documents.${key}`]: "" }));
      return;
    }
    const fileName = file.name.toLowerCase();
    const isAllowedExtension = ALLOWED_DOCUMENT_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext),
    );
    const isAllowedType = ALLOWED_DOCUMENT_TYPES.includes(file.type);
    if (!isAllowedExtension || !isAllowedType) {
      setFieldErrors((p) => ({
        ...p,
        [`documents.${key}`]: "Only JPG, PNG or PDF files are allowed",
      }));
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setFieldErrors((p) => ({
        ...p,
        [`documents.${key}`]: "File must be 15 MB or smaller",
      }));
      return;
    }
    try {
      const doc = await fileToDocument(file);
      setForm((p) => ({ ...p, documents: { ...p.documents, [key]: doc } }));
      setDirtyDocumentKeys((keys) => [...new Set([...keys, key])]);
      setFieldErrors((p) => ({ ...p, [`documents.${key}`]: "" }));
    } catch {
      setFieldErrors((p) => ({
        ...p,
        [`documents.${key}`]: "Unable to read selected file",
      }));
    }
  };

  const updateFacilityItem = (key, patch) => {
    setForm((current) => {
      const previous = current.interiorItems[key] || {};
      const next = { ...previous, ...patch };
      const amount = Number(next.amount || 0);
      const units = Number(next.units || 0);
      next.total = next.enabled && amount > 0 && units > 0 ? amount * units : 0;
      return {
        ...current,
        interiorItems: { ...current.interiorItems, [key]: next },
      };
    });
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = "Site Store name is required";
    if (!form.addressLine1.trim()) next.addressLine1 = "Site address line 1 is required";
    if (!form.city.trim()) next.city = "City is required";
    if (!form.state.trim()) next.state = "State is required";
    if (form.pincode.trim() && !/^\d{6}$/.test(form.pincode.trim())) {
      next.pincode = "Pincode must be 6 digits";
    }
    if (!form.managerName.trim()) {
      next.managerName = "Site In-Charge / Store Keeper name is required";
    }
    if (!form.managerMobile.trim()) {
      next.managerMobile = "In-charge mobile number is required";
    } else if (!/^\d{10}$/.test(form.managerMobile)) {
      next.managerMobile = "Mobile number must be exactly 10 digits";
    }
    if (
      form.managerEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.managerEmail.trim())
    ) {
      next.managerEmail = "Enter a valid e-mail address";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!validate()) {
      setError("Please fix the highlighted fields");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        documents: Object.fromEntries(
          Object.entries(form.documents || {}).map(([key, document]) => [
            key,
            document
              ? {
                  name: document.name,
                  type: document.type,
                  size: document.size,
                }
              : null,
          ]),
        ),
      };

      const res = await fetch(`/api/stores/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || "Failed to update site store");
        return;
      }

      for (const key of dirtyDocumentKeys) {
        const document = form.documents?.[key];
        if (document?.dataUrl) {
          await uploadStoreDocument(params.id, key, document);
        }
      }

      setSuccess("Site Store details updated successfully!");
      setDirtyDocumentKeys([]);
      setTimeout(() => router.push(`/settings/stores/${params.id}`), 1200);
    } catch (err) {
      setError(err.message || "Failed to update site store");
    } finally {
      setSaving(false);
    }
  };

  const storeFormat = getStoreFormat(form.storeAreaSqFt);
  const totalAmount = getTotalAmount(form.storeAreaSqFt, form.costPerSqFt);
  const facilityGrandTotal = getFacilityGrandTotal(form.interiorItems);
  const inputClass = (field) => `input ${fieldErrors[field] ? "input-error" : ""}`;

  return (
    <MainLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded">
              Construction Infrastructure
            </span>
            <h2 className="text-xl font-bold text-gray-900">Edit Construction Site Store</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Update project association, site location, in-charge engineer, and material handling infrastructure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/settings/stores/${params.id}`)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            form="edit-store-form"
            type="submit"
            disabled={saving || loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm transition"
          >
            {saving ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm font-semibold text-gray-500">
          Loading site store details...
        </div>
      ) : (
        <form
          id="edit-store-form"
          onSubmit={handleSubmit}
          className="space-y-6 max-w-5xl"
        >
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg">
              {error}
            </div>
          )}
          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-lg">
              ✓ {success}
            </div>
          )}

          {/* Section 1: Location & Project */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                1
              </span>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Site Location & Project Assignment
              </h3>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Site Store Name *" error={fieldErrors.name}>
                  <input
                    name="name"
                    value={form.name}
                    onChange={onChange}
                    className={inputClass("name")}
                    placeholder="e.g. Noida Sector 62 Main Yard"
                  />
                </Field>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">
                      Associated Construction Project
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowProjectModal(true)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      + New Project
                    </button>
                  </div>
                  <select
                    name="projectId"
                    value={form.projectId}
                    onChange={onChange}
                    className="input bg-white"
                  >
                    <option value="">-- Standalone / Not Linked to Specific Project --</option>
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.project_code} - {proj.name} ({proj.status || "active"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">
                      Site Store Format / Facility Type
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setManageModal({
                          type: "site-store-types",
                          title: "Site Store Formats",
                          currentValue: form.franchiseType,
                          items: storeTypes,
                          onUpdate: (items) => setStoreTypes(items),
                          onSelect: (val) => setForm((p) => ({ ...p, franchiseType: val })),
                        })
                      }
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      ⚙ Manage / + Add
                    </button>
                  </div>
                  <select
                    name="franchiseType"
                    value={form.franchiseType}
                    onChange={onChange}
                    className="input bg-white font-medium"
                  >
                    {storeTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">
                      Location Type
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setManageModal({
                          type: "site-location-types",
                          title: "Location Types",
                          currentValue: form.locationType,
                          items: locationTypes,
                          onUpdate: (items) => setLocationTypes(items),
                          onSelect: (val) => setForm((p) => ({ ...p, locationType: val })),
                        })
                      }
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      ⚙ Manage / + Add
                    </button>
                  </div>
                  <select
                    name="locationType"
                    value={form.locationType}
                    onChange={onChange}
                    className="input bg-white"
                  >
                    {locationTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Field label="Site Address (Line 1) *" error={fieldErrors.addressLine1}>
                <input
                  name="addressLine1"
                  value={form.addressLine1}
                  onChange={onChange}
                  className={inputClass("addressLine1")}
                  placeholder="Address Line 1"
                />
              </Field>

              <Field label="Site Address (Line 2) / Landmark">
                <input
                  name="addressLine2"
                  value={form.addressLine2}
                  onChange={onChange}
                  className="input"
                  placeholder="Address Line 2"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="City / District *" error={fieldErrors.city}>
                  <input
                    name="city"
                    value={form.city}
                    onChange={onChange}
                    className={inputClass("city")}
                  />
                </Field>

                <Field label="State *" error={fieldErrors.state}>
                  <input
                    name="state"
                    value={form.state}
                    onChange={onChange}
                    className={inputClass("state")}
                  />
                </Field>

                <Field label="Pincode" error={fieldErrors.pincode}>
                  <input
                    name="pincode"
                    value={form.pincode}
                    onChange={onChange}
                    className={inputClass("pincode")}
                    maxLength={6}
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">
                      Site Geo-Location & Dispatch Radius
                    </h4>
                    <p className="text-xs text-blue-700">
                      Used for GPS delivery tracking and material gate passes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={captureStoreLocation}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition"
                  >
                    📍 Capture Current GPS
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Site Latitude">
                    <input
                      name="deliveryLatitude"
                      value={form.deliveryLatitude}
                      onChange={onChange}
                      inputMode="decimal"
                      className="input bg-white"
                    />
                  </Field>
                  <Field label="Site Longitude">
                    <input
                      name="deliveryLongitude"
                      value={form.deliveryLongitude}
                      onChange={onChange}
                      inputMode="decimal"
                      className="input bg-white"
                    />
                  </Field>
                  <Field label="Supply Radius (km)">
                    <input
                      name="deliveryRadiusKm"
                      type="number"
                      min="1"
                      max="500"
                      value={form.deliveryRadiusKm}
                      onChange={onChange}
                      className="input bg-white"
                    />
                  </Field>
                </div>
                {locationStatus && (
                  <p className="mt-2 text-xs font-medium text-blue-800">
                    {locationStatus}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 2: In-Charge & Capacity */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                2
              </span>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Site In-Charge & Storage Specifications
              </h3>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Site In-Charge / Store Keeper *"
                  error={fieldErrors.managerName}
                >
                  <input
                    name="managerName"
                    value={form.managerName}
                    onChange={onChange}
                    className={inputClass("managerName")}
                  />
                </Field>

                <Field
                  label="In-Charge Mobile Number *"
                  error={fieldErrors.managerMobile}
                >
                  <input
                    name="managerMobile"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.managerMobile}
                    onChange={onChange}
                    className={inputClass("managerMobile")}
                  />
                </Field>

                <Field label="In-Charge Email Address" error={fieldErrors.managerEmail}>
                  <input
                    name="managerEmail"
                    type="email"
                    value={form.managerEmail}
                    onChange={onChange}
                    className={inputClass("managerEmail")}
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Site Store Code">
                  <input
                    name="storeCode"
                    value={form.storeCode}
                    onChange={onChange}
                    className="input uppercase font-semibold"
                  />
                </Field>

                <Field label="Site Gate Opening Time">
                  <input
                    name="openingTime"
                    value={form.openingTime}
                    onChange={onChange}
                    className="input"
                  />
                </Field>

                <Field label="Site Gate Closing Time">
                  <input
                    name="closingTime"
                    value={form.closingTime}
                    onChange={onChange}
                    className="input"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Site Storage Area (Sq. Ft.)">
                  <input
                    name="storeAreaSqFt"
                    inputMode="decimal"
                    value={form.storeAreaSqFt}
                    onChange={onChange}
                    className="input font-semibold"
                  />
                  {storeFormat ? (
                    <span className="mt-1 block text-xs font-semibold text-blue-700">
                      Category: {storeFormat}
                    </span>
                  ) : null}
                </Field>

                <Field label="Estimated Infrastructure Cost / Sq. Ft. (₹)">
                  <input
                    name="costPerSqFt"
                    inputMode="decimal"
                    value={form.costPerSqFt}
                    onChange={onChange}
                    className="input"
                  />
                </Field>

                <Field label="Storage Facility Valuation">
                  <input
                    value={totalAmount ? formatMoney(totalAmount) : "₹ 0"}
                    readOnly
                    className="input bg-gray-50 font-bold text-gray-900"
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* Section 3: Documents */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                3
              </span>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Site & Project Documents
              </h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {DOCUMENT_FIELDS.map((field) => (
                <DocumentUpload
                  key={field.key}
                  field={field}
                  document={form.documents[field.key]}
                  error={fieldErrors[`documents.${field.key}`]}
                  onChange={(file) => onDocumentChange(field.key, file)}
                />
              ))}
            </div>
          </section>

          {/* Section 4: Infrastructure & Equipment */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4 border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                  4
                </span>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                  Site Storage Infrastructure & Handling Facilities
                </h3>
              </div>
              <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                Equipment Total: {formatMoney(facilityGrandTotal)}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {INFRASTRUCTURE_FIELDS.map((field) => (
                <FacilityLine
                  key={field.key}
                  field={field}
                  item={form.interiorItems[field.key]}
                  onChange={(patch) => updateFacilityItem(field.key, patch)}
                />
              ))}
            </div>
          </section>

          {/* Section 5: Gate Controls */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                5
              </span>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Operations & Gate Controls
              </h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle
                label="Enable Material Gate-Pass & Voucher Validation"
                name="enableVoucherValidation"
                checked={form.enableVoucherValidation}
                onChange={onCheck}
              />
              <Toggle
                label="Automatic MRN / Material Issue Slip Print"
                name="automaticPrint"
                checked={form.automaticPrint}
                onChange={onCheck}
              />
              <Toggle
                label="Enable Site Min-Max Inventory Stock Alert"
                name="enableStoreStockAlert"
                checked={form.enableStoreStockAlert}
                onChange={onCheck}
              />
              <Toggle
                label="Restrict to Direct Site Requisition Only"
                name="enableStoreOnlineBillingOnly"
                checked={form.enableStoreOnlineBillingOnly}
                onChange={onCheck}
              />
            </div>
          </section>

          {/* Section 6: Tax & Identification */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                6
              </span>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Tax, GST & Material Requisition Prefixes
              </h3>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="GST Number">
                  <input
                    name="gstNumber"
                    value={form.gstNumber}
                    onChange={onChange}
                    className="input uppercase"
                    placeholder="07AAAAA0000A1Z5"
                  />
                </Field>
                <Field label="PAN Number">
                  <input
                    name="panNumber"
                    value={form.panNumber}
                    onChange={onChange}
                    className="input uppercase"
                    placeholder="ABCDE1234F"
                  />
                </Field>
                <Field label="CIN / Company Reg No.">
                  <input
                    name="cin"
                    value={form.cin}
                    onChange={onChange}
                    className="input"
                    placeholder="U12345DL2024PTC123456"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Material Receipt Note (MRN) Prefix">
                  <input
                    name="customStoreOrderPrefix"
                    value={form.customStoreOrderPrefix}
                    onChange={onChange}
                    className="input uppercase font-medium"
                  />
                </Field>
                <Field label="Material Issue Note (MIN) Prefix">
                  <input
                    name="ncCustomStoreOrderPrefix"
                    value={form.ncCustomStoreOrderPrefix}
                    onChange={onChange}
                    className="input uppercase font-medium"
                  />
                </Field>
                <Field label="Site Transfer Note (STR) Prefix">
                  <input
                    name="rwiCustomStoreOrderPrefix"
                    value={form.rwiCustomStoreOrderPrefix}
                    onChange={onChange}
                    className="input uppercase font-medium"
                  />
                </Field>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.push(`/settings/stores/${params.id}`)}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm transition"
            >
              {saving ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {/* Reusable Modal to Manage, Add & Delete Options */}
      {manageModal && (
        <ManageDropdownModal
          modalInfo={manageModal}
          onClose={() => setManageModal(null)}
        />
      )}

      {/* Quick Create Project Modal */}
      {showProjectModal && (
        <CreateProjectModal
          onClose={() => setShowProjectModal(false)}
          onSuccess={handleProjectCreated}
        />
      )}

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          background: white;
        }
        .input:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 1px #2563eb;
        }
        .input-error {
          border-color: #ef4444;
          background: #fff7f7;
        }
        .input-error:focus {
          border-color: #ef4444;
          box-shadow: 0 0 0 1px #ef4444;
        }
      `}</style>
    </MainLayout>
  );
}

function ManageDropdownModal({ modalInfo, onClose }) {
  const { type, title, currentValue, items = [], onUpdate, onSelect } = modalInfo;
  const [list, setList] = useState(items);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }
  const [confirmDelete, setConfirmDelete] = useState(null); // item to delete
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const refreshList = async () => {
    try {
      const res = await fetch(`/api/settings/${type}?pageSize=100`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data?.records) && json.data.records.length > 0) {
        const mapped = json.data.records.map((r) => ({
          id: r.id,
          value: r.code || r.name,
          label: r.name,
        }));
        setList(mapped);
        onUpdate(mapped);
      } else if (items && items.length > 0) {
        setList(items);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    refreshList();
  }, [type]);

  const handleAdd = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setActionError("Please enter a name first");
      return;
    }
    setLoading(true);
    setActionError("");
    try {
      const code = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 40);
      const res = await fetch(`/api/settings/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          code,
          description: `Custom ${title}: ${trimmed}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setActionError(json.message || "Failed to add option");
        return;
      }
      const savedRecord = json.data;
      const savedValue = savedRecord?.code || code || trimmed;
      const savedLabel = savedRecord?.name || trimmed;
      const newItem = {
        id: savedRecord?.id || Date.now(),
        value: savedValue,
        label: savedLabel,
      };

      const updated = [...list.filter((i) => i.value !== newItem.value), newItem];
      setList(updated);
      onUpdate(updated);
      onSelect(newItem.value);
      setNewName("");
      setToast({ type: "success", message: `"${savedLabel}" added successfully!` });
      await refreshList();
    } catch (err) {
      setActionError(err.message || "Unable to add option");
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async (item) => {
    if (!item) return;
    setLoading(true);
    setActionError("");
    try {
      let recordId = item.id;
      if (!recordId) {
        const checkRes = await fetch(`/api/settings/${type}?search=${encodeURIComponent(item.label)}`);
        const checkJson = await checkRes.json();
        const found = checkJson?.data?.records?.find(
          (r) => r.name.toLowerCase() === item.label.toLowerCase() || (r.code && r.code.toLowerCase() === item.value.toLowerCase())
        );
        if (found?.id) {
          recordId = found.id;
        }
      }

      if (recordId) {
        const res = await fetch(`/api/settings/${type}?id=${recordId}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          setActionError(json.message || "Failed to delete option");
          return;
        }
      }
      const updated = list.filter((i) => i.value !== item.value);
      setList(updated);
      onUpdate(updated);
      if (currentValue === item.value && updated.length > 0) {
        onSelect(updated[0].value);
      }
      setConfirmDelete(null);
      setToast({ type: "success", message: `"${item.label}" deleted successfully` });
    } catch (err) {
      setActionError(err.message || "Unable to delete option");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl p-6 relative my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Manage {title}
            </h3>
            <p className="text-xs text-gray-500">Add new options or delete existing ones</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center justify-between animate-in fade-in duration-150">
            <span>✓ {toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-emerald-600 hover:text-emerald-900 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Add New Input */}
        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (actionError) setActionError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd(e);
              }
            }}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            placeholder={`Enter new ${title} name...`}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading || !newName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Adding..." : "+ Add"}
          </button>
        </form>

        {actionError && (
          <p className="text-xs font-semibold text-red-600 mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
            ⚠ {actionError}
          </p>
        )}

        {/* List of items with delete buttons */}
        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {list.map((item) => (
            <div
              key={item.value}
              className={`flex items-center justify-between p-3 hover:bg-gray-50 transition ${
                currentValue === item.value ? "bg-blue-50/60 font-semibold" : ""
              }`}
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => {
                  onSelect(item.value);
                  onClose();
                }}
              >
                <div className="text-sm text-gray-900">{item.label}</div>
                <div className="text-[11px] text-gray-400 font-mono">{item.value}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                  className={`text-xs px-2.5 py-1 rounded font-semibold ${
                    currentValue === item.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {currentValue === item.value ? "Selected" : "Select"}
                </button>
                <button
                  type="button"
                  title="Delete this option"
                  onClick={() => setConfirmDelete(item)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="p-4 text-center text-sm text-gray-500 italic">No options found.</div>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200"
          >
            Done
          </button>
        </div>

        {/* Custom In-App Delete Confirmation Modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div
              className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl p-5 text-center animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h4 className="text-base font-bold text-gray-900 mb-1">Delete Option?</h4>
              <p className="text-xs text-gray-500 mb-5">
                Are you sure you want to delete <strong>"{confirmDelete.label}"</strong>? This will remove it from the dropdown.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  disabled={loading}
                  className="flex-1 py-2 px-3 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeDelete(confirmDelete)}
                  disabled={loading}
                  className="flex-1 py-2 px-3 bg-red-600 rounded-lg text-xs font-semibold text-white hover:bg-red-700 transition"
                >
                  {loading ? "Deleting..." : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children, error }) {
  const isRequired = String(label || "")
    .trim()
    .endsWith("*");
  const displayLabel = isRequired ? String(label).replace(/\s*\*$/, "") : label;
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-700">
        {displayLabel}
        {isRequired ? <span className="text-red-500 font-bold"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function DocumentUpload({ field, document, error, onChange }) {
  const [showPreview, setShowPreview] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const documentType = String(document?.type || "").toLowerCase();
  const isPdf = documentType.includes("pdf");
  const isImage = documentType.startsWith("image/");
  const hasPreview = Boolean(document?.dataUrl);

  return (
    <>
      <label
        className={`block rounded-lg border px-3 py-3 ${error ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"}`}
      >
        <span className="mb-2 block text-xs font-semibold text-gray-700">
          {field.label}
          <span className="text-gray-400 font-normal"> (optional)</span>
        </span>
        <input
          key={inputKey}
          type="file"
          accept=".pdf,.jpg,.png"
          onChange={(e) => {
            setShowPreview(false);
            onChange(e.target.files?.[0] || null);
          }}
          className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
        />
        {document?.name ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="block truncate text-xs font-semibold text-emerald-700">
              ✓ {document.name}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (hasPreview) setShowPreview((current) => !current);
              }}
              disabled={!hasPreview}
              className={`text-xs font-semibold ${
                hasPreview
                  ? "text-blue-700 hover:underline"
                  : "cursor-not-allowed text-gray-400"
              }`}
            >
              {hasPreview
                ? showPreview
                  ? "Hide Preview"
                  : "Show Preview"
                : "Re-upload to preview"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowPreview(false);
                setInputKey((current) => current + 1);
                onChange(null);
              }}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : null}
        <span className="mt-2 block text-[11px] text-gray-400">
          JPG, PNG or PDF (Max 15 MB)
        </span>
        {error ? (
          <span className="mt-1 block text-xs font-medium text-red-600">
            {error}
          </span>
        ) : null}
      </label>
      {mounted && showPreview && document?.dataUrl
        ? createPortal(
            <div
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
              style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}
              onClick={() => setShowPreview(false)}
            >
              <div
                className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl relative my-auto animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-gray-50">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-gray-900">
                      {field.label}
                    </h3>
                    <p className="truncate text-xs text-gray-500">{document.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPreview(false)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Close Preview
                  </button>
                </div>
                <div className="h-[70vh] bg-gray-100 p-3">
                  {isImage ? (
                    <img
                      src={document.dataUrl}
                      alt={`${field.label} preview`}
                      className="h-full w-full object-contain"
                    />
                  ) : isPdf ? (
                    <iframe
                      src={document.dataUrl}
                      title={`${field.label} preview`}
                      className="h-full w-full rounded border border-gray-200 bg-white"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      Preview is not available for this file.
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function FacilityLine({ field, item, onChange }) {
  const enabled = !!item?.enabled;
  const amount = item?.amount ?? "";
  const units = item?.units ?? "";
  const total = Number(item?.total || 0);

  return (
    <div className={`rounded-lg border p-3 transition ${enabled ? "border-blue-300 bg-blue-50/20" : "border-gray-200 bg-white"}`}>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className={`text-xs font-semibold ${enabled ? "text-blue-900" : "text-gray-800"}`}>
          {field.label}
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-4 w-4 accent-blue-600 rounded"
        />
      </label>
      {enabled ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center">
          <div>
            <span className="text-[10px] font-medium text-gray-500 block mb-0.5">Est. Cost (₹)</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) =>
                onChange({ amount: e.target.value.replace(/[^\d.]/g, "") })
              }
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
              placeholder="0"
            />
          </div>
          <div>
            <span className="text-[10px] font-medium text-gray-500 block mb-0.5">Quantity / Units</span>
            <input
              inputMode="decimal"
              value={units}
              onChange={(e) =>
                onChange({ units: e.target.value.replace(/[^\d.]/g, "") })
              }
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
              placeholder="1"
            />
          </div>
          <div className="pt-3">
            <span className="text-xs font-bold text-blue-700 bg-white border border-blue-200 px-2.5 py-1.5 rounded block whitespace-nowrap">
              {formatMoney(total)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Toggle({ label, name, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 bg-white hover:bg-gray-50 cursor-pointer">
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      <input
        name={name}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-blue-600 rounded"
      />
    </label>
  );
}

function CreateProjectModal({ onClose, onSuccess }) {
  const [name, setName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [budget, setBudget] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const onNameChange = (val) => {
    setName(val);
    if (!projectCode || projectCode.startsWith("PRJ-")) {
      const generated = "PRJ-" + val.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      setProjectCode(generated);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!projectCode.trim()) {
      setError("Project code is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/construction/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          projectCode: projectCode.trim().toUpperCase(),
          clientName: clientName.trim(),
          address: address.trim(),
          budget: budget ? Number(budget) : 0,
          status,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.message || "Failed to create project");
        return;
      }
      onSuccess(json.data);
      onClose();
    } catch (err) {
      setError(err.message || "Unable to create project");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl p-6 relative my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Create Construction Project</h3>
            <p className="text-xs text-gray-500">Register new project to link site stores and track material yard</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="text-xs font-semibold text-red-600 mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
            ⚠ {error}
          </p>
        )}

        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Project Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-600"
                placeholder="e.g. Express Tower Phase 2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Project Code *
              </label>
              <input
                type="text"
                required
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
                className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white font-mono focus:outline-none focus:border-blue-600"
                placeholder="e.g. PRJ-ETP2"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Client / Developer Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white"
                placeholder="e.g. DLF / NBCC"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Approved Budget (₹)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))}
                className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white"
                placeholder="e.g. 50000000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Project Site Location / Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white"
              placeholder="e.g. Sector 62, Noida, Uttar Pradesh"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !projectCode.trim()}
              className="px-5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
