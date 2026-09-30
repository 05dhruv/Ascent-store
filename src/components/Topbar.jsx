"use client";
import Icon from "@/components/Icon";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { menuItems } from "./sidebarConfig";
import { useUser } from "@/hooks/useUser";
import {
  filterMenuItemsForUser,
  getPageTitleForMenu,
} from "@/lib/accessControl";

function buildSearchItems(items = []) {
  const seen = new Set();
  const results = [];

  const addItem = ({ label, href, section, group, icon }) => {
    if (!label || !href || seen.has(href)) return;
    seen.add(href);
    results.push({
      label,
      href,
      section: section || "Workspace",
      group: group || "",
      icon: icon || "ti-arrow-up-right",
      haystack: [label, href, section, group]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    });
  };

  items.forEach((item) => {
    addItem({
      label: item.label,
      href: item.href,
      section: item.label,
      group: "Main",
      icon: item.icon,
    });

    if (Array.isArray(item.subSidebar?.flatItems)) {
      item.subSidebar.flatItems.forEach((subItem) => {
        addItem({
          label: subItem.label,
          href: subItem.href,
          section: item.label,
          group: item.subSidebar.title,
          icon: subItem.icon || item.subSidebar.titleIcon || item.icon,
        });
      });
    }

    (item.subSidebar?.groups || []).forEach((group) => {
      (group.items || []).forEach((subItem) => {
        addItem({
          label: subItem.label,
          href: subItem.href,
          section: item.label,
          group: group.label,
          icon:
            subItem.icon ||
            group.icon ||
            item.subSidebar.titleIcon ||
            item.icon,
        });
      });
    });
  });

  return results;
}

export default function Topbar({
  onMenuOpen,
  hasSidebar = true,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: loadingUser } = useUser();
  const accessibleMenuItems = useMemo(
    () => filterMenuItemsForUser(menuItems, user),
    [user],
  );
  const title = getPageTitleForMenu(accessibleMenuItems, pathname);
  const searchItems = useMemo(
    () => buildSearchItems(accessibleMenuItems),
    [accessibleMenuItems],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [openSearch, setOpenSearch] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [openChangePassword, setOpenChangePassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [returnRequests, setReturnRequests] = useState([]);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [requisitionRequests, setRequisitionRequests] = useState([]);
  const [procurementAlerts, setProcurementAlerts] = useState([]);
  const [passwordRequests, setPasswordRequests] = useState([]);
  const [purchaseOrderEditRequests, setPurchaseOrderEditRequests] = useState(
    [],
  );
  const [promotionAlerts, setPromotionAlerts] = useState([]);
  const profileRef = useRef(null);
  const notificationRef = useRef(null);
  const searchRef = useRef(null);

  const initials = useMemo(() => {
    const name = user?.name?.trim();
    if (!name) return "US";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [user?.name]);

  const roleLabel = useMemo(() => {
    if (!user?.role) return "Guest";
    return user.role
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, [user?.role]);

  const storeLabel = useMemo(() => {
    if (!user) return "-";
    if (user.role === "super_admin") return "All Stores";
    if (
      Array.isArray(user.assigned_store_names) &&
      user.assigned_store_names.length > 0
    ) {
      return user.assigned_store_names.length === 1
        ? user.assigned_store_names[0]
        : `${user.assigned_store_names.length} Stores`;
    }
    if (
      Array.isArray(user.assigned_stores) &&
      user.assigned_stores.length > 0
    ) {
      return `${user.assigned_stores.length} Stores`;
    }
    return "No Store Assigned";
  }, [user]);

  const canReviewReturns =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.permissions?.includes("*") ||
    user?.permissions?.includes("APPROVE_STORE_BILL_EXCHANGE") ||
    user?.permissions?.includes("PROCESS_STORE_BILL_EXCHANGE");
  const canReviewRequisitions =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.permissions?.includes("*") ||
    user?.permissions?.includes("MANAGE_INVENTORY") ||
    user?.permissions?.includes("MANAGE_STOCK_REQUISITION");
  const canReviewProcurement =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.permissions?.includes("*") ||
    user?.permissions?.includes("MANAGE_PURCHASE_ORDERS") ||
    user?.permissions?.includes("MANAGE_VENDORS") ||
    user?.permissions?.includes("ACCESS_ACCOUNTS") ||
    user?.permissions?.includes("VIEW_ACCOUNTS") ||
    user?.permissions?.includes("MANAGE_ACCOUNTS") ||
    user?.permissions?.includes("MANAGE_VENDOR_PAYMENTS") ||
    user?.permissions?.includes("APPROVE_FINANCE");
  const canReviewPasswordRequests = user?.role === "super_admin";
  const canReviewPurchaseOrderEditRequests = user?.role === "super_admin";
  const returnNotificationTitle = canReviewReturns
    ? "Return Requests"
    : "My Return Updates";
  const notificationCount =
    returnRequests.length +
    lowStockAlerts.length +
    requisitionRequests.length +
    procurementAlerts.length +
    passwordRequests.length +
    purchaseOrderEditRequests.length +
    promotionAlerts.length;

  const filteredSearchItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return searchItems.slice(0, 8);

    return searchItems
      .map((item) => {
        const label = item.label.toLowerCase();
        const section = item.section.toLowerCase();
        const exactBoost =
          label === query
            ? 0
            : label.startsWith(query)
              ? 1
              : section.startsWith(query)
                ? 2
                : 3;
        return { item, exactBoost };
      })
      .filter(({ item }) => item.haystack.includes(query))
      .sort(
        (a, b) =>
          a.exactBoost - b.exactBoost ||
          a.item.label.localeCompare(b.item.label),
      )
      .slice(0, 10)
      .map(({ item }) => item);
  }, [searchItems, searchQuery]);

  const goToSearchItem = (href) => {
    setOpenSearch(false);
    setSearchQuery("");
    setOpenProfile(false);
    setOpenNotifications(false);
    router.push(href);
  };

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setReturnRequests([]);
      setLowStockAlerts([]);
      setRequisitionRequests([]);
      setProcurementAlerts([]);
      setPasswordRequests([]);
      setPurchaseOrderEditRequests([]);
      setPromotionAlerts([]);
      return;
    }

    try {
      const response = await fetch("/api/notifications/summary", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await response.json();
      const data = json.success ? json.data || {} : {};
      setReturnRequests(
        Array.isArray(data.returnRequests) ? data.returnRequests : [],
      );
      setLowStockAlerts(
        Array.isArray(data.lowStockAlerts) ? data.lowStockAlerts : [],
      );
      setRequisitionRequests(
        Array.isArray(data.requisitionRequests) ? data.requisitionRequests : [],
      );
      setProcurementAlerts(
        Array.isArray(data.procurementAlerts) ? data.procurementAlerts : [],
      );
      setPasswordRequests(
        Array.isArray(data.passwordRequests) ? data.passwordRequests : [],
      );
      setPurchaseOrderEditRequests(
        Array.isArray(data.purchaseOrderEditRequests)
          ? data.purchaseOrderEditRequests
          : [],
      );
      const dismissed = JSON.parse(
        window.localStorage.getItem("dismissed-promotion-alerts") || "[]",
      );
      setPromotionAlerts(
        (Array.isArray(data.promotionAlerts)
          ? data.promotionAlerts
          : []
        ).filter((item) => !dismissed.includes(`${item.id}:${item.alertType}`)),
      );
    } catch {
      setReturnRequests([]);
      setLowStockAlerts([]);
      setRequisitionRequests([]);
      setProcurementAlerts([]);
      setPasswordRequests([]);
      setPurchaseOrderEditRequests([]);
      setPromotionAlerts([]);
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
    const intervalId = setInterval(loadNotifications, 90_000);
    const onFocus = () => loadNotifications();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadNotifications]);

  const dismissPromotionAlert = (promotion) => {
    const key = `${promotion.id}:${promotion.alertType}`;
    const existing = JSON.parse(
      window.localStorage.getItem("dismissed-promotion-alerts") || "[]",
    );
    window.localStorage.setItem(
      "dismissed-promotion-alerts",
      JSON.stringify([...new Set([...existing, key])]),
    );
    setPromotionAlerts((current) =>
      current.filter((item) => `${item.id}:${item.alertType}` !== key),
    );
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(event.target)) {
        setOpenProfile(false);
      }
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target)
      ) {
        setOpenNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setOpenSearch(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpenSearch(true);
        setTimeout(() => searchRef.current?.querySelector("input")?.focus(), 0);
        return;
      }

      if (!isTyping && event.key === "/") {
        event.preventDefault();
        setOpenSearch(true);
        setTimeout(() => searchRef.current?.querySelector("input")?.focus(), 0);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setOpenProfile(false);
      router.push("/login");
      router.refresh();
    }
  };

  const handlePasswordRequestAction = async (requestId, action) => {
    try {
      const response = await fetch(
        `/api/auth/password-change-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || `Unable to ${action} password request`);
      }

      await loadPasswordRequestNotifications();
    } catch (err) {
      alert(err.message || "Unable to update password request");
    }
  };

  const handlePurchaseOrderEditRequestAction = async (requestId, action) => {
    try {
      const response = await fetch(
        `/api/purchase-orders/edit-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(
          json.message || `Unable to ${action} purchase order edit request`,
        );
      }

      await loadPurchaseOrderEditRequestNotifications();
    } catch (err) {
      alert(err.message || "Unable to update purchase order edit request");
    }
  };

  const onPasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const submitChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    setPasswordLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordForm),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.errors) {
          // `validationError` may return an array of error objects or a single object.
          if (Array.isArray(json.errors) && json.errors.length) {
            const firstErr = json.errors[0];
            if (typeof firstErr === "object") {
              const val = Object.values(firstErr)[0];
              setPasswordError(String(val));
            } else {
              setPasswordError(String(firstErr));
            }
          } else if (typeof json.errors === "object") {
            const firstError = Object.values(json.errors)[0];
            setPasswordError(String(firstError));
          } else {
            setPasswordError(json.message || "Unable to change password");
          }
        } else {
          setPasswordError(json.message || "Unable to change password");
        }

        return;
      }

      setPasswordSuccess(
        "Password change request sent to Super Admin for approval.",
      );
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      setPasswordError(err.message || "Unable to change password");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <header
      className={`workspace-topbar fixed top-0 right-0 left-0 h-[56px] z-50 flex items-center px-3 md:pr-5 transition-[left] duration-300 ${hasSidebar ? "lg:left-[240px]" : ""}`}
    >
      {/* Hamburger — below desktop, sidebar lives in the drawer */}
      {hasSidebar && (
        <button
          onClick={onMenuOpen}
          className="lg:hidden p-2 rounded-xl hover:bg-slate-100 transition-colors mr-2 flex-shrink-0"
          aria-label="Open menu"
        >
          <Icon name="ti ti-menu-2 text-slate-700 text-[20px]" />
        </button>
      )}

      {/* Brand — mobile center */}
      <button
        type="button"
        onClick={() => router.push("/home")}
        className="md:hidden flex-1 flex justify-center items-center px-1"
        aria-label="Go to home"
      >
        <img
          src="/ascent-sync-icon.svg"
          alt="Ascent Sync"
          className="h-8 w-8 rounded-lg object-contain"
        />
      </button>

      {/* Breadcrumb + page title */}
      <div className="hidden md:flex flex-1 items-center gap-3 px-2 lg:px-4 min-w-0">
        <h2 className="truncate text-[16px] font-bold tracking-tight text-slate-900">{title}</h2>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <div ref={searchRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setOpenSearch(true);
              setTimeout(
                () => searchRef.current?.querySelector("input")?.focus(),
                0,
              );
            }}
            className="md:hidden rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Search pages"
          >
            <Icon name="ti ti-search text-[20px]" />
          </button>

          <div
            className={`${
              openSearch
                ? "fixed left-2 right-2 top-[58px] z-50 md:static md:z-auto"
                : "hidden md:block"
            }`}
          >
            <div className="relative w-full md:w-[280px] xl:w-[420px]">
              <Icon name="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setOpenSearch(true);
                }}
                onFocus={() => setOpenSearch(true)}
                aria-label="Global search"
                placeholder={
                  pathname.startsWith("/catalog")
                    ? "Search materials, codes, brands..."
                    : pathname.startsWith("/construction")
                      ? "Search projects, sites, clients..."
                      : "Search projects, materials, reports..."
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-9 pr-16 text-[13px] font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 md:block">
                Ctrl K
              </span>
            </div>
          </div>

          {openSearch && (
            <div className="fixed left-2 right-2 top-[104px] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.16)] md:absolute md:left-auto md:right-0 md:top-[44px] md:w-[420px]">
              <div className="max-h-[420px] overflow-auto py-2">
                {filteredSearchItems.length > 0 ? (
                  filteredSearchItems.map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => goToSearchItem(item.href)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-blue-50 ${
                        pathname === item.href ? "bg-blue-50" : ""
                      }`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        <Icon name={`ti ${item.icon} text-[17px]`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-slate-900">
                          {item.label}
                        </span>
                        <span className="block truncate text-[11px] font-semibold text-slate-400">
                          {item.section}
                          {item.group ? ` / ${item.group}` : ""}
                        </span>
                      </span>
                      <Icon name="ti ti-arrow-up-right text-[15px] text-slate-300" />
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center">
                    <p className="text-[13px] font-semibold text-slate-700">
                      No matching page found
                    </p>
                    <p className="mt-1 text-[12px] text-slate-400">
                      Try project, material, transfer, supplier, or report.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={notificationRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setOpenNotifications((prev) => !prev);
              loadNotifications();
            }}
            className="relative rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Notifications"
          >
            <Icon name="ti ti-bell text-slate-500 text-[20px]" />
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            )}
          </button>

          {openNotifications && (
            <div className="fixed left-2 right-2 top-[58px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.16)] sm:absolute sm:left-auto sm:right-0 sm:top-[40px] sm:w-[340px]">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-bold text-gray-900">Notifications</p>
                <button
                  type="button"
                  onClick={loadNotifications}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                >
                  Refresh
                </button>
              </div>
              {notificationCount === 0 ? (
                <p className="px-4 py-5 text-sm text-gray-500">
                  No notifications right now.
                </p>
              ) : (
                <div className="max-h-80 overflow-auto py-1">
                  {promotionAlerts.length > 0 && (
                    <div className="border-b border-gray-100">
                      <p className="px-4 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-orange-600">
                        Promotion Alerts
                      </p>
                      {promotionAlerts.map((promotion) => (
                        <div
                          key={`${promotion.id}:${promotion.alertType}`}
                          className="flex items-start justify-between gap-2 border-t border-gray-100 px-4 py-3 hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {promotion.name}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {promotion.alertType === "pending"
                                ? "Waiting for approval"
                                : promotion.alertType === "expired"
                                  ? "Promotion expired"
                                  : `Ends in ${promotion.daysLeft} day${promotion.daysLeft === 1 ? "" : "s"}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => dismissPromotionAlert(promotion)}
                            className="shrink-0 rounded px-1 text-gray-400 hover:bg-white hover:text-gray-700"
                            aria-label="Dismiss promotion alert"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {passwordRequests.length > 0 && (
                    <div className="border-b border-gray-100">
                      <p className="px-4 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-red-600">
                        Password Requests
                      </p>
                      {passwordRequests.map((request) => {
                        const employeeName =
                          [request.first_name, request.last_name]
                            .filter(Boolean)
                            .join(" ")
                            .trim() ||
                          request.user_name ||
                          request.username ||
                          request.user_email;

                        return (
                          <div
                            key={request.id}
                            className="border-t border-gray-100 px-4 py-3 hover:bg-red-50"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-900">
                                  {employeeName}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-gray-500">
                                  {request.user_email || "Employee"} requested
                                  password change
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                                Pending
                              </span>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handlePasswordRequestAction(
                                    request.id,
                                    "reject",
                                  )
                                }
                                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handlePasswordRequestAction(
                                    request.id,
                                    "approve",
                                  )
                                }
                                className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                Approve
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {purchaseOrderEditRequests.length > 0 && (
                    <div className="border-b border-gray-100">
                      <p className="px-4 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-orange-600">
                        PO Edit Requests
                      </p>
                      {purchaseOrderEditRequests.map((request) => (
                        <div
                          key={request.id}
                          className="border-t border-gray-100 px-4 py-3 hover:bg-orange-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {request.transaction_id ||
                                  `PO-${request.purchase_order_id}`}{" "}
                                edit requested
                              </p>
                              <p className="mt-0.5 truncate text-xs text-gray-500">
                                {request.requested_by_name ||
                                  request.requested_by_email ||
                                  "User"}
                                {request.destination_name
                                  ? ` - ${request.destination_name}`
                                  : ""}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
                              Pending
                            </span>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handlePurchaseOrderEditRequestAction(
                                  request.id,
                                  "reject",
                                )
                              }
                              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handlePurchaseOrderEditRequestAction(
                                  request.id,
                                  "approve",
                                )
                              }
                              className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {lowStockAlerts.length > 0 && (
                    <div className="border-b border-gray-100">
                      <p className="px-4 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-amber-600">
                        Inventory Alerts
                      </p>
                      {lowStockAlerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() => {
                            setOpenNotifications(false);
                            router.push(
                              "/reports/inventory/low-stock-products",
                            );
                          }}
                          className="block w-full border-t border-gray-100 px-4 py-3 text-left hover:bg-amber-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {alert.productName} is{" "}
                                {alert.severity === "out_of_stock"
                                  ? "out of stock"
                                  : "running low"}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-gray-500">
                                {alert.storeName || "Store"}
                                {alert.sku ? ` - ${alert.sku}` : ""}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                              {Number(alert.availableQty || 0)} left
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {requisitionRequests.length > 0 && (
                    <div className="border-b border-gray-100">
                      <p className="px-4 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-violet-600">
                        Stock Requisitions
                      </p>
                      {requisitionRequests.map((request) => (
                        <button
                          key={request.id}
                          type="button"
                          onClick={() => {
                            setOpenNotifications(false);
                            router.push("/inventory/stockrequisition");
                          }}
                          className="block w-full border-t border-gray-100 px-4 py-3 text-left hover:bg-violet-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {request.transactionId || `REQ-${request.id}`}{" "}
                                needs approval
                              </p>
                              <p className="mt-0.5 truncate text-xs text-gray-500">
                                {request.destinationName || "Destination"}
                                {request.requestedBy
                                  ? ` - ${request.requestedBy}`
                                  : ""}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">
                              {Number(request.totalItems || 0)} items
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {procurementAlerts.length > 0 && (
                    <div className="border-b border-gray-100">
                      <p className="px-4 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-emerald-600">
                        Procurement
                      </p>
                      {procurementAlerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() => {
                            setOpenNotifications(false);
                            router.push(alert.href || "/purchase");
                          }}
                          className="block w-full border-t border-gray-100 px-4 py-3 text-left hover:bg-emerald-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {alert.title || "Procurement item pending"}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-gray-500">
                                {alert.transactionId ||
                                  alert.vendorName ||
                                  "Record"}
                                {alert.storeName ? ` - ${alert.storeName}` : ""}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                              {alert.displayStatus || alert.status || "Pending"}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {returnRequests.length > 0 && (
                    <p className="px-4 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-blue-600">
                      {returnNotificationTitle}
                    </p>
                  )}
                  {returnRequests.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => {
                        setOpenNotifications(false);
                        router.push("/sales/returns");
                      }}
                      className="block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {canReviewReturns
                              ? `${request.return_type === "exchange" ? "Exchange" : "Return"} request #${request.id}`
                              : request.status === "approved"
                                ? `Return request #${request.id} ready to proceed`
                                : `Return request #${request.id} ${request.status}`}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {request.store_name ||
                              `Store ${request.store_id || "-"}`}{" "}
                            - Bill{" "}
                            {request.bill_number || request.original_bill_id}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-xs font-bold ${request.status === "declined" ? "text-red-700" : "text-green-700"}`}
                        >
                          Rs.{Number(request.refund_amount || 0).toFixed(0)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          ref={profileRef}
          className="relative flex items-center gap-2 pl-2 md:pl-4 md:border-l border-slate-200"
        >
          <button
            type="button"
            onClick={() => setOpenProfile((prev) => !prev)}
            className="flex items-center gap-2 rounded-2xl px-1.5 py-1 transition-colors hover:bg-blue-50"
          >
            <div className="w-8 h-8 rounded-full bg-[#1A476C] flex items-center justify-center flex-shrink-0 shadow-[0_8px_18px_rgba(26,71,108,0.22)]">
              <span className="text-[11px] font-bold text-white">
                {initials}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-[12px] font-semibold text-gray-800 leading-tight">
                {loadingUser ? "Loading..." : user?.name || "Guest User"}
              </p>
              <p className="text-[10px] text-gray-400 leading-tight">
                {loadingUser ? "" : roleLabel}
              </p>
            </div>
            <Icon name="ti ti-chevron-down text-gray-400 text-[13px] hidden sm:block" />
          </button>

          {openProfile && (
            <div className="fixed left-2 right-2 top-[58px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.16)] sm:absolute sm:left-auto sm:right-0 sm:top-[44px] sm:w-[320px]">
              <div className="bg-slate-100 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#1A476C] flex items-center justify-center">
                    <span className="text-white text-[16px] font-bold">
                      {initials}
                    </span>
                  </div>
                  <div>
                    <p className="text-[18px] font-bold text-slate-800 leading-tight">
                      {user?.name || "Guest User"}
                    </p>
                    <p className="text-[13px] text-slate-700 leading-tight">
                      {user?.email || "-"}
                    </p>
                    <p className="text-[13px] text-slate-700 leading-tight">
                      {user?.phone || "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-300 pt-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Role
                    </p>
                    <p className="text-[16px] font-bold leading-tight text-slate-900">
                      {roleLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Store Access
                    </p>
                    <p className="text-[16px] font-bold leading-tight text-slate-900">
                      {storeLabel}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenProfile(false);
                    setOpenChangePassword(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                >
                  <Icon name="ti ti-lock text-[16px]" />
                  Change password
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                >
                  <Icon name="ti ti-world text-[16px]" />
                  Change language
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                >
                  <Icon name="ti ti-help-circle text-[16px]" />
                  Help & support
                </button>
              </div>

              <div className="border-t border-gray-200 p-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[14px] text-red-600 hover:bg-red-50"
                >
                  <Icon name="ti ti-logout text-[16px]" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isClient &&
        openChangePassword &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-start md:items-center justify-center bg-black/30 px-4 py-6 overflow-auto">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl max-h-[calc(100vh-120px)] overflow-auto">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[18px] font-semibold text-gray-900">
                  Change password
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setOpenChangePassword(false);
                    setPasswordError("");
                    setPasswordSuccess("");
                  }}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                >
                  <Icon name="ti ti-x text-[16px]" />
                </button>
              </div>

              <form className="space-y-3" onSubmit={submitChangePassword}>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={onPasswordChange}
                  placeholder="Current password"
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                />
                <input
                  type="password"
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={onPasswordChange}
                  placeholder="New password (min 8 chars)"
                  minLength={8}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                />
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={onPasswordChange}
                  placeholder="Confirm new password"
                  minLength={8}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                />

                {passwordError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {passwordError}
                  </p>
                )}

                {passwordSuccess && (
                  <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-700">
                    {passwordSuccess}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
                >
                  {passwordLoading ? "Updating..." : "Update password"}
                </button>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}
