const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class VendorCreditTermsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "VendorCreditTermsError";
    this.status = status;
  }
}

export function normalizeDateOnly(value) {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  if (!DATE_ONLY_PATTERN.test(text)) return "";
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text
    ? ""
    : text;
}

export function getIndiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addCalendarDays(dateValue, days) {
  const date = normalizeDateOnly(dateValue);
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
}

export async function resolveVendorPaymentTerms(
  db,
  { vendorId, paymentDueDate, baseDate, creditDaysOverride } = {},
) {
  const vendor = await db.query(
    `SELECT id, name, credit_days, is_active FROM vendors WHERE id = $1`,
    [vendorId],
  );
  if (!vendor.rows[0]) {
    throw new VendorCreditTermsError("Vendor not found", 404);
  }
  if (vendor.rows[0].is_active === false) {
    throw new VendorCreditTermsError("The selected vendor is inactive");
  }

  const startDate = normalizeDateOnly(baseDate) || getIndiaDate();
  if (baseDate && !normalizeDateOnly(baseDate)) {
    throw new VendorCreditTermsError("Enter a valid purchase order date");
  }
  const requestedDate = paymentDueDate ? normalizeDateOnly(paymentDueDate) : "";
  if (paymentDueDate && !requestedDate) {
    throw new VendorCreditTermsError("Enter a valid payment due date");
  }

  const rawCreditDays = creditDaysOverride ?? vendor.rows[0].credit_days;
  const creditDays = rawCreditDays == null ? null : Number(rawCreditDays);
  if (!Number.isInteger(creditDays) || creditDays <= 0) {
    return {
      vendorName: vendor.rows[0].name,
      creditDays: null,
      baseDate: startDate,
      maximumDueDate: null,
      paymentDueDate: requestedDate || null,
    };
  }

  const maximumDueDate = addCalendarDays(startDate, creditDays);
  const resolvedDueDate = requestedDate || maximumDueDate;
  if (resolvedDueDate < startDate) {
    throw new VendorCreditTermsError(
      `Payment due date cannot be before the purchase order date (${startDate})`,
    );
  }
  if (resolvedDueDate > maximumDueDate) {
    throw new VendorCreditTermsError(
      `${vendor.rows[0].name} allows a maximum of ${creditDays} credit days. Payment due date cannot be after ${maximumDueDate}.`,
    );
  }

  return {
    vendorName: vendor.rows[0].name,
    creditDays,
    baseDate: startDate,
    maximumDueDate,
    paymentDueDate: resolvedDueDate,
  };
}

