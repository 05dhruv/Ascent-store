"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MainLayout from "@/components/MainLayout";
import { validatePhoneNumber } from "@/lib/phoneValidator";
import { fetchLookup, normalizeVendors } from "@/lib/purchaseLookups";

const tableHeaders = [
  "S. No.",
  "Vendor Name",
  "Credit Days",
  "Mobile Number",
  "Email Address",
  "Vendor Location",
  "Address",
  "Actions",
];

const DISTRIBUTION_VIA_OPTIONS = [
  { value: "company", label: "Company" },
  { value: "distributor", label: "Distributor" },
];
const VENDOR_EDIT_SHEET = "Vendors";
const VENDOR_EDIT_SCOPE_SHEET = "_VendorEditScope";

function normalizeMobile(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 10);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeDistributionVia(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "distributor"
    ? "distributor"
    : "company";
}

function getVendorAddress(vendor) {
  return [
    vendor.address_1,
    vendor.address_2,
    vendor.city,
    vendor.state,
    vendor.pincode,
    vendor.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditBusy, setBulkEditBusy] = useState(false);
  const [bulkChooserOpen, setBulkChooserOpen] = useState(false);
  const [bulkChooserSearch, setBulkChooserSearch] = useState("");
  const [selectedBulkVendorIds, setSelectedBulkVendorIds] = useState({});
  const [search, setSearch] = useState("");
  const bulkEditInputRef = useRef(null);
  const emptyForm = {
    id: null,
    name: "",
    company: "",
    business: "company",
    address_1: "",
    address_2: "",
    city: "",
    state: "",
    pincode: "",
    country: "",
    email: "",
    mobile_number: "",
    gst_number: "",
    margin: 0,
    credit_days: "",
    brand_ids: [],
    is_active: true,
  };
  const [form, setForm] = useState(emptyForm);
  const [currentUser, setCurrentUser] = useState(null);
  const isSuperAdmin = currentUser?.role === "super_admin";
  const bulkChooserQuery = bulkChooserSearch.trim().toLowerCase();
  const filteredBulkVendors = vendors.filter((vendor) => {
    if (!bulkChooserQuery) return true;
    return [
      vendor.id,
      vendor.name,
      vendor.company,
      vendor.mobile_number,
      vendor.email,
      vendor.gst_number,
      vendor.city,
      vendor.state,
    ]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(bulkChooserQuery));
  });
  const selectedBulkVendors = vendors.filter(
    (vendor) => vendor?.id && selectedBulkVendorIds[String(vendor.id)],
  );

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setCurrentUser(json.data?.user || json.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    fetchVendors();
    fetchBrands();
  }, []);

  useEffect(() => {
    if (!showModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showModal]);

  const fetchBrands = async () => {
    try {
      const data = await fetchLookup("/api/catalog/brands?pageSize=1000");
      const records = Array.isArray(data?.data?.records)
        ? data.data.records
        : Array.isArray(data?.records)
          ? data.records
          : [];
      setBrands(records.filter((brand) => brand?.is_active !== false));
    } catch (err) {
      console.error("Failed to fetch brands", err);
      setBrands([]);
    }
  };

  const fetchVendors = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("includeInactive", "true");
      params.set("pageSize", "10000");
      const data = await fetchLookup(`/api/vendors?${params.toString()}`);
      setVendors(normalizeVendors(data));
    } catch (err) {
      console.error("Failed to fetch vendors", err);
      setVendors([]);
      setError(err.message || "Failed to fetch vendors");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadVendors = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = vendors.map((vendor, index) => ({
        "S. No.": index + 1,
        "Vendor Name": vendor.name || "",
        "Vendor Company": vendor.company || "",
        "Distribution Via":
          normalizeDistributionVia(vendor.business) === "distributor"
            ? "Distributor"
            : "Company",
        "Mobile Number": vendor.mobile_number || "",
        "Email Address": vendor.email || "",
        "Vendor Location": [vendor.city, vendor.state, vendor.pincode]
          .filter(Boolean)
          .join(", "),
        "GST Number": vendor.gst_number || "",
        "Margin (%)": Number(vendor.margin || 0),
        "Credit Days": vendor.credit_days ?? "",
        Brands: Array.isArray(vendor.brands) ? vendor.brands.join(", ") : "",
        Address: getVendorAddress(vendor),
        "Address 1": vendor.address_1 || "",
        "Address 2": vendor.address_2 || "",
        City: vendor.city || "",
        State: vendor.state || "",
        Pincode: vendor.pincode || "",
        Country: vendor.country || "",
        Status: vendor.is_active === false ? "Inactive" : "Active",
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 8 },
        { wch: 28 },
        { wch: 24 },
        { wch: 16 },
        { wch: 16 },
        { wch: 30 },
        { wch: 18 },
        { wch: 12 },
        { wch: 32 },
        { wch: 60 },
        { wch: 28 },
        { wch: 28 },
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
        { wch: 18 },
        { wch: 12 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Vendors");
      XLSX.writeFile(
        workbook,
        `vendors-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      console.error("Vendor download failed", err);
      alert("Unable to download vendors Excel sheet");
    }
  };

  const openBulkEditChooser = () => {
    if (!vendors.length) return alert("No vendors available to edit.");
    setBulkEditOpen(false);
    setBulkChooserSearch("");
    setSelectedBulkVendorIds({});
    setBulkChooserOpen(true);
  };

  const handleDownloadEditableVendors = async (selectedVendors) => {
    const vendorsToDownload = Array.isArray(selectedVendors)
      ? selectedVendors
      : [];
    if (!vendorsToDownload.length) {
      return alert("Please select at least one vendor to download.");
    }
    setBulkEditBusy(true);
    setBulkEditOpen(false);
    try {
      const XLSX = await import("xlsx");
      const rows = vendorsToDownload.map((vendor, index) => ({
        "S. No.": index + 1,
        "Vendor ID": vendor.id,
        "Vendor Name": vendor.name || "",
        "Vendor Company": vendor.company || "",
        "Distribution Via":
          normalizeDistributionVia(vendor.business) === "distributor"
            ? "Distributor"
            : "Company",
        "Mobile Number": vendor.mobile_number || "",
        "Email Address": vendor.email || "",
        "GST Number": vendor.gst_number || "",
        "Margin (%)": Number(vendor.margin || 0),
        "Credit Days": vendor.credit_days ?? "",
        Brands: Array.isArray(vendor.brands) ? vendor.brands.join(", ") : "",
        "Address 1": vendor.address_1 || "",
        "Address 2": vendor.address_2 || "",
        City: vendor.city || "",
        State: vendor.state || "",
        Pincode: vendor.pincode || "",
        Country: vendor.country || "",
        Status: vendor.is_active === false ? "Inactive" : "Active",
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 8 },
        { wch: 12 },
        { wch: 28 },
        { wch: 24 },
        { wch: 16 },
        { wch: 16 },
        { wch: 30 },
        { wch: 18 },
        { wch: 12 },
        { wch: 12 },
        { wch: 40 },
        { wch: 28 },
        { wch: 28 },
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
        { wch: 18 },
        { wch: 12 },
      ];
      const scopeSheet = XLSX.utils.aoa_to_sheet([
        ["Workbook Type", "vendor-edit"],
        ["Generated At", new Date().toISOString()],
        [
          "Allowed Vendor IDs",
          vendorsToDownload.map((vendor) => vendor.id).join(","),
        ],
        ["Rule", "Only vendors listed in this workbook can be updated."],
        ["Rule", "Do not edit Vendor ID."],
      ]);
      scopeSheet["!hidden"] = 1;
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, VENDOR_EDIT_SHEET);
      XLSX.utils.book_append_sheet(
        workbook,
        scopeSheet,
        VENDOR_EDIT_SCOPE_SHEET,
      );
      XLSX.writeFile(
        workbook,
        `vendors-edit-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      setBulkChooserOpen(false);
      setSelectedBulkVendorIds({});
    } catch (err) {
      console.error("Editable vendor download failed", err);
      alert(err.message || "Unable to download editable vendors Excel sheet");
    } finally {
      setBulkEditBusy(false);
    }
  };

  const parseBrandIdsFromExcel = (value, rowNumber) => {
    const names = String(value || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (!names.length) return [];
    const byName = new Map(
      brands.map((brand) => [
        String(brand.name || "")
          .trim()
          .toLowerCase(),
        String(brand.id),
      ]),
    );
    return names.map((name) => {
      const brandId = byName.get(name.toLowerCase());
      if (!brandId)
        throw new Error(`Row ${rowNumber}: Brand not found - ${name}`);
      return brandId;
    });
  };

  const handleUploadEditableVendors = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBulkEditBusy(true);
    setBulkEditOpen(false);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const scope = XLSX.utils.sheet_to_json(
        workbook.Sheets[VENDOR_EDIT_SCOPE_SHEET],
        {
          header: 1,
          defval: "",
        },
      );
      const scopeMap = new Map(
        scope.map((row) => [String(row[0] || ""), String(row[1] || "")]),
      );
      if (scopeMap.get("Workbook Type") !== "vendor-edit") {
        throw new Error("Please upload a valid vendor edit workbook.");
      }
      const allowedIds = new Set(
        String(scopeMap.get("Allowed Vendor IDs") || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      );
      const sheet = workbook.Sheets[VENDOR_EDIT_SHEET];
      if (!sheet) throw new Error("Vendors sheet not found.");
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!rows.length) throw new Error("No vendors found in uploaded sheet.");

      for (let index = 0; index < rows.length; index += 1) {
        const rowNumber = index + 2;
        const row = rows[index];
        const vendorId = String(row["Vendor ID"] || "").trim();
        if (!vendorId || !allowedIds.has(vendorId)) {
          throw new Error(
            `Row ${rowNumber}: Vendor ID is not part of this edit file.`,
          );
        }
        const name = String(row["Vendor Name"] || "").trim();
        const mobile = normalizeMobile(row["Mobile Number"]);
        const gst = String(row["GST Number"] || "").trim();
        const email = String(row["Email Address"] || "").trim();
        const creditDays = Number(row["Credit Days"]);
        const brandIds = parseBrandIdsFromExcel(row.Brands, rowNumber);
        if (!name)
          throw new Error(`Row ${rowNumber}: Vendor name is required.`);
        if (!/^\d{10}$/.test(mobile)) {
          throw new Error(
            `Row ${rowNumber}: Mobile number must be exactly 10 digits.`,
          );
        }
        if (!gst) throw new Error(`Row ${rowNumber}: GST number is required.`);
        if (email && !isValidEmail(email)) {
          throw new Error(`Row ${rowNumber}: Enter a valid email address.`);
        }
        if (
          !Number.isInteger(creditDays) ||
          creditDays < 1 ||
          creditDays > 3650
        ) {
          throw new Error(
            `Row ${rowNumber}: Credit days must be between 1 and 3650.`,
          );
        }
        if (!brandIds.length) {
          throw new Error(
            `Row ${rowNumber}: Please enter at least one valid brand.`,
          );
        }

        const res = await fetch(
          `/api/vendors/${encodeURIComponent(vendorId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              company: String(row["Vendor Company"] || "").trim(),
              business: normalizeDistributionVia(row["Distribution Via"]),
              mobile_number: mobile,
              email,
              gst_number: gst,
              margin: Number(row["Margin (%)"] || 0),
              credit_days: creditDays,
              brand_ids: brandIds,
              address_1: String(row["Address 1"] || "").trim(),
              address_2: String(row["Address 2"] || "").trim(),
              city: String(row.City || "").trim(),
              state: String(row.State || "").trim(),
              pincode: String(row.Pincode || "").trim(),
              country: String(row.Country || "").trim(),
              is_active:
                String(row.Status || "Active")
                  .trim()
                  .toLowerCase() !== "inactive",
            }),
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            `Row ${rowNumber}: ${json.error || "Vendor update failed"}`,
          );
        }
      }
      await fetchVendors();
      alert(`Updated ${rows.length} vendor(s) successfully.`);
    } catch (err) {
      console.error("Editable vendor upload failed", err);
      alert(err.message || "Unable to upload editable vendors Excel sheet");
    } finally {
      setBulkEditBusy(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchVendors, 250);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (vendor) => {
    setForm({
      ...emptyForm,
      id: vendor.id,
      name: vendor.name || "",
      company: vendor.company || "",
      business: normalizeDistributionVia(vendor.business),
      address_1: vendor.address_1 || "",
      address_2: vendor.address_2 || "",
      city: vendor.city || "",
      state: vendor.state || "",
      pincode: vendor.pincode || "",
      country: vendor.country || "",
      email: vendor.email || "",
      mobile_number: vendor.mobile_number || "",
      gst_number: vendor.gst_number || "",
      margin: Number(vendor.margin || 0),
      credit_days: vendor.credit_days ?? "",
      brand_ids: Array.isArray(vendor.brand_ids)
        ? vendor.brand_ids.map((id) => String(id))
        : [],
      is_active: vendor.is_active !== false,
    });
    setShowModal(true);
  };

  const handleDelete = async (vendor) => {
    if (
      !window.confirm(
        `Delete vendor ${vendor.name}? Used vendors will be archived.`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      fetchVendors();
    } catch (err) {
      alert(err.message || "Failed to delete vendor");
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert("Vendor name is required");
    if (!form.mobile_number.trim()) return alert("Mobile number is required");
    if (!/^\d{10}$/.test(form.mobile_number))
      return alert("Mobile number must be exactly 10 digits");
    if (!form.gst_number.trim()) return alert("GST number is required");
    const creditDays = Number(form.credit_days);
    if (!Number.isInteger(creditDays) || creditDays < 1 || creditDays > 3650)
      return alert("Credit days must be a whole number between 1 and 3650");
    if (!Array.isArray(form.brand_ids) || form.brand_ids.length === 0)
      return alert("Please select at least one brand");
    if (form.email.trim() && !isValidEmail(form.email))
      return alert("Enter a valid email address");
    setSaving(true);
    try {
      const res = await fetch(
        form.id ? `/api/vendors/${form.id}` : "/api/vendors",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setShowModal(false);
      setForm(emptyForm);
      fetchVendors();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Purchase</span>
        <i className="ti ti-chevron-right text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">Vendors</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">
            Vendors
          </h1>
          <p className="text-[12.5px] text-gray-400 mt-1">
            Descriptive Text Need Help?
          </p>
        </div>

        {(() => {
          const userPermissions = Array.isArray(currentUser?.permissions)
            ? currentUser.permissions
            : [];
          const canManageVendors =
            isSuperAdmin ||
            userPermissions.includes("*") ||
            userPermissions.includes("MANAGE_VENDORS");
          if (!canManageVendors) return null;
          return (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              <i className="ti ti-plus text-[16px]" />
              Create Vendor
            </button>
          );
        })()}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-600">
            {error}
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 justify-between flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-[340px] bg-gray-50 rounded-lg px-3 py-2">
            <i className="ti ti-search text-gray-400 text-[16px]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setBulkEditOpen((open) => !open)}
                disabled={loading || bulkEditBusy || vendors.length === 0}
                className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Bulk edit vendors"
              >
                {bulkEditBusy ? "Processing..." : "Bulk Edit"}
              </button>
              {bulkEditOpen && (
                <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                  <button
                    type="button"
                    onClick={openBulkEditChooser}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <i className="ti ti-download text-[16px]" />
                    Download Editable Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkEditOpen(false);
                      bulkEditInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-left text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <i className="ti ti-upload text-[16px]" />
                    Upload Edited Excel
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleDownloadVendors}
              disabled={loading || vendors.length === 0}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="Download vendors Excel"
            >
              <i className="ti ti-download text-gray-500 text-[16px]" />
            </button>
            <input
              ref={bulkEditInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleUploadEditableVendors}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-gray-100">
                {tableHeaders.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6" colSpan={tableHeaders.length}>
                    Loading...
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td className="px-4 py-6" colSpan={tableHeaders.length}>
                    No vendors found
                  </td>
                </tr>
              ) : (
                vendors.map((row, rowIdx) => (
                  <tr
                    key={row.id || rowIdx}
                    className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      {rowIdx + 1}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      <div className="font-medium text-gray-900">
                        {row.name || "-"}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {row.company || row.business || ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      {row.credit_days ? `${row.credit_days} days` : "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      {row.mobile_number || "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      {row.email || "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      {[row.city, row.state, row.pincode].filter(Boolean).join(", ") || "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      {getVendorAddress(row) || "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">
                      {(() => {
                        const userPermissions = Array.isArray(
                          currentUser?.permissions,
                        )
                          ? currentUser.permissions
                          : [];
                        const canManageVendors =
                          isSuperAdmin ||
                          userPermissions.includes("*") ||
                          userPermissions.includes("MANAGE_VENDORS");
                        if (!canManageVendors) return null;
                        return (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEdit(row)}
                              className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"
                              title="Edit vendor"
                            >
                              <i className="ti ti-edit text-[15px]" />
                            </button>
                            <button
                              onClick={() => handleDelete(row)}
                              className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                              title="Delete vendor"
                            >
                              <i className="ti ti-trash text-[15px]" />
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 text-[12px] text-gray-400">
          <select className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-[12px] text-gray-600">
            <option>10</option>
            <option>20</option>
            <option>50</option>
          </select>
          <span>Showing {vendors.length} Results</span>
        </div>
      </div>

      {bulkChooserOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setBulkChooserOpen(false)}
            />
            <div className="relative flex max-h-[calc(100dvh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Select Vendors for Bulk Edit
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Search by vendor name, ID, mobile number, email, or GST.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkChooserOpen(false)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                >
                  <i className="ti ti-x text-[18px]" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-3">
                <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <i className="ti ti-search text-[16px] text-gray-400" />
                  <input
                    type="text"
                    value={bulkChooserSearch}
                    onChange={(event) =>
                      setBulkChooserSearch(event.target.value)
                    }
                    placeholder="Search vendor by name, ID, mobile, email..."
                    className="w-full bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
                  />
                </div>
                <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-600">
                  {selectedBulkVendors.length} selected
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedBulkVendorIds((current) => ({
                        ...current,
                        ...Object.fromEntries(
                          filteredBulkVendors.map((vendor) => [
                            String(vendor.id),
                            true,
                          ]),
                        ),
                      }))
                    }
                    disabled={!filteredBulkVendors.length}
                    className="rounded-lg border border-blue-100 px-3 py-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    Select Results
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBulkVendorIds({})}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-bold uppercase text-gray-500 shadow-[0_1px_0_rgba(229,231,235,1)]">
                    <tr>
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={
                            filteredBulkVendors.length > 0 &&
                            filteredBulkVendors.every(
                              (vendor) =>
                                selectedBulkVendorIds[String(vendor.id)],
                            )
                          }
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedBulkVendorIds((current) => ({
                                ...current,
                                ...Object.fromEntries(
                                  filteredBulkVendors.map((vendor) => [
                                    String(vendor.id),
                                    true,
                                  ]),
                                ),
                              }));
                            } else {
                              setSelectedBulkVendorIds((current) => {
                                const next = { ...current };
                                filteredBulkVendors.forEach((vendor) => {
                                  delete next[String(vendor.id)];
                                });
                                return next;
                              });
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3">Vendor ID</th>
                      <th className="px-4 py-3">Vendor</th>
                      <th className="px-4 py-3">Mobile</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Credit Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredBulkVendors.length ? (
                      filteredBulkVendors.map((vendor) => {
                        const vendorId = String(vendor.id);
                        return (
                          <tr key={vendorId} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={!!selectedBulkVendorIds[vendorId]}
                                onChange={(event) =>
                                  setSelectedBulkVendorIds((current) => {
                                    const next = { ...current };
                                    if (event.target.checked)
                                      next[vendorId] = true;
                                    else delete next[vendorId];
                                    return next;
                                  })
                                }
                              />
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-800">
                              {vendor.id}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-gray-900">
                                {vendor.name || "-"}
                              </div>
                              <div className="text-xs text-gray-500">
                                {vendor.company || vendor.business || ""}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {vendor.mobile_number || "-"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {vendor.email || "-"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {vendor.credit_days
                                ? `${vendor.credit_days} days`
                                : "-"}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-12 text-center text-sm font-semibold text-gray-500"
                        >
                          No vendors match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={() => setBulkChooserOpen(false)}
                  disabled={bulkEditBusy}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadEditableVendors(selectedBulkVendors)
                  }
                  disabled={bulkEditBusy || selectedBulkVendors.length === 0}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {bulkEditBusy ? "Preparing..." : "Download Selected Excel"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {showModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowModal(false)}
            />
            <div className="relative flex max-h-[calc(100dvh-3rem)] w-full max-w-[1000px] flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {form.id ? "Edit Vendor" : "Create Vendor"}
                </h3>
                <button
                  className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                  onClick={() => setShowModal(false)}
                >
                  <i className="ti ti-x text-[18px]" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                <section className="border border-gray-300 rounded p-4 bg-white">
                  <h4 className="text-sm text-blue-700 font-semibold mb-3">
                    Basic Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[12px] text-gray-700">
                        Vendor Name *
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-gray-700">
                        Vendor Company
                      </label>
                      <input
                        value={form.company}
                        onChange={(e) =>
                          setForm({ ...form, company: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] text-gray-700">
                        Distribution Via
                      </label>
                      <select
                        value={form.business}
                        onChange={(e) =>
                          setForm({ ...form, business: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                      >
                        {DISTRIBUTION_VIA_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                <section className="border border-gray-300 rounded p-4 bg-white">
                  <h4 className="text-sm text-blue-700 font-semibold mb-3">
                    Address Information
                  </h4>
                  <div className="space-y-3">
                    <input
                      value={form.address_1}
                      onChange={(e) =>
                        setForm({ ...form, address_1: e.target.value })
                      }
                      placeholder="Address 1"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      value={form.address_2}
                      onChange={(e) =>
                        setForm({ ...form, address_2: e.target.value })
                      }
                      placeholder="Address 2"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        value={form.city}
                        onChange={(e) =>
                          setForm({ ...form, city: e.target.value })
                        }
                        placeholder="City"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        value={form.state}
                        onChange={(e) =>
                          setForm({ ...form, state: e.target.value })
                        }
                        placeholder="State"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        value={form.pincode}
                        onChange={(e) =>
                          setForm({ ...form, pincode: e.target.value })
                        }
                        placeholder="Pincode"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        value={form.country}
                        onChange={(e) =>
                          setForm({ ...form, country: e.target.value })
                        }
                        placeholder="Country"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[12px] text-gray-700">
                          Email Address
                        </label>
                        <input
                          value={form.email}
                          onChange={(e) =>
                            setForm({ ...form, email: e.target.value })
                          }
                          placeholder="Email Address"
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[12px] text-gray-700">
                          Mobile Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={form.mobile_number}
                          onChange={(e) => {
                            const digits = e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 10);
                            setForm({ ...form, mobile_number: digits });
                          }}
                          placeholder="Mobile Number (10 digits)"
                          maxLength="10"
                          className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                        />
                        {form.mobile_number &&
                          !validatePhoneNumber(form.mobile_number).isValid && (
                            <p className="text-[11px] text-red-600 mt-0.5">
                              {validatePhoneNumber(form.mobile_number).error}
                            </p>
                          )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border border-gray-300 rounded p-4 bg-white">
                  <h4 className="text-sm text-blue-700 font-semibold mb-3">
                    Other Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[12px] text-gray-700">
                        GST Number *
                      </label>
                      <input
                        value={form.gst_number}
                        onChange={(e) =>
                          setForm({ ...form, gst_number: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] text-gray-700">
                        Vendor Margin(%)
                      </label>
                      <input
                        type="number"
                        value={form.margin}
                        onChange={(e) =>
                          setForm({ ...form, margin: Number(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-gray-700">
                        Credit Days *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        step="1"
                        value={form.credit_days}
                        onChange={(e) =>
                          setForm({ ...form, credit_days: e.target.value })
                        }
                        placeholder="e.g. 15"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500"
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        Maximum number of days allowed to complete this vendor's
                        PO payment.
                      </p>
                    </div>
                    <div className="col-span-2">
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-[12px] text-gray-700">
                          Brands *
                        </label>
                        {brands.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                brand_ids:
                                  current.brand_ids.length === brands.length
                                    ? []
                                    : brands.map((brand) => String(brand.id)),
                              }))
                            }
                            className="text-[12px] font-semibold text-blue-600 hover:underline"
                          >
                            {form.brand_ids.length === brands.length
                              ? "Clear all"
                              : "Select all"}
                          </button>
                        )}
                      </div>
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-300 p-3">
                        {brands.length ? (
                          <div className="grid grid-cols-2 gap-2">
                            {brands.map((brand) => (
                              <label
                                key={brand.id}
                                className="flex items-center gap-2 text-[13px] text-gray-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={form.brand_ids.includes(
                                    String(brand.id),
                                  )}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      brand_ids: event.target.checked
                                        ? [
                                            ...current.brand_ids,
                                            String(brand.id),
                                          ]
                                        : current.brand_ids.filter(
                                            (id) => id !== String(brand.id),
                                          ),
                                    }))
                                  }
                                />
                                <span>{brand.name}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[12px] text-gray-500">
                            No brands found.
                          </p>
                        )}
                      </div>
                    </div>
                    <label className="col-span-2 flex items-center gap-2 text-[12px] text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.is_active !== false}
                        onChange={(e) =>
                          setForm({ ...form, is_active: e.target.checked })
                        }
                      />
                      Active vendor
                    </label>
                  </div>
                </section>

                <div className="flex items-center justify-end gap-3">
                  <button
                    className="px-4 py-2 rounded-lg border border-gray-200 bg-white"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : form.id ? "Update" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </MainLayout>
  );
}
