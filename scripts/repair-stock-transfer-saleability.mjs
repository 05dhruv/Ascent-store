import fs from 'node:fs';
import { Pool } from 'pg';

function loadEnv() {
  if (!fs.existsSync('.env')) return {};
  return Object.fromEntries(
    fs.readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const env = { ...loadEnv(), ...process.env };
const pool = new Pool(
  env.DATABASE_URL || env.POSTGRES_URL
    ? {
        connectionString: env.DATABASE_URL || env.POSTGRES_URL,
        ssl: String(env.DB_SSL || '').toLowerCase() === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
      }
    : {
        host: env.DB_HOST || 'localhost',
        port: Number(env.DB_PORT || 5432),
        database: env.DB_NAME || 'buyzaar_sync',
        user: env.DB_USER || 'postgres',
        password: env.DB_PASSWORD || '',
      },
);

const latestTransferPricesSql = `
  WITH latest AS (
    SELECT DISTINCT ON (sti.product_id, st.destination_id)
      sti.product_id,
      st.destination_id AS store_id,
      sti.selling_price,
      COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) AS mrp,
      st.transaction_id,
      COALESCE(st.confirmed_at, st.created_at) AS confirmed_at
    FROM stock_transfer st
    INNER JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
    WHERE st.status = 'confirmed'
      AND st.destination_id IS NOT NULL
      AND (
        COALESCE(sti.selling_price, 0) > 0
        OR COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
      )
    ORDER BY
      sti.product_id,
      st.destination_id,
      COALESCE(st.confirmed_at, st.created_at) DESC,
      sti.id DESC
  )
`;

async function main() {
  const apply = process.argv.includes('--apply');
  const client = await pool.connect();

  try {
    if (!apply) {
      const preview = await client.query(`
        ${latestTransferPricesSql}
        SELECT
          COUNT(*)::int AS rows_to_upsert,
          COUNT(*) FILTER (WHERE ps.id IS NULL)::int AS missing_saleability,
          COUNT(*) FILTER (
            WHERE ps.id IS NOT NULL
              AND (
                COALESCE(ps.selling_price, 0) IS DISTINCT FROM COALESCE(latest.selling_price, 0)
                OR COALESCE(ps.mrp, 0) IS DISTINCT FROM COALESCE(latest.mrp, 0)
                OR ps.is_active IS DISTINCT FROM TRUE
              )
          )::int AS different_saleability
        FROM latest
        LEFT JOIN product_saleability ps
          ON ps.product_id = latest.product_id
         AND ps.store_id = latest.store_id
      `);
      console.log(JSON.stringify(preview.rows[0], null, 2));
      return;
    }

    await client.query('BEGIN');
    const result = await client.query(`
      ${latestTransferPricesSql}
      INSERT INTO product_saleability (
        product_id, store_id, is_active, selling_price, mrp, low_stock_value, created_at, updated_at
      )
      SELECT
        product_id,
        store_id,
        true,
        COALESCE(selling_price, 0),
        COALESCE(mrp, 0),
        0,
        NOW(),
        NOW()
      FROM latest
      ON CONFLICT (product_id, store_id)
      DO UPDATE SET
        is_active = true,
        selling_price = CASE
          WHEN EXCLUDED.selling_price > 0 THEN EXCLUDED.selling_price
          ELSE product_saleability.selling_price
        END,
        mrp = CASE
          WHEN EXCLUDED.mrp > 0 THEN EXCLUDED.mrp
          ELSE product_saleability.mrp
        END,
        updated_at = NOW()
    `);
    await client.query('COMMIT');
    console.log(JSON.stringify({ repairedRows: result.rowCount }, null, 2));
  } catch (error) {
    if (apply) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
