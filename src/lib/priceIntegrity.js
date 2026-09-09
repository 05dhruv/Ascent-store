function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Single server-side guard for every CP/SP/MRP write. Zero is supported for
 * drafts and free promotional lines; a positive selling/cost price requires a
 * positive MRP and can never exceed it.
 */
export function validatePriceSet({ mrp = 0, sellingPrice = 0, costPrice = 0 } = {}) {
  const normalized = {
    mrp: numberOrZero(mrp),
    sellingPrice: numberOrZero(sellingPrice),
    costPrice: numberOrZero(costPrice),
  };
  if (Object.values(normalized).some((value) => value < 0)) {
    return { valid: false, error: "MRP, selling price and cost price cannot be negative", values: normalized };
  }
  if (normalized.mrp > 0 && normalized.sellingPrice > normalized.mrp) {
    return { valid: false, error: "Selling price cannot be greater than MRP", values: normalized };
  }
  if (normalized.mrp > 0 && normalized.costPrice > normalized.mrp) {
    return { valid: false, error: "Cost price cannot be greater than MRP", values: normalized };
  }
  if (normalized.mrp === 0 && (normalized.sellingPrice > 0 || normalized.costPrice > 0)) {
    return { valid: false, error: "MRP is required when selling price or cost price is entered", values: normalized };
  }
  return { valid: true, values: normalized };
}

export function assertValidPrices(prices, context = "Price") {
  const result = validatePriceSet(prices);
  if (!result.valid) throw new Error(`${context}: ${result.error}`);
  return result.values;
}

/** Batch data is the authority for a received/transferred item. */
export function resolveEffectiveBatchPrice(batch = {}, fallback = {}) {
  const meta = batch.meta || {};
  return {
    mrp: numberOrZero(meta.mrp ?? batch.mrp ?? fallback.mrp),
    sellingPrice: numberOrZero(meta.sellingPrice ?? batch.selling_price ?? fallback.sellingPrice ?? fallback.selling_price),
    costPrice: numberOrZero(meta.costPrice ?? batch.cost_price ?? fallback.costPrice ?? fallback.cost_price),
    source: batch.id ? "batch" : fallback.source || "default",
  };
}
