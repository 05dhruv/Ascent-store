"use client";

export function TableEmpty({ colSpan, message = "No records yet." }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-10 text-center text-[13px] text-slate-400"
      >
        {message}
      </td>
    </tr>
  );
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

/**
 * Two ways to use it:
 *  - Data mode: `columns=[{ key, label, render?, align?, className? }]` + `rows`.
 *  - Markup mode: `headers=["A", "B"]` + your own <tr> children.
 */
export default function DataTable({
  columns,
  rows,
  headers,
  rowKey = "id",
  loading = false,
  emptyMessage = "No records yet.",
  onRowClick,
  empty,
  className = "",
  children,
}) {
  const heads = columns
    ? columns.map((column) => ({
        key: column.key,
        label: column.label,
        align: column.align,
      }))
    : (headers || []).map((label, index) => ({ key: `${label}-${index}`, label }));
  const colSpan = heads.length || 1;

  let body = children;
  if (columns) {
    if (loading) {
      body = <TableEmpty colSpan={colSpan} message="Loading..." />;
    } else if (!rows?.length) {
      body = <TableEmpty colSpan={colSpan} message={emptyMessage} />;
    } else {
      body = rows.map((row, index) => (
        <tr
          key={typeof rowKey === "function" ? rowKey(row, index) : (row[rowKey] ?? index)}
          className={`hover:bg-slate-50/80 ${onRowClick ? "cursor-pointer" : ""}`}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
        >
          {columns.map((column) => (
            <td
              key={column.key}
              className={`px-4 py-3 text-slate-700 ${ALIGN[column.align] || ""} ${column.className || ""}`}
            >
              {column.render ? column.render(row, index) : (row[column.key] ?? "—")}
            </td>
          ))}
        </tr>
      ));
    }
  }

  return (
    <div
      className={`overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm ${className}`}
    >
      <table className="min-w-full text-left text-[13px]">
        <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {heads.map((head) => (
              <th
                key={head.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 ${ALIGN[head.align] || ""}`}
              >
                {head.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{body}</tbody>
      </table>
      {empty}
    </div>
  );
}
