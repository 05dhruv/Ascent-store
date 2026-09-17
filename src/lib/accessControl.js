const ROLE_HOME_PATHS = {
  super_admin: "/home/master-dashboard",
  admin: "/home/master-dashboard",
  manager: "/inventory/hub",
  user: "/construction/projects",
};

const SUPER_ADMIN_PERMISSION = "*";

// Legacy retail data is retained for history, but its screens do not belong in
// the construction-material workspace. Block these paths for every role so a
// copied URL cannot reopen a POS or customer workflow.
const CONSTRUCTION_HIDDEN_ROUTE_PREFIXES = [
  "/sales",
  "/sales-order",
  "/customer",
  "/delivery",
  "/accounts",
  "/reports/sales",
  "/reports/accounting",
];

function isConstructionHiddenRoute(pathname = "") {
  return (
    pathname === "/home" ||
    CONSTRUCTION_HIDDEN_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

const SECTION_PERMISSION_RULES = {
  Dashboard: ["DASHBOARD_VIEW"],
  Projects: ["PROJECT_VIEW", "PROJECT_CREATE", "SITE_VIEW", "SITE_CREATE"],
  Materials: [
    "MATERIAL_VIEW",
    "MATERIAL_CREATE",
    "MATERIAL_EDIT",
    "MATERIAL_IMPORT",
  ],
  Movement: [
    "STOCK_VIEW",
    "SITE_REQUEST_CREATE",
    "TRANSFER_VIEW",
    "TRANSFER_CREATE",
    "MATERIAL_ISSUE_CREATE",
  ],
  Team: ["TEAM_VIEW", "TEAM_MANAGE", "ROLE_MANAGE"],
  Home: ["ACCESS_DASHBOARD"],
  Sales: [
    "CREATE_POS_BILL",
    "MANAGE_ORDERS",
    "VIEW_ORDERS",
    "PROCESS_STORE_BILL_EXCHANGE",
    "APPROVE_STORE_BILL_EXCHANGE",
  ],
  Catalog: [
    "MATERIAL_VIEW",
    "MATERIAL_CREATE",
    "MATERIAL_EDIT",
    "MATERIAL_IMPORT",
  ],
  Inventory: [
    "STOCK_VIEW",
    "GRN_CREATE",
    "SITE_REQUEST_CREATE",
    "TRANSFER_VIEW",
    "TRANSFER_CREATE",
    "MATERIAL_ISSUE_CREATE",
    "STOCK_AUDIT",
  ],
  Purchase: [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "CREATE_STORE_PURCHASE_ORDER",
    "VIEW_VENDORS",
    "MANAGE_VENDORS",
    "VIEW_REMOTE_GRN",
    "CREATE_REMOTE_GRN",
    "APPROVE_REMOTE_GRN",
    "VIEW_REMOTE_GRN_COSTING",
    "MANAGE_REMOTE_GRN_CP",
    "MANAGE_REMOTE_GRN_PRICING",
  ],
  Accounts: [
    "ACCESS_ACCOUNTS",
    "VIEW_ACCOUNTS",
    "MANAGE_ACCOUNTS",
    "APPROVE_FINANCE",
    "MANAGE_VENDOR_PAYMENTS",
    "VIEW_FINANCIAL_REPORTS",
  ],
  "Sales Order": ["MANAGE_ORDERS", "VIEW_ORDERS"],
  Admin: ["*", "MANAGE_RECYCLE_BIN"],
  Employee: ["TEAM_VIEW", "TEAM_MANAGE", "ROLE_MANAGE"],
  Customer: ["MANAGE_CUSTOMERS", "VIEW_CUSTOMERS"],
  Settings: ["PROJECT_VIEW", "SITE_VIEW", "WAREHOUSE_VIEW", "MATERIAL_VIEW"],
  Reports: ["REPORT_VIEW", "AUDIT_LOG_VIEW"],
};

const ITEM_PERMISSION_RULES = {
  "/inventory/movement-tracker": [
    "TRANSFER_VIEW",
    "TRANSFER_CREATE",
    "TRANSFER_DISPATCH",
    "TRANSFER_RECEIVE",
  ],
  "/": ["ACCESS_DASHBOARD"],
  "/home": ["ACCESS_DASHBOARD"],
  "/home/master-dashboard": ["ACCESS_DASHBOARD"],
  "/sales": ["CREATE_POS_BILL", "MANAGE_ORDERS", "VIEW_ORDERS"],
  "/sales/pos": ["CREATE_POS_BILL"],
  "/sales/online-orders": ["MANAGE_ORDERS", "VIEW_ORDERS", "CREATE_POS_BILL"],
  "/delivery": ["MANAGE_DELIVERIES"],
  "/sales/store-cash": [
    "CREATE_POS_BILL",
    "OPEN_CLOSE_SESSION",
    "MANAGE_POS",
    "VIEW_BILLING",
    "MANAGE_BILLING",
    "VIEW_STORE_REPORTS",
  ],
  "/sales/returns": [
    "CREATE_POS_BILL",
    "MANAGE_ORDERS",
    "VIEW_ORDERS",
    "PROCESS_STORE_BILL_EXCHANGE",
    "APPROVE_STORE_BILL_EXCHANGE",
  ],
  "/catalog": [
    "MATERIAL_VIEW",
    "MATERIAL_CREATE",
    "MATERIAL_EDIT",
    "MATERIAL_IMPORT",
  ],
  "/inventory": [
    "STOCK_VIEW",
    "GRN_CREATE",
    "SITE_REQUEST_CREATE",
    "TRANSFER_VIEW",
    "MATERIAL_ISSUE_CREATE",
    "STOCK_AUDIT",
  ],
  "/inventory/hub": [
    "STOCK_VIEW",
    "GRN_CREATE",
    "TRANSFER_VIEW",
    "SITE_REQUEST_CREATE",
  ],
  "/inventory/ops": ["STOCK_VIEW", "STOCK_ADJUST", "STOCK_AUDIT"],
  "/inventory/stockin": ["STOCK_VIEW", "GRN_CREATE", "GRN_APPROVE"],
  "/inventory/stockout": [
    "STOCK_VIEW",
    "MATERIAL_ISSUE_CREATE",
    "MATERIAL_RETURN_CREATE",
  ],
  "/inventory/stocktransfer": [
    "TRANSFER_VIEW",
    "TRANSFER_CREATE",
    "TRANSFER_APPROVE",
    "TRANSFER_DISPATCH",
    "TRANSFER_RECEIVE",
  ],
  "/inventory/stockvalidation": ["STOCK_VIEW", "STOCK_AUDIT"],
  "/inventory/stockrequisition": [
    "SITE_REQUEST_CREATE",
    "SITE_REQUEST_APPROVE",
    "STOCK_VIEW",
  ],
  "/inventory/batches": ["STOCK_VIEW", "STOCK_AUDIT"],
  "/inventory/expiry-alerts": ["STOCK_VIEW", "STOCK_AUDIT"],
  "/purchase": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "VIEW_VENDORS",
    "MANAGE_VENDORS",
    "VIEW_REMOTE_GRN",
    "CREATE_REMOTE_GRN",
    "APPROVE_REMOTE_GRN",
    "VIEW_REMOTE_GRN_COSTING",
    "MANAGE_REMOTE_GRN_CP",
    "MANAGE_REMOTE_GRN_PRICING",
  ],
  "/purchase/remote-grn": [
    "VIEW_REMOTE_GRN",
    "CREATE_REMOTE_GRN",
    "APPROVE_REMOTE_GRN",
    "VIEW_REMOTE_GRN_COSTING",
    "MANAGE_REMOTE_GRN_CP",
    "MANAGE_REMOTE_GRN_PRICING",
  ],
  "/purchase/vendors": ["VIEW_VENDORS", "MANAGE_VENDORS"],
  "/purchase/purchase-orders": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "CREATE_STORE_PURCHASE_ORDER",
  ],
  "/reports/sales/product-wise-sales": [
    "VIEW_STORE_SALES",
    "VIEW_STORE_REPORTS",
    "VIEW_FINANCIAL_REPORTS",
  ],
  "/reports/inventory/stock-level": [
    "VIEW_STORE_PRODUCT_INVENTORY",
    "VIEW_STORE_REPORTS",
    "VIEW_FINANCIAL_REPORTS",
  ],
  "/reports/stock-level": [
    "VIEW_STORE_PRODUCT_INVENTORY",
    "VIEW_STORE_REPORTS",
    "VIEW_FINANCIAL_REPORTS",
  ],
  "/reports/accounting/order-wise-tax-breakup": [
    "VIEW_STORE_ACCOUNTING",
    "VIEW_STORE_REPORTS",
    "VIEW_FINANCIAL_REPORTS",
  ],
  "/reports/accounting/product-wise-tax-breakup": [
    "VIEW_STORE_ACCOUNTING",
    "VIEW_STORE_REPORTS",
    "VIEW_FINANCIAL_REPORTS",
  ],
  "/reports/accounting/hsn-sac-wise-tax-breakup": [
    "VIEW_STORE_ACCOUNTING",
    "VIEW_STORE_REPORTS",
    "VIEW_FINANCIAL_REPORTS",
  ],
  "/reports/accounting/store-wise-tax-breakup": ["VIEW_TAX_WISE_REPORTS"],
  "/purchase/quotations": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "VIEW_VENDORS",
    "MANAGE_VENDORS",
  ],
  "/purchase/grn": ["VIEW_PURCHASE_ORDERS", "MANAGE_PURCHASE_ORDERS"],
  "/purchase/margin-approvals": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "VIEW_BILLING",
    "MANAGE_BILLING",
    "VIEW_CATALOG",
    "MANAGE_CATALOG",
  ],
  "/purchase/returns": ["VIEW_PURCHASE_ORDERS", "MANAGE_PURCHASE_ORDERS"],
  "/purchase/vendor-invoices": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "VIEW_VENDORS",
    "MANAGE_VENDORS",
  ],
  "/purchase/invoice-settlement": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "VIEW_VENDORS",
    "MANAGE_VENDORS",
  ],
  "/purchase/vendor-ledger": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "VIEW_VENDORS",
    "MANAGE_VENDORS",
  ],
  "/purchase/vendor-performance": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "VIEW_VENDORS",
    "MANAGE_VENDORS",
  ],
  "/purchase/auto-reorder": [
    "VIEW_PURCHASE_ORDERS",
    "MANAGE_PURCHASE_ORDERS",
    "VIEW_INVENTORY",
    "MANAGE_INVENTORY",
  ],
  "/accounts": [
    "ACCESS_ACCOUNTS",
    "VIEW_ACCOUNTS",
    "MANAGE_ACCOUNTS",
    "APPROVE_FINANCE",
    "MANAGE_VENDOR_PAYMENTS",
    "VIEW_FINANCIAL_REPORTS",
  ],
  "/sales-order": ["MANAGE_ORDERS", "VIEW_ORDERS"],
  "/admin/assistant": ["*"],
  "/admin/recycle-bin": ["MANAGE_RECYCLE_BIN"],
  "/customer": ["MANAGE_CUSTOMERS", "VIEW_CUSTOMERS"],
  "/reports": [
    "VIEW_FINANCIAL_REPORTS",
    "VIEW_STORE_REPORTS",
    "VIEW_TAX_WISE_REPORTS",
  ],
  "/employee": ["TEAM_VIEW", "TEAM_MANAGE", "ROLE_MANAGE"],
  "/employee/staffdepartments": ["TEAM_VIEW", "TEAM_MANAGE"],
  "/employee/staff": ["TEAM_VIEW", "TEAM_MANAGE"],
  "/employee/user-counter-session": ["OPEN_CLOSE_SESSION"],
  "/settings": ["PROJECT_VIEW", "SITE_VIEW", "WAREHOUSE_VIEW", "MATERIAL_VIEW"],
  "/settings/stores": ["SITE_VIEW", "SITE_CREATE", "SITE_EDIT"],
  "/settings/warehouses": [
    "WAREHOUSE_VIEW",
    "WAREHOUSE_CREATE",
    "WAREHOUSE_EDIT",
  ],
  "/settings/regions": [
    "PROJECT_VIEW",
    "PROJECT_EDIT",
    "SITE_VIEW",
    "SITE_EDIT",
  ],
  "/settings/device-config/store-device-map": ["MANAGE_STORES"],
  "/settings/device-config/application-device-settings": ["MANAGE_STORES"],
  "/settings/device-config/device-sync-logs": ["MANAGE_STORES"],
  "/settings/device-config/device-data-sync": ["MANAGE_STORES"],
  "/settings/billing/customize-receipt-print": [
    "VIEW_BILLING",
    "MANAGE_BILLING",
  ],
  "/settings/billing/remarks": ["VIEW_BILLING", "MANAGE_BILLING"],
  "/settings/billing/kot-printer-config": ["VIEW_BILLING", "MANAGE_BILLING"],
  "/settings/billing/chain-attributes": ["VIEW_BILLING", "MANAGE_BILLING"],
  "/settings/inventory/system-attributes": ["MATERIAL_VIEW", "MATERIAL_EDIT"],
  "/settings/inventory/custom-attributes": ["MATERIAL_VIEW", "MATERIAL_EDIT"],
  "/settings/inventory/measurement-unit": ["MATERIAL_VIEW", "MATERIAL_EDIT"],
  "/settings/payment/chain-payment-settings": ["MANAGE_PAYMENTS"],
  "/settings/payment/store-payment-settings": ["MANAGE_PAYMENTS"],
  "/settings/credit-note/redemption-configuration": [
    "VIEW_BILLING",
    "MANAGE_BILLING",
  ],
  "/settings/credit-note/refund-configuration": [
    "VIEW_BILLING",
    "MANAGE_BILLING",
  ],
  "/settings/business-info": ["VIEW_BILLING", "MANAGE_BILLING"],
  "/settings/receipts-print": ["VIEW_BILLING", "MANAGE_BILLING"],
  "/settings/kot-printers": ["VIEW_BILLING", "MANAGE_BILLING"],
  "/settings/system-attributes": ["MATERIAL_VIEW", "MATERIAL_EDIT"],
  "/settings/custom-attributes": ["MATERIAL_VIEW", "MATERIAL_EDIT"],
  "/settings/rooms-tables": ["MANAGE_STORES"],
  "/settings/sales-targets": ["VIEW_BILLING", "MANAGE_BILLING"],
  "/settings/app-settings": ["VIEW_BILLING", "MANAGE_BILLING"],
  "/settings/store-payment-modes": ["MANAGE_PAYMENTS"],
};

const ROUTE_PERMISSION_RULES = [
  { prefix: "/login", permissions: [] },
  { prefix: "/home/master-dashboard", permissions: ["ACCESS_DASHBOARD"] },
  { prefix: "/home", permissions: ["ACCESS_DASHBOARD"] },
  {
    prefix: "/construction",
    permissions: [
      "PROJECT_VIEW",
      "PROJECT_CREATE",
      "PROJECT_EDIT",
      "SITE_VIEW",
      "SITE_CREATE",
      "SITE_EDIT",
    ],
  },
  { prefix: "/delivery", permissions: ["MANAGE_DELIVERIES"] },
  { prefix: "/sales/pos", permissions: ["CREATE_POS_BILL"] },
  {
    prefix: "/sales/online-orders",
    permissions: ["MANAGE_ORDERS", "VIEW_ORDERS", "CREATE_POS_BILL"],
  },
  {
    prefix: "/sales/store-cash",
    permissions: [
      "CREATE_POS_BILL",
      "OPEN_CLOSE_SESSION",
      "MANAGE_POS",
      "MANAGE_BILLING",
      "VIEW_STORE_REPORTS",
    ],
  },
  {
    prefix: "/sales/returns",
    permissions: [
      "CREATE_POS_BILL",
      "MANAGE_ORDERS",
      "VIEW_ORDERS",
      "PROCESS_STORE_BILL_EXCHANGE",
      "APPROVE_STORE_BILL_EXCHANGE",
    ],
  },
  { prefix: "/sales-order", permissions: ["MANAGE_ORDERS", "VIEW_ORDERS"] },
  { prefix: "/admin/recycle-bin", permissions: ["MANAGE_RECYCLE_BIN"] },
  { prefix: "/admin", permissions: ["*"] },
  {
    prefix: "/sales",
    permissions: ["CREATE_POS_BILL", "MANAGE_ORDERS", "VIEW_ORDERS"],
  },
  {
    prefix: "/catalog",
    permissions: [
      "MATERIAL_VIEW",
      "MATERIAL_CREATE",
      "MATERIAL_EDIT",
      "MATERIAL_IMPORT",
    ],
  },
  {
    prefix: "/inventory/stockvalidation",
    permissions: ["STOCK_VIEW", "STOCK_AUDIT"],
  },
  {
    prefix: "/inventory/stockrequisition",
    permissions: ["SITE_REQUEST_CREATE", "SITE_REQUEST_APPROVE", "STOCK_VIEW"],
  },
  {
    prefix: "/inventory/expiry-alerts",
    permissions: [
      "VIEW_EXPIRY_ALERTS",
      "VIEW_STORE_EXPIRY",
      "MANAGE_INVENTORY",
      "VIEW_INVENTORY",
    ],
  },
  {
    prefix: "/inventory/hub",
    permissions: [
      "STOCK_VIEW",
      "GRN_CREATE",
      "TRANSFER_VIEW",
      "SITE_REQUEST_CREATE",
    ],
  },
  {
    prefix: "/inventory",
    permissions: [
      "STOCK_VIEW",
      "GRN_CREATE",
      "TRANSFER_VIEW",
      "SITE_REQUEST_CREATE",
      "STOCK_AUDIT",
    ],
  },
  {
    prefix: "/purchase/remote-grn",
    permissions: [
      "VIEW_REMOTE_GRN",
      "CREATE_REMOTE_GRN",
      "APPROVE_REMOTE_GRN",
      "VIEW_REMOTE_GRN_COSTING",
      "MANAGE_REMOTE_GRN_CP",
      "MANAGE_REMOTE_GRN_PRICING",
    ],
  },
  {
    prefix: "/purchase/purchase-orders",
    permissions: [
      "VIEW_PURCHASE_ORDERS",
      "MANAGE_PURCHASE_ORDERS",
      "CREATE_STORE_PURCHASE_ORDER",
    ],
  },
  {
    prefix: "/purchase",
    permissions: [
      "VIEW_PURCHASE_ORDERS",
      "MANAGE_PURCHASE_ORDERS",
      "CREATE_STORE_PURCHASE_ORDER",
      "VIEW_VENDORS",
      "MANAGE_VENDORS",
      "VIEW_REMOTE_GRN",
      "CREATE_REMOTE_GRN",
      "APPROVE_REMOTE_GRN",
      "VIEW_REMOTE_GRN_COSTING",
      "MANAGE_REMOTE_GRN_CP",
      "MANAGE_REMOTE_GRN_PRICING",
    ],
  },
  {
    prefix: "/accounts",
    permissions: [
      "ACCESS_ACCOUNTS",
      "VIEW_ACCOUNTS",
      "MANAGE_ACCOUNTS",
      "APPROVE_FINANCE",
      "MANAGE_VENDOR_PAYMENTS",
      "VIEW_FINANCIAL_REPORTS",
    ],
  },
  {
    prefix: "/employee/staffdepartments",
    permissions: ["TEAM_VIEW", "TEAM_MANAGE"],
  },
  { prefix: "/employee/staff", permissions: ["TEAM_VIEW", "TEAM_MANAGE"] },
  {
    prefix: "/employee/user-counter-session",
    permissions: ["OPEN_CLOSE_SESSION"],
  },
  {
    prefix: "/employee",
    permissions: ["TEAM_VIEW", "TEAM_MANAGE", "ROLE_MANAGE"],
  },
  {
    prefix: "/settings/stores",
    permissions: ["SITE_VIEW", "SITE_CREATE", "SITE_EDIT"],
  },
  {
    prefix: "/settings/warehouses",
    permissions: ["WAREHOUSE_VIEW", "WAREHOUSE_CREATE", "WAREHOUSE_EDIT"],
  },
  {
    prefix: "/settings/regions",
    permissions: ["PROJECT_VIEW", "PROJECT_EDIT", "SITE_VIEW", "SITE_EDIT"],
  },
  {
    prefix: "/settings/payment/chain-payment-settings",
    permissions: ["MANAGE_PAYMENTS"],
  },
  {
    prefix: "/settings/billing/chain-attributes",
    permissions: ["VIEW_BILLING", "MANAGE_BILLING"],
  },
  {
    prefix: "/settings/business-info",
    permissions: ["VIEW_BILLING", "MANAGE_BILLING"],
  },
  {
    prefix: "/settings/app-settings",
    permissions: ["VIEW_BILLING", "MANAGE_BILLING"],
  },
  { prefix: "/settings/store-payment-modes", permissions: ["MANAGE_PAYMENTS"] },
  {
    prefix: "/settings",
    permissions: [
      "PROJECT_VIEW",
      "SITE_VIEW",
      "WAREHOUSE_VIEW",
      "MATERIAL_VIEW",
    ],
  },
  { prefix: "/customer", permissions: ["MANAGE_CUSTOMERS", "VIEW_CUSTOMERS"] },
  { prefix: "/reports", permissions: ["REPORT_VIEW", "AUDIT_LOG_VIEW"] },
];

function normalizeRole(role) {
  return role || "guest";
}

function getPermissionList(user) {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions.filter(Boolean);
  return [];
}

function isSuperAdmin(user) {
  if (!user) return false;

  // Check by role first
  if (user.role === "super_admin") return true;

  // Check by permission array
  const permissions = getPermissionList(user);
  return permissions.includes(SUPER_ADMIN_PERMISSION);
}

function hasAnyPermission(user, permissions = []) {
  if (!user) return false;

  // Super admin check - should come first
  if (isSuperAdmin(user)) return true;

  // If no permissions required, grant access
  if (permissions.length === 0) return true;

  // Check user permissions
  const userPermissions = getPermissionList(user);
  return permissions.some((permission) => userPermissions.includes(permission));
}

function permissionAllowed(user, permissions = []) {
  if (!permissions.length) return true;
  if (!user) return false;

  // Check if super admin by role
  if (user.role === "super_admin") return true;

  // Check if super admin by permissions
  const userPermissions = Array.isArray(user.permissions)
    ? user.permissions
    : [];
  if (userPermissions.includes("*")) return true;

  // Check specific permissions
  return permissions.some((permission) => userPermissions.includes(permission));
}

function accessEntryAllowed(user, roles = [], permissions = []) {
  if (permissions.length) return permissionAllowed(user, permissions);
  return roleAllowed(user?.role, roles);
}

function pathMatches(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getMatchingRouteRule(pathname) {
  const sortedRules = [...ROUTE_PERMISSION_RULES].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  );
  return sortedRules.find((entry) => pathMatches(pathname, entry.prefix));
}

function getItemPermissions(item, sectionLabel) {
  if (ITEM_PERMISSION_RULES[item?.href])
    return ITEM_PERMISSION_RULES[item.href];
  if (sectionLabel === "Reports") {
    const href = String(item?.href || "");
    const legacy = ["VIEW_FINANCIAL_REPORTS", "VIEW_STORE_REPORTS"];
    if (
      href.startsWith("/reports/sales/") ||
      ["/reports/net-sales", "/reports/daily-sales-dsr"].includes(href)
    ) {
      return [...legacy, "VIEW_STORE_SALES"];
    }
    if (href.startsWith("/reports/accounting/"))
      return [...legacy, "VIEW_STORE_ACCOUNTING"];
    if (
      ["/reports/inventory/stock-level", "/reports/stock-level"].includes(href)
    ) {
      return [...legacy, "VIEW_STORE_PRODUCT_INVENTORY"];
    }
    return legacy;
  }
  return SECTION_PERMISSION_RULES[sectionLabel] || [];
}

export function getDefaultRouteForUser(user) {
  if (!isSuperAdmin(user)) {
    const permissions = getPermissionList(user);
    if (!permissions.includes("ACCESS_DASHBOARD")) {
      if (permissions.includes("MANAGE_DELIVERIES")) return "/delivery";
      if (permissions.includes("MANAGE_STOCK_REQUISITION"))
        return "/inventory/stockrequisition";
      if (permissions.includes("MANAGE_STOCK_VALIDATION"))
        return "/inventory/stockvalidation";
      if (permissions.includes("VIEW_EXPIRY_ALERTS"))
        return "/inventory/expiry-alerts";
    }
  }

  // Return based on role
  const rolePath = ROLE_HOME_PATHS[user?.role];
  if (rolePath) return rolePath;
  return "/construction/projects";
}

export function canAccessPath(user, pathname) {
  if (isConstructionHiddenRoute(pathname)) return false;
  if (isSuperAdmin(user)) return true;

  const rule = getMatchingRouteRule(pathname);
  if (!rule) return false;
  if (rule.permissions.length === 0) return true;

  return hasAnyPermission(user, rule.permissions);
}

export function filterMenuItemsForUser(menuItems, user) {
  // Super admin sees everything
  if (isSuperAdmin(user)) {
    return menuItems;
  }

  // If no user, return empty
  if (!user) {
    return [];
  }

  return menuItems
    .map((item) => {
      if (!item.subSidebar?.groups) {
        return hasAnyPermission(user, getItemPermissions(item, item.label))
          ? item
          : null;
      }

      // For sensitive sections like Settings and Employee, require a
      // section-level permission before exposing the section at all.
      if (["Settings", "Employee"].includes(item.label)) {
        const sectionPerms = SECTION_PERMISSION_RULES[item.label] || [];
        if (!hasAnyPermission(user, sectionPerms)) {
          return null;
        }
      }

      const groups = item.subSidebar.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((subItem) =>
            hasAnyPermission(user, getItemPermissions(subItem, item.label)),
          ),
        }))
        .filter((group) => group.items.length > 0);

      if (groups.length === 0) return null;

      return {
        ...item,
        href: groups[0]?.items?.[0]?.href || item.href,
        subSidebar: {
          ...item.subSidebar,
          groups,
        },
      };
    })
    .filter(Boolean);
}

export function getFirstAccessibleHref(menuItems, user) {
  const filtered = filterMenuItemsForUser(menuItems, user);
  const first = filtered[0];
  const firstSubItem = first?.subSidebar?.groups?.[0]?.items?.[0];
  return firstSubItem?.href || first?.href || null;
}

export function getPageTitleForMenu(menuItems, pathname) {
  for (const item of menuItems) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (item.subSidebar?.groups) {
        for (const group of item.subSidebar.groups) {
          const match = group.items.find(
            (subItem) =>
              pathname === subItem.href ||
              pathname.startsWith(subItem.href + "/"),
          );
          if (match?.label) return match.label;
        }
      }
      return item.label;
    }
  }

  return "Home";
}
