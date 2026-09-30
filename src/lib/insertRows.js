/**
 * Multi-row INSERT in chunks (stays well under Postgres' 65535 bind-parameter limit).
 * `rows` are value arrays ordered like `columns`; `casts` maps column -> SQL type;
 * `literals` maps extra column -> SQL expression appended to every row (e.g. NOW()).
 */
export async function insertRows(db, table, columns, rows, { casts = {}, literals = {}, chunkSize = 500 } = {}) {
  if (!rows.length) return;
  const literalColumns = Object.keys(literals);
  const columnSql = [...columns, ...literalColumns].join(", ");
  for (let start = 0; start < rows.length; start += chunkSize) {
    const params = [];
    const tuples = rows.slice(start, start + chunkSize).map((row) => {
      const placeholders = columns.map((column, index) => {
        params.push(row[index]);
        return casts[column] ? `$${params.length}::${casts[column]}` : `$${params.length}`;
      });
      return `(${[...placeholders, ...literalColumns.map((column) => literals[column])].join(", ")})`;
    });
    await db.query(`INSERT INTO ${table} (${columnSql}) VALUES ${tuples.join(", ")}`, params);
  }
}
