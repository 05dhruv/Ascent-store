"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MainLayout from "@/components/MainLayout";

export default function RolesListPage() {
  const router = useRouter();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.title = "Roles & Permissions | Ascent Sync";
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/roles");
      if (res.ok) {
        const data = await res.json();
        setRoles(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load roles:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/employee/roles?id=${deleteConfirmId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete role");
      }
      setRoles((current) => current.filter((r) => r.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to delete role");
    } finally {
      setDeleting(false);
    }
  };

  const filteredRoles = roles.filter((role) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const name = String(role.roleName || "").toLowerCase();
    const desc = String(role.description || "").toLowerCase();
    const perms = Array.isArray(role.permissions)
      ? role.permissions.join(" ").toLowerCase()
      : "";
    return name.includes(q) || desc.includes(q) || perms.includes(q);
  });

  return (
    <MainLayout>
      <div className="min-h-screen pb-12">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-5">
          <Link href="/employee" className="text-blue-600 hover:underline font-medium">
            Employee
          </Link>
          <i className="ti ti-chevron-right text-[11px] text-gray-400" />
          <span className="text-blue-600 font-semibold">Roles & Permissions</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900">Roles & Permissions</h1>
            <p className="text-[12.5px] text-gray-500 mt-1">
              Manage custom user roles, security access levels, and granular permissions.
            </p>
          </div>
          <Link
            href="/employee/customroles/createcustomrole"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-800 transition-colors"
          >
            <i className="ti ti-plus text-[15px]" />
            Create Role
          </Link>
        </div>

        {/* Search & Stats Bar */}
        <div className="mb-5 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="relative w-full sm:w-80">
            <i className="ti ti-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[15px]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search roles or permissions..."
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-4 text-[13px] text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 w-full sm:w-auto justify-between sm:justify-end">
            <span>
              Total Roles: <strong className="text-gray-800">{roles.length}</strong>
            </span>
            <button
              onClick={fetchRoles}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
              title="Refresh"
            >
              <i className="ti ti-refresh text-[15px]" />
            </button>
          </div>
        </div>

        {/* Roles Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-slate-50/80 text-[12px] font-semibold text-gray-600">
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <th className="py-3.5 px-4">Role Name</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4">Capabilities / Permissions</th>
                  <th className="py-3.5 px-4">Created Date</th>
                  <th className="py-3.5 px-4 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400">
                      <div className="inline-flex items-center gap-2">
                        <i className="ti ti-loader-2 animate-spin text-[20px] text-blue-600" />
                        <span>Loading roles...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRoles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <i className="ti ti-shield-lock text-[32px] text-gray-300" />
                        <p className="text-[14px] font-medium text-gray-700">No roles found</p>
                        <p className="text-xs text-gray-400">
                          {searchQuery
                            ? "Try adjusting your search query"
                            : "Create your first custom role to get started"}
                        </p>
                        {!searchQuery && (
                          <Link
                            href="/employee/customroles/createcustomrole"
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
                          >
                            <i className="ti ti-plus" />
                            Create New Role
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRoles.map((role, idx) => {
                    const permissions = Array.isArray(role.permissions) ? role.permissions : [];
                    const isSuperAdmin = String(role.roleName).toLowerCase() === "super_admin" || String(role.roleName).toLowerCase() === "super admin";

                    return (
                      <tr key={role.id || idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-4 text-center text-gray-400 font-mono text-xs">
                          {idx + 1}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                              <i className="ti ti-shield-check text-[16px]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900">{role.roleName}</span>
                                {isSuperAdmin && (
                                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10.5px] font-semibold text-purple-700 border border-purple-200">
                                    System Root
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400">ID: #{role.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-gray-600 max-w-xs">
                          <p className="line-clamp-2 text-xs">
                            {role.description || <span className="text-gray-300 italic">No description provided</span>}
                          </p>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-gray-700">
                              {permissions.includes("*") ? (
                                <span className="text-emerald-700 font-bold">Full Access (All Permissions)</span>
                              ) : (
                                `${permissions.length} Permission${permissions.length === 1 ? "" : "s"} Assigned`
                              )}
                            </span>
                            {!permissions.includes("*") && permissions.length > 0 && (
                              <div className="flex flex-wrap gap-1 max-w-md">
                                {permissions.slice(0, 4).map((p) => (
                                  <span
                                    key={p}
                                    className="rounded bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-medium text-gray-600"
                                  >
                                    {p}
                                  </span>
                                ))}
                                {permissions.length > 4 && (
                                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-700">
                                    +{permissions.length - 4} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap text-xs text-gray-500">
                          {role.createdAt
                            ? new Date(role.createdAt).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() =>
                                router.push(`/employee/customroles/createcustomrole?id=${role.id}`)
                              }
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Edit Role"
                            >
                              <i className="ti ti-edit text-[16px]" />
                            </button>
                            {!isSuperAdmin && (
                              <button
                                onClick={() => setDeleteConfirmId(role.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Delete Role"
                              >
                                <i className="ti ti-trash text-[16px]" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Full-screen Portal Delete Confirmation Modal */}
        {mounted && deleteConfirmId && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDeleteConfirmId(null);
            }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-150 border border-gray-100">
              <div className="flex items-center gap-3 mb-4 text-red-600">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100/80">
                  <i className="ti ti-alert-triangle text-[22px]" />
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-gray-900">Delete Role?</h2>
                  <p className="text-xs text-gray-500">This action will move the role to the recycle bin.</p>
                </div>
              </div>
              <p className="text-[13px] text-gray-600 mb-6 leading-relaxed">
                Are you sure you want to delete this role? Any staff members currently assigned this role may lose their access capabilities.
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 transition shadow-sm"
                >
                  {deleting ? "Deleting..." : "Delete Role"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
