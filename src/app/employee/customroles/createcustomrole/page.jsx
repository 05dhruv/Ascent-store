"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";

const PERMISSION_GROUPS = [
  {
    id: "projects",
    title: "Projects & Sites",
    description: "Manage projects, site locations, and work assignments",
    icon: "ti-building",
    color: "blue",
    keys: [
      "PROJECT_VIEW",
      "PROJECT_CREATE",
      "PROJECT_EDIT",
      "SITE_VIEW",
      "SITE_CREATE",
      "SITE_EDIT",
    ],
  },
  {
    id: "warehouses",
    title: "Central Warehouses",
    description: "Central warehouse setup, locations, and personnel",
    icon: "ti-building-warehouse",
    color: "indigo",
    keys: [
      "WAREHOUSE_VIEW",
      "WAREHOUSE_CREATE",
      "WAREHOUSE_EDIT",
    ],
  },
  {
    id: "materials",
    title: "Material Master",
    description: "Create, edit, and import construction materials",
    icon: "ti-box",
    color: "amber",
    keys: [
      "MATERIAL_VIEW",
      "MATERIAL_CREATE",
      "MATERIAL_EDIT",
      "MATERIAL_IMPORT",
    ],
  },
  {
    id: "procurement",
    title: "Procurement & Receipts (GRN)",
    description: "Purchase orders, supplier receipts, and site requests",
    icon: "ti-receipt",
    color: "emerald",
    keys: [
      "PROCUREMENT_VIEW",
      "PURCHASE_ORDER_CREATE",
      "PURCHASE_ORDER_APPROVE",
      "GRN_CREATE",
      "GRN_APPROVE",
      "SITE_REQUEST_CREATE",
      "SITE_REQUEST_APPROVE",
    ],
  },
  {
    id: "transfers",
    title: "Transfers & Logistics",
    description: "Warehouse-to-site and inter-site material movements",
    icon: "ti-truck",
    color: "cyan",
    keys: [
      "TRANSFER_VIEW",
      "TRANSFER_CREATE",
      "TRANSFER_APPROVE",
      "TRANSFER_DISPATCH",
      "TRANSFER_RECEIVE",
    ],
  },
  {
    id: "stock_ops",
    title: "Stock & Site Operations",
    description: "Work issuance, material returns, stock adjustments, and audits",
    icon: "ti-clipboard-check",
    color: "violet",
    keys: [
      "STOCK_VIEW",
      "MATERIAL_ISSUE_CREATE",
      "MATERIAL_RETURN_CREATE",
      "STOCK_ADJUST",
      "STOCK_AUDIT",
    ],
  },
  {
    id: "reports",
    title: "Reports & Audit Trail",
    description: "Analytics, construction reports, and system change logs",
    icon: "ti-chart-bar",
    color: "rose",
    keys: [
      "DASHBOARD_VIEW",
      "REPORT_VIEW",
      "AUDIT_LOG_VIEW",
    ],
  },
  {
    id: "team",
    title: "Team & Administration",
    description: "Team management, custom roles, and security access levels",
    icon: "ti-users",
    color: "teal",
    keys: [
      "TEAM_VIEW",
      "TEAM_MANAGE",
      "ROLE_MANAGE",
    ],
  },
];

const FALLBACK_PERMISSIONS = [
  { value: "PROJECT_VIEW", label: "View Projects", description: "View assigned projects and project register" },
  { value: "PROJECT_CREATE", label: "Create Projects", description: "Create a construction project" },
  { value: "PROJECT_EDIT", label: "Edit Projects", description: "Edit project details and status" },
  { value: "SITE_VIEW", label: "View Sites", description: "View assigned sites and site stores" },
  { value: "SITE_CREATE", label: "Create Sites", description: "Create site stores under a project" },
  { value: "SITE_EDIT", label: "Edit Sites", description: "Edit site store and site in-charge details" },
  { value: "WAREHOUSE_VIEW", label: "View Central Warehouses", description: "View central warehouse stores" },
  { value: "WAREHOUSE_CREATE", label: "Create Central Warehouse", description: "Create central warehouses" },
  { value: "WAREHOUSE_EDIT", label: "Edit Central Warehouse", description: "Edit warehouse storage details" },
  { value: "MATERIAL_VIEW", label: "View Material Master", description: "Browse construction material catalog" },
  { value: "MATERIAL_CREATE", label: "Create Materials", description: "Add new material items" },
  { value: "MATERIAL_EDIT", label: "Edit Materials", description: "Update material specifications & units" },
  { value: "MATERIAL_IMPORT", label: "Import Materials", description: "Bulk Excel/CSV upload" },
  { value: "PROCUREMENT_VIEW", label: "View Procurement", description: "Access POs and receipt lists" },
  { value: "PURCHASE_ORDER_CREATE", label: "Create Purchase Order", description: "Draft POs to vendors" },
  { value: "PURCHASE_ORDER_APPROVE", label: "Approve Purchase Order", description: "Financial authorization of PO" },
  { value: "GRN_CREATE", label: "Create GRN / Material Receipt", description: "Receive goods at warehouse/site" },
  { value: "GRN_APPROVE", label: "Approve GRN", description: "Quality check and stock intake" },
  { value: "SITE_REQUEST_CREATE", label: "Raise Site Indent / Requisition", description: "Request material from warehouse" },
  { value: "SITE_REQUEST_APPROVE", label: "Approve Site Indent", description: "Authorize transfer request" },
  { value: "TRANSFER_VIEW", label: "View Transfers", description: "Monitor in-transit material dispatches" },
  { value: "TRANSFER_CREATE", label: "Create Dispatch / Transfer", description: "Issue delivery challan / gate pass" },
  { value: "TRANSFER_APPROVE", label: "Approve Transfer", description: "Manager clearance for dispatch" },
  { value: "TRANSFER_DISPATCH", label: "Dispatch Goods", description: "Release vehicle and print challan" },
  { value: "TRANSFER_RECEIVE", label: "Receive Transferred Goods", description: "Acknowledge arrival at site" },
  { value: "STOCK_VIEW", label: "View Stock Levels", description: "Real-time site & warehouse inventory" },
  { value: "MATERIAL_ISSUE_CREATE", label: "Issue Material to Contractor", description: "Daily work consumption record" },
  { value: "MATERIAL_RETURN_CREATE", label: "Record Contractor Return", description: "Return unused materials to store" },
  { value: "STOCK_ADJUST", label: "Adjust Stock", description: "Write-offs & corrections" },
  { value: "STOCK_AUDIT", label: "Conduct Stock Audit", description: "Physical inventory audit" },
  { value: "REPORT_VIEW", label: "View Construction Reports", description: "Movement & consumption reports" },
  { value: "AUDIT_LOG_VIEW", label: "View Audit Trail", description: "User activity audit logs" },
  { value: "TEAM_VIEW", label: "View Team", description: "View staff list" },
  { value: "TEAM_MANAGE", label: "Manage Team", description: "Create & assign employees" },
  { value: "ROLE_MANAGE", label: "Manage Roles & Permissions", description: "Configure custom roles" },
];

function RoleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [saving, setSaving] = useState(false);
  const [loadingRole, setLoadingRole] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [permissionList, setPermissionList] = useState(FALLBACK_PERMISSIONS);
  const [form, setForm] = useState({
    roleName: "",
    description: "",
    permissions: [],
  });

  useEffect(() => {
    document.title = editId ? "Edit Role | Ascent Sync" : "Create Custom Role | Ascent Sync";
  }, [editId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/employee/permissions");
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted || !Array.isArray(data) || data.length === 0) return;

        const mapped = data.map((p) => ({
          value: p.permissionName || p.permission_name,
          label: p.displayName || p.display_name || p.permissionName || p.permission_name,
          description: p.description || "",
        }));

        setPermissionList((current) => {
          const map = new Map();
          current.forEach((item) => map.set(item.value, item));
          mapped.forEach((item) => map.set(item.value, item));
          return Array.from(map.values());
        });
      } catch (err) {
        console.error("Failed to load permissions", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Load role if editId is provided
  useEffect(() => {
    if (!editId) return;
    let mounted = true;
    (async () => {
      setLoadingRole(true);
      try {
        const res = await fetch("/api/employee/roles");
        if (!res.ok) return;
        const roles = await res.json();
        if (!mounted || !Array.isArray(roles)) return;
        const role = roles.find((r) => String(r.id) === String(editId));
        if (role) {
          setForm({
            roleName: role.roleName || "",
            description: role.description || "",
            permissions: Array.isArray(role.permissions) ? role.permissions : [],
          });
        }
      } catch (err) {
        console.error("Failed to load role details", err);
      } finally {
        if (mounted) setLoadingRole(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [editId]);

  const permissionMap = useMemo(() => {
    const map = new Map();
    permissionList.forEach((p) => map.set(p.value, p));
    return map;
  }, [permissionList]);

  const organizedGroups = useMemo(() => {
    const assignedKeys = new Set();
    const query = searchQuery.trim().toLowerCase();

    const groups = PERMISSION_GROUPS.map((group) => {
      const items = group.keys
        .map((key) => {
          assignedKeys.add(key);
          return permissionMap.get(key) || { value: key, label: key, description: "" };
        })
        .filter((item) => {
          if (!query) return true;
          return (
            item.label.toLowerCase().includes(query) ||
            item.value.toLowerCase().includes(query) ||
            (item.description && item.description.toLowerCase().includes(query))
          );
        });

      return {
        ...group,
        items,
      };
    });

    const unassigned = permissionList.filter((item) => {
      if (assignedKeys.has(item.value)) return false;
      if (!query) return true;
      return (
        item.label.toLowerCase().includes(query) ||
        item.value.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query))
      );
    });

    if (unassigned.length > 0) {
      groups.push({
        id: "other",
        title: "Additional Capabilities",
        description: "General module and system access permissions",
        icon: "ti-dots",
        color: "slate",
        items: unassigned,
      });
    }

    if (activeTab === "all") {
      return groups.filter((g) => g.items.length > 0);
    }
    return groups.filter((g) => g.id === activeTab && g.items.length > 0);
  }, [activeTab, permissionList, permissionMap, searchQuery]);

  const totalPermissionsCount = permissionList.length;
  const selectedCount = form.permissions.length;

  const togglePermission = (val) => {
    setForm((current) => {
      const exists = current.permissions.includes(val);
      return {
        ...current,
        permissions: exists
          ? current.permissions.filter((p) => p !== val)
          : [...current.permissions, val],
      };
    });
  };

  const toggleGroup = (groupItems) => {
    const groupValues = groupItems.map((i) => i.value);
    const allSelected = groupValues.every((val) => form.permissions.includes(val));

    setForm((current) => {
      if (allSelected) {
        return {
          ...current,
          permissions: current.permissions.filter((p) => !groupValues.includes(p)),
        };
      } else {
        const set = new Set([...current.permissions, ...groupValues]);
        return {
          ...current,
          permissions: Array.from(set),
        };
      }
    });
  };

  const selectAll = () => {
    setForm((current) => ({
      ...current,
      permissions: permissionList.map((p) => p.value),
    }));
  };

  const clearAll = () => {
    setForm((current) => ({
      ...current,
      permissions: [],
    }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!form.roleName.trim()) {
      alert("Role name is required");
      return;
    }
    if (form.permissions.length === 0) {
      alert("Please select at least one permission");
      return;
    }

    setSaving(true);
    try {
      const endpoint = "/api/employee/roles";
      const method = editId ? "PUT" : "POST";
      const payload = {
        role_name: form.roleName.trim(),
        permissions: form.permissions,
        description: form.description.trim(),
        ...(editId ? { id: Number(editId) } : {}),
      };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${editId ? "update" : "create"} role`);
      }

      router.push("/employee/customroles");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  if (loadingRole) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="inline-flex items-center gap-2 text-gray-500">
            <i className="ti ti-loader-2 animate-spin text-[24px] text-blue-600" />
            <span>Loading role details...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-5 pb-16">
        {/* Breadcrumb & Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Link href="/employee" className="font-medium hover:text-blue-600">
                Employee
              </Link>
              <span>/</span>
              <Link href="/employee/customroles" className="font-medium hover:text-blue-600">
                Roles &amp; Permissions
              </Link>
              <span>/</span>
              <span className="font-semibold text-gray-800">
                {editId ? "Edit Role" : "New Role"}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              {editId ? `Edit Role: ${form.roleName || ""}` : "Create Custom Role"}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Set role title and grant fine-grained permissions for staff and operators.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => router.push("/employee/customroles")}
              disabled={saving}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              <i className={`ti ${editId ? "ti-check" : "ti-device-floppy"} text-[14px]`} />
              {saving ? "Saving..." : editId ? "Update Role" : "Save Role"}
            </button>
          </div>
        </div>

        {/* Form Details Card */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs sm:p-6">
          <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <i className="ti ti-id-badge-2 text-[15px]" />
            </div>
            <h2 className="text-sm font-bold text-gray-900">Role Details</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Role Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.roleName}
                onChange={(e) => setForm({ ...form, roleName: e.target.value })}
                placeholder="e.g. Site Supervisor, Material Inwarder"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs text-gray-800 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                A unique, recognizable role title for team assignment.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Description / Responsibilities
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief summary of duties and operational scope"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs text-gray-800 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Optional note explaining what users in this role handle.
              </p>
            </div>
          </div>
        </div>

        {/* Permissions Configuration Card */}
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs">
          {/* Permissions Header */}
          <div className="border-b border-gray-100 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <i className="ti ti-key text-[15px]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-gray-900">Module Permissions</h2>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      {selectedCount} of {totalPermissionsCount} selected
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Check specific permissions this role is authorized to perform.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-xs hover:bg-red-50"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Filter & Module Tabs */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 pt-2">
              <div className="relative w-full sm:w-64">
                <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[13px]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter permissions by keyword..."
                  className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    activeTab === "all"
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  All Modules
                </button>
                {PERMISSION_GROUPS.map((group) => {
                  const isActive = activeTab === group.id;
                  const groupTotal = group.keys.length;
                  const groupSelected = group.keys.filter((k) =>
                    form.permissions.includes(k)
                  ).length;

                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setActiveTab(group.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        isActive
                          ? "bg-blue-600 text-white font-semibold"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      <span>{group.title.split(" ")[0]}</span>
                      {groupSelected > 0 && (
                        <span
                          className={`rounded-full px-1.5 text-[10px] font-bold ${
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {groupSelected}/{groupTotal}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Group Content */}
          <div className="divide-y divide-gray-100 p-4 sm:p-5 space-y-6">
            {organizedGroups.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">
                No permissions matched your query &quot;{searchQuery}&quot;
              </div>
            ) : (
              organizedGroups.map((group) => {
                const groupItems = group.items;
                const groupValues = groupItems.map((i) => i.value);
                const selectedInGroup = groupValues.filter((v) =>
                  form.permissions.includes(v)
                ).length;
                const isAllSelected =
                  groupValues.length > 0 && selectedInGroup === groupValues.length;

                return (
                  <div key={group.id} className="pt-4 first:pt-0">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-gray-600">
                          <i className={`ti ${group.icon} text-[13px]`} />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                            {group.title}
                          </h3>
                          <p className="text-[11px] text-gray-400">
                            {group.description}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleGroup(groupItems)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {isAllSelected ? "Deselect Section" : "Select Section"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {groupItems.map((item) => {
                        const checked = form.permissions.includes(item.value);

                        return (
                          <label
                            key={item.value}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition ${
                              checked
                                ? "border-blue-300 bg-blue-50/50"
                                : "border-gray-200/80 bg-white hover:border-gray-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePermission(item.value)}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-xs font-semibold leading-tight ${
                                  checked ? "text-blue-900" : "text-gray-800"
                                }`}
                              >
                                {item.label}
                              </p>
                              {item.description && (
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Clean Bottom Summary Bar */}
          <div className="border-t border-gray-100 bg-gray-50/90 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-800">
                {selectedCount}
              </span>{" "}
              capabilities will be granted to users with this role.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/employee/customroles")}
                disabled={saving}
                className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : editId ? "Update Role" : "Save Role"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default function CreateCustomRolePage() {
  return (
    <Suspense fallback={
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <i className="ti ti-loader-2 animate-spin text-[24px] text-blue-600" />
        </div>
      </MainLayout>
    }>
      <RoleForm />
    </Suspense>
  );
}
