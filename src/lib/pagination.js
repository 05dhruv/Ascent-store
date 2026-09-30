import * as XLSX from "xlsx";

// Lookup tables (brands, categories, taxes…) feed full dropdown lists.
export const LOOKUP_MAX_PAGE_SIZE = 5000;
// Transactional lists (returns, credit, ledgers…) must paginate.
export const LIST_MAX_PAGE_SIZE = 500;

export function clampPageSize(raw, { fallback = 10, max = LIST_MAX_PAGE_SIZE } = {}) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return Math.min(fallback, max);
  return Math.min(n, max);
}

export function clampPage(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export const EXPORT_MAX_ROWS = 50000;

/**
 * Reads `page`, `pageSize` and `format` from the query string.
 * - Paged request (`page` present): LIMIT pageSize OFFSET (page-1)*pageSize.
 * - Export request (`format=xlsx`): up to EXPORT_MAX_ROWS rows, no offset.
 * - Legacy request (neither): keeps the old fixed cap so existing callers
 *   (dropdowns, other screens) behave as before.
 */
export function getPagination(
  searchParams,
  { defaultPageSize = 25, maxPageSize = 200, legacyLimit = 200 } = {},
) {
  const format = String(searchParams.get("format") || "").toLowerCase();
  const isExport = format === "xlsx" || format === "csv";
  const paged = searchParams.has("page") && !isExport;
  const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
  const requested = Math.floor(Number(searchParams.get("pageSize")) || defaultPageSize);
  const pageSize = Math.min(Math.max(requested, 1), maxPageSize);

  if (isExport) {
    return { paged: false, isExport, format, page: 1, pageSize: EXPORT_MAX_ROWS, limit: EXPORT_MAX_ROWS, offset: 0 };
  }
  if (paged) {
    return { paged, isExport, format, page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
  }
  return { paged, isExport, format, page: 1, pageSize: legacyLimit, limit: legacyLimit, offset: 0 };
}

/**
 * Returns `LIMIT $n OFFSET $n+1` and pushes the two values onto `params`.
 * Pass `null` as limit to skip the LIMIT entirely.
 */
export function limitOffsetSql(pagination, params) {
  if (pagination.limit == null) return "";
  params.push(pagination.limit, pagination.offset);
  return `LIMIT $${params.length - 1} OFFSET $${params.length}`;
}

/**
 * Strips the `__total` window column (from `COUNT(*) OVER() AS __total`)
 * and builds the list payload used by paged screens.
 */
export function pagedPayload(rows, pagination, extra = {}) {
  const total = rows.length ? Number(rows[0].__total) || 0 : 0;
  const records = rows.map(({ __total, ...rest }) => rest);
  const effectiveTotal = pagination.paged ? total : Math.max(total, records.length);
  return {
    records,
    total: effectiveTotal,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.max(1, Math.ceil(effectiveTotal / pagination.pageSize)),
    ...extra,
  };
}

function formatCell(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace("T", " ");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/**
 * Builds an .xlsx (or .csv) download on the server.
 * `columns` = [{ key, label, value?(row) }]. Omit to export every field.
 */
export function spreadsheetResponse(rows, { columns, filename = "export", format = "xlsx", sheetName = "Data" } = {}) {
  const cleanRows = rows.map(({ __total, ...rest }) => rest);
  const cols =
    columns ||
    Object.keys(cleanRows[0] || {}).map((key) => ({ key, label: key }));
  const data = cleanRows.map((row) =>
    Object.fromEntries(
      cols.map((col) => [col.label, formatCell(col.value ? col.value(row) : row[col.key])]),
    ),
  );
  const sheet = XLSX.utils.json_to_sheet(data, { header: cols.map((c) => c.label) });
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = `${String(filename).replace(/[^\w-]+/g, "_")}_${stamp}`;

  if (format === "csv") {
    return new Response(XLSX.utils.sheet_to_csv(sheet), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
