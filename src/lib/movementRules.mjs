export const roundQty = (value) => Math.round(Number(value) * 1000) / 1000;

export function quantity(value, name = 'Quantity', allowZero = true) {
  const n = Number(value);
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'string' && !value.trim()) || !Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || Math.abs(n - roundQty(n)) > 0.0000001) {
    throw new Error(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} number with at most 3 decimals`);
  }
  return roundQty(n);
}

// Receipts are incremental, never cumulative. Short is an explicit final shortage,
// not the quantity still expected on a later vehicle.
export function receiptQuantities(line, pending) {
  const received = quantity(line.received, 'Received');
  const accepted = quantity(line.accepted, 'Accepted');
  const damaged = quantity(line.damaged, 'Damaged');
  const rejected = quantity(line.rejected, 'Rejected');
  const short = quantity(line.short, 'Short');
  const excess = quantity(line.excess, 'Excess');
  if (roundQty(accepted + damaged + rejected) !== received) throw new Error('Accepted + damaged + rejected must equal received');
  const settled = roundQty(received + short - excess);
  if (excess > received || settled < 0 || settled > roundQty(pending)) throw new Error('Receipt exceeds the outstanding dispatch quantity');
  if (received + short <= 0) throw new Error('Enter a received or short quantity');
  return { received, accepted, damaged, rejected, short, excess, settled };
}

export function transferState(items, openCases) {
  const pending = roundQty(items.reduce((sum, row) => {
    const outstanding = roundQty(quantity(row.dispatched_qty) - quantity(row.received_qty) - quantity(row.short_qty) + quantity(row.excess_qty));
    if (outstanding < 0) throw new Error('Transfer line quantities do not reconcile');
    return sum + outstanding;
  }, 0));
  return pending > 0 ? 'partially_received' : openCases > 0 ? 'under_dispute' : 'closed';
}

export function requestSignature(value) {
  const normalize = (input) => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input).sort()
      .filter(key => key !== 'requestKey' && input[key] !== undefined)
      .map(key => [key, normalize(input[key])]));
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function transferPrices(item, allocation = {}) {
  const positive = (value, fallback = 0) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  return {
    costPrice: allocation.costPrice == null ? Number(item.cost_price || 0) : Number(allocation.costPrice),
    mrp: positive(item.destination_mrp, positive(item.mrp, positive(allocation.mrp))),
    sellingPrice: positive(item.selling_price, positive(allocation.sellingPrice)),
  };
}

export function splitReceipt(allocations, count, offset = 0) {
  let remaining = quantity(count), skip = quantity(offset);
  const result = [];
  for (const allocation of allocations) {
    const qty = quantity(allocation.qty);
    if (skip >= qty) { skip = roundQty(skip - qty); continue; }
    const take = Math.min(roundQty(qty - skip), remaining);
    if (take > 0) result.push({ ...allocation, qty: take });
    remaining = roundQty(remaining - take); skip = 0;
    if (!remaining) break;
  }
  if (remaining > 0) throw new Error('Receipt exceeds its source batch allocations');
  return result;
}
