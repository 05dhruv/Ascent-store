export const menuItems = [
  { label: 'Dashboard', icon: 'ti-layout-dashboard', href: '/home/master-dashboard' },
  { label: 'Projects', icon: 'ti-building-community', href: '/construction/projects', subSidebar: { title: 'Projects & Sites', titleIcon: 'ti-building-community', groups: [
    { label: 'Project Controls', icon: 'ti-building', items: [
      { label: 'Project Register', href: '/construction/projects' }, { label: 'Sites & Site Stores', href: '/settings/stores' }, { label: 'Project Team', href: '/employee/staff' },
    ]},
  ]}},
  { label: 'Materials', icon: 'ti-packages', href: '/catalog/products', subSidebar: { title: 'Material Master', titleIcon: 'ti-packages', groups: [
    { label: 'Classification', icon: 'ti-category', items: [
      { label: 'Materials', href: '/catalog/products' }, { label: 'Material Categories', href: '/catalog/category' }, { label: 'Material Sub-categories', href: '/catalog/sub-category' },
      { label: 'Manufacturers', href: '/catalog/manufacturer' }, { label: 'Brands / Makes', href: '/catalog/brand' }, { label: 'Measurement Units', href: '/settings/inventory/measurement-unit' }, { label: 'Taxes', href: '/catalog/taxes' },
    ]},
  ]}},
  { label: 'Procurement', icon: 'ti-shopping-cart', href: '/purchase/purchase-orders', subSidebar: { title: 'Construction Procurement', titleIcon: 'ti-shopping-cart', groups: [
    { label: 'Purchase Workflow', icon: 'ti-file-invoice', items: [
      { label: 'Vendors & Subcontractors', href: '/purchase/vendors' }, { label: 'Purchase Orders', href: '/purchase/purchase-orders' }, { label: 'Quotation Comparison', href: '/purchase/quotations' },
      { label: 'Gate Entry / GRN', href: '/purchase/grn' }, { label: 'Material Returns', href: '/purchase/returns' }, { label: 'Vendor Invoices', href: '/purchase/vendor-invoices' }, { label: 'Vendor Ledger', href: '/purchase/vendor-ledger' },
    ]},
  ]}},
  { label: 'Material Movement', icon: 'ti-arrows-transfer-up', href: '/inventory/hub', subSidebar: { title: 'Material Movement & Tracking', titleIcon: 'ti-route', groups: [
    { label: 'Operations', icon: 'ti-forklift', items: [
      { label: 'Movement Overview', href: '/inventory/hub' }, { label: 'Material Receipt / Stock In', href: '/inventory/stockin' }, { label: 'Material Requisition', href: '/inventory/stockrequisition' },
      { label: 'Material Movement / Receipts', href: '/inventory/movement-tracker' }, { label: 'Create / List Transfers', href: '/inventory/stocktransfer' }, { label: 'Material Issue / Consumption', href: '/inventory/stockout' }, { label: 'Physical Stock Validation', href: '/inventory/stockvalidation' }, { label: 'Batch / Serial Trace', href: '/inventory/batches' },
    ]},
  ]}},
  { label: 'Accounts', icon: 'ti-calculator', href: '/accounts', subSidebar: { title: 'Project Accounts', titleIcon: 'ti-calculator', groups: [
    { label: 'Finance', icon: 'ti-currency-rupee', items: [
      { label: 'Finance Dashboard', href: '/accounts' }, { label: 'Vendor Payables', href: '/accounts/vendor-payables' }, { label: 'Site Expenses & Imprest', href: '/accounts/expenses-imprest' }, { label: 'Financial Reports', href: '/accounts/reports' },
    ]},
  ]}},
  { label: 'Reports', icon: 'ti-chart-bar', href: '/reports/inventory/stock-movement', subSidebar: { title: 'Construction Reports', titleIcon: 'ti-chart-bar', groups: [
    { label: 'Inventory & Audit', icon: 'ti-report-analytics', items: [
      { label: 'Material Stock Level', href: '/reports/inventory/stock-level' }, { label: 'Movement Ledger', href: '/reports/inventory/stock-ledger-summary' }, { label: 'Material Movement', href: '/reports/inventory/stock-movement' },
      { label: 'Requisition Report', href: '/reports/inventory/stock-requisition' }, { label: 'Unfulfilled Transfers', href: '/reports/inventory/unfulfilled-stock-transfers' }, { label: 'Inventory Accuracy', href: '/reports/insights/inventory-accuracy-scorecard' }, { label: 'Audit Trail', href: '/reports/logs/audit-trail' },
    ]},
    { label: 'Procurement', icon: 'ti-file-description', items: [
      { label: 'Purchase Orders', href: '/reports/purchase/list-of-purchase-orders' }, { label: 'Purchase Returns', href: '/reports/purchase/purchase-return-report' }, { label: 'Vendor Performance', href: '/reports/purchase/vendor-performance-report' },
    ]},
  ]}},
  { label: 'Team & Access', icon: 'ti-users', href: '/employee/staff', subSidebar: { title: 'Team & Permissions', titleIcon: 'ti-users', groups: [
    { label: 'Access Control', icon: 'ti-lock-access', items: [
      { label: 'Employees', href: '/employee/staff' }, { label: 'Departments', href: '/employee/staffdepartments' }, { label: 'Custom Roles', href: '/employee/customroles/createcustomrole' },
    ]},
  ]}},
  { label: 'Settings', icon: 'ti-settings', href: '/settings', subSidebar: { title: 'Construction Settings', titleIcon: 'ti-settings', groups: [
    { label: 'Locations', icon: 'ti-map-pin', items: [
      { label: 'Sites & Stores', href: '/settings/stores' }, { label: 'Warehouses', href: '/settings/warehouses' }, { label: 'Regions / Zones', href: '/settings/regions' },
    ]},
    { label: 'Administration', icon: 'ti-shield-lock', items: [
      { label: 'Business Information', href: '/settings/business-info' }, { label: 'Application Settings', href: '/settings/app-settings' }, { label: 'Recycle Bin', href: '/admin/recycle-bin' },
    ]},
  ]}},
];
