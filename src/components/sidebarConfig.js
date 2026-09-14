export const menuItems = [
  {
    label: "Dashboard",
    icon: "ti-layout-dashboard",
    href: "/home/master-dashboard",
  },
  {
    label: "Projects",
    icon: "ti-building-community",
    href: "/construction/projects",
    subSidebar: {
      title: "Projects & Sites",
      titleIcon: "ti-building-community",
      groups: [
        {
          label: "Project Controls",
          icon: "ti-building",
          items: [
            { label: "Projects & Sites", href: "/construction/projects" },
            { label: "Site Stores", href: "/construction/projects?view=sites" },
            { label: "Warehouses", href: "/settings/warehouses" },
            { label: "Project Team", href: "/employee/staff" },
          ],
        },
      ],
    },
  },
  {
    label: "Materials",
    icon: "ti-packages",
    href: "/catalog/products",
    subSidebar: {
      title: "Material Master",
      titleIcon: "ti-packages",
      groups: [
        {
          label: "Classification",
          icon: "ti-category",
          items: [
            { label: "Materials", href: "/catalog/products" },
            { label: "Material Categories", href: "/catalog/category" },
            { label: "Material Sub-categories", href: "/catalog/sub-category" },
            { label: "Manufacturers", href: "/catalog/manufacturer" },
            { label: "Brands / Makes", href: "/catalog/brand" },
            {
              label: "Measurement Units",
              href: "/settings/inventory/measurement-unit",
            },
            { label: "Taxes", href: "/catalog/taxes" },
          ],
        },
      ],
    },
  },
  {
    label: "Procurement",
    icon: "ti-shopping-cart",
    href: "/purchase/purchase-orders",
    subSidebar: {
      title: "Purchase & Receiving",
      titleIcon: "ti-shopping-cart",
      groups: [
        {
          label: "Purchase Workflow",
          icon: "ti-file-invoice",
          items: [
            { label: "Suppliers", href: "/purchase/vendors" },
            { label: "Purchase Orders", href: "/purchase/purchase-orders" },
            { label: "Quotation Comparison", href: "/purchase/quotations" },
            { label: "Material Receipt (GRN)", href: "/purchase/grn" },
            { label: "Margin / Price Approvals", href: "/purchase/margin-approvals" },
            { label: "Supplier Returns", href: "/purchase/returns" },
            { label: "Supplier Invoices", href: "/purchase/vendor-invoices" },
            { label: "Supplier Ledger", href: "/purchase/vendor-ledger" },
          ],
        },
      ],
    },
  },
  {
    label: "Material Movement",
    icon: "ti-arrows-transfer-up",
    href: "/inventory/hub",
    subSidebar: {
      title: "Warehouse to Site",
      titleIcon: "ti-route",
      groups: [
        {
          label: "Operations",
          icon: "ti-forklift",
          items: [
            { label: "Movement Overview", href: "/inventory/hub" },
            { label: "Warehouse Stock In", href: "/inventory/stockin" },
            { label: "Site Request", href: "/inventory/stockrequisition" },
            { label: "Movement Tracker", href: "/inventory/movement-tracker" },
            { label: "Transfer to Site", href: "/inventory/stocktransfer" },
            { label: "Material Issue / Return", href: "/inventory/stockout" },
            { label: "Stock Check", href: "/inventory/stockvalidation" },
            { label: "Batch & Serial Trace", href: "/inventory/batches" },
          ],
        },
      ],
    },
  },
  {
    label: "Reports",
    icon: "ti-chart-bar",
    href: "/reports/inventory/stock-movement",
    subSidebar: {
      title: "Construction Reports",
      titleIcon: "ti-chart-bar",
      groups: [
        {
          label: "Inventory & Audit",
          icon: "ti-report-analytics",
          items: [
            {
              label: "Material Stock Level",
              href: "/reports/inventory/stock-level",
            },
            {
              label: "Movement Ledger",
              href: "/reports/inventory/stock-ledger-summary",
            },
            {
              label: "Material Movement",
              href: "/reports/inventory/stock-movement",
            },
            {
              label: "Requisition Report",
              href: "/reports/inventory/stock-requisition",
            },
            {
              label: "Unfulfilled Transfers",
              href: "/reports/inventory/unfulfilled-stock-transfers",
            },
            {
              label: "Inventory Accuracy",
              href: "/reports/insights/inventory-accuracy-scorecard",
            },
            { label: "Audit Trail", href: "/reports/logs/audit-trail" },
          ],
        },
        {
          label: "Procurement",
          icon: "ti-file-description",
          items: [
            {
              label: "Purchase Orders",
              href: "/reports/purchase/list-of-purchase-orders",
            },
            {
              label: "Purchase Returns",
              href: "/reports/purchase/purchase-return-report",
            },
            {
              label: "Vendor Performance",
              href: "/reports/purchase/vendor-performance-report",
            },
          ],
        },
      ],
    },
  },
  {
    label: "Team & Access",
    icon: "ti-users",
    href: "/employee/staff",
    subSidebar: {
      title: "Team & Access",
      titleIcon: "ti-users",
      groups: [
        {
          label: "Access Control",
          icon: "ti-lock-access",
          items: [
            { label: "Staff", href: "/employee/staff" },
            { label: "Departments", href: "/employee/staffdepartments" },
            {
              label: "Roles & Permissions",
              href: "/employee/customroles",
            },
          ],
        },
      ],
    },
  },
  {
    label: "Settings",
    icon: "ti-settings",
    href: "/settings",
    subSidebar: {
      title: "Construction Settings",
      titleIcon: "ti-settings",
      groups: [
        {
          label: "Locations",
          icon: "ti-map-pin",
          items: [
            { label: "Site Stores", href: "/settings/stores" },
            { label: "Warehouses", href: "/settings/warehouses" },
            { label: "Regions / Zones", href: "/settings/regions" },
          ],
        },
        {
          label: "Administration",
          icon: "ti-shield-lock",
          items: [
            { label: "Company Profile", href: "/settings/business-info" },
            { label: "Platform Settings", href: "/settings/app-settings" },
            { label: "Recycle Bin", href: "/admin/recycle-bin" },
          ],
        },
      ],
    },
  },
];
