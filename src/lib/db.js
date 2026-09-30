import { Pool } from "pg";

// Singleton pool — reuse across hot reloads in dev
const globalForPg = globalThis;

if (!globalForPg._pgPool) {
  const poolMax = Number(process.env.PG_POOL_MAX || 20);
  const idleTimeoutMs = Number(process.env.PG_IDLE_TIMEOUT_MS || 30000);
  const connectTimeoutMs = Number(process.env.PG_CONNECT_TIMEOUT_MS || 25000);
  const statementTimeoutMs = Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 60000);
  const idleTxTimeoutMs = Number(process.env.PG_IDLE_TX_TIMEOUT_MS ?? 60000);
  const databaseUrl =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  const useSsl =
    String(process.env.DB_SSL || "").toLowerCase() === "true" ||
    /sslmode=require/i.test(databaseUrl);
  const ssl = useSsl ? { rejectUnauthorized: false } : false;

  const baseConfig = databaseUrl
    ? { connectionString: databaseUrl }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || "buyzaar_sync",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
      };

  globalForPg._pgPool = new Pool({
    ...baseConfig,
    ssl,
    max: Number.isFinite(poolMax) ? poolMax : 20,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30000,
    connectionTimeoutMillis: Number.isFinite(connectTimeoutMs)
      ? connectTimeoutMs
      : 10000,
    // 0 disables. Stops one runaway query / leaked transaction from pinning
    // a pool connection (and its row locks) forever.
    ...(Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0
      ? { statement_timeout: statementTimeoutMs }
      : {}),
    ...(Number.isFinite(idleTxTimeoutMs) && idleTxTimeoutMs > 0
      ? { idle_in_transaction_session_timeout: idleTxTimeoutMs }
      : {}),
  });

  globalForPg._pgPool.on("error", (err) => {
    console.error("PostgreSQL Pool Error:", err);
  });
}

const pool = globalForPg._pgPool;
const shouldLogQueries =
  process.env.NODE_ENV !== "production" || process.env.DEBUG_SQL === "true";

const CONNECTION_FAILURE_CODES = new Set([
  "57P01",
  "57P02",
  "57P03",
  "08000",
  "08001",
  "08003",
  "08006",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
]);

// The statement may already have committed when the socket drops mid-flight,
// so only statements that are safe to run twice are retried in that case.
function isIdempotentStatement(text) {
  const sql = String(text || "").replace(/^\s*(--[^\n]*\n\s*)*/, "").trim();
  if (/\bIF\s+NOT\s+EXISTS\b/i.test(sql) && /^(CREATE|ALTER)\b/i.test(sql)) return true;
  if (!/^(SELECT|WITH|SHOW|EXPLAIN)\b/i.test(sql)) return false;
  return !/\b(INSERT|UPDATE|DELETE|MERGE|nextval|setval)\b/i.test(sql);
}

// Failures that happen before the statement reaches the server.
function isPreSendFailure(err) {
  return (
    err.code === "ECONNREFUSED" ||
    /timeout exceeded when trying to connect/i.test(err.message || "")
  );
}

/**
 * Run a query with automatic retry.
 * Deadlock/serialization failures roll the statement back, so they are always
 * retried; mid-flight connection drops are retried only for idempotent SQL.
 *
 * @param {string} text   - SQL query
 * @param {any[]}  params - Query parameters ($1, $2 …)
 * @param {object} opts   - { maxRetries?: number }
 */
export async function query(text, params = [], { maxRetries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (shouldLogQueries) {
        console.log(`[DB] ${duration}ms — ${text.substring(0, 80)}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      const connectionFailure =
        CONNECTION_FAILURE_CODES.has(err.code) ||
        /connection (?:terminated|timeout|timed out|reset)|socket hang up/i.test(
          err.message || "",
        );
      const isRetryable =
        err.code === "40P01" ||
        err.code === "40001" ||
        isPreSendFailure(err) ||
        (connectionFailure && isIdempotentStatement(text));
      if (isRetryable && attempt < maxRetries) {
        const delayMs = 80 * Math.pow(2, attempt); // 80ms → 160ms → 320ms
        console.warn(
          `[DB] Retryable error (${err.code}) on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delayMs}ms…`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      console.error("[DB ERROR]", err.message, "\nQuery:", text);
      throw err;
    }
  }
  // Should never reach here, but satisfy linter
  throw lastErr;
}

/**
 * Get a client for transactions
 */
export async function getClient() {
  return await pool.connect();
}

export default pool;
