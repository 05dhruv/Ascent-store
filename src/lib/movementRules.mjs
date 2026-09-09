export const roundQty = (value) => Math.round(Number(value) * 1000) / 1000;

export function quantity(value, name = 'Quantity', allowZero = true) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || Math.abs(n - roundQty(n)) > 0.0000001) {
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
  const pending = roundQty(items.reduce((sum, row) => sum + Number(row.dispatched_qty) - Number(row.received_qty) - Number(row.short_qty) + Number(row.excess_qty), 0));
  if (pending < 0) throw new Error('Transfer quantities do not reconcile');
  return pending > 0 ? 'partially_received' : openCases > 0 ? 'under_dispute' : 'closed';
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
