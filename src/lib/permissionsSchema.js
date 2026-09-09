import { query } from "@/lib/db";
import { makeSchemaEnsurer } from "@/lib/schemaGuard";

const PERMISSIONS_SCHEMA_VERSION = 2;

export const ensurePermissionsSchema = makeSchemaEnsurer("permissions", PERMISSIONS_SCHEMA_VERSION, async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      permission_for_org VARCHAR(50) NOT NULL DEFAULT 'MERCHANT',
      permission_for_interface VARCHAR(50) NOT NULL DEFAULT 'BOTH',
      permission_name VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255),
      display_name VARCHAR(255),
      description TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS permission_for_org VARCHAR(50) NOT NULL DEFAULT 'MERCHANT';
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS permission_for_interface VARCHAR(50) NOT NULL DEFAULT 'BOTH';
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS permission_name VARCHAR(255);
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS name VARCHAR(255);
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    UPDATE permissions
    SET permission_name = COALESCE(NULLIF(permission_name, ''), NULLIF(name, ''))
    WHERE permission_name IS NULL OR permission_name = '';

    UPDATE permissions
    SET permission_name = 'PERMISSION_' || id
    WHERE permission_name IS NULL OR permission_name = '';

    UPDATE permissions
    SET name = COALESCE(NULLIF(name, ''), permission_name)
    WHERE name IS NULL OR name = '';

    UPDATE permissions
    SET display_name = COALESCE(display_name, name, permission_name)
    WHERE display_name IS NULL OR display_name = '';

    ALTER TABLE permissions ALTER COLUMN name DROP NOT NULL;
    ALTER TABLE permissions ALTER COLUMN permission_name SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS permissions_permission_name_unique_idx
      ON permissions (permission_name);
  `);

  const defaults = [
    [
      "MERCHANT",
      "BOTH",
      "ACCESS_DASHBOARD",
      "Access Dashboard",
      "Access the main dashboard",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_ROLES",
      "Manage Roles",
      "Create and manage roles",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_USERS",
      "Manage Users",
      "Invite and manage users",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_USERS",
      "View Users",
      "View user and staff records",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_INVENTORY",
      "Manage Inventory",
      "View and adjust stock and transfers",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_INVENTORY",
      "View Inventory",
      "View stock and inventory reports",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_STOCK_VALIDATION",
      "Manage Stock Validation",
      "Create, review, and confirm stock validation audits",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_STORE_INVENTORY_DASHBOARD",
      "View Store Inventory Dashboard",
      "View complete store-wise inventory on the inventory dashboard",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_STOCK_REQUISITION",
      "Manage Stock Requisition",
      "Create, approve, and track stock requisitions",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_EXPIRY_ALERTS",
      "View Near Expiry",
      "View near-expiry and missing-expiry stock alerts",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_CATALOG",
      "Manage Catalog",
      "Manage products and services",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_CATALOG",
      "View Catalog",
      "View products and services",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_ORDERS",
      "Manage Orders",
      "Create and manage sales orders",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_ORDERS",
      "View Orders",
      "View sales orders and bills",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_DELIVERIES",
      "Manage Deliveries",
      "Access only assigned store deliveries, customer navigation, live location sharing, and OTP delivery completion",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_PURCHASE_ORDERS",
      "Manage Purchase Orders",
      "Create and manage PO to vendors",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_VENDORS",
      "Manage Vendors",
      "Manage vendor records and invoices",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_REMOTE_GRN",
      "View Remote GRN",
      "View remote GRN records",
    ],
    [
      "MERCHANT",
      "BOTH",
      "CREATE_REMOTE_GRN",
      "Create Remote GRN",
      "Scan products and submit remote GRN drafts for approval",
    ],
    [
      "MERCHANT",
      "BOTH",
      "APPROVE_REMOTE_GRN",
      "Approve Remote GRN",
      "Open, review, and confirm remote GRNs",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_REMOTE_GRN_COSTING",
      "View Remote GRN CP",
      "Legacy permission to view and enter CP details in remote GRN",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_REMOTE_GRN_CP",
      "Enter Remote GRN CP",
      "Enter CP and CP to MRP margin for assigned store Remote GRNs",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_REMOTE_GRN_PRICING",
      "Enter Remote GRN SP",
      "Enter franchise and consumer SP and margins before super admin approval",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_CUSTOMERS",
      "Manage Customers",
      "Manage customer profiles and credits",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_CUSTOMERS",
      "View Customers",
      "View customer profiles and history",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_BILLING",
      "Manage Billing",
      "Configure billing and invoices",
    ],
    [
      "MERCHANT",
      "BOTH",
      "CREATE_POS_BILL",
      "Create POS Bill",
      "Create POS bills and receipts",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_PAYMENTS",
      "Manage Payments",
      "Record and reconcile payments",
    ],
    [
      "MERCHANT",
      "BOTH",
      "ACCESS_ACCOUNTS",
      "Access Accounts Module",
      "Open the basic Accounts module",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_ACCOUNTS",
      "View Accounts",
      "View cash, bank, vendor payable, expense, and report data in Accounts",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_ACCOUNTS",
      "Manage Accounts",
      "Create and update cash, bank, expense, document, and imprest records",
    ],
    [
      "MERCHANT",
      "BOTH",
      "APPROVE_FINANCE",
      "Approve Finance",
      "Approve finance proposals and expenses",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_VENDOR_PAYMENTS",
      "Manage Vendor Payments",
      "Create payment proposals and record vendor payment UTRs",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_FINANCIAL_REPORTS",
      "View Financial Reports",
      "Access financial reporting",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_STORE_REPORTS",
      "View Store Reports",
      "Access assigned store reports",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_TAX_WISE_REPORTS",
      "View Tax Wise Reports",
      "Access store-wise tax reports",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_PROMOS",
      "Manage Promotions",
      "Create and manage promotions",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_TAXES",
      "Manage Taxes",
      "Configure tax settings",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_STORES",
      "Manage Stores",
      "Create and manage store locations",
    ],
    [
      "MERCHANT",
      "BOTH",
      "MANAGE_RECYCLE_BIN",
      "Manage Recycle Bin",
      "View, restore, and permanently delete recycle bin records",
    ],
    ["MERCHANT", "BOTH", "VIEW_STORES", "View Stores", "View store locations"],
    [
      "MERCHANT",
      "BOTH",
      "OPEN_CLOSE_SESSION",
      "Open/Close Session",
      "Open and close POS counter sessions",
    ],
    [
      "MERCHANT",
      "BOTH",
      "PROCESS_STORE_BILL_EXCHANGE",
      "Process Store Bill Exchange",
      "Create bill exchanges for assigned stores",
    ],
    [
      "MERCHANT",
      "BOTH",
      "APPROVE_STORE_BILL_EXCHANGE",
      "Approve Store Return/Exchange",
      "Approve or decline POS return and exchange requests for assigned stores",
    ],
    [
      "MERCHANT",
      "BOTH",
      "CREATE_STORE_PURCHASE_ORDER",
      "Create Store Purchase Order",
      "Create and confirm purchase orders only for assigned stores",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_STORE_SALES",
      "View Store Sales",
      "View sales reports only for assigned stores",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_STORE_PRODUCT_INVENTORY",
      "View Store Product Inventory",
      "View product-wise inventory and store-specific cost only for assigned stores",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_STORE_EXPIRY",
      "View Store Expiry",
      "View product and batch expiry only for assigned stores",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_STORE_ACCOUNTING",
      "View Store Accounting",
      "View accounting and tax reports only for assigned stores",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_PURCHASE_ORDERS",
      "View Purchase Orders",
      "Access and view purchase orders and GRNs",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_VENDORS",
      "View Vendors",
      "View vendor list, invoices, and ledger",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_BILLING",
      "View Billing",
      "View billing configurations and templates",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_TAXES",
      "View Taxes",
      "View tax categories and HSN/SAC codes",
    ],
    [
      "MERCHANT",
      "BOTH",
      "VIEW_PROMOS",
      "View Promotions",
      "View active promotions and coupons",
    ],
  ];

  for (const d of defaults) {
    await query(
      `INSERT INTO permissions (permission_for_org, permission_for_interface, permission_name, name, display_name, description, meta, created_at, updated_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6::jsonb, NOW(), NOW())
       ON CONFLICT (permission_name) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           name = EXCLUDED.permission_name,
           description = EXCLUDED.description,
           updated_at = NOW()`,
      [d[0], d[1], d[2], d[3], d[4], JSON.stringify({ seeded: true })],
    );
  }

});

export default null;
