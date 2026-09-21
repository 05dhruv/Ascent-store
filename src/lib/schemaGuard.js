/**
 * schemaGuard.js
 *
 * Prevents concurrent schema-init calls from causing PostgreSQL deadlocks.
 * Also supports boot-time warming so hot APIs avoid DDL mid-request.
 */

const g = globalThis;

/**
 * @param {string}           key       Unique key for this schema (e.g. 'customers')
 * @param {number|() => Promise<any>} versionOrFn Schema version or DDL function
 * @param {() => Promise<any>} [maybeFn] Async function that runs the DDL
 * @returns {() => Promise<void>}  Thread-safe schema ensurer
 */
export function makeSchemaEnsurer(key, versionOrFn, maybeFn) {
  const hasVersion = typeof versionOrFn !== "function";
  const version = hasVersion ? versionOrFn : 1;
  const fn = hasVersion ? maybeFn : versionOrFn;
  const normalizedKey = `${key}_v${version}`;
  const doneKey = `_schemaEnsured_${normalizedKey}`;
  const promKey = `_schemaPromise_${normalizedKey}`;

  return async function ensureSchema() {
    if (g[doneKey]) return;
    if (g[promKey]) return g[promKey];

    g[promKey] = fn()
      .then(() => {
        g[doneKey] = true;
      })
      .finally(() => {
        g[promKey] = null;
      });

    return g[promKey];
  };
}

/** Register ensurers that should run at process boot. */
export function registerBootSchemas(ensurers) {
  const list = Array.isArray(ensurers)
    ? ensurers.filter((fn) => typeof fn === "function")
    : [];
  g._schemaBootRegistry = [...(g._schemaBootRegistry || []), ...list];
}

export function schemasReady() {
  return Boolean(g._schemasWarmed);
}

/**
 * Warm all registered (and optional extra) ensurers once per process.
 */
export async function warmSchemas(extraEnsurers = []) {
  if (g._schemasWarmed) return;
  if (g._schemasWarmPromise) return g._schemasWarmPromise;

  g._schemasWarmPromise = (async () => {
    const ensurers = [
      ...(g._schemaBootRegistry || []),
      ...(Array.isArray(extraEnsurers) ? extraEnsurers : []),
    ];
    await Promise.allSettled(ensurers.map((fn) => fn()));
    g._schemasWarmed = true;
  })().finally(() => {
    g._schemasWarmPromise = null;
  });

  return g._schemasWarmPromise;
}

/**
 * Hot-path helper: if schemas are not warmed and NODE_ENV is production,
 * skip DDL and let the caller return 503. In development, run warmSchemas.
 */
export async function ensureHotPathSchemas(ensurers = []) {
  if (schemasReady()) {
    return { ready: true };
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_REQUEST_SCHEMA !== "true"
  ) {
    warmSchemas(ensurers).catch(() => {});
    return {
      ready: false,
      status: 503,
      message: "Database schema warming — retry shortly",
    };
  }

  await warmSchemas(ensurers);
  return { ready: true };
}
