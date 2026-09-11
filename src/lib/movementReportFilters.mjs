export function parseMovementFilters(searchParams) {
  const id = key => {
    const value = searchParams.get(key);
    if (!value) return null;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid ${key}`);
    return Number(value);
  };
  const date = key => {
    const value = searchParams.get(key);
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid ${key} date`);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw new Error(`Invalid ${key} date`);
    return value;
  };
  const from = date('from'), to = date('to');
  if (from && to && from > to) throw new Error('Start date must be on or before end date');
  return {store:id('store'), project:id('project'), from, to, search:(searchParams.get('search') || '').trim().slice(0,200)};
}
