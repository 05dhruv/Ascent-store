import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Dev-only request timing. Enabled outside production, or in production with DEBUG_PERF=1.
 * Logs total / DB / processing time per wrapped route and sets a Server-Timing header.
 * DB time is the sum of query durations, so it can exceed wall time when queries run in parallel.
 */
export const perfEnabled =
  process.env.NODE_ENV !== "production" || process.env.DEBUG_PERF === "1";

const storage = perfEnabled ? new AsyncLocalStorage() : null;

export function getPerfStore() {
  return storage?.getStore() || null;
}

export function recordDbTime(store, startedAt) {
  if (!store) return;
  store.dbMs += performance.now() - startedAt;
  store.queries += 1;
}

export function withPerfTiming(label, handler) {
  if (!perfEnabled) return handler;
  return async function timedHandler(...args) {
    if (storage.getStore()) return handler(...args);
    const store = { dbMs: 0, queries: 0 };
    const startedAt = performance.now();
    const response = await storage.run(store, () => handler(...args));
    const totalMs = performance.now() - startedAt;
    const processingMs = Math.max(0, totalMs - store.dbMs);
    console.log(
      `[perf] ${label} total=${totalMs.toFixed(0)}ms db=${store.dbMs.toFixed(0)}ms (${store.queries} queries) processing~${processingMs.toFixed(0)}ms status=${response?.status ?? "-"}`,
    );
    try {
      response?.headers?.set(
        "Server-Timing",
        `total;dur=${totalMs.toFixed(1)}, db;dur=${store.dbMs.toFixed(1)}`,
      );
    } catch {
      // Some responses have immutable headers; the log line is enough.
    }
    return response;
  };
}
