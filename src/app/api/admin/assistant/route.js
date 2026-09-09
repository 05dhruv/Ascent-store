import { requireAuth, requireRole } from "@/lib/api-protection";
import {
  successResponse,
  validationError,
  errorResponse,
} from "@/lib/api-response";
import { ensureAuditLogsSchema } from "@/lib/auditLogsSchema";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureEmployeesSchema } from "@/lib/employeesSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { ensureSalesBillingSchema } from "@/lib/salesBillingSchema";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { query } from "@/lib/db";
import { formatIndianDateTime } from "@/lib/dateUtils";

const RUPEE = "\u20b9";
const MAX_ROWS = 20;

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatMoney(value) {
  return `${RUPEE}${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });
}

function parseDateRange(message) {
  const text = message.toLowerCase();
  const now = new Date();

  if (/(last|pichle)\s*30|30\s*(days|din)/.test(text)) {
    return {
      from: startOfDay(addDays(now, -29)),
      to: endOfDay(now),
      label: "last 30 days",
      explicit: true,
    };
  }
  if (
    /(last|pichle)\s*7|7\s*(days|din|day)/.test(text) ||
    /week|hafta/.test(text)
  ) {
    return {
      from: startOfDay(addDays(now, -6)),
      to: endOfDay(now),
      label: "last 7 days",
      explicit: true,
    };
  }
  if (/yesterday|kal/.test(text)) {
    const yesterday = addDays(now, -1);
    return {
      from: startOfDay(yesterday),
      to: endOfDay(yesterday),
      label: "yesterday",
      explicit: true,
    };
  }
  if (/month|mahina|is mahine|this month/.test(text)) {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: endOfDay(now),
      label: "this month",
      explicit: true,
    };
  }

  const isoMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const date = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
    return {
      from: startOfDay(date),
      to: endOfDay(date),
      label: formatDate(date),
      explicit: true,
    };
  }

  const indianMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (indianMatch) {
    const date = new Date(
      Number(indianMatch[3]),
      Number(indianMatch[2]) - 1,
      Number(indianMatch[1]),
    );
    return {
      from: startOfDay(date),
      to: endOfDay(date),
      label: formatDate(date),
      explicit: true,
    };
  }

  const monthNames = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };
  const monthMatch = text.match(/\b(\d{1,2})\s+([a-z]+)(?:\s+(20\d{2}))?\b/);
  if (
    monthMatch &&
    Object.prototype.hasOwnProperty.call(monthNames, monthMatch[2])
  ) {
    const date = new Date(
      Number(monthMatch[3] || now.getFullYear()),
      monthNames[monthMatch[2]],
      Number(monthMatch[1]),
    );
    return {
      from: startOfDay(date),
      to: endOfDay(date),
      label: formatDate(date),
      explicit: true,
    };
  }

  return {
    from: startOfDay(now),
    to: endOfDay(now),
    label: "today",
    explicit: false,
  };
}

function parseIntent(message) {
  const text = message.toLowerCase();
  if (/expir|near expiry|expiry|expire|kharaab|pass/.test(text))
    return "expiry";
  if (
    /audit|activity|log|kisne|kya kya|kiya|changes|delete|update|created/.test(
      text,
    )
  )
    return "activity";
  if (/stock|inventory|transfer|requisition|batch/.test(text)) return "stock";
  if (
    /sale|sales|performance|cashier|bill|revenue|employee|staff|top/.test(text)
  )
    return "sales";
  return "help";
}

function parseStoreId(message) {
  const match = message.toLowerCase().match(/\b(?:store|at)\s*#?\s*(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractProductSearch(message, store = null) {
  const numericMatch = String(message || "").match(/\b\d{5,}\b/);
  if (numericMatch) {
    return { term: numericMatch[0], exact: true };
  }

  let normalized = normalizeSearchText(message);
  normalized = normalized.replace(/\b(?:store|at)\s*#?\s*\d+\b/g, " ");
  if (store?.name) {
    normalized = normalized.replace(normalizeSearchText(store.name), " ");
  }

  const stopWords = new Set([
    "show",
    "dikhao",
    "bata",
    "bta",
    "do",
    "details",
    "detail",
    "inventory",
    "stock",
    "product",
    "item",
    "barcode",
    "sku",
    "available",
    "availability",
    "qty",
    "quantity",
    "kitna",
    "kitni",
    "kaha",
    "kahan",
    "kis",
    "store",
    "stores",
    "warehouse",
    "par",
    "pe",
    "pr",
    "me",
    "mein",
    "hai",
    "h",
    "ka",
    "ki",
    "ke",
    "for",
    "of",
    "in",
    "on",
    "by",
    "activity",
    "operations",
    "transfer",
    "requisition",
    "batch",
    "batches",
    "how",
    "many",
    "packets",
    "packet",
    "units",
    "unit",
    "please",
    "tell",
    "find",
    "search",
    "check",
    "available",
    "at",
    "are",
    "is",
    "was",
    "were",
    "there",
    "currently",
    "left",
    "remaining",
  ]);
  const tokens = normalized
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token));

  const term = tokens.join(" ").trim();
  if (!term || term.length < 3) return null;
  return { term, exact: false };
}

async function resolveStoreFilter(message) {
  const storeId = parseStoreId(message);
  if (storeId) {
    const result = await query(
      `SELECT id, name FROM stores WHERE id = $1 LIMIT 1`,
      [storeId],
    );
    return result.rows[0] || { id: storeId, name: `Store ${storeId}` };
  }

  const normalizedMessage = normalizeSearchText(message);
  if (!normalizedMessage) return null;

  const storesResult = await query(
    `SELECT id, name
     FROM stores
     WHERE name IS NOT NULL AND TRIM(name) <> ''
     ORDER BY LENGTH(name) DESC
     LIMIT 500`,
  );

  return (
    storesResult.rows.find((store) => {
      const normalizedName = normalizeSearchText(store.name);
      return (
        normalizedName.length >= 3 && normalizedMessage.includes(normalizedName)
      );
    }) || null
  );
}

function parseEmployeeSearch(message) {
  const text = message.trim();
  const named = text.match(
    /\b(?:employee|staff|cashier|user)\s*(?:name|named|called|:)\s+([a-zA-Z0-9._-]{2,40})/i,
  );
  if (named) {
    const candidate = named[1].trim();
    if (
      !/^(sales|sale|performance|activity|report|wise|top|data|logs?|stock|inventory)$/i.test(
        candidate,
      )
    ) {
      return candidate;
    }
  }
  const beforeAction = text.match(
    /^([a-zA-Z][a-zA-Z ._-]{1,35})\s+(?:ne|has|did|kiya)/i,
  );
  return beforeAction ? beforeAction[1].trim() : "";
}

async function addOptionalFilters({ where, params, message }) {
  const store = await resolveStoreFilter(message);
  const employee = parseEmployeeSearch(message);

  if (store?.id) {
    params.push(Number(store.id));
    where.push(`sb.store_id = $${params.length}`);
  }

  if (employee) {
    params.push(`%${employee.toLowerCase()}%`);
    where.push(`(
      LOWER(COALESCE(u.name, '')) LIKE $${params.length}
      OR LOWER(COALESCE(u.email, '')) LIKE $${params.length}
      OR LOWER(COALESCE(e.first_name || ' ' || COALESCE(e.last_name, ''), '')) LIKE $${params.length}
      OR LOWER(COALESCE(e.username, '')) LIKE $${params.length}
    )`);
  }
}

function buildAnswer({
  title,
  summary,
  columns = [],
  rows = [],
  cards = [],
  links = [],
  range,
}) {
  return {
    title,
    answer: summary,
    range,
    cards,
    table: { columns, rows },
    links,
  };
}

async function getLatestRange(tableName, dateColumn = "created_at", days = 7) {
  const result = await query(
    `SELECT MAX(${dateColumn}) AS latest_date FROM ${tableName} WHERE ${dateColumn} IS NOT NULL`,
  );
  const latestDate = result.rows[0]?.latest_date
    ? new Date(result.rows[0].latest_date)
    : null;
  if (!latestDate || Number.isNaN(latestDate.getTime())) return null;

  return {
    from: startOfDay(addDays(latestDate, -(days - 1))),
    to: endOfDay(latestDate),
    label: `latest ${days} days in data`,
    explicit: false,
    fallback: true,
  };
}

async function runSalesQuery(message, range) {
  const params = [range.from, range.to];
  const where = [`sb.created_at BETWEEN $1 AND $2`];
  await addOptionalFilters({ where, params, message });

  return query(
    `SELECT
       COALESCE(NULLIF(TRIM(e.first_name || ' ' || COALESCE(e.last_name, '')), ''), u.name, u.email, 'Unknown') AS employee,
       COALESCE(s.name, 'Unknown store') AS store,
       COUNT(sb.id)::int AS bills,
       COALESCE(SUM(sb.grand_total), 0)::float AS sales,
       COALESCE(SUM(sb.tax_total), 0)::float AS tax,
       COALESCE(SUM(sb.paid_amount), 0)::float AS paid
     FROM sales_bills sb
     LEFT JOIN users u ON u.id = sb.user_id
     LEFT JOIN employees e ON e.user_id = sb.user_id
     LEFT JOIN stores s ON s.id = sb.store_id
     WHERE ${where.join(" AND ")}
       AND COALESCE(sb.status, 'paid') NOT IN ('cancelled', 'void')
     GROUP BY employee, store
     ORDER BY sales DESC
     LIMIT ${MAX_ROWS}`,
    params,
  );
}

async function getSalesAnswer(message, range) {
  let effectiveRange = range;
  let result = await runSalesQuery(message, effectiveRange);

  if (!result.rows.length && !range.explicit) {
    const latestRange = await getLatestRange("sales_bills", "created_at", 7);
    if (latestRange) {
      effectiveRange = latestRange;
      result = await runSalesQuery(message, effectiveRange);
    }
  }

  const totalSales = result.rows.reduce(
    (sum, row) => sum + Number(row.sales || 0),
    0,
  );
  const totalBills = result.rows.reduce(
    (sum, row) => sum + Number(row.bills || 0),
    0,
  );
  const top = result.rows[0];

  return buildAnswer({
    title: "Employee sales performance",
    summary: result.rows.length
      ? `${effectiveRange.label}${effectiveRange.fallback ? " (selected date had no sales)" : ""}: ${totalBills} bills and ${formatMoney(totalSales)} sales found. Top performer is ${top.employee} with ${formatMoney(top.sales)}.`
      : `No sales data was found for ${effectiveRange.label}. Try changing the date, store, or employee filter.`,
    range: effectiveRange,
    cards: [
      { label: "Sales", value: formatMoney(totalSales) },
      { label: "Bills", value: String(totalBills) },
      { label: "Employees/Stores", value: String(result.rows.length) },
    ],
    columns: ["Employee", "Store", "Bills", "Sales", "Tax", "Paid"],
    rows: result.rows.map((row) => ({
      Employee: row.employee,
      Store: row.store,
      Bills: row.bills,
      Sales: formatMoney(row.sales),
      Tax: formatMoney(row.tax),
      Paid: formatMoney(row.paid),
    })),
    links: [
      {
        label: "Employee wise sales report",
        href: "/reports/sales/employee-wise-sales",
      },
    ],
  });
}

async function runActivityQuery(message, range) {
  const params = [range.from, range.to];
  const where = [`al.created_at BETWEEN $1 AND $2`];
  const employee = parseEmployeeSearch(message);

  if (employee) {
    params.push(`%${employee.toLowerCase()}%`);
    where.push(`(
      LOWER(COALESCE(u.name, '')) LIKE $${params.length}
      OR LOWER(COALESCE(u.email, '')) LIKE $${params.length}
      OR LOWER(COALESCE(e.first_name || ' ' || COALESCE(e.last_name, ''), '')) LIKE $${params.length}
      OR LOWER(COALESCE(e.username, '')) LIKE $${params.length}
    )`);
  }

  return query(
    `SELECT
       al.created_at,
       COALESCE(NULLIF(TRIM(e.first_name || ' ' || COALESCE(e.last_name, '')), ''), u.name, u.email, 'Unknown') AS employee,
       al.action,
       al.resource_type,
       COALESCE(al.resource_id::text, '-') AS resource_id,
       COALESCE(al.status, '-') AS status
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     LEFT JOIN employees e ON e.user_id = al.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY al.created_at DESC
     LIMIT 30`,
    params,
  );
}

async function getActivityAnswer(message, range) {
  let effectiveRange = range;
  let result = await runActivityQuery(message, effectiveRange);

  if (!result.rows.length && !range.explicit) {
    const latestRange = await getLatestRange("audit_logs", "created_at", 7);
    if (latestRange) {
      effectiveRange = latestRange;
      result = await runActivityQuery(message, effectiveRange);
    }
  }

  return buildAnswer({
    title: "Employee activity trail",
    summary: result.rows.length
      ? `${effectiveRange.label}${effectiveRange.fallback ? " (selected date had no logs)" : ""}: ${result.rows.length} recent activity logs found.`
      : `No audit activity was found for ${effectiveRange.label}. Older actions may not appear if audit logging was not enabled at that time.`,
    range: effectiveRange,
    cards: [
      { label: "Logs", value: String(result.rows.length) },
      { label: "Window", value: effectiveRange.label },
    ],
    columns: ["Time", "Employee", "Action", "Resource", "Status"],
    rows: result.rows.map((row) => ({
      Time: formatIndianDateTime(row.created_at, "-"),
      Employee: row.employee,
      Action: row.action || "-",
      Resource: `${row.resource_type || "-"} #${row.resource_id}`,
      Status: row.status,
    })),
    links: [{ label: "Audit trail", href: "/reports/logs/audit-trail" }],
  });
}

async function resolveProduct(message, store = null) {
  const search = extractProductSearch(message, store);
  if (!search) return { search: null, products: [] };

  const likeTerm = `%${search.term}%`;
  const result = await query(
    `SELECT
       p.id,
       p.product_id,
       p.name,
       p.barcode,
       p.sku,
       COALESCE(b.name, '-') AS brand,
       COALESCE(c.name, '-') AS category
     FROM products p
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE COALESCE(p.is_active, TRUE) = TRUE
       AND (
         p.barcode = $1
         OR p.sku = $1
         OR p.product_id = $1
         OR p.name ILIKE $2
         OR COALESCE(p.barcode, '') ILIKE $2
         OR COALESCE(p.sku, '') ILIKE $2
       )
     ORDER BY
       CASE
         WHEN p.barcode = $1 OR p.sku = $1 OR p.product_id = $1 THEN 0
         WHEN LOWER(p.name) = LOWER($1) THEN 1
         ELSE 2
       END,
       LENGTH(p.name),
       p.id
     LIMIT 5`,
    [search.term, likeTerm],
  );

  return { search, products: result.rows };
}

async function getProductInventoryAnswer(message, range) {
  const store = await resolveStoreFilter(message);
  const { search, products } = await resolveProduct(message, store);
  if (!search) return null;

  if (!products.length) {
    return buildAnswer({
      title: "Product inventory lookup",
      summary: `No active product found for "${search.term}". Try exact barcode, SKU, or full product name.`,
      range,
      cards: [{ label: "Matched products", value: "0" }],
      links: [{ label: "Open product master", href: "/catalog/products" }],
    });
  }

  const exactNameMatches = products.filter(
    (candidate) =>
      normalizeSearchText(candidate.name) === normalizeSearchText(search.term),
  );
  const exactIdentifierMatches = products.filter((candidate) =>
    [candidate.barcode, candidate.sku, candidate.product_id].some(
      (value) =>
        String(value || "").toLowerCase() === search.term.toLowerCase(),
    ),
  );
  const definitiveMatch = exactIdentifierMatches[0] || exactNameMatches[0];

  if (!definitiveMatch && products.length > 1) {
    return buildAnswer({
      title: "Choose a product",
      summary: `${products.length} products matched "${search.term}". Select a product below, or enter its exact name, SKU, or barcode.`,
      range,
      cards: [{ label: "Possible matches", value: String(products.length) }],
      columns: ["Product", "SKU", "Barcode", "Brand", "Category"],
      rows: products.map((candidate) => ({
        Product: candidate.name,
        SKU: candidate.sku || candidate.product_id || "-",
        Barcode: candidate.barcode || "-",
        Brand: candidate.brand,
        Category: candidate.category,
      })),
      links: [{ label: "Open product master", href: "/catalog/products" }],
    });
  }

  const product = definitiveMatch || products[0];
  const params = [product.id];
  const where = ["ps.product_id = $1", "COALESCE(ps.is_active, TRUE) = TRUE"];

  if (store?.id) {
    params.push(Number(store.id));
    where.push(`ps.store_id = $${params.length}`);
  }

  const result = await query(
    `WITH batch_stock AS (
       SELECT product_id, store_id,
              SUM(available_qty) FILTER (WHERE status = 'active' AND available_qty > 0)::float AS available_qty,
              SUM(received_qty) FILTER (WHERE status = 'active' AND available_qty > 0)::float AS received_qty,
              STRING_AGG(DISTINCT batch_no, ', ') FILTER (WHERE status = 'active' AND available_qty > 0) AS batch_no,
              MIN(expiry_date) FILTER (WHERE status = 'active' AND available_qty > 0) AS expiry_date,
              SUM(available_qty * cost_price) FILTER (WHERE status = 'active' AND available_qty > 0)
                / NULLIF(SUM(available_qty) FILTER (WHERE status = 'active' AND available_qty > 0), 0) AS avg_cost
       FROM inventory_batches
       WHERE product_id = $1
       GROUP BY product_id, store_id
     )
     SELECT
       COALESCE(s.name, 'Unknown store') AS store,
       bs.batch_no,
       bs.expiry_date,
       COALESCE(bs.available_qty, 0)::float AS available_qty,
       COALESCE(bs.received_qty, 0)::float AS received_qty,
       COALESCE(NULLIF(ps.mrp, 0), NULLIF(p.mrp, 0), 0)::float AS mrp,
       COALESCE(NULLIF(ps.selling_price, 0), NULLIF(p.selling_price, 0), 0)::float AS selling_price,
       COALESCE(NULLIF(bs.avg_cost, 0), NULLIF(ps.franchise_cost, 0), NULLIF(p.cost_price, 0), 0)::float AS cost_price,
       COALESCE(ps.franchise_cost, 0)::float AS franchise_cost
     FROM product_saleability ps
     JOIN stores s ON s.id = ps.store_id
     JOIN products p ON p.id = ps.product_id
     LEFT JOIN batch_stock bs ON bs.product_id = ps.product_id AND bs.store_id = ps.store_id
     WHERE ${where.join(" AND ")}
     ORDER BY s.name
     LIMIT 50`,
    params,
  );

  const storeTotals = result.rows.reduce((map, row) => {
    const key = row.store || "Unknown store";
    map.set(key, (map.get(key) || 0) + Number(row.available_qty || 0));
    return map;
  }, new Map());
  const totalQty = result.rows.reduce(
    (sum, row) => sum + Number(row.available_qty || 0),
    0,
  );
  const storeSummary = Array.from(storeTotals.entries())
    .map(([name, qty]) => `${name}: ${formatQty(qty)}`)
    .join(", ");
  return buildAnswer({
    title: "Product inventory lookup",
    summary: result.rows.length
      ? `${product.name} (${product.sku || product.product_id || "no SKU"}) is assigned to ${storeTotals.size} location(s). Total available qty: ${formatQty(totalQty)}.${storeSummary ? ` Store-wise: ${storeSummary}.` : ""}`
      : `${product.name} is in product master, but is not actively assigned${store?.name ? ` to ${store.name}` : " to any store"}.`,
    range,
    cards: [
      { label: "Product", value: product.name },
      {
        label: "SKU / Barcode",
        value: product.sku || product.barcode || product.product_id || "-",
      },
      { label: "Total Qty", value: formatQty(totalQty) },
      {
        label: "Brand / Category",
        value: `${product.brand} / ${product.category}`,
      },
    ],
    columns: [
      "Store",
      "Status",
      "Available Qty",
      "Batch",
      "Expiry",
      "MRP",
      "Selling Price",
      "Cost",
      "Franchise Cost",
    ],
    rows: result.rows.map((row) => ({
      Store: row.store,
      Status:
        Number(row.available_qty || 0) <= 0
          ? "Out of stock"
          : Number(row.available_qty || 0) <= 10
            ? "Low stock"
            : "In stock",
      "Available Qty": formatQty(row.available_qty),
      Batch: row.batch_no || "-",
      Expiry: row.expiry_date ? formatDate(new Date(row.expiry_date)) : "-",
      MRP: formatMoney(row.mrp),
      "Selling Price": formatMoney(row.selling_price),
      Cost: formatMoney(row.cost_price),
      "Franchise Cost": formatMoney(row.franchise_cost),
    })),
    links: [
      { label: "Product master", href: `/catalog/products/${product.id}/edit` },
      { label: "Stock level report", href: "/reports/inventory/stock-level" },
    ],
  });
}

async function runStockQuery(range) {
  const params = [range.from, range.to];
  return query(
    `SELECT
       al.created_at,
       COALESCE(NULLIF(TRIM(e.first_name || ' ' || COALESCE(e.last_name, '')), ''), u.name, u.email, 'Unknown') AS employee,
       al.action,
       al.resource_type,
       COALESCE(al.resource_id::text, '-') AS resource_id,
       COALESCE(al.status, '-') AS status
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     LEFT JOIN employees e ON e.user_id = al.user_id
     WHERE al.created_at BETWEEN $1 AND $2
       AND (
         LOWER(COALESCE(al.action, '')) LIKE '%stock%'
         OR LOWER(COALESCE(al.resource_type, '')) LIKE '%stock%'
         OR LOWER(COALESCE(al.resource_type, '')) LIKE '%inventory%'
         OR LOWER(COALESCE(al.resource_type, '')) LIKE '%batch%'
       )
     ORDER BY al.created_at DESC
     LIMIT 30`,
    params,
  );
}

async function getStockAnswer(message, range) {
  await Promise.all([
    ensureCatalogExtrasSchema(),
    ensureInventoryBatchSchema(),
  ]);

  const productInventoryAnswer = await getProductInventoryAnswer(
    message,
    range,
  );
  if (productInventoryAnswer) return productInventoryAnswer;

  let effectiveRange = range;
  let result = await runStockQuery(effectiveRange);

  if (!result.rows.length && !range.explicit) {
    const latestRange = await getLatestRange("audit_logs", "created_at", 7);
    if (latestRange) {
      effectiveRange = latestRange;
      result = await runStockQuery(effectiveRange);
    }
  }

  return buildAnswer({
    title: "Stock operation activity",
    summary: result.rows.length
      ? `${effectiveRange.label}${effectiveRange.fallback ? " (selected date had no stock logs)" : ""}: ${result.rows.length} stock/inventory related activities found.`
      : `No stock audit activity was found for ${effectiveRange.label}. Use the stock movement reports or expiry alerts for an operational view.`,
    range: effectiveRange,
    cards: [
      { label: "Stock logs", value: String(result.rows.length) },
      { label: "Window", value: effectiveRange.label },
    ],
    columns: ["Time", "Employee", "Action", "Resource", "Status"],
    rows: result.rows.map((row) => ({
      Time: formatIndianDateTime(row.created_at, "-"),
      Employee: row.employee,
      Action: row.action || "-",
      Resource: `${row.resource_type || "-"} #${row.resource_id}`,
      Status: row.status,
    })),
    links: [
      {
        label: "Stock operations report",
        href: "/reports/inventory/stock-operations",
      },
      { label: "Near expiry products", href: "/inventory/expiry-alerts" },
    ],
  });
}

async function getExpiryAnswer(message, range) {
  await ensureStockInSchema();
  await ensureInventoryBatchSchema();

  const params = [];
  const where = ["ib.status = 'active'", "ib.available_qty > 0"];
  const store = await resolveStoreFilter(message);
  if (store?.id) {
    params.push(Number(store.id));
    where.push(`ib.store_id = $${params.length}`);
  }

  const result = await query(
    `SELECT
       COUNT(*)::int AS total_batches,
       COALESCE(SUM(ib.available_qty), 0)::float AS total_qty,
       COALESCE(SUM(ib.available_qty * ib.cost_price), 0)::float AS total_value,
       COUNT(*) FILTER (WHERE COALESCE(ib.expiry_date, sii.expiry_date) IS NULL)::int AS missing,
       COUNT(*) FILTER (WHERE COALESCE(ib.expiry_date, sii.expiry_date) < CURRENT_DATE)::int AS expired,
       COUNT(*) FILTER (
         WHERE COALESCE(ib.expiry_date, sii.expiry_date) >= CURRENT_DATE
           AND COALESCE(ib.expiry_date, sii.expiry_date) <= CURRENT_DATE + INTERVAL '3 days'
       )::int AS critical,
       COUNT(*) FILTER (
         WHERE COALESCE(ib.expiry_date, sii.expiry_date) >= CURRENT_DATE
           AND COALESCE(ib.expiry_date, sii.expiry_date) <= CURRENT_DATE + INTERVAL '7 days'
       )::int AS urgent
     FROM inventory_batches ib
     LEFT JOIN stock_in_items sii
       ON ib.source_type = 'stock_in'
      AND NULLIF(ib.source_id, '') ~ '^[0-9]+$'
      AND sii.id = NULLIF(ib.source_id, '')::BIGINT
     WHERE ${where.join(" AND ")}`,
    params,
  );

  const topStores = await query(
    `SELECT
       COALESCE(s.name, 'Unknown store') AS store,
       COUNT(*)::int AS batches,
       COALESCE(SUM(ib.available_qty), 0)::float AS qty,
       COALESCE(SUM(ib.available_qty * ib.cost_price), 0)::float AS value
     FROM inventory_batches ib
     LEFT JOIN stock_in_items sii
       ON ib.source_type = 'stock_in'
      AND NULLIF(ib.source_id, '') ~ '^[0-9]+$'
      AND sii.id = NULLIF(ib.source_id, '')::BIGINT
     LEFT JOIN stores s ON s.id = ib.store_id
     WHERE ${where.join(" AND ")}
       AND (
         COALESCE(ib.expiry_date, sii.expiry_date) IS NULL
         OR COALESCE(ib.expiry_date, sii.expiry_date) <= CURRENT_DATE + INTERVAL '30 days'
       )
     GROUP BY store
     ORDER BY value DESC, batches DESC
     LIMIT 5`,
    params,
  );

  const summary = result.rows[0] || {};
  const scope = store?.name ? ` for ${store.name}` : "";

  return buildAnswer({
    title: "Expiry risk assistant",
    summary: `${summary.total_batches || 0} active risk batch(es)${scope} found. Critical: ${summary.critical || 0}, expired: ${summary.expired || 0}, missing expiry: ${summary.missing || 0}. Use FEFO sell order and avoid replenishing urgent items before old stock clears.`,
    range,
    cards: [
      { label: "Stock value", value: formatMoney(summary.total_value || 0) },
      { label: "Critical", value: String(summary.critical || 0) },
      { label: "Missing expiry", value: String(summary.missing || 0) },
    ],
    columns: ["Store", "Batches", "Qty", "Value"],
    rows: topStores.rows.map((row) => ({
      Store: row.store,
      Batches: row.batches,
      Qty: Number(row.qty || 0).toLocaleString("en-IN", {
        maximumFractionDigits: 3,
      }),
      Value: formatMoney(row.value),
    })),
    links: [
      { label: "Open Near Expiry dashboard", href: "/inventory/expiry-alerts" },
    ],
  });
}

function getHelpAnswer(range) {
  return buildAnswer({
    title: "Admin Assistant",
    summary:
      'Ask about product availability, sales performance, employee activity, stock operations, or expiry risk. Examples: "Tata Tea Premium 1kg in store 2", "top cashier for the last 7 days", "activity by Ramesh on 1 June", or "near-expiry products".',
    range,
    cards: [
      { label: "Sales", value: "employee/store wise" },
      { label: "Activity", value: "audit trail" },
      { label: "Expiry", value: "risk dashboard" },
    ],
  });
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const roleCheck = requireRole(auth.user, "super_admin");
    if (roleCheck.error) return roleCheck.error;

    const body = await request.json().catch(() => ({}));
    const message = String(body?.message || "").trim();
    if (!message) return validationError("Message is required");

    await Promise.all([
      ensureSalesBillingSchema(),
      ensureAuditLogsSchema(),
      ensureEmployeesSchema(),
    ]);

    const range = parseDateRange(message);
    let intent = parseIntent(message);
    let response;

    if (intent === "sales") response = await getSalesAnswer(message, range);
    else if (intent === "activity")
      response = await getActivityAnswer(message, range);
    else if (intent === "stock")
      response = await getStockAnswer(message, range);
    else if (intent === "expiry") {
      // A product-specific expiry question should return that product's nearest
      // batch expiry, not the chain-wide expiry dashboard.
      await Promise.all([
        ensureCatalogExtrasSchema(),
        ensureInventoryBatchSchema(),
      ]);
      const candidate = await resolveProduct(
        message,
        await resolveStoreFilter(message),
      );
      if (candidate.products.length) {
        intent = "product";
        response = await getProductInventoryAnswer(message, range);
      } else {
        response = await getExpiryAnswer(message, range);
      }
    } else {
      // A bare product name has no stock keyword, so probe the catalog before
      // falling back to help. This keeps greetings/general questions harmless
      // while making queries such as "Tata Tea Premium 1kg" useful.
      await Promise.all([
        ensureCatalogExtrasSchema(),
        ensureInventoryBatchSchema(),
      ]);
      const candidate = await resolveProduct(message);
      if (candidate.products.length) {
        intent = "product";
        response = await getProductInventoryAnswer(message, range);
      } else {
        response = getHelpAnswer(range);
      }
    }

    return successResponse({ intent, ...response }, "Assistant response ready");
  } catch (err) {
    console.error("[ADMIN_ASSISTANT] Error:", err);
    return errorResponse(err.message || "Unable to answer right now", 500, err);
  }
}
