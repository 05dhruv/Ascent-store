/** Lazy-load xlsx so list pages do not pay the full parse cost on first paint. */
let xlsxModule = null;

export async function loadXlsx() {
  if (!xlsxModule) {
    const mod = await import("xlsx");
    xlsxModule = mod.default || mod;
  }
  return xlsxModule;
}

/** Synchronous access for helpers that only run after a caller awaited loadXlsx(). */
export function getLoadedXlsx() {
  if (!xlsxModule) {
    throw new Error("Spreadsheet library is not loaded yet. Please try again.");
  }
  return xlsxModule;
}
