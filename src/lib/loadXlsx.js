/** Lazy-load xlsx so list pages do not pay the full parse cost on first paint. */
export async function loadXlsx() {
  const mod = await import("xlsx");
  return mod.default || mod;
}
