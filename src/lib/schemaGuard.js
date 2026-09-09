/**
 * schemaGuard.js
 *
 * Prevents concurrent schema-init calls from causing PostgreSQL deadlocks.
 *
 * Problem: Multiple simultaneous API requests each call `ensureFooSchema()`.
 * All pass the `if (ensured) return;` check before any query resolves,
 * so they all fire the same DDL concurrently → AccessExclusiveLock deadlock.
 *
 * Solution: Store a per-key Promise on globalThis.
 *   - Already done?     → return immediately (flag)
 *   - Already running?  → return the same in-flight Promise (mutex)
 *   - New call?         → start the Promise, store it, run the fn
 *
 * Usage:
 *   import { makeSchemaEnsurer } from '@/lib/schemaGuard';
 *   import { query } from '@/lib/db';
 *
 *   export const ensureFooSchema = makeSchemaEnsurer('foo', () => query(`...`));
 *   export const ensureFooSchema = makeSchemaEnsurer('foo', 2, () => query(`...`));
 */

const g = globalThis;

/**
 * @param {string}           key       Unique key for this schema (e.g. 'customers')
 * @param {number|() => Promise<any>} versionOrFn Schema version or DDL function
 * @param {() => Promise<any>} [maybeFn] Async function that runs the DDL
 * @returns {() => Promise<void>}  Thread-safe schema ensurer
 */
export function makeSchemaEnsurer(key, versionOrFn, maybeFn) {
  const hasVersion = typeof versionOrFn !== 'function';
  const version = hasVersion ? versionOrFn : 1;
  const fn = hasVersion ? maybeFn : versionOrFn;
  const normalizedKey = `${key}_v${version}`;
  const doneKey  = `_schemaEnsured_${normalizedKey}`;
  const promKey  = `_schemaPromise_${normalizedKey}`;

  return async function ensureSchema() {
    // Already completed in this process (survives hot-reload via globalThis)
    if (g[doneKey]) return;

    // Already in-flight — share the same promise (prevents concurrent DDL)
    if (g[promKey]) return g[promKey];

    // First caller — start the work
    g[promKey] = fn()
      .then(() => {
        g[doneKey] = true;
      })
      .finally(() => {
        // Clear the promise slot so errors allow a clean retry
        g[promKey] = null;
      });

    return g[promKey];
  };
}
