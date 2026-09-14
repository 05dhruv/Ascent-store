"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { generateQRDataURL, getInvoiceURL } from "@/lib/qrService";
import { validatePhoneNumber } from "@/lib/phoneValidator";
import { useRouter } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { fetchAuthEndpoint } from "@/lib/auth-endpoints";
import { formatIndianDate, formatIndianDateTime } from "@/lib/dateUtils";

// ============================================================================
// UTILITIES
// ============================================================================

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUnit(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function getWeightedUnitKind(unit) {
  const normalized = normalizeUnit(unit).replace(/[\s_-]+/g, "");
  if (!normalized) return null;
  if (
    ["G", "GM", "GMS", "GRAM", "GRAMS", "GRM", "GRMS"].includes(normalized) ||
    normalized.includes("GRAM")
  ) {
    return "GRAMS";
  }
  if (
    ["KG", "KGS", "KILOGRAM", "KILOGRAMS", "KILO", "KILOS"].includes(
      normalized,
    ) ||
    normalized.includes("KG") ||
    normalized.includes("KILO")
  ) {
    return "KG";
  }
  return null;
}

function isWeightedUnit(unit) {
  return Boolean(getWeightedUnitKind(unit));
}

function getScaleQuantityForUnit(weightKg, weightedUnit) {
  const normalizedWeight = Number(Number(weightKg || 0).toFixed(3));
  if (normalizedWeight <= 0) return 0;
  return weightedUnit === "GRAMS"
    ? Number((normalizedWeight * 1000).toFixed(3))
    : normalizedWeight;
}

function getManualWeightedQuantity(weightedUnit) {
  return weightedUnit === "KG" ? 0.001 : 1;
}

function formatScaleWeight(weightKg) {
  const normalizedWeight = Number(Number(weightKg || 0).toFixed(3));
  if (!Number.isFinite(normalizedWeight) || normalizedWeight <= 0) {
    return "0 g";
  }
  if (normalizedWeight < 1) {
    return `${Math.round(normalizedWeight * 1000)} g`;
  }
  return `${normalizedWeight.toFixed(3)} KG`;
}

function isAndroidRuntime() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

const EAGLE_SCALE_SERIAL_OPTIONS = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
};
const SCALE_BAUD_RATES = [9600, 4800, 2400, 19200, 38400, 115200];
const POS_PRODUCT_PAGE_SIZE = 500;

function createCartSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function signedByte(value) {
  return value > 127 ? value - 256 : value;
}

function getBytes(data) {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(
    data.buffer || data,
    data.byteOffset || 0,
    data.byteLength,
  );
}

function getHexPreview(data) {
  return Array.from(getBytes(data))
    .slice(0, 24)
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

function isUsefulScaleText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  return replacementCount === 0 || replacementCount < text.length / 4;
}

function getPrintablePreview(data) {
  return new TextDecoder()
    .decode(data)
    .replace(/[^\x20-\x7E\r\n]/g, ".")
    .trim()
    .slice(0, 80);
}

function getAsciiFromBytes(data, allowedOnly = false) {
  const bytes = getBytes(data);
  return Array.from(bytes)
    .map((byte) => {
      if (byte >= 0x20 && byte <= 0x7e) {
        const char = String.fromCharCode(byte);
        return !allowedOnly || /[\d+\-.a-zA-Z\s]/.test(char) ? char : " ";
      }
      return " ";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseScaleWeightFromBytes(data) {
  const bytes = getBytes(data);
  if (!bytes.length) return null;

  const candidates = [
    getAsciiFromBytes(bytes),
    getAsciiFromBytes(bytes, true),
    new TextDecoder().decode(bytes),
  ];

  try {
    candidates.push(new TextDecoder("utf-16le").decode(bytes));
  } catch {}

  for (const candidate of candidates) {
    const parsed = parseScaleWeight(candidate);
    if (parsed !== null && parsed >= 0 && parsed <= 30) return parsed;
  }

  const digits = Array.from(bytes)
    .filter((byte) => byte >= 0x30 && byte <= 0x39)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  if (digits.length >= 3 && digits.length <= 8) {
    const grams = Number(digits);
    if (Number.isFinite(grams) && grams >= 0 && grams <= 30000) {
      return grams / 1000;
    }
  }

  return null;
}

function parseUsbScaleWeight(data) {
  if (!data) return null;
  const bytes = getBytes(data);
  if (!bytes.length) return null;

  for (const offset of [0, 1, 2]) {
    if (bytes.length < offset + 6) continue;
    const unit = bytes[offset + 2];
    const exponent = signedByte(bytes[offset + 3]);
    const rawWeight = bytes[offset + 4] | (bytes[offset + 5] << 8);
    if (!rawWeight || rawWeight > 300000) continue;
    const scaledWeight = rawWeight * 10 ** exponent;
    if (
      !Number.isFinite(scaledWeight) ||
      scaledWeight < 0 ||
      exponent < -4 ||
      exponent > 0
    ) {
      continue;
    }
    if (unit === 2) {
      const weightKg = scaledWeight / 1000;
      if (weightKg >= 0 && weightKg <= 30) return weightKg; // grams
    }
    if (unit === 3 && scaledWeight >= 0 && scaledWeight <= 30) {
      return scaledWeight; // kilograms
    }
  }
  return parseScaleWeightFromBytes(bytes);
}

function parseScaleWeight(rawValue) {
  const text = String(rawValue || "")
    .replace(/,/g, ".")
    .trim();
  if (!text) return null;

  const compact = text.replace(/\s+/g, "");
  if (/^[+-]?\d{2,8}$/.test(compact)) {
    const sign = compact.startsWith("-") ? -1 : 1;
    const digits = compact.replace(/^[+-]/, "");
    const grams = Number(digits);
    if (!Number.isFinite(grams)) return null;
    return sign <= 0 || grams <= 0 ? 0 : grams / 1000;
  }

  if (!/[a-z]/i.test(compact) && /^[+-]?\d{1,3}\.\d{1,4}$/.test(compact)) {
    const value = Number(compact);
    if (!Number.isFinite(value) || Math.abs(value) > 30) return null;
    return value <= 0 ? 0 : value;
  }

  const signedMatches = [
    ...text.matchAll(
      /([+-]\s*\d{1,6}(?:\.\d{1,3})?)\s*(kg|kgs|g|gm|gram|grams)?/gi,
    ),
  ];
  const unitMatches = [
    ...text.matchAll(
      /(?:^|[^\d.])(\d{1,6}(?:\.\d{1,3})?)\s*(kg|kgs|g|gm|gram|grams)\b/gi,
    ),
  ];
  const matches = [...signedMatches, ...unitMatches].sort(
    (a, b) => a.index - b.index,
  );
  const match = matches[matches.length - 1];
  if (!match) return null;
  const value = Number(String(match[1]).replace(/\s+/g, ""));
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return 0;
  const unit = String(match[2] || "kg").toLowerCase();
  const weightKg = ["g", "gm", "gram", "grams"].includes(unit)
    ? value / 1000
    : value;
  return weightKg >= 0 && weightKg <= 30 ? weightKg : null;
}

function parseBridgeScalePayload(payload) {
  if (payload == null) return null;
  if (typeof payload === "number") return payload;
  if (typeof payload === "string") return parseScaleWeight(payload);

  const value =
    payload.weightKg ??
    payload.weight_kg ??
    payload.kg ??
    payload.weight ??
    payload.value ??
    payload.data?.weightKg ??
    payload.data?.weight ??
    null;
  if (value == null) return null;

  const unit = String(payload.unit || payload.data?.unit || "kg").toLowerCase();
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return parseScaleWeight(String(value));
  if (["g", "gm", "gram", "grams"].includes(unit)) return numeric / 1000;
  return numeric;
}

function preferBulkEndpoint(endpoints, direction) {
  const matches = (endpoints || []).filter(
    (endpoint) =>
      endpoint.direction === direction &&
      ["bulk", "interrupt"].includes(endpoint.type),
  );
  return (
    matches.find((endpoint) => endpoint.type === "bulk") ||
    matches.find((endpoint) => endpoint.type === "interrupt") ||
    null
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function getDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return getDateInputValue(new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatReceiptDateTime(value) {
  return formatIndianDateTime(value || Date.now(), "");
}

function escapeReceiptHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatReceiptMoney(value) {
  return toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatReceiptQty(value) {
  const qty = toNumber(value, 0);
  return Number.isInteger(qty) ? qty.toFixed(2) : qty.toFixed(3);
}

function getReceiptDateParts(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return { date: "-", time: "-" };
  return {
    date: date.toLocaleDateString("en-GB"),
    time: date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

function numberToIndianWords(value) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const underHundred = (num) =>
    num < 20
      ? ones[num]
      : `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`;
  const underThousand = (num) => {
    const hundred = Math.floor(num / 100);
    const rest = num % 100;
    return `${hundred ? `${ones[hundred]} Hundred` : ""}${
      hundred && rest ? " " : ""
    }${rest ? underHundred(rest) : ""}`.trim();
  };
  let num = Math.round(toNumber(value));
  if (num <= 0) return "Zero Only";
  const parts = [];
  const crore = Math.floor(num / 10000000);
  if (crore) {
    parts.push(`${underThousand(crore)} Crore`);
    num %= 10000000;
  }
  const lakh = Math.floor(num / 100000);
  if (lakh) {
    parts.push(`${underThousand(lakh)} Lakh`);
    num %= 100000;
  }
  const thousand = Math.floor(num / 1000);
  if (thousand) {
    parts.push(`${underThousand(thousand)} Thousand`);
    num %= 1000;
  }
  if (num) parts.push(underThousand(num));
  return `${parts.join(" ")} Only`;
}

const SESSION_CLOSE_CUTOFF_HOUR = 21;
const SESSION_TIME_ZONE = "Asia/Kolkata";

function getCurrentHourInTimeZone(timeZone = SESSION_TIME_ZONE) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

function canClosePosSessionNow() {
  return getCurrentHourInTimeZone() >= SESSION_CLOSE_CUTOFF_HOUR;
}

function isSessionCloseTimeRestricted(user) {
  return user?.role !== "super_admin";
}

function generateInvoiceNumber() {
  return `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function emptyPayment() {
  return { method: "cash", amount: "", referenceNo: "" };
}

function getReceiptPayments(receipt) {
  const bill = receipt?.bill || receipt || {};
  const direct = Array.isArray(bill.payments)
    ? bill.payments
    : Array.isArray(receipt?.payments)
      ? receipt.payments
      : [];
  if (direct.length) return direct;
  if (Array.isArray(bill.payment_meta)) return bill.payment_meta;
  if (Array.isArray(bill.paymentMeta)) return bill.paymentMeta;
  return [];
}

function getBillCashReturns(receipt) {
  const bill = receipt?.bill || receipt || {};
  const fromBillMeta = Array.isArray(bill.meta?.cashReturns)
    ? bill.meta.cashReturns
    : [];
  if (fromBillMeta.length) return fromBillMeta;
  const fromPayments = getReceiptPayments(receipt)
    .filter((payment) => payment?.meta?.type === "post_bill_cash_return")
    .filter((payment) => payment?.meta?.direction === "cash_return")
    .map((payment) => ({
      amount: Math.abs(toNumber(payment.amount)),
      reason: payment.meta?.reason || "",
      tenderMethod: payment.meta?.tenderMethod || payment.meta?.method || "",
      referenceNo: payment.referenceNo || payment.reference_no || "",
      createdAt: payment.createdAt || payment.created_at,
    }));
  return fromPayments;
}

function formatPaymentMethod(method) {
  const value = String(method || "cash").trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Cash";
}

function formatPaymentBreakup(payments, fallbackMode = "cash") {
  const rows = (Array.isArray(payments) ? payments : [])
    .map((payment) => ({
      method:
        payment.method || payment.payment_mode || payment.mode || fallbackMode,
      amount: toNumber(payment.amount),
    }))
    .filter((payment) => payment.amount > 0);

  if (!rows.length) return formatPaymentMethod(fallbackMode);
  if (rows.length === 1)
    return `${formatPaymentMethod(rows[0].method)} ${formatCurrency(rows[0].amount)}`;
  return `Split: ${rows.map((payment) => `${formatPaymentMethod(payment.method)} ${formatCurrency(payment.amount)}`).join(" + ")}`;
}

function receiptTextLine(char = "-", width = 42) {
  return String(char).slice(0, 1).repeat(width);
}

function centerReceiptText(value, width = 42) {
  const text = String(value || "").trim();
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}`;
}

function splitReceiptText(value, width = 42) {
  const words = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word.length > width ? word.slice(0, width) : word;
    } else if (`${line} ${word}`.length <= width) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word.length > width ? word.slice(0, width) : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function getReceiptStoreAddress(bill = {}, activeStore = null) {
  return (
    bill.store_address ||
    bill.storeAddress ||
    [
      activeStore?.address_line1 || activeStore?.addressLine1,
      activeStore?.address_line2 || activeStore?.addressLine2,
      activeStore?.city,
      activeStore?.state,
      activeStore?.pincode,
    ]
      .filter(Boolean)
      .join(", ")
  );
}

function getReceiptStorePhone(bill = {}, activeStore = null) {
  return (
    bill.store_phone ||
    bill.storePhone ||
    activeStore?.manager_mobile ||
    activeStore?.managerMobile ||
    activeStore?.phone ||
    ""
  );
}

const KANPUR_RECEIPT_DETAILS = {
  gstNo: "09CLUPD7759N1ZY",
  phone: "7236931915",
  address: "870/13B, Rampuram, Daheli Sujanpur, Shyam Nagar, Kanpur 208013",
  exchangePolicy:
    "Exchange goods within 3 days; bill is mandatory. No return and no exchange on frozen and dairy items.",
};

function isKanpurReceiptStore(...values) {
  return values.some((value) => /kanpur|knsn/i.test(String(value || "")));
}

function getKanpurReceiptDisplayStoreName(value) {
  const cleaned = String(value || "")
    .replace(/\s*[-–—]?\s*\(?\s*KNSN\s*\)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || value || "Store";
}

function maskReceiptMobileLast4(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `XXXXXX${digits.slice(-4)}`;
}

function receiptAmountLine(label, value, width = 42) {
  const left = String(label || "").slice(0, width - 12);
  const right = String(value || "");
  const spaces = Math.max(1, width - left.length - right.length);
  return `${left}${" ".repeat(spaces)}${right}`;
}

function canReturnChangeForMethod(method) {
  return ["cash", "upi"].includes(String(method || "").toLowerCase());
}

const DEFAULT_PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash", icon: "ti-cash" },
  { value: "card", label: "Card", icon: "ti-credit-card" },
  { value: "upi", label: "UPI", icon: "ti-qrcode" },
  { value: "credit", label: "Credit", icon: "ti-file-invoice" },
];

const FIXED_PAYMENT_METHODS = DEFAULT_PAYMENT_OPTIONS.map((option) => ({
  method: option.value,
  label: option.label,
  icon: option.icon,
}));

const PAYMENT_ICON_BY_CODE = {
  cash: "ti-cash",
  card: "ti-credit-card",
  upi: "ti-qrcode",
  credit: "ti-file-invoice",
  wallet: "ti-wallet",
};

const STANDARD_PAYMENT_LABELS = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit",
  wallet: "Wallet",
  split: "Split",
};

function getPaymentLabel(code, fallback = "") {
  const normalized = String(code || "")
    .trim()
    .toLowerCase();
  return (
    STANDARD_PAYMENT_LABELS[normalized] ||
    fallback ||
    normalized.charAt(0).toUpperCase() + normalized.slice(1)
  );
}

function normalizePaymentOptions(modes = []) {
  const mapped = (Array.isArray(modes) ? modes : [])
    .map((mode) => {
      const value = String(
        mode.code || mode.value || mode.paymentMode || mode.name || "",
      )
        .trim()
        .toLowerCase();
      if (!value) return null;
      const label = getPaymentLabel(value, mode.name || mode.label);
      return {
        value,
        label,
        icon: PAYMENT_ICON_BY_CODE[value] || "ti-credit-card",
      };
    })
    .filter(Boolean);

  const byValue = new Map(
    DEFAULT_PAYMENT_OPTIONS.map((option) => [option.value, option]),
  );
  for (const option of mapped) {
    byValue.set(option.value, option);
  }

  return Array.from(byValue.values());
}

const inputClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400 outline-none";
const DEFAULT_RECEIPT_CONFIG = {
  businessName: "Ascent Sync",
  subtitle: "GST Invoice / POS Receipt",
  headerText: "",
  footerText: "Thank you. Visit again.",
  template: "thermal-80",
  printerName: "",
  paperWidthMm: 80,
  paperHeightMm: "",
  printMarginMm: 3,
  autoCloseAfterPrint: false,
  useCssPageSize: true,
  copies: 1,
  showTaxBreakup: true,
  showDiscount: true,
  showQr: true,
  showCustomerMobile: true,
  showSku: true,
  cutFeedLines: 1,
};

const RECEIPT_PAPER_PRESETS = {
  "printer-default": {
    width: 80,
    height: "",
    margin: 3,
    useCssPageSize: false,
    label: "Printer Default",
  },
  "thermal-57": {
    width: 57,
    height: "",
    margin: 2,
    useCssPageSize: true,
    label: "Thermal 57mm",
  },
  "thermal-58": {
    width: 58,
    height: "",
    margin: 2,
    useCssPageSize: true,
    label: "Thermal 58mm",
  },
  "thermal-72": {
    width: 72,
    height: "",
    margin: 3,
    useCssPageSize: true,
    label: "Thermal 72mm",
  },
  "thermal-76": {
    width: 76,
    height: "",
    margin: 3,
    useCssPageSize: true,
    label: "Thermal 76mm",
  },
  "thermal-80": {
    width: 80,
    height: "",
    margin: 3,
    useCssPageSize: true,
    label: "Thermal 80mm",
  },
  "thermal-82": {
    width: 82,
    height: "",
    margin: 3,
    useCssPageSize: true,
    label: "Thermal 82mm",
  },
  a5: {
    width: 148,
    height: 210,
    margin: 8,
    useCssPageSize: true,
    label: "A5 Invoice",
  },
  a4: {
    width: 210,
    height: 297,
    margin: 10,
    useCssPageSize: true,
    label: "A4 Invoice",
  },
  letter: {
    width: 216,
    height: 279,
    margin: 10,
    useCssPageSize: true,
    label: "Letter",
  },
  custom: {
    width: 80,
    height: "",
    margin: 3,
    useCssPageSize: true,
    label: "Custom",
  },
};

function isReceiptSheetTemplate(template) {
  return ["a4", "a5", "letter"].includes(template);
}

function canUseReceiptCssPageSize(template) {
  return template !== "printer-default";
}

function isReceiptThermalTemplate(template) {
  return String(template || "").startsWith("thermal-");
}

function normalizeReceiptConfig(config = {}) {
  const template = RECEIPT_PAPER_PRESETS[config.template]
    ? config.template
    : DEFAULT_RECEIPT_CONFIG.template;
  const preset = RECEIPT_PAPER_PRESETS[template];
  const width = toNumber(config.paperWidthMm, preset.width);
  const margin = toNumber(config.printMarginMm, preset.margin);
  const rawHeight = config.paperHeightMm;
  const height =
    !isReceiptSheetTemplate(template) || rawHeight === "" || rawHeight == null
      ? ""
      : Math.max(20, toNumber(rawHeight, preset.height || 0));
  const useCssPageSize =
    config.useCssPageSize == null
      ? preset.useCssPageSize !== false
      : Boolean(config.useCssPageSize);
  const canUseCssPageSize = canUseReceiptCssPageSize(template);

  return {
    ...DEFAULT_RECEIPT_CONFIG,
    ...config,
    template,
    printerName: String(config.printerName || "").trim(),
    paperWidthMm: Math.min(300, Math.max(40, width)),
    paperHeightMm: height,
    printMarginMm: Math.min(25, Math.max(0, margin)),
    useCssPageSize:
      canUseCssPageSize &&
      (isReceiptThermalTemplate(template) || useCssPageSize),
    copies: Math.min(5, Math.max(1, Math.round(toNumber(config.copies, 1)))),
    cutFeedLines: Math.min(
      5,
      Math.max(0, Math.round(toNumber(config.cutFeedLines, 1))),
    ),
    autoCloseAfterPrint: Boolean(config.autoCloseAfterPrint),
  };
}

function getReceiptPageCss(config = DEFAULT_RECEIPT_CONFIG) {
  const normalized = normalizeReceiptConfig(config);
  const thermalReceipt = isReceiptThermalTemplate(normalized.template);
  const printableWidth = Math.max(
    30,
    normalized.paperWidthMm - normalized.printMarginMm * 2,
  );
  const pageSize = normalized.paperHeightMm
    ? `${normalized.paperWidthMm}mm ${normalized.paperHeightMm}mm`
    : `${normalized.paperWidthMm}mm 297mm`;
  // Thermal printers use a continuous roll. Forcing an A4-length CSS page
  // makes them feed the unused part of that page after every receipt. Keep
  // the receipt width in CSS, but let the selected printer's roll driver set
  // the actual paper length and cut position.
  const pageRule = thermalReceipt
    ? `@page { margin: ${normalized.printMarginMm}mm; }`
    : normalized.useCssPageSize
      ? `@page { size: ${pageSize}; margin: ${normalized.printMarginMm}mm; }`
      : `@page { margin: ${normalized.printMarginMm}mm; }`;
  return {
    bodyWidth: `${printableWidth}mm`,
    margin: `${normalized.printMarginMm}mm`,
    pageRule,
    paperWidth: `${normalized.paperWidthMm}mm`,
  };
}

function normalizeProduct(p) {
  const selectedBatchId = p.selectedBatchId ?? p.selected_batch_id ?? null;
  const selectedBatchIds = Array.isArray(p.selectedBatchIds)
    ? p.selectedBatchIds
    : Array.isArray(p.selected_batch_ids)
      ? p.selected_batch_ids
      : [];
  const sellingPrice = toNumber(p.selling_price || p.sellingPrice || p.mrp);
  const mrp = toNumber(p.mrp || p.selling_price || p.sellingPrice);
  const variantKey = String(
    p.variantKey ||
      p.variant_key ||
      `${p.id}:${selectedBatchId || "catalog"}:${sellingPrice}:${mrp}`,
  );
  return {
    id: p.id,
    cartKey: variantKey,
    variantKey,
    selectedBatchId,
    selectedBatchIds,
    name: p.name,
    sku: p.sku || "",
    barcode: p.barcode || "",
    unit: normalizeUnit(p.unit || p.unit_name || p.measurement_unit || "PCS"),
    mrp,
    sellingPrice,
    costPrice: toNumber(p.cost_price || p.costPrice, 0),
    availableStock: toNumber(
      p.availableStock ?? p.available_stock ?? p.stock,
      0,
    ),
    expiredStock: toNumber(p.expiredStock ?? p.expired_stock, 0),
    nearestExpiryDate: p.nearestExpiryDate ?? p.nearest_expiry_date ?? null,
    categoryName: p.categoryName || p.category_name || "N/A",
    taxRate: toNumber(p.taxRate ?? p.tax_rate, 0),
    allowDiscountOnPos: Boolean(
      p.allow_discount_on_pos ?? p.allowDiscountOnPos,
    ),
    includeTax: Boolean(p.includeTax ?? p.include_tax),
  };
}

function getCartItemKey(item) {
  return String(item.cartKey || item.variantKey || item.id);
}

function getCartQtyRules(item) {
  const weightedUnit = getWeightedUnitKind(item?.unit);
  const weighted = Boolean(weightedUnit);
  const minQty = weighted ? getManualWeightedQuantity(weightedUnit) : 1;
  const qtyStep = weightedUnit === "KG" ? 0.001 : 1;
  const maxQty = toNumber(item?.availableStock, Infinity);
  return { weightedUnit, weighted, minQty, qtyStep, maxQty };
}

function normalizeCartQtyValue(item, value, fallback = item?.qty) {
  const { weighted, minQty, maxQty } = getCartQtyRules(item);
  const normalizedInput = String(value ?? "")
    .trim()
    .replace(",", ".");
  let nextQty = toNumber(normalizedInput, toNumber(fallback, minQty));
  if (!Number.isFinite(nextQty) || nextQty <= 0) nextQty = minQty;
  nextQty = Math.max(minQty, nextQty);
  if (Number.isFinite(maxQty)) nextQty = Math.min(nextQty, maxQty);
  return weighted
    ? Number(nextQty.toFixed(3))
    : Math.max(1, Math.round(nextQty));
}

function getDiscountCartSignature(items = []) {
  return JSON.stringify(
    (Array.isArray(items) ? items : [])
      .map((item) => ({
        cartKey: getCartItemKey(item),
        productId: Number(item.id || item.productId || 0),
        qty: Math.round(toNumber(item.qty) * 1000) / 1000,
        sellingPrice:
          Math.round(toNumber(item.sellingPrice ?? item.selling_price) * 100) /
          100,
        selectedBatchId:
          Number(item.selectedBatchId || item.selected_batch_id || 0) || null,
        promotionId: Number(item.promotionId || 0) || null,
        promotionFreeItem: Boolean(item.promotionFreeItem),
      }))
      .sort((left, right) =>
        [
          left.productId,
          left.cartKey,
          left.sellingPrice,
          left.selectedBatchId || 0,
        ]
          .join(":")
          .localeCompare(
            [
              right.productId,
              right.cartKey,
              right.sellingPrice,
              right.selectedBatchId || 0,
            ].join(":"),
          ),
      ),
  );
}

function calculateGstLine(item, canManageDiscounts = true) {
  const qty = toNumber(item.qty, 1);
  const sellingPrice = toNumber(item.sellingPrice ?? item.selling_price);
  const discountAmount =
    item.promotionFreeItem ||
    item.approvedManualDiscount ||
    (canManageDiscounts && item.allowDiscountOnPos)
      ? toNumber(item.discountAmount)
      : 0;
  const gross = Math.max(0, qty * sellingPrice - discountAmount);
  const rate = toNumber(item.taxRate || 0);
  if (!rate || gross <= 0)
    return { gstAmount: 0, exclusiveGstAmount: 0, lineTotal: gross };
  if (item.includeTax) {
    return {
      gstAmount: gross - gross / (1 + rate / 100),
      exclusiveGstAmount: 0,
      lineTotal: gross,
    };
  }
  const gstAmount = (gross * rate) / 100;
  return {
    gstAmount,
    exclusiveGstAmount: gstAmount,
    lineTotal: gross + gstAmount,
  };
}

function getPromotionProductsConfig(products) {
  if (!products)
    return { eligibleProductIds: [], freeProductId: null, freeProductQty: 0 };
  if (Array.isArray(products)) {
    return {
      eligibleProductIds: products
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0),
      freeProductId: null,
      freeProductQty: 0,
    };
  }
  if (typeof products === "object") {
    const eligibleProductIds = Array.isArray(products.eligibleProductIds)
      ? products.eligibleProductIds
          .map(Number)
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];
    const freeProductId =
      Number(products.freeProductId || products.free_product_id || 0) || null;
    const freeProductQty = toNumber(
      products.freeProductQty || products.free_product_qty,
      0,
    );
    return { eligibleProductIds, freeProductId, freeProductQty };
  }
  return { eligibleProductIds: [], freeProductId: null, freeProductQty: 0 };
}

function isPromotionActiveForStore(promotion, storeId) {
  if (!promotion?.is_auto_applied) return false;
  if (
    promotion.store_id &&
    String(promotion.store_id) !== String(storeId || "")
  )
    return false;
  const today = getDateInputValue();
  const start = promotion.start_date
    ? String(promotion.start_date).slice(0, 10)
    : "";
  const end = promotion.end_date ? String(promotion.end_date).slice(0, 10) : "";
  if (start && today < start) return false;
  if (end && today > end) return false;
  return String(promotion.status || "").toLowerCase() === "active";
}

function getPromotionEligibleSubtotal(cart, eligibleProductIds = []) {
  const eligibleSet = new Set(eligibleProductIds.map(Number));
  return cart
    .filter((item) => !item.promotionFreeItem)
    .filter((item) => !eligibleSet.size || eligibleSet.has(Number(item.id)))
    .reduce(
      (sum, item) => sum + toNumber(item.qty) * toNumber(item.sellingPrice),
      0,
    );
}

function calculateRoundOff(amount) {
  const normalizedAmount = Math.round(toNumber(amount) * 100) / 100;
  const roundedAmount = Math.round(normalizedAmount);
  return Math.round((roundedAmount - normalizedAmount) * 100) / 100;
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEYS = {
  CACHE: "pos-cache-v4",
  DRAFT: "pos-draft-v3",
  HELD_BILLS: "pos-held-bills-v3",
  QUEUE: "pos-queue-v3",
  OFFLINE_BILLS: "pos-offline-bills-v3",
  SCALE_BAUD_RATE: "pos-scale-baud-rate-v1",
};

function readStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

async function loadReceiptConfig() {
  try {
    const [receiptRes, businessRes] = await Promise.all([
      fetch("/api/settings/customize-receipt-print?pageSize=1&isActive=true", {
        cache: "no-store",
        credentials: "include",
      }),
      fetch("/api/settings/business-info?pageSize=1&isActive=true", {
        cache: "no-store",
        credentials: "include",
      }),
    ]);
    const receiptJson = await receiptRes.json();
    const businessJson = await businessRes.json();
    const config = receiptJson.data?.records?.[0]?.config || {};
    const business = businessJson.data?.records?.[0]?.config || {};
    return normalizeReceiptConfig({
      ...DEFAULT_RECEIPT_CONFIG,
      ...config,
      businessName:
        config.businessName ||
        business.legalName ||
        DEFAULT_RECEIPT_CONFIG.businessName,
      headerText: config.headerText || business.address || "",
    });
  } catch {
    return DEFAULT_RECEIPT_CONFIG;
  }
}

function getOrCreateLocalId(key, prefix) {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(key, next);
  return next;
}

function createFixedPaymentRows(sourcePayments = []) {
  const sourceByMethod = new Map();

  for (const payment of Array.isArray(sourcePayments) ? sourcePayments : []) {
    const method = String(payment?.method || "")
      .trim()
      .toLowerCase();
    if (!method) continue;
    sourceByMethod.set(method, {
      method,
      amount: String(payment?.amount ?? ""),
      referenceNo: String(payment?.referenceNo ?? payment?.reference_no ?? ""),
    });
  }

  return FIXED_PAYMENT_METHODS.map(
    (method) =>
      sourceByMethod.get(method.method) || {
        method: method.method,
        amount: "",
        referenceNo: "",
      },
  );
}

// ============================================================================
// MAIN POS COMPONENT
// ============================================================================

export default function POSPage() {
  const router = useRouter();
  const searchInputRef = useRef(null);
  const scalePortRef = useRef(null);
  const scaleReaderRef = useRef(null);
  const scaleUsbDeviceRef = useRef(null);
  const scaleUsbLoopRef = useRef(false);
  const scaleBridgeTimerRef = useRef(null);
  const activeScaleCartKeyRef = useRef("");
  const scaleBaudRateRef = useRef(EAGLE_SCALE_SERIAL_OPTIONS.baudRate);
  const initialPOSLoadStartedRef = useRef(false);

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [deviceUid, setDeviceUid] = useState("");
  const [counterName, setCounterName] = useState("");
  // State: Products & Search
  const [products, setProducts] = useState([]);
  const [activePromotions, setActivePromotions] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [cartSessionId, setCartSessionId] = useState(() =>
    createCartSessionId(),
  );
  const [deletedCartItemIds, setDeletedCartItemIds] = useState([]);
  const [priceVariantOptions, setPriceVariantOptions] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [roundOff, setRoundOff] = useState("0");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [payments, setPayments] = useState(() => createFixedPaymentRows());
  const [paymentOptions, setPaymentOptions] = useState(DEFAULT_PAYMENT_OPTIONS);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleWeightKg, setScaleWeightKg] = useState(0);
  const [scaleStatus, setScaleStatus] = useState("");
  const [scaleLastData, setScaleLastData] = useState("");
  const [activeScaleCartKey, setActiveScaleCartKey] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [openSessionModal, setOpenSessionModal] = useState(false);
  const [closeSessionModal, setCloseSessionModal] = useState(false);
  const [customerHistoryModal, setCustomerHistoryModal] = useState(false);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [closingSummary, setClosingSummary] = useState(null);
  const [closingLoading, setClosingLoading] = useState(false);
  const [actualCash, setActualCash] = useState("0");
  const [closingRemarks, setClosingRemarks] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [recentBills, setRecentBills] = useState([]);
  const [salesSummary, setSalesSummary] = useState({
    billCount: 0,
    salesTotal: 0,
    averageBill: 0,
    paidTotal: 0,
  });
  const [salesDateFrom, setSalesDateFrom] = useState(() => getDateInputValue());
  const [salesDateTo, setSalesDateTo] = useState(() => getDateInputValue());
  const [salesBillSearch, setSalesBillSearch] = useState("");
  const [salesTrackerLoading, setSalesTrackerLoading] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const [receiptModal, setReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [receiptQR, setReceiptQR] = useState("");
  const [receiptPrintConfig, setReceiptPrintConfig] = useState(
    DEFAULT_RECEIPT_CONFIG,
  );
  const [receiptPrintRecordId, setReceiptPrintRecordId] = useState(null);
  const [receiptPrintSaving, setReceiptPrintSaving] = useState(false);
  const [receiptPrintLoaded, setReceiptPrintLoaded] = useState(false);
  const [directPrintLoading, setDirectPrintLoading] = useState(false);
  const [cashReturnOpen, setCashReturnOpen] = useState(false);
  const [cashReturnAmount, setCashReturnAmount] = useState("");
  const [cashReturnReason, setCashReturnReason] = useState("");
  const [cashReturnTenderMethod, setCashReturnTenderMethod] = useState("upi");
  const [cashReturnReferenceNo, setCashReturnReferenceNo] = useState("");
  const [cashReturnSaving, setCashReturnSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerStatus, setScannerStatus] = useState("");
  const [holdDetectModal, setHoldDetectModal] = useState(false);
  const [detectedHeldBills, setDetectedHeldBills] = useState([]);
  const [activeTab, setActiveTab] = useState("catalog"); // "catalog" | "cart"
  const [customerDemandModal, setCustomerDemandModal] = useState(false);
  const [customerDemandSaving, setCustomerDemandSaving] = useState(false);
  const [customerDemandForm, setCustomerDemandForm] = useState({
    productName: "",
    requestedQty: "1",
    remarks: "",
  });
  const [discountRequestOpen, setDiscountRequestOpen] = useState(false);
  const [discountRequestSaving, setDiscountRequestSaving] = useState(false);
  const [discountRequestForm, setDiscountRequestForm] = useState({
    scope: "order",
    targetCartKey: "",
    amount: "",
    reason: "",
  });
  const [activeDiscountRequest, setActiveDiscountRequest] = useState(null);
  const [discountApprovalOpen, setDiscountApprovalOpen] = useState(false);
  const [discountApprovalRows, setDiscountApprovalRows] = useState([]);
  const [discountApprovalLoading, setDiscountApprovalLoading] = useState(false);
  const [discountReviewingId, setDiscountReviewingId] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scannerStopRef = useRef(false);
  const hardwareScanBufferRef = useRef("");
  const hardwareScanLastKeyAtRef = useRef(0);
  const handleBarcodeRef = useRef(null);

  // ── TOAST ──
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadReceiptPrintSettings = useCallback(async () => {
    setReceiptPrintLoaded(false);
    try {
      const res = await fetch(
        "/api/settings/customize-receipt-print?pageSize=1&isActive=true",
        { cache: "no-store", credentials: "include" },
      );
      const json = await res.json();
      const record = json.data?.records?.[0];
      setReceiptPrintRecordId(record?.id || null);
      setReceiptPrintConfig(
        normalizeReceiptConfig(record?.config || DEFAULT_RECEIPT_CONFIG),
      );
    } catch {
      setReceiptPrintConfig(DEFAULT_RECEIPT_CONFIG);
    } finally {
      setReceiptPrintLoaded(true);
    }
  }, []);

  const updateReceiptPrintConfig = (key, value) => {
    setReceiptPrintConfig((current) => {
      const next = { ...current, [key]: value };
      if (key === "template") {
        const preset =
          RECEIPT_PAPER_PRESETS[value] || RECEIPT_PAPER_PRESETS.custom;
        next.paperWidthMm = preset.width;
        next.paperHeightMm = preset.height;
        next.printMarginMm = preset.margin;
        next.useCssPageSize = preset.useCssPageSize !== false;
      }
      return normalizeReceiptConfig(next);
    });
  };

  const saveReceiptPrintSettings = async () => {
    setReceiptPrintSaving(true);
    try {
      const config = normalizeReceiptConfig(receiptPrintConfig);
      const res = await fetch("/api/settings/customize-receipt-print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: receiptPrintRecordId,
          name: "Default POS Receipt",
          code: "default",
          description: "Default receipt template used by POS print",
          isActive: true,
          config,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Save failed");
      setReceiptPrintRecordId(json.data?.id || receiptPrintRecordId);
      setReceiptPrintConfig(config);
      setReceiptPrintLoaded(true);
      showToast("Printer settings saved");
    } catch (err) {
      showToast(err.message || "Unable to save printer settings", "error");
    } finally {
      setReceiptPrintSaving(false);
    }
  };

  useEffect(() => {
    if (receiptModal) loadReceiptPrintSettings();
  }, [loadReceiptPrintSettings, receiptModal]);

  useEffect(() => {
    const savedBaud = Number(
      readStorage(
        STORAGE_KEYS.SCALE_BAUD_RATE,
        EAGLE_SCALE_SERIAL_OPTIONS.baudRate,
      ),
    );
    if (SCALE_BAUD_RATES.includes(savedBaud)) {
      scaleBaudRateRef.current = savedBaud;
    }
  }, []);

  const noteScaleRawData = useCallback((raw, bytes = null) => {
    const text = isUsefulScaleText(raw) ? String(raw || "").trim() : "";
    const hex = bytes ? getHexPreview(bytes) : "";
    const preview =
      text && hex
        ? `TEXT ${text} | HEX ${hex}`
        : text || (hex ? `HEX ${hex}` : "");
    if (preview) setScaleLastData(preview.slice(0, 80));
  }, []);

  const applyScaleWeightReading = useCallback(
    (raw) => {
      if (isUsefulScaleText(raw)) noteScaleRawData(raw);
      const weightKg = parseScaleWeight(raw);
      if (weightKg === null) return false;

      const normalizedWeight = Number(weightKg.toFixed(3));
      if (!Number.isFinite(normalizedWeight) || normalizedWeight > 30) {
        setScaleWeightKg(0);
        setScaleStatus("0 g");
        return false;
      }
      setScaleWeightKg(normalizedWeight);
      setScaleStatus(formatScaleWeight(normalizedWeight));
      const activeCartKey = activeScaleCartKeyRef.current;
      if (activeCartKey) {
        setCart((current) =>
          current.map((item) => {
            if (getCartItemKey(item) !== activeCartKey) return item;
            const weightedUnit = getWeightedUnitKind(item.unit);
            if (!weightedUnit) return item;
            const nextQty = Math.min(
              getScaleQuantityForUnit(normalizedWeight, weightedUnit),
              toNumber(item.availableStock),
            );
            return Number(item.qty) === nextQty
              ? item
              : { ...item, qty: nextQty };
          }),
        );
      }
      return true;
    },
    [noteScaleRawData],
  );

  const applyScaleWeightKg = useCallback(
    (weightKg) => {
      if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 30) {
        return false;
      }
      return applyScaleWeightReading(`${weightKg.toFixed(3)}kg`);
    },
    [applyScaleWeightReading],
  );

  const applyUsbScaleData = useCallback(
    (data) => {
      const printable = getPrintablePreview(data);
      noteScaleRawData(printable, data);
      const binaryWeightKg = parseUsbScaleWeight(data);
      if (binaryWeightKg !== null) {
        return applyScaleWeightKg(binaryWeightKg);
      }
      return applyScaleWeightReading(
        printable || new TextDecoder().decode(data),
      );
    },
    [applyScaleWeightKg, applyScaleWeightReading, noteScaleRawData],
  );

  const readScaleBridge = useCallback(async () => {
    const endpoints = [
      "http://127.0.0.1:8765/weight",
      "http://127.0.0.1:8765/api/weight",
      "http://localhost:8765/weight",
      "http://localhost:8765/api/weight",
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${endpoint}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
          ? await response.json()
          : await response.text();
        const weightKg = parseBridgeScalePayload(payload);
        if (weightKg === null || weightKg < 0 || weightKg > 30) continue;
        return { endpoint, weightKg, payload };
      } catch {}
    }

    return null;
  }, []);

  const connectScaleWithBridge = useCallback(async () => {
    const firstReading = await readScaleBridge();
    if (!firstReading) return false;

    setScaleConnected(true);
    setScaleStatus("Bridge connected");
    setScaleLastData(`Bridge ${firstReading.endpoint}`);
    applyScaleWeightKg(firstReading.weightKg);
    showToast("Weighing scale connected through POS bridge", "success");

    if (scaleBridgeTimerRef.current) {
      window.clearInterval(scaleBridgeTimerRef.current);
    }
    scaleBridgeTimerRef.current = window.setInterval(async () => {
      const reading = await readScaleBridge();
      if (!reading) {
        setScaleStatus("Bridge connected · waiting");
        return;
      }
      setScaleLastData(`Bridge ${reading.endpoint}`);
      applyScaleWeightKg(reading.weightKg);
    }, 350);

    return true;
  }, [applyScaleWeightKg, readScaleBridge]);

  const configureUsbSerialAdapter = useCallback(
    async (
      device,
      interfaceNumber,
      baudRate = EAGLE_SCALE_SERIAL_OPTIONS.baudRate,
    ) => {
      const lineCoding = new Uint8Array([
        baudRate & 0xff,
        (baudRate >> 8) & 0xff,
        (baudRate >> 16) & 0xff,
        (baudRate >> 24) & 0xff,
        0,
        0,
        8,
      ]);

      const safeControlOut = async (setup, data) => {
        try {
          await device.controlTransferOut(setup, data);
        } catch {}
      };
      const safeControlIn = async (setup, length = 1) => {
        try {
          await device.controlTransferIn(setup, length);
        } catch {}
      };

      await safeControlOut(
        {
          requestType: "class",
          recipient: "interface",
          request: 0x20,
          value: 0,
          index: interfaceNumber,
        },
        lineCoding,
      );
      await safeControlOut({
        requestType: "class",
        recipient: "interface",
        request: 0x22,
        value: 0x03,
        index: interfaceNumber,
      });

      if (device.vendorId === 0x1a86) {
        await safeControlOut({
          requestType: "vendor",
          recipient: "device",
          request: 0xa1,
          value: 0,
          index: 0,
        });
        await safeControlOut({
          requestType: "vendor",
          recipient: "device",
          request: 0x9a,
          value: 0x1312,
          index: 0xd982,
        });
        await safeControlOut({
          requestType: "vendor",
          recipient: "device",
          request: 0x9a,
          value: 0x0f2c,
          index: 0x0004,
        });
        await safeControlOut({
          requestType: "vendor",
          recipient: "device",
          request: 0xa4,
          value: 0xff,
          index: 0,
        });
        await safeControlOut({
          requestType: "vendor",
          recipient: "device",
          request: 0xa1,
          value: 0,
          index: 0,
        });
        await safeControlOut({
          requestType: "vendor",
          recipient: "device",
          request: 0x9a,
          value: 0x2518,
          index: 0x0050,
        });
        await safeControlOut({
          requestType: "vendor",
          recipient: "device",
          request: 0x9a,
          value: 0x2518,
          index: 0x0050,
        });
      }

      if (device.vendorId === 0x067b) {
        const vendorIn = (value, index = 0) =>
          safeControlIn(
            {
              requestType: "vendor",
              recipient: "device",
              request: 0x01,
              value,
              index,
            },
            1,
          );
        const vendorOut = (value, index = 0) =>
          safeControlOut({
            requestType: "vendor",
            recipient: "device",
            request: 0x01,
            value,
            index,
          });

        await vendorIn(0x8484);
        await vendorOut(0x0404);
        await vendorIn(0x8484);
        await vendorIn(0x8383);
        await vendorIn(0x8484);
        await vendorOut(0x0404, 1);
        await vendorIn(0x8484);
        await vendorIn(0x8383);
        await vendorOut(0, 1);
        await vendorOut(1, 0);
        await vendorOut(2, 0x44);
      }

      if (device.vendorId === 0x10c4) {
        await safeControlOut({
          requestType: "vendor",
          recipient: "interface",
          request: 0x00,
          value: 0x0001,
          index: interfaceNumber,
        });
        await safeControlOut({
          requestType: "vendor",
          recipient: "interface",
          request: 0x07,
          value: 0x0303,
          index: interfaceNumber,
        });
      }
    },
    [],
  );

  const disconnectScale = useCallback(async () => {
    scaleUsbLoopRef.current = false;
    if (scaleBridgeTimerRef.current) {
      window.clearInterval(scaleBridgeTimerRef.current);
      scaleBridgeTimerRef.current = null;
    }
    try {
      await scaleReaderRef.current?.cancel();
    } catch {}
    try {
      scaleReaderRef.current?.releaseLock?.();
    } catch {}
    try {
      await scalePortRef.current?.close();
    } catch {}
    try {
      await scaleUsbDeviceRef.current?.close();
    } catch {}
    scaleReaderRef.current = null;
    scalePortRef.current = null;
    scaleUsbDeviceRef.current = null;
    setScaleConnected(false);
    setScaleWeightKg(0);
    setScaleStatus("");
    setScaleLastData("");
    activeScaleCartKeyRef.current = "";
    setActiveScaleCartKey("");
  }, []);

  const connectScaleWithWebUsb = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.usb) {
      showToast(
        "This POS browser cannot access USB scale. Open this page in Chrome/Edge, or install a POS browser that supports USB/WebUSB.",
        "error",
      );
      return;
    }

    let device;
    let pollTimer = null;
    try {
      device = await navigator.usb.requestDevice({ filters: [] });
      await device.open();
      if (!device.configuration) await device.selectConfiguration(1);

      let selectedInterface = null;
      let selectedAlternate = null;
      let inputEndpoint = null;
      let outputEndpoint = null;
      for (const usbInterface of device.configuration.interfaces || []) {
        for (const alternate of usbInterface.alternates || []) {
          const endpoint = preferBulkEndpoint(alternate.endpoints, "in");
          if (endpoint) {
            selectedInterface = usbInterface;
            selectedAlternate = alternate;
            inputEndpoint = endpoint;
            outputEndpoint = preferBulkEndpoint(alternate.endpoints, "out");
            break;
          }
        }
        if (inputEndpoint) break;
      }

      if (!selectedInterface || !inputEndpoint) {
        throw new Error("No readable USB endpoint found for this scale.");
      }

      await device.claimInterface(selectedInterface.interfaceNumber);
      await configureUsbSerialAdapter(
        device,
        selectedInterface.interfaceNumber,
        scaleBaudRateRef.current,
      );
      if (selectedAlternate?.alternateSetting) {
        await device.selectAlternateInterface(
          selectedInterface.interfaceNumber,
          selectedAlternate.alternateSetting,
        );
      }

      scaleUsbDeviceRef.current = device;
      scaleUsbLoopRef.current = true;
      setScaleConnected(true);
      setScaleStatus("Connected · waiting");
      setScaleLastData("");
      showToast("Weighing scale connected through USB", "success");

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let commandIndex = 0;
      let unreadablePackets = 0;
      let baudIndex = Math.max(
        0,
        SCALE_BAUD_RATES.indexOf(scaleBaudRateRef.current),
      );
      const usbCommands = ["\r\n", "P\r\n", "W\r\n", "S\r\n", "SI\r\n"];
      pollTimer = outputEndpoint
        ? window.setInterval(() => {
            device
              .transferOut(
                outputEndpoint.endpointNumber,
                encoder.encode(usbCommands[commandIndex % usbCommands.length]),
              )
              .catch(() => {});
            commandIndex += 1;
          }, 1000)
        : null;
      while (scaleUsbLoopRef.current) {
        const result = await device.transferIn(
          inputEndpoint.endpointNumber,
          64,
        );
        if (!scaleUsbLoopRef.current) break;
        if (!result?.data) continue;
        const parsedPacket = applyUsbScaleData(result.data);
        if (parsedPacket) {
          unreadablePackets = 0;
          writeStorage(STORAGE_KEYS.SCALE_BAUD_RATE, scaleBaudRateRef.current);
        } else {
          unreadablePackets += 1;
          if (unreadablePackets >= 5 && selectedInterface) {
            baudIndex = (baudIndex + 1) % SCALE_BAUD_RATES.length;
            const nextBaud = SCALE_BAUD_RATES[baudIndex];
            scaleBaudRateRef.current = nextBaud;
            setScaleStatus(`Trying ${nextBaud} baud`);
            await configureUsbSerialAdapter(
              device,
              selectedInterface.interfaceNumber,
              nextBaud,
            );
            buffer = "";
            unreadablePackets = 0;
          }
        }
        buffer += decoder.decode(result.data, { stream: true });
        const chunks = buffer.split(/\r?\n/);
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          applyScaleWeightReading(chunk);
        }
        if (buffer.length >= 8 && applyScaleWeightReading(buffer)) {
          buffer = "";
        }
      }
      if (pollTimer) window.clearInterval(pollTimer);
    } catch (err) {
      if (pollTimer) window.clearInterval(pollTimer);
      scaleUsbLoopRef.current = false;
      setScaleConnected(false);
      setScaleStatus("");
      setScaleLastData("");
      if (err?.name !== "NotFoundError") {
        showToast(
          err?.message ||
            "Unable to connect USB scale. Try Chrome/Edge or check USB permission.",
          "error",
        );
      }
      try {
        await device?.close();
      } catch {}
    }
  }, [applyScaleWeightReading, applyUsbScaleData, configureUsbSerialAdapter]);

  const connectScale = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.serial) {
      if (isAndroidRuntime()) {
        const bridgeConnected = await connectScaleWithBridge();
        if (bridgeConnected) return;
      }
      await connectScaleWithWebUsb();
      return;
    }

    try {
      const port = await navigator.serial.requestPort();
      await port.open({
        ...EAGLE_SCALE_SERIAL_OPTIONS,
        baudRate: scaleBaudRateRef.current,
      });
      scalePortRef.current = port;
      setScaleConnected(true);
      setScaleStatus("Connected · waiting");
      setScaleLastData("");
      showToast("Weighing scale connected", "success");

      const decoder = new TextDecoder();
      const reader = port.readable.getReader();
      scaleReaderRef.current = reader;
      let writer = null;
      let pollTimer = null;
      try {
        writer = port.writable?.getWriter?.() || null;
        if (writer) {
          const encoder = new TextEncoder();
          const commands = ["\r\n", "P\r\n", "W\r\n"];
          let commandIndex = 0;
          pollTimer = window.setInterval(() => {
            writer
              ?.write(encoder.encode(commands[commandIndex % commands.length]))
              .catch(() => {});
            commandIndex += 1;
          }, 1200);
        }
      } catch {
        writer = null;
      }
      let buffer = "";
      const applyWeight = (raw) => {
        const parsed = applyScaleWeightReading(raw);
        if (parsed)
          writeStorage(STORAGE_KEYS.SCALE_BAUD_RATE, scaleBaudRateRef.current);
        return parsed;
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          noteScaleRawData(getPrintablePreview(value), value);
          buffer += decoder.decode(value || new Uint8Array(), {
            stream: true,
          });
          const chunks = buffer.split(/\r?\n/);
          buffer = chunks.pop() || "";
          for (const chunk of chunks) {
            applyWeight(chunk);
          }
          if (buffer.length >= 5 && applyWeight(buffer)) {
            buffer = "";
          }
        }
      } finally {
        if (pollTimer) window.clearInterval(pollTimer);
        try {
          writer?.releaseLock?.();
        } catch {}
      }
    } catch (err) {
      setScaleConnected(false);
      setScaleStatus("");
      setScaleLastData("");
      if (err?.name !== "NotFoundError") {
        showToast(err?.message || "Unable to connect weighing scale", "error");
      }
    }
  }, [
    applyScaleWeightReading,
    connectScaleWithBridge,
    connectScaleWithWebUsb,
    noteScaleRawData,
  ]);

  useEffect(
    () => () => {
      disconnectScale();
    },
    [disconnectScale],
  );

  const canManageDiscounts = user?.role === "super_admin";
  const canDeleteBills = user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const canRequestDiscount =
    Boolean(user) &&
    user?.role !== "super_admin" &&
    (user?.permissions?.includes("*") ||
      user?.permissions?.includes("CREATE_POS_BILL") ||
      user?.permissions?.includes("MANAGE_BILLING"));
  const hasApprovedOrderDiscount =
    activeDiscountRequest?.status === "approved" &&
    activeDiscountRequest?.scope === "order";
  const canApplyOrderDiscount =
    hasApprovedOrderDiscount ||
    (canManageDiscounts &&
      cart.length > 0 &&
      cart.every((item) => item.allowDiscountOnPos));
  const salesTracker = useMemo(() => {
    const offlineBills = recentBills.filter((bill) => bill.isOffline);
    const offlineSales = offlineBills.reduce(
      (sum, bill) => sum + toNumber(bill.grandTotal),
      0,
    );
    const billCount = toNumber(salesSummary.billCount) + offlineBills.length;
    const salesTotal = toNumber(salesSummary.salesTotal) + offlineSales;
    return {
      billCount,
      salesTotal,
      averageBill: billCount ? salesTotal / billCount : 0,
      paidTotal: toNumber(salesSummary.paidTotal) + offlineSales,
      pendingCount: offlineBills.length,
    };
  }, [recentBills, salesSummary]);
  const visibleRecentBills = useMemo(() => {
    const needle = salesBillSearch.trim().toLowerCase();
    if (!needle) return recentBills;
    return recentBills.filter((bill) =>
      [
        bill.billNumber,
        bill.invoiceNumber,
        bill.customerName,
        bill.customerMobile,
        bill.paymentMode,
        bill.status,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [recentBills, salesBillSearch]);
  const salesDateLabel =
    salesDateFrom && salesDateTo && salesDateFrom === salesDateTo
      ? formatIndianDate(salesDateFrom)
      : `${salesDateFrom ? formatIndianDate(salesDateFrom) : "Start"} to ${
          salesDateTo ? formatIndianDate(salesDateTo) : "Today"
        }`;

  // ── DATA LOADING ──
  const loadPOSData = useCallback(
    async (storeIdOverride = "") => {
      setLoading(true);
      const activeStoreId =
        storeIdOverride || session?.storeId || selectedStoreId;
      const cached = readStorage(STORAGE_KEYS.CACHE, null);
      const cacheMatchesStore =
        !activeStoreId ||
        String(cached?.storeId || "") === String(activeStoreId);
      if (cacheMatchesStore && cached?.products?.length) {
        setProducts(cached.products);
        setFilteredProducts(cached.products);
        setStores(cached.stores || []);
        setPaymentOptions(normalizePaymentOptions(cached.paymentOptions));
      }
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: String(POS_PRODUCT_PAGE_SIZE),
          bill_date_from: salesDateFrom,
          bill_date_to: salesDateTo,
          bill_limit: "200",
        });
        if (activeStoreId) params.set("store_id", String(activeStoreId));
        if (deviceUid) {
          params.set("device_uid", deviceUid);
          params.set("counter_uid", deviceUid);
        }
        const catalogRequest = fetch(`/api/sales-order/pos?${params}`, {
          cache: "no-store",
        });
        const bootstrapParams = new URLSearchParams(params);
        bootstrapParams.set("bootstrap_only", "true");
        bootstrapParams.set("pageSize", "1");
        const bootstrapRes = await fetch(
          `/api/sales-order/pos?${bootstrapParams}`,
          { cache: "no-store" },
        );
        const bootstrapJson = await bootstrapRes.json();
        if (bootstrapJson.success && bootstrapJson.data) {
          setStores(bootstrapJson.data.stores || []);
          if (bootstrapJson.data.session?.sessionId) {
            setSession(bootstrapJson.data.session);
            setSelectedStoreId(
              String(bootstrapJson.data.session.storeId || ""),
            );
            setOpeningCash(String(bootstrapJson.data.session.openingCash || 0));
          } else if (bootstrapJson.data.selectedStoreId) {
            setSelectedStoreId(String(bootstrapJson.data.selectedStoreId));
          } else {
            setSession(null);
          }
        }

        const res = await catalogRequest;
        const json = await res.json();
        if (json.success && json.data) {
          const allProducts = [...(json.data.products || [])];
          const firstPageProducts = allProducts.map(normalizeProduct);

          // Session and assigned-store data must not wait for the complete
          // catalogue. Make the POS usable as soon as page one arrives.
          setProducts(firstPageProducts);
          setFilteredProducts(firstPageProducts);
          setStores(json.data.stores || []);
          setRecentBills(json.data.recentBills || []);
          setSalesSummary(
            json.data.salesSummary || {
              billCount: 0,
              salesTotal: 0,
              averageBill: 0,
              paidTotal: 0,
            },
          );
          setPaymentOptions(normalizePaymentOptions(json.data.paymentModes));
          if (json.data.session?.sessionId) {
            setSession(json.data.session);
            setSelectedStoreId(String(json.data.session.storeId || ""));
            setOpeningCash(String(json.data.session.openingCash || 0));
          } else if (json.data.selectedStoreId) {
            setSelectedStoreId(String(json.data.selectedStoreId));
            setOpeningCash("0");
          } else {
            setSession(null);
          }

          const totalProducts = toNumber(json.data.pagination?.total);
          const totalPages = totalProducts
            ? Math.ceil(totalProducts / POS_PRODUCT_PAGE_SIZE)
            : 1;

          const remainingPages = Array.from(
            { length: Math.max(0, totalPages - 1) },
            (_, index) => index + 2,
          );
          for (let index = 0; index < remainingPages.length; index += 3) {
            const pageResults = await Promise.all(
              remainingPages.slice(index, index + 3).map(async (page) => {
                const pageParams = new URLSearchParams(params);
                pageParams.set("page", String(page));
                const pageRes = await fetch(
                  `/api/sales-order/pos?${pageParams}`,
                  {
                    cache: "no-store",
                  },
                );
                const pageJson = await pageRes.json();
                return pageJson.success && pageJson.data
                  ? pageJson.data.products || []
                  : [];
              }),
            );
            pageResults.forEach((pageProducts) =>
              allProducts.push(...pageProducts),
            );
          }

          const mappedProducts = allProducts.map(normalizeProduct);
          try {
            const promoRes = await fetch(
              "/api/catalog/promotions?status=Active&pageSize=100",
              {
                cache: "no-store",
              },
            );
            const promoJson = await promoRes.json();
            setActivePromotions(
              promoJson.success ? promoJson.data?.records || [] : [],
            );
          } catch {
            setActivePromotions([]);
          }
          setProducts(mappedProducts);
          setFilteredProducts(mappedProducts);
          writeStorage(STORAGE_KEYS.CACHE, {
            storeId: String(json.data.selectedStoreId || activeStoreId || ""),
            products: mappedProducts,
            stores: json.data.stores || [],
            recentBills: json.data.recentBills || [],
            salesSummary: json.data.salesSummary || {
              billCount: 0,
              salesTotal: 0,
              averageBill: 0,
              paidTotal: 0,
            },
            paymentOptions: normalizePaymentOptions(json.data.paymentModes),
          });
        }
      } catch {
        const cached = readStorage(STORAGE_KEYS.CACHE, null);
        if (cached?.products) {
          setProducts(cached.products);
          setFilteredProducts(cached.products);
          setStores(cached.stores || []);
          setRecentBills(cached.recentBills || []);
          setSalesSummary(
            cached.salesSummary || {
              billCount: 0,
              salesTotal: 0,
              averageBill: 0,
              paidTotal: 0,
            },
          );
          setPaymentOptions(normalizePaymentOptions(cached.paymentOptions));
        }
      } finally {
        setLoading(false);
      }
    },
    [selectedStoreId, session?.storeId, deviceUid, salesDateFrom, salesDateTo],
  );

  const loadSalesTrackerData = useCallback(async () => {
    const activeStoreId = session?.storeId || selectedStoreId;
    if (!activeStoreId && user?.role !== "super_admin") return;
    setSalesTrackerLoading(true);
    try {
      const params = new URLSearchParams({
        bills_only: "true",
        bill_date_from: salesDateFrom,
        bill_limit: "500",
      });
      if (activeStoreId) params.set("store_id", String(activeStoreId));
      if (deviceUid) {
        params.set("device_uid", deviceUid);
        params.set("counter_uid", deviceUid);
      }
      const allBills = [];
      let summary = null;
      let offset = 0;
      do {
        params.set("bill_offset", String(offset));
        const res = await fetch(`/api/sales-order/pos?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.message || "Failed to load bills");
        }
        const pageBills = Array.isArray(json.data.recentBills)
          ? json.data.recentBills
          : [];
        allBills.push(...pageBills);
        summary ||= json.data.salesSummary || null;
        offset += pageBills.length;
        if (pageBills.length < 500 || offset >= toNumber(summary?.billCount))
          break;
      } while (true);

      setRecentBills((current) => [
        ...current.filter((bill) => bill.isOffline),
        ...allBills,
      ]);
      setSalesSummary(
        summary || {
          billCount: 0,
          salesTotal: 0,
          averageBill: 0,
          paidTotal: 0,
        },
      );
    } catch (err) {
      showToast(err.message || "Failed to load bills", "error");
    } finally {
      setSalesTrackerLoading(false);
    }
  }, [selectedStoreId, session?.storeId, user?.role, deviceUid, salesDateFrom]);

  useEffect(() => {
    if (!deviceUid || !user) return;
    loadSalesTrackerData();
  }, [deviceUid, user, loadSalesTrackerData]);

  const loadAuth = useCallback(async () => {
    try {
      const res = await fetchAuthEndpoint("/api/auth/me");
      const json = await res.json();
      if (json.success && json.data?.user) setUser(json.data.user);
    } catch {}
  }, []);

  // ── SEARCH ──
  const productCodeIndex = useMemo(() => {
    const index = new Map();
    for (const product of products) {
      for (const value of [product.barcode, product.sku, product.id]) {
        const code = String(value ?? "").trim();
        if (!code) continue;
        const matches = index.get(code);
        if (matches) matches.push(product);
        else index.set(code, [product]);
      }
    }
    return index;
  }, [products]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredProducts(products);
      return undefined;
    }
    // A hardware scanner emits many keys in a few milliseconds. Waiting for
    // the burst to finish avoids filtering and repainting the product grid for
    // every digit, while normal typed search still feels immediate.
    const timer = window.setTimeout(() => {
      const needle = search.toLowerCase();
      setFilteredProducts(
        products.filter(
          (p) =>
            (p.name && p.name.toLowerCase().includes(needle)) ||
            (p.sku && p.sku.toLowerCase().includes(needle)) ||
            (p.barcode && p.barcode.toLowerCase().includes(needle)),
        ),
      );
    }, 120);
    return () => window.clearTimeout(timer);
  }, [search, products]);

  // ── OFFLINE SYNC ──
  const syncOfflineQueue = useCallback(async () => {
    const queue = readStorage(STORAGE_KEYS.QUEUE, []);
    if (queue.length === 0) return;

    let synced = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        const res = await fetch("/api/sales-order/pos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...item.payload,
            payments:
              Array.isArray(item.payload.payments) &&
              item.payload.payments.length
                ? item.payload.payments
                : [
                    {
                      method: item.payload.paymentMode,
                      amount: toNumber(item.totals?.grandTotal || 0),
                    },
                  ],
          }),
        });
        const json = await res.json();
        if (json.success) {
          synced++;
          const savedBill = json.data?.bill;
          if (savedBill) {
            // Replace the local offline bill with the confirmed server bill
            setRecentBills((current) => {
              const filtered = current.filter(
                (b) =>
                  b.billNumber !== item.payload.invoiceNumber &&
                  b.invoiceNumber !== item.payload.invoiceNumber,
              );
              return [{ ...savedBill, isOffline: false }, ...filtered].slice(
                0,
                20,
              );
            });
          }
          // Remove from offline-bills storage too
          const offlineBills = readStorage(STORAGE_KEYS.OFFLINE_BILLS, []);
          writeStorage(
            STORAGE_KEYS.OFFLINE_BILLS,
            offlineBills.filter(
              (b) => b.billNumber !== item.payload.invoiceNumber,
            ),
          );
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    writeStorage(STORAGE_KEYS.QUEUE, remaining);
    setPendingQueueCount(remaining.length);
    if (synced > 0) {
      showToast(
        `✓ ${synced} offline bill${synced > 1 ? "s" : ""} synced & stock updated!`,
      );
      loadPOSData(); // Refresh products to show updated stock
    }
  }, [loadPOSData]);

  // ── INIT ──
  useEffect(() => {
    const localDeviceUid = getOrCreateLocalId("pos-device-uid-v1", "POSDEV");
    const savedCounterName =
      typeof window !== "undefined"
        ? window.localStorage.getItem("pos-counter-name-v1")
        : "";
    setDeviceUid(localDeviceUid);
    if (savedCounterName) setCounterName(savedCounterName);
    loadAuth();
    setHeldBills(readStorage(STORAGE_KEYS.HELD_BILLS, []));
    // Restore offline bills into recent bills on page load
    const savedOfflineBills = readStorage(STORAGE_KEYS.OFFLINE_BILLS, []);
    if (savedOfflineBills.length > 0) {
      setRecentBills((current) => {
        const merged = [...savedOfflineBills, ...current];
        const seen = new Set();
        return merged
          .filter((b) => {
            const key = b.billNumber || b.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 20);
      });
    }
    setIsOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    setPendingQueueCount(readStorage(STORAGE_KEYS.QUEUE, []).length);
    if (searchInputRef.current) searchInputRef.current.focus();
  }, [loadAuth]);

  const loadHeldBills = useCallback(async () => {
    const activeStoreId = session?.storeId || selectedStoreId;
    if (!activeStoreId) {
      setHeldBills(readStorage(STORAGE_KEYS.HELD_BILLS, []));
      return;
    }
    try {
      const params = new URLSearchParams({
        store_id: String(activeStoreId),
        limit: "100",
      });
      const res = await fetch(`/api/pos/held-bills?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success) {
        const serverHeld = Array.isArray(json.data?.heldBills)
          ? json.data.heldBills
          : [];
        setHeldBills(serverHeld);
        writeStorage(STORAGE_KEYS.HELD_BILLS, serverHeld);
        return;
      }
    } catch {}
    setHeldBills(readStorage(STORAGE_KEYS.HELD_BILLS, []));
  }, [selectedStoreId, session?.storeId]);

  useEffect(() => {
    loadHeldBills();
  }, [loadHeldBills]);

  useEffect(() => {
    if (paymentOptions.some((option) => option.value === paymentMode)) return;
    const nextMode = paymentOptions[0]?.value || "cash";
    setPaymentMode(nextMode);
    setPayments((current) =>
      current.map((payment) => ({
        ...payment,
        method: payment.method || nextMode,
      })),
    );
  }, [paymentMode, paymentOptions]);

  // Online / Offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      const pending = readStorage(STORAGE_KEYS.QUEUE, []);
      if (pending.length > 0) {
        syncOfflineQueue(); // Auto-sync silently; toast shown after success
      }
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast("You are offline. Bills will be saved locally.", "error");
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [syncOfflineQueue]);

  useEffect(() => {
    if (!deviceUid || initialPOSLoadStartedRef.current) return;
    initialPOSLoadStartedRef.current = true;
    loadPOSData();
    // Auto-sync any pending bills when POS loads while online
    if (typeof navigator !== "undefined" && navigator.onLine) {
      const pending = readStorage(STORAGE_KEYS.QUEUE, []);
      if (pending.length > 0) syncOfflineQueue();
    }
  }, [deviceUid, loadPOSData, syncOfflineQueue]);

  useEffect(() => {
    const draft = readStorage(STORAGE_KEYS.DRAFT, null);
    if (!draft) return;
    setCart(draft.cart || []);
    setCustomerName(draft.customerName || "");
    setCustomerMobile(
      draft.customerMobile
        ? String(draft.customerMobile).replace(/\D/g, "").slice(0, 10)
        : "",
    );
    setOrderDiscount(String(draft.orderDiscount ?? "0"));
    setRoundOff(String(draft.roundOff ?? "0"));
    setPaymentMode(draft.paymentMode || "cash");
    setPayments(createFixedPaymentRows(draft.payments));
  }, []);

  useEffect(() => {
    const token =
      receiptData?.bill?.publicToken || receiptData?.bill?.public_token;
    if (!token || !receiptModal) {
      setReceiptQR("");
      return;
    }
    generateQRDataURL(getInvoiceURL(token), { size: 160 })
      .then(setReceiptQR)
      .catch(() => setReceiptQR(""));
  }, [receiptData, receiptModal]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.DRAFT, {
      cart,
      customerName,
      customerMobile,
      orderDiscount,
      roundOff,
      paymentMode,
      payments,
    });
  }, [
    cart,
    customerName,
    customerMobile,
    orderDiscount,
    roundOff,
    paymentMode,
    payments,
  ]);

  // ── BARCODE ──
  useEffect(() => {
    if (!scannerOpen) return undefined;
    let detector = null;
    let rafId = 0;

    const stopScanner = () => {
      scannerStopRef.current = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    const startScanner = async () => {
      scannerStopRef.current = false;
      setScannerError("");
      setScannerStatus("Opening camera...");
      try {
        if (
          typeof window === "undefined" ||
          !navigator?.mediaDevices?.getUserMedia
        ) {
          throw new Error("Camera access is not available in this browser.");
        }
        if (!("BarcodeDetector" in window)) {
          throw new Error(
            "This browser does not support live barcode detection. Use the scan box with a hardware scanner.",
          );
        }
        detector = new window.BarcodeDetector({
          formats: [
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
            "qr_code",
          ],
        });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScannerStatus("Point camera at the barcode");

        const scanFrame = async () => {
          if (scannerStopRef.current || !videoRef.current || !detector) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const code = codes?.[0]?.rawValue;
            if (code) {
              stopScanner();
              setScannerOpen(false);
              await handleBarcode(code);
              return;
            }
          } catch {}
          rafId = requestAnimationFrame(scanFrame);
        };
        rafId = requestAnimationFrame(scanFrame);
      } catch (err) {
        setScannerStatus("");
        setScannerError(err.message || "Unable to start camera scanner.");
      }
    };

    startScanner();
    return stopScanner;
  }, [scannerOpen]);

  const handleBarcode = async (value) => {
    const code = value?.trim();
    if (!code) return;
    const requiresExactMatch = /^\d{6,}$/.test(code);
    const localMatches = productCodeIndex.get(code) || [];
    if (localMatches.length > 1) {
      setPriceVariantOptions(localMatches);
      setSearch("");
      return;
    }
    if (localMatches.length === 1) {
      addProduct(localMatches[0]);
      setSearch("");
      if (searchInputRef.current) searchInputRef.current.focus();
      return;
    }
    try {
      const activeStoreId = session?.storeId || selectedStoreId;
      const params = new URLSearchParams({ search: code, pageSize: "20" });
      if (activeStoreId) params.set("store_id", String(activeStoreId));
      const res = await fetch(`/api/sales-order/pos?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      const matches = (
        json.success ? (json.data?.products || []).map(normalizeProduct) : []
      ).filter(
        (p) =>
          (p.barcode && String(p.barcode) === code) ||
          (p.sku && String(p.sku) === code) ||
          String(p.id) === code,
      );
      if (matches.length > 1) {
        setPriceVariantOptions(matches);
        setSearch("");
      } else if (matches.length === 1) {
        addProduct(matches[0]);
        setSearch("");
      } else if (!requiresExactMatch && json.data?.products?.[0]) {
        addProduct(normalizeProduct(json.data.products[0]));
        setSearch("");
      } else {
        showToast("Product not found", "error");
      }
    } catch {
      showToast("Failed to lookup product", "error");
    } finally {
      if (searchInputRef.current) searchInputRef.current.focus();
    }
  };

  // ── CART ──
  const addProduct = (product) => {
    if (toNumber(product.availableStock) <= 0) {
      if (toNumber(product.expiredStock) > 0) {
        showToast(
          `${product.name} has ${product.expiredStock} expired stock. Billing is blocked for expired products.`,
          "error",
        );
        return;
      }
      showToast("No stock available", "error");
      return;
    }
    const weightedUnit = getWeightedUnitKind(product.unit);
    const weighted = Boolean(weightedUnit);
    const scaleQty = Number(scaleWeightKg.toFixed(3));
    const nextQty = weighted
      ? scaleQty > 0
        ? getScaleQuantityForUnit(scaleQty, weightedUnit)
        : getManualWeightedQuantity(weightedUnit)
      : 1;
    if (nextQty > toNumber(product.availableStock)) {
      showToast(
        `Only ${product.availableStock} ${product.unit || "qty"} available`,
        "error",
      );
      return;
    }
    const sellingPrice = product.sellingPrice || product.mrp || 0;
    const discountAmount = 0;
    const cartKey = getCartItemKey(product);
    if (weighted && scaleQty > 0) {
      activeScaleCartKeyRef.current = cartKey;
      setActiveScaleCartKey(cartKey);
    }
    setCart((current) => {
      const existing = current.find((item) => getCartItemKey(item) === cartKey);
      if (existing)
        return current.map((item) =>
          getCartItemKey(item) === cartKey
            ? {
                ...item,
                qty: weighted
                  ? scaleQty > 0
                    ? nextQty
                    : item.qty
                  : Math.min(
                      Number((item.qty + nextQty).toFixed(3)),
                      toNumber(product.availableStock),
                    ),
                discountAmount,
                sellingPrice,
              }
            : item,
        );
      return [
        ...current,
        { ...product, cartKey, qty: nextQty, discountAmount, sellingPrice },
      ];
    });
  };

  // Hardware barcode scanners behave like fast keyboards. Listen page-wide so
  // a scan can start a bill without the cashier first selecting the search box.
  // Actual form fields retain their normal keyboard behaviour.
  handleBarcodeRef.current = handleBarcode;
  useEffect(() => {
    const resetBuffer = () => {
      hardwareScanBufferRef.current = "";
      hardwareScanLastKeyAtRef.current = 0;
    };
    const onKeyDown = (event) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        scannerOpen ||
        openSessionModal ||
        closeSessionModal ||
        receiptModal ||
        priceVariantOptions.length > 0
      ) {
        resetBuffer();
        return;
      }

      const target = event.target;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (isEditable) {
        resetBuffer();
        return;
      }

      if (event.key === "Enter") {
        const code = hardwareScanBufferRef.current.trim();
        resetBuffer();
        if (!code) return;
        event.preventDefault();
        handleBarcodeRef.current?.(code);
        return;
      }

      if (event.key.length !== 1) return;
      const now = performance.now();
      if (
        hardwareScanLastKeyAtRef.current &&
        now - hardwareScanLastKeyAtRef.current > 120
      ) {
        hardwareScanBufferRef.current = "";
      }
      hardwareScanBufferRef.current += event.key;
      hardwareScanLastKeyAtRef.current = now;
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    closeSessionModal,
    openSessionModal,
    priceVariantOptions.length,
    receiptModal,
    scannerOpen,
  ]);

  useEffect(() => {
    activeScaleCartKeyRef.current = activeScaleCartKey;
  }, [activeScaleCartKey]);

  useEffect(() => {
    if (!openSessionModal && !closeSessionModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [closeSessionModal, openSessionModal]);

  useEffect(() => {
    if (!scaleConnected || !activeScaleCartKey) return;
    if (toNumber(scaleWeightKg) <= 0) return;
    setCart((current) =>
      current.map((item) => {
        if (getCartItemKey(item) !== activeScaleCartKey) return item;
        const weightedUnit = getWeightedUnitKind(item.unit);
        if (!weightedUnit) return item;
        const nextQty = Math.min(
          getScaleQuantityForUnit(scaleWeightKg, weightedUnit),
          toNumber(item.availableStock),
        );
        if (Number(item.qty) === nextQty) return item;
        return { ...item, qty: nextQty };
      }),
    );
  }, [activeScaleCartKey, scaleConnected, scaleWeightKg]);

  useEffect(() => {
    const activeStoreId = session?.storeId || selectedStoreId;
    if (!activeStoreId || !activePromotions.length || !products.length) {
      setCart((current) =>
        current.some((item) => item.promotionFreeItem)
          ? current.filter((item) => !item.promotionFreeItem)
          : current,
      );
      return;
    }

    setCart((current) => {
      const baseCart = current.filter((item) => !item.promotionFreeItem);
      const freeLines = [];

      for (const promotion of activePromotions) {
        if (!isPromotionActiveForStore(promotion, activeStoreId)) continue;
        const config = getPromotionProductsConfig(promotion.products);
        if (!config.freeProductId || config.freeProductQty <= 0) continue;

        const eligibleSubtotal = getPromotionEligibleSubtotal(
          baseCart,
          config.eligibleProductIds,
        );
        if (eligibleSubtotal < toNumber(promotion.min_cart_value)) continue;

        const freeProduct = products.find(
          (product) => Number(product.id) === Number(config.freeProductId),
        );
        if (
          !freeProduct ||
          toNumber(freeProduct.availableStock) < config.freeProductQty
        )
          continue;

        const qty = config.freeProductQty;
        const sellingPrice = toNumber(
          freeProduct.sellingPrice || freeProduct.mrp,
        );
        freeLines.push({
          ...freeProduct,
          cartKey: `promotion:${promotion.id}:free:${freeProduct.id}`,
          variantKey: `promotion:${promotion.id}:free:${freeProduct.id}`,
          qty,
          sellingPrice,
          discountAmount: qty * sellingPrice,
          allowDiscountOnPos: true,
          promotionFreeItem: true,
          promotionId: promotion.id,
          promotionName: promotion.name,
        });
      }

      const nextCart = [...baseCart, ...freeLines];
      const signature = (items) =>
        items
          .map((item) =>
            [
              getCartItemKey(item),
              item.id,
              item.qty,
              item.sellingPrice,
              item.discountAmount,
              item.promotionFreeItem ? item.promotionId : "",
            ].join(":"),
          )
          .join("|");
      return signature(current) === signature(nextCart) ? current : nextCart;
    });
  }, [activePromotions, cart, products, selectedStoreId, session?.storeId]);

  const updateCartItem = (key, field, value) =>
    setCart((current) =>
      current.map((item) =>
        getCartItemKey(item) === String(key)
          ? { ...item, [field]: value }
          : item,
      ),
    );

  const clearQtyDraft = (key) => {
    setQtyDrafts((current) => {
      if (!(String(key) in current)) return current;
      const next = { ...current };
      delete next[String(key)];
      return next;
    });
  };

  const commitCartQtyDraft = (key, item, draftValue) => {
    const nextQty = normalizeCartQtyValue(item, draftValue, item.qty);
    clearQtyDraft(key);
    updateCartItem(key, "qty", nextQty);
    return nextQty;
  };

  const getCartWithCommittedQtyDrafts = () =>
    cart.map((item) => {
      const itemKey = getCartItemKey(item);
      if (!(itemKey in qtyDrafts)) return item;
      return {
        ...item,
        qty: normalizeCartQtyValue(item, qtyDrafts[itemKey], item.qty),
      };
    });

  const unlinkScaleFromCartItem = (key) => {
    if (activeScaleCartKey === String(key)) {
      activeScaleCartKeyRef.current = "";
      setActiveScaleCartKey("");
    }
  };

  const linkScaleToCartItem = (key) => {
    activeScaleCartKeyRef.current = String(key);
    setActiveScaleCartKey(String(key));
  };

  const logDeletedCartItems = useCallback(
    async (
      items,
      eventType = "item_removed",
      reason = "Removed before billing",
    ) => {
      const rows = (Array.isArray(items) ? items : []).filter(
        (item) => item && !item.promotionFreeItem,
      );
      const activeStoreId = session?.storeId || selectedStoreId;
      if (!rows.length || !activeStoreId || isOffline || !navigator.onLine) {
        return [];
      }

      try {
        const res = await fetch("/api/pos/deleted-cart-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            cartSessionId,
            storeId: activeStoreId,
            posSessionId: session?.sessionId || null,
            counterId: session?.counterId || null,
            eventType,
            reason,
            items: rows.map((item) => ({
              ...item,
              cartKey: getCartItemKey(item),
            })),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) return [];
        const ids = (json.data?.ids || [])
          .map(Number)
          .filter((id) => Number.isFinite(id) && id > 0);
        if (ids.length) {
          setDeletedCartItemIds((current) => [...current, ...ids]);
        }
        return ids;
      } catch (err) {
        console.warn("[POS] Deleted cart item log failed", err);
        return [];
      }
    },
    [
      cartSessionId,
      isOffline,
      selectedStoreId,
      session?.counterId,
      session?.sessionId,
      session?.storeId,
    ],
  );

  const removeCartItem = (key) => {
    if (activeScaleCartKey === String(key)) {
      activeScaleCartKeyRef.current = "";
      setActiveScaleCartKey("");
    }
    const removedItem = cart.find(
      (item) => getCartItemKey(item) === String(key),
    );
    if (removedItem) {
      void logDeletedCartItems(
        [removedItem],
        "item_removed",
        "Removed before billing",
      );
    }
    clearQtyDraft(key);
    if (cart.length <= 1) {
      setCartSessionId(createCartSessionId());
      setDeletedCartItemIds([]);
    }
    setCart((current) =>
      current.filter((item) => getCartItemKey(item) !== String(key)),
    );
  };

  const clearCart = ({
    trackDeletedItems = false,
    resetCartSession = true,
  } = {}) => {
    if (trackDeletedItems && cart.length) {
      void logDeletedCartItems(
        cart,
        "cart_cleared",
        "Cart cleared before billing",
      );
    }
    if (activeDiscountRequest?.id) {
      fetch(`/api/pos/discount-requests?id=${activeDiscountRequest.id}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setCart([]);
    setQtyDrafts({});
    activeScaleCartKeyRef.current = "";
    setActiveScaleCartKey("");
    setCustomerName("");
    setCustomerMobile("");
    setOrderDiscount("0");
    setRoundOff("0");
    setPayments(createFixedPaymentRows());
    setPaymentMode("cash");
    setSearch("");
    setActiveDiscountRequest(null);
    if (resetCartSession) {
      setCartSessionId(createCartSessionId());
      setDeletedCartItemIds([]);
    }
  };

  const clearApprovedManualDiscount = useCallback(() => {
    setOrderDiscount("0");
    setCart((current) =>
      current.map((item) =>
        item.approvedManualDiscount
          ? {
              ...item,
              discountAmount: 0,
              approvedManualDiscount: false,
              discountApprovalId: null,
            }
          : item,
      ),
    );
    setActiveDiscountRequest(null);
  }, []);

  const applyApprovedDiscountRequest = useCallback(
    (requestRow) => {
      const amount = toNumber(requestRow?.approvedAmount);
      if (!requestRow || amount <= 0) return;

      if (requestRow.scope === "order") {
        setOrderDiscount(String(amount));
      } else {
        setCart((current) =>
          current.map((item) =>
            getCartItemKey(item) === String(requestRow.targetCartKey)
              ? {
                  ...item,
                  discountAmount: amount,
                  approvedManualDiscount: true,
                  discountApprovalId: requestRow.id,
                }
              : item,
          ),
        );
      }
      setActiveDiscountRequest((current) => ({
        ...requestRow,
        cartSignature: current?.cartSignature || getDiscountCartSignature(cart),
      }));
      showToast(`Discount approved: ${formatCurrency(amount)}`, "success");
    },
    [cart],
  );

  const openDiscountRequest = () => {
    if (!session?.sessionId) {
      showToast("Open session first", "error");
      return;
    }
    if (!cart.length) {
      showToast("Add products to cart first", "error");
      return;
    }
    if (!navigator.onLine || isOffline) {
      showToast("Discount approval requires an online connection", "error");
      return;
    }
    const firstItem = cart.find((item) => !item.promotionFreeItem);
    setDiscountRequestForm({
      scope: "order",
      targetCartKey: firstItem ? getCartItemKey(firstItem) : "",
      amount: "",
      reason: "",
    });
    setDiscountRequestOpen(true);
  };

  const submitDiscountRequest = async () => {
    const amount = toNumber(discountRequestForm.amount);
    if (amount <= 0) {
      showToast("Enter a valid discount amount", "error");
      return;
    }
    if (!discountRequestForm.reason.trim()) {
      showToast("Discount reason is required", "error");
      return;
    }

    const targetItem = cart.find(
      (item) =>
        getCartItemKey(item) === String(discountRequestForm.targetCartKey),
    );
    setDiscountRequestSaving(true);
    try {
      const res = await fetch("/api/pos/discount-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: session?.storeId || selectedStoreId,
          sessionId: session?.sessionId,
          scope: discountRequestForm.scope,
          targetCartKey:
            discountRequestForm.scope === "item"
              ? discountRequestForm.targetCartKey
              : "",
          targetProductName: targetItem?.name || "",
          amount,
          reason: discountRequestForm.reason.trim(),
          items: cart.map((item) => ({
            cartKey: getCartItemKey(item),
            productId: item.id,
            qty: item.qty,
            sellingPrice: item.sellingPrice,
            selectedBatchId: item.selectedBatchId,
            promotionId: item.promotionId || null,
            promotionFreeItem: !!item.promotionFreeItem,
          })),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || "Discount request failed");
      }
      setActiveDiscountRequest({
        ...json.data,
        cartSignature: getDiscountCartSignature(cart),
      });
      setDiscountRequestOpen(false);
      showToast("Discount request sent to Super Admin", "success");
    } catch (error) {
      showToast(error.message || "Discount request failed", "error");
    } finally {
      setDiscountRequestSaving(false);
    }
  };

  const loadDiscountApprovals = useCallback(
    async (openModal = false) => {
      if (user?.role !== "super_admin") return;
      if (openModal) setDiscountApprovalLoading(true);
      try {
        const res = await fetch("/api/pos/discount-requests?status=pending", {
          cache: "no-store",
        });
        const json = await res.json();
        if (json.success) {
          setDiscountApprovalRows(json.data?.records || []);
          if (openModal) setDiscountApprovalOpen(true);
        }
      } catch {
        if (openModal) showToast("Failed to load discount requests", "error");
      } finally {
        if (openModal) setDiscountApprovalLoading(false);
      }
    },
    [user?.role],
  );

  const reviewDiscountRequest = async (requestRow, action) => {
    setDiscountReviewingId(requestRow.id);
    try {
      const res = await fetch("/api/pos/discount-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestRow.id,
          action,
          approvedAmount: requestRow.requestedAmount,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || "Review failed");
      }
      showToast(
        action === "approve" ? "Discount approved" : "Discount rejected",
      );
      await loadDiscountApprovals();
    } catch (error) {
      showToast(error.message || "Review failed", "error");
    } finally {
      setDiscountReviewingId(null);
    }
  };

  useEffect(() => {
    if (
      !activeDiscountRequest?.id ||
      !["pending", "approved"].includes(activeDiscountRequest.status)
    ) {
      return;
    }
    let stopped = false;
    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/pos/discount-requests?id=${activeDiscountRequest.id}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (stopped || !json.success) return;
        const requestRow = json.data?.records?.[0];
        if (!requestRow) return;
        if (
          requestRow.status === "approved" &&
          activeDiscountRequest.status === "pending"
        ) {
          const expectedSignature = activeDiscountRequest.cartSignature;
          if (expectedSignature !== getDiscountCartSignature(cart)) {
            clearApprovedManualDiscount();
            showToast(
              "Cart changed. Discount approval was cancelled.",
              "error",
            );
            return;
          }
          applyApprovedDiscountRequest({
            ...requestRow,
            cartSignature: expectedSignature,
          });
        } else if (
          ["rejected", "expired", "cancelled"].includes(requestRow.status)
        ) {
          clearApprovedManualDiscount();
          showToast(`Discount request ${requestRow.status}`, "error");
        }
      } catch {}
    };
    checkStatus();
    const timer = window.setInterval(checkStatus, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    activeDiscountRequest?.id,
    activeDiscountRequest?.status,
    activeDiscountRequest?.cartSignature,
    applyApprovedDiscountRequest,
    cart,
    clearApprovedManualDiscount,
  ]);

  useEffect(() => {
    if (!activeDiscountRequest?.id || !activeDiscountRequest.cartSignature) {
      return;
    }
    if (
      activeDiscountRequest.cartSignature === getDiscountCartSignature(cart)
    ) {
      return;
    }

    const requestId = activeDiscountRequest.id;
    fetch(`/api/pos/discount-requests?id=${requestId}`, {
      method: "DELETE",
    }).catch(() => {});
    clearApprovedManualDiscount();
    showToast("Cart changed. Request a new discount approval.", "error");
  }, [activeDiscountRequest, cart, clearApprovedManualDiscount]);

  useEffect(() => {
    if (user?.role !== "super_admin") return;
    loadDiscountApprovals();
    const timer = window.setInterval(() => loadDiscountApprovals(), 10000);
    return () => window.clearInterval(timer);
  }, [loadDiscountApprovals, user?.role]);

  useEffect(() => {
    if (
      !canRequestDiscount ||
      activeDiscountRequest ||
      !cart.length ||
      !(session?.storeId || selectedStoreId)
    ) {
      return;
    }
    let stopped = false;
    const restoreActiveRequest = async () => {
      try {
        const storeId = session?.storeId || selectedStoreId;
        const res = await fetch(
          `/api/pos/discount-requests?active=true&store_id=${storeId}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (stopped || !json.success) return;
        const currentSignature = getDiscountCartSignature(cart);
        const matching = (json.data?.records || []).find(
          (requestRow) =>
            getDiscountCartSignature(requestRow.cartSnapshot) ===
            currentSignature,
        );
        if (!matching) return;
        const restored = { ...matching, cartSignature: currentSignature };
        if (restored.status === "approved") {
          setActiveDiscountRequest(restored);
          applyApprovedDiscountRequest(restored);
        } else {
          setActiveDiscountRequest(restored);
        }
      } catch {}
    };
    restoreActiveRequest();
    return () => {
      stopped = true;
    };
  }, [
    activeDiscountRequest,
    applyApprovedDiscountRequest,
    canRequestDiscount,
    cart,
    selectedStoreId,
    session?.storeId,
  ]);

  const saveHeldBills = (next) => {
    setHeldBills(next);
    writeStorage(STORAGE_KEYS.HELD_BILLS, next);
  };

  const saveHeldBillToServer = async (heldBill) => {
    const activeStoreId = session?.storeId || selectedStoreId;
    if (
      !activeStoreId ||
      isOffline ||
      (typeof navigator !== "undefined" && !navigator.onLine)
    )
      return null;
    try {
      const res = await fetch("/api/pos/held-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...heldBill,
          storeId: activeStoreId,
          sessionId: session?.sessionId || null,
          deviceUid,
          counterUid: deviceUid,
          counterName: session?.counterName || counterName,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.heldBill) return json.data.heldBill;
    } catch {}
    return null;
  };

  const removeHeldBillFromServer = async (id) => {
    if (
      !id ||
      isOffline ||
      (typeof navigator !== "undefined" && !navigator.onLine)
    )
      return;
    try {
      await fetch(`/api/pos/held-bills?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch {}
  };

  const buildHeldBill = () => ({
    id: `HOLD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    heldAt: new Date().toISOString(),
    storeId: session?.storeId || selectedStoreId,
    sessionId: session?.sessionId || null,
    cart,
    customerName,
    customerMobile,
    orderDiscount,
    roundOff,
    paymentMode,
    payments,
    totals: cartTotals,
  });

  const holdCurrentBill = async () => {
    if (cart.length === 0) {
      showToast("Add products before holding bill", "error");
      return;
    }
    const heldBill = buildHeldBill();
    saveHeldBills([heldBill, ...heldBills].slice(0, 25));
    clearCart();
    const serverHeld = await saveHeldBillToServer(heldBill);
    if (serverHeld) {
      const next = [
        serverHeld,
        ...heldBills.filter((b) => b.id !== heldBill.id),
      ].slice(0, 100);
      saveHeldBills(next);
    }
    showToast(`Bill held for ${heldBill.customerName || "Walk-in Customer"}`);
  };

  const resumeHeldBill = async (heldBill) => {
    if (cart.length > 0) {
      showToast("Hold or clear current bill before resuming", "error");
      return;
    }
    setCart(heldBill.cart || []);
    setCustomerName(heldBill.customerName || "");
    setCustomerMobile(
      heldBill.customerMobile
        ? String(heldBill.customerMobile).replace(/\D/g, "").slice(0, 10)
        : "",
    );
    setOrderDiscount(String(heldBill.orderDiscount ?? "0"));
    setRoundOff(String(heldBill.roundOff ?? "0"));
    setPaymentMode(heldBill.paymentMode || "cash");
    setPayments(createFixedPaymentRows(heldBill.payments));
    saveHeldBills(heldBills.filter((b) => b.id !== heldBill.id));
    await removeHeldBillFromServer(heldBill.id);
    setHoldDetectModal(false);
    setDetectedHeldBills([]);
    showToast("Held bill resumed");
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const removeHeldBill = async (id) => {
    saveHeldBills(heldBills.filter((b) => b.id !== id));
    await removeHeldBillFromServer(id);
    showToast("Held bill removed", "info");
  };

  const checkForHeldBills = (mobile) => {
    if (!mobile || mobile.length < 10) return;
    const normalized = mobile.replace(/\D/g, "").slice(0, 10);
    const matches = heldBills
      .filter(
        (b) =>
          b.customerMobile &&
          b.customerMobile.replace(/\D/g, "").slice(0, 10) === normalized,
      )
      .sort((a, b) => new Date(b.heldAt || 0) - new Date(a.heldAt || 0));
    if (matches.length > 0) {
      setDetectedHeldBills(matches);
      setHoldDetectModal(true);
    }
  };

  const holdCurrentAndResume = async (heldBill) => {
    const withoutTarget = heldBills.filter((b) => b.id !== heldBill.id);
    let nextHeldBills = withoutTarget;
    if (cart.length > 0) {
      const currentHeld = buildHeldBill();
      nextHeldBills = [currentHeld, ...withoutTarget].slice(0, 25);
      saveHeldBillToServer(currentHeld).then((serverHeld) => {
        if (serverHeld) {
          saveHeldBills([serverHeld, ...withoutTarget].slice(0, 100));
        }
      });
    }
    setCart(heldBill.cart || []);
    setCustomerName(heldBill.customerName || "");
    setCustomerMobile(
      heldBill.customerMobile
        ? String(heldBill.customerMobile).replace(/\D/g, "").slice(0, 10)
        : "",
    );
    setOrderDiscount(String(heldBill.orderDiscount ?? "0"));
    setRoundOff(String(heldBill.roundOff ?? "0"));
    setPaymentMode(heldBill.paymentMode || "cash");
    setPayments(createFixedPaymentRows(heldBill.payments));
    saveHeldBills(nextHeldBills);
    await removeHeldBillFromServer(heldBill.id);
    setHoldDetectModal(false);
    setDetectedHeldBills([]);
    showToast(
      cart.length > 0
        ? `Current cart held · Resumed ${heldBill.customerName || "held bill"}`
        : `Resumed ${heldBill.customerName || "held bill"}`,
    );
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  // ── TOTALS ──
  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum + item.qty * item.sellingPrice,
      0,
    );
    const lineDiscount = cart.reduce(
      (sum, item) =>
        sum +
        (item.promotionFreeItem ||
        item.approvedManualDiscount ||
        (canManageDiscounts && item.allowDiscountOnPos)
          ? toNumber(item.discountAmount)
          : 0),
      0,
    );
    const gstTotal = cart.reduce(
      (sum, item) => sum + calculateGstLine(item, canManageDiscounts).gstAmount,
      0,
    );
    const exclusiveGstTotal = cart.reduce(
      (sum, item) =>
        sum + calculateGstLine(item, canManageDiscounts).exclusiveGstAmount,
      0,
    );
    const discount =
      (canApplyOrderDiscount ? toNumber(orderDiscount) : 0) + lineDiscount;
    const amountBeforeRoundOff = Math.max(
      0,
      subtotal - discount + exclusiveGstTotal,
    );
    const roundValue = calculateRoundOff(amountBeforeRoundOff);
    const grandTotal = Math.max(
      0,
      Math.round((amountBeforeRoundOff + roundValue) * 100) / 100,
    );
    return {
      subtotal,
      lineDiscount,
      taxTotal: gstTotal,
      exclusiveGstTotal,
      discount,
      roundValue,
      grandTotal,
    };
  }, [cart, canApplyOrderDiscount, canManageDiscounts, orderDiscount]);

  useEffect(() => {
    const nextRoundOff = cartTotals.roundValue.toFixed(2);
    setRoundOff((current) =>
      current === nextRoundOff ? current : nextRoundOff,
    );
  }, [cartTotals.roundValue]);

  const normalizedPayments = useMemo(() => {
    const rows = payments
      .map((payment) => ({
        method: payment.method || paymentMode || "cash",
        amount: toNumber(payment.amount),
        referenceNo: payment.referenceNo || "",
      }))
      .filter((payment) => payment.amount > 0);

    if (!rows.length && cartTotals.grandTotal > 0) {
      return [
        {
          method: paymentMode || "cash",
          amount: cartTotals.grandTotal,
          referenceNo: "",
        },
      ];
    }
    return rows;
  }, [payments, paymentMode, cartTotals.grandTotal]);

  const paidTotal = useMemo(
    () =>
      normalizedPayments.reduce(
        (sum, payment) => sum + toNumber(payment.amount),
        0,
      ),
    [normalizedPayments],
  );
  const paymentBalance =
    Math.round((cartTotals.grandTotal - paidTotal) * 100) / 100;
  const changeReturnableTenderTotal = useMemo(
    () =>
      normalizedPayments.reduce(
        (sum, payment) =>
          canReturnChangeForMethod(payment.method)
            ? sum + toNumber(payment.amount)
            : sum,
        0,
      ),
    [normalizedPayments],
  );
  const changeDue = Math.max(
    0,
    Math.round((paidTotal - cartTotals.grandTotal) * 100) / 100,
  );
  const isPaymentCovered = paymentBalance <= 0.01;
  const isChangeAllowed =
    changeDue <= 0.01 || changeReturnableTenderTotal >= changeDue - 0.01;
  const isPaymentBalanced = isPaymentCovered && isChangeAllowed;
  const canGenerateBill =
    !!session?.sessionId &&
    cart.length > 0 &&
    !isProcessing &&
    activeDiscountRequest?.status !== "pending" &&
    isPaymentBalanced;
  const isCloseTimeRestricted = isSessionCloseTimeRestricted(user);
  const canCloseSessionNow = !isCloseTimeRestricted || canClosePosSessionNow();

  const updatePayment = (index, field, value) => {
    setPayments((current) =>
      current.map((payment, idx) =>
        idx === index ? { ...payment, [field]: value } : payment,
      ),
    );
    if (field === "method" && index === 0) setPaymentMode(value);
  };

  const getOtherPaymentTotal = (method) =>
    payments.reduce(
      (sum, payment) =>
        payment.method === method ? sum : sum + toNumber(payment.amount),
      0,
    );

  const isPaymentMethodDisabled = (method) =>
    cartTotals.grandTotal > 0 &&
    getOtherPaymentTotal(method) >= cartTotals.grandTotal - 0.01;

  const handlePaymentAmountChange = (method, value) => {
    if (value === "") {
      setPayments((current) =>
        current.map((payment) =>
          payment.method === method ? { ...payment, amount: "" } : payment,
        ),
      );
      return;
    }

    const requestedAmount = Number(value);
    if (!Number.isFinite(requestedAmount) || requestedAmount < 0) return;

    const otherPaymentTotal = getOtherPaymentTotal(method);
    const remainingAmount = Math.max(
      0,
      Math.round((cartTotals.grandTotal - otherPaymentTotal) * 100) / 100,
    );

    if (requestedAmount > 0 && remainingAmount <= 0.01) {
      showToast(
        "The bill total is already covered by another payment mode",
        "error",
      );
      return;
    }

    let acceptedValue = value;
    if (
      !canReturnChangeForMethod(method) &&
      requestedAmount > remainingAmount + 0.001
    ) {
      acceptedValue = remainingAmount > 0 ? String(remainingAmount) : "";
      showToast(
        `${formatPaymentMethod(method)} cannot exceed the remaining bill amount`,
        "error",
      );
    }

    setPayments((current) =>
      current.map((payment) =>
        payment.method === method
          ? { ...payment, amount: acceptedValue }
          : payment,
      ),
    );
  };

  const addPaymentRow = () => {
    const remaining = Math.max(
      0,
      Math.round((cartTotals.grandTotal - paidTotal) * 100) / 100,
    );
    setPayments((current) => [
      ...current,
      {
        method: "cash",
        amount: remaining ? String(remaining) : "",
        referenceNo: "",
      },
    ]);
  };

  const removePaymentRow = (index) => {
    setPayments((current) =>
      current.length <= 1 ? current : current.filter((_, idx) => idx !== index),
    );
  };

  // ── CUSTOMER HISTORY ──
  const submitCustomerDemand = async () => {
    const activeStoreId = session?.storeId || selectedStoreId;
    const productName = customerDemandForm.productName.trim();
    if (!activeStoreId) {
      showToast("Open/select a store first", "error");
      return;
    }
    if (!productName) {
      showToast("Enter demanded product name", "error");
      return;
    }
    setCustomerDemandSaving(true);
    try {
      const res = await fetch("/api/customer-demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId: activeStoreId,
          productName,
          requestedQty: toNumber(customerDemandForm.requestedQty, 1),
          customerName,
          customerMobile,
          remarks: customerDemandForm.remarks,
          source: "pos",
        }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error || "Failed to save customer demand");
      setCustomerDemandModal(false);
      setCustomerDemandForm({
        productName: "",
        requestedQty: "1",
        remarks: "",
      });
      showToast("Customer demand sent to store manager");
    } catch (err) {
      showToast(err.message || "Failed to save customer demand", "error");
    } finally {
      setCustomerDemandSaving(false);
    }
  };
  const loadCustomerHistory = async () => {
    if (!customerName.trim() && !customerMobile.trim()) {
      showToast("Enter customer name or mobile", "error");
      return;
    }
    try {
      const historyQuery = customerMobile || customerName;
      const activeStoreId = session?.storeId || selectedStoreId;
      const params = new URLSearchParams({ search: historyQuery });
      if (activeStoreId) params.set("store_id", String(activeStoreId));
      const res = await fetch(`/api/sales-order/customer-history?${params}`);
      const json = await res.json();
      if (json.success && json.data) {
        setCustomerHistory(json.data.bills || []);
        setCustomerHistoryModal(true);
      } else showToast("No history found", "info");
    } catch {
      showToast("Failed to load history", "error");
    }
  };

  const selectCustomerFromHistory = (bill) => {
    setCustomerName(bill.customerName || customerName);
    setCustomerMobile(
      bill.customerMobile
        ? String(bill.customerMobile).replace(/\D/g, "").slice(0, 10)
        : customerMobile || "",
    );
    if (bill.paymentMode) setPaymentMode(bill.paymentMode);
    setCustomerHistoryModal(false);
    showToast("Customer details filled from history");
  };

  const buildPlainReceiptText = (receipt, receiptConfig) => {
    const bill = receipt?.bill || {};
    const items = Array.isArray(receipt?.items) ? receipt.items : [];
    const billMeta = (() => {
      try {
        return typeof bill.meta === "string"
          ? JSON.parse(bill.meta || "{}")
          : bill.meta || {};
      } catch {
        return {};
      }
    })();
    const activeStore =
      stores.find(
        (store) =>
          String(store.id) ===
          String(
            bill.storeId ||
              bill.store_id ||
              session?.storeId ||
              selectedStoreId,
          ),
      ) || null;
    const width = toNumber(receiptConfig.paperWidthMm, 80) <= 58 ? 32 : 42;
    const storeName =
      bill.storeName ||
      bill.store_name ||
      session?.storeName ||
      activeStore?.name ||
      receiptConfig.businessName ||
      "Store";
    const isKanpurReceipt = isKanpurReceiptStore(
      storeName,
      bill.storeName,
      bill.store_name,
      activeStore?.name,
      activeStore?.code,
      activeStore?.slug,
    );
    const receiptStoreName = isKanpurReceipt
      ? getKanpurReceiptDisplayStoreName(storeName)
      : storeName;
    const receiptStoreAddress = getReceiptStoreAddress(bill, activeStore);
    const receiptStorePhone = getReceiptStorePhone(bill, activeStore);
    const billNumber =
      bill.billNumber || bill.bill_number || bill.invoiceNumber || "-";
    const dateParts = getReceiptDateParts(
      bill.createdAt || bill.created_at || Date.now(),
    );
    const salesPerson =
      billMeta?.billed_by?.name ||
      billMeta?.billedBy ||
      user?.name ||
      bill.created_by ||
      bill.salesman ||
      "-";
    const activeCounterName =
      bill.counterName ||
      bill.counter_name ||
      billMeta?.counterName ||
      session?.counterName ||
      counterName ||
      bill.counter ||
      bill.counter_id ||
      "-";
    const grandTotal = toNumber(
      bill.grand_total || bill.grandTotal || receipt.grandTotal || 0,
    );
    const subtotal = toNumber(bill.subtotal || receipt.subtotal || 0);
    const discountTotal = toNumber(
      bill.discount_total || bill.discountTotal || receipt.discount || 0,
    );
    const taxTotal = toNumber(
      bill.tax_total || bill.totalTax || receipt.taxTotal || 0,
    );
    const totalQty = items.reduce(
      (sum, item) => sum + toNumber(item.qty, 1),
      0,
    );
    const paymentText = formatPaymentBreakup(
      getReceiptPayments(receipt),
      bill.payment_mode || bill.paymentMode || "cash",
    );
    const headerLines = String(receiptConfig.headerText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const rawCustomerMobile =
      bill.customerMobile || bill.customer_mobile || customerMobile || "";
    const customerMobileText = isKanpurReceipt
      ? maskReceiptMobileLast4(rawCustomerMobile)
      : rawCustomerMobile;

    const lines = [];
    lines.push(centerReceiptText("RETAIL INVOICE", width));
    lines.push(centerReceiptText(receiptStoreName, width));
    if (isKanpurReceipt) {
      lines.push(
        centerReceiptText(`GST NO: ${KANPUR_RECEIPT_DETAILS.gstNo}`, width),
      );
      splitReceiptText(KANPUR_RECEIPT_DETAILS.address, width).forEach((line) =>
        lines.push(centerReceiptText(line, width)),
      );
      lines.push(
        centerReceiptText(`Store No: ${KANPUR_RECEIPT_DETAILS.phone}`, width),
      );
    } else {
      splitReceiptText(receiptStoreAddress, width)
        .filter((line) => line.trim())
        .forEach((line) => lines.push(centerReceiptText(line, width)));
      if (receiptStorePhone) {
        lines.push(centerReceiptText(`PHNO. ${receiptStorePhone}`, width));
      }
    }
    headerLines.forEach((line) =>
      splitReceiptText(line, width).forEach((part) =>
        lines.push(centerReceiptText(part, width)),
      ),
    );
    lines.push(receiptTextLine("-", width));
    lines.push(`Bill No: ${billNumber}`.slice(0, width));
    lines.push(
      `Date: ${dateParts.date}  Time: ${dateParts.time}`.slice(0, width),
    );
    lines.push(`Salesman: ${salesPerson}`.slice(0, width));
    lines.push(`Counter: ${activeCounterName}`.slice(0, width));
    if (customerMobileText) {
      lines.push(`Mobile: ${customerMobileText}`.slice(0, width));
    }
    lines.push(receiptTextLine("-", width));
    lines.push(
      "ITEM".padEnd(Math.max(10, width - 19), " ") +
        "QTY".padStart(5, " ") +
        "AMT".padStart(14, " "),
    );
    lines.push(receiptTextLine("-", width));
    items.forEach((item, index) => {
      const qty = toNumber(item.qty, 1);
      const rate = toNumber(
        item.selling_price || item.sellingPrice || item.mrp,
      );
      const amount = toNumber(item.line_total, qty * rate);
      const nameLines = splitReceiptText(
        `${index + 1}. ${item.name || item.product_name || "Product"}`,
        width,
      );
      nameLines.forEach((line) => lines.push(line));
      lines.push(
        `${formatReceiptMoney(rate)} x ${formatReceiptQty(qty)}`
          .slice(0, Math.max(10, width - 14))
          .padEnd(Math.max(10, width - 14), " ") +
          formatReceiptMoney(amount).padStart(14, " "),
      );
    });
    lines.push(receiptTextLine("-", width));
    lines.push(
      receiptAmountLine("Total Qty", formatReceiptQty(totalQty), width),
    );
    if (subtotal)
      lines.push(
        receiptAmountLine("Subtotal", formatReceiptMoney(subtotal), width),
      );
    if (discountTotal)
      lines.push(
        receiptAmountLine("Discount", formatReceiptMoney(discountTotal), width),
      );
    if (taxTotal)
      lines.push(receiptAmountLine("GST", formatReceiptMoney(taxTotal), width));
    lines.push(receiptTextLine("=", width));
    lines.push(
      receiptAmountLine("NET AMOUNT", formatReceiptMoney(grandTotal), width),
    );
    lines.push(receiptTextLine("=", width));
    splitReceiptText(numberToIndianWords(grandTotal), width).forEach((line) =>
      lines.push(centerReceiptText(line, width)),
    );
    lines.push(centerReceiptText("(INCL. OF ALL GST TAXES)", width));
    lines.push(receiptTextLine("-", width));
    splitReceiptText(`Paid By: ${paymentText}`, width).forEach((line) =>
      lines.push(line),
    );
    lines.push(receiptTextLine("-", width));
    splitReceiptText(
      receiptConfig.footerText || "Thank you. Visit again.",
      width,
    ).forEach((line) => lines.push(centerReceiptText(line, width)));
    if (isKanpurReceipt) {
      lines.push(receiptTextLine("-", width));
      splitReceiptText(KANPUR_RECEIPT_DETAILS.exchangePolicy, width).forEach(
        (line) => lines.push(centerReceiptText(line, width)),
      );
    }
    return lines.join("\n");
  };

  const directPrintReceipt = async (receipt = receiptData) => {
    if (!receipt) return;
    setDirectPrintLoading(true);
    try {
      const savedReceiptConfig = await loadReceiptConfig();
      const activePrintConfig = receiptPrintLoaded
        ? receiptPrintConfig
        : savedReceiptConfig;
      const receiptConfig = normalizeReceiptConfig({
        ...savedReceiptConfig,
        ...activePrintConfig,
      });
      if (!receiptConfig.printerName) {
        showToast("Enter and save the exact printer name first", "error");
        return;
      }
      const receiptText = buildPlainReceiptText(receipt, receiptConfig);
      const res = await fetch("/api/pos/direct-print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          printerName: receiptConfig.printerName,
          receiptText,
          cutFeedLines: receiptConfig.cutFeedLines,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Direct print failed");
      showToast(`Receipt sent to ${receiptConfig.printerName}`);
    } catch (error) {
      showToast(error.message || "Direct print failed", "error");
    } finally {
      setDirectPrintLoading(false);
    }
  };

  const printReceipt = async (receipt = receiptData) => {
    if (!receipt || typeof window === "undefined") return;
    // Open synchronously while the click still carries a user gesture. Opening
    // after the settings/QR awaits is liable to be blocked by the browser.
    const printWindow = window.open("", "_blank", "width=400,height=720");
    if (!printWindow) {
      showToast(
        "Popup blocked. Please allow popups to print receipt.",
        "error",
      );
      return;
    }
    printWindow.document.write(
      '<!doctype html><title>Preparing receipt...</title><p style="font-family:Arial,sans-serif;padding:16px">Preparing receipt...</p>',
    );
    printWindow.document.close();

    const bill = receipt.bill || {};
    const items = receipt.items || [];
    const activePrintConfig = receiptPrintLoaded
      ? receiptPrintConfig
      : DEFAULT_RECEIPT_CONFIG;
    const receiptConfig = normalizeReceiptConfig({
      ...DEFAULT_RECEIPT_CONFIG,
      printerName: activePrintConfig.printerName,
      template: activePrintConfig.template,
      paperWidthMm: activePrintConfig.paperWidthMm,
      paperHeightMm: activePrintConfig.paperHeightMm,
      printMarginMm: activePrintConfig.printMarginMm,
      useCssPageSize: activePrintConfig.useCssPageSize,
      autoCloseAfterPrint: activePrintConfig.autoCloseAfterPrint,
    });
    const pageCss = getReceiptPageCss(receiptConfig);
    const token = bill.publicToken || bill.public_token;
    const paymentText = formatPaymentBreakup(
      getReceiptPayments(receipt),
      bill.payment_mode || bill.paymentMode || "cash",
    );

    let qrBlock = "";
    if (token && receiptConfig.showQr) {
      const url = getInvoiceURL(token);
      qrBlock = `<div id="receipt-qr-block" style="margin-top:12px;padding-top:12px;border-top:1px dashed #94a3b8;text-align:center"><p style="font-size:9px;color:#64748b;margin:4px 0 2px;font-weight:700">DIGITAL INVOICE</p><p style="font-size:8px;color:#94a3b8;word-break:break-all">${escapeReceiptHtml(url)}</p></div>`;
    }
    const printWindowWidth = Math.max(
      360,
      Math.round(toNumber(receiptConfig.paperWidthMm, 80) * 5),
    );
    try {
      printWindow.resizeTo(printWindowWidth, 720);
    } catch {}

    const billMeta = (() => {
      try {
        return typeof bill.meta === "string"
          ? JSON.parse(bill.meta || "{}")
          : bill.meta || {};
      } catch {
        return {};
      }
    })();
    const activeStore =
      stores.find(
        (store) =>
          String(store.id) ===
          String(
            bill.storeId ||
              bill.store_id ||
              session?.storeId ||
              selectedStoreId,
          ),
      ) || null;
    const storeName =
      bill.storeName ||
      bill.store_name ||
      session?.storeName ||
      activeStore?.name ||
      receiptConfig.businessName ||
      "Store";
    const isKanpurReceipt = isKanpurReceiptStore(
      storeName,
      bill.storeName,
      bill.store_name,
      activeStore?.name,
      activeStore?.code,
      activeStore?.slug,
    );
    const receiptStoreName = isKanpurReceipt
      ? getKanpurReceiptDisplayStoreName(storeName)
      : storeName;
    const receiptStoreAddress = getReceiptStoreAddress(bill, activeStore);
    const receiptStorePhone = getReceiptStorePhone(bill, activeStore);
    const salesPerson =
      billMeta?.billed_by?.name ||
      billMeta?.billedBy ||
      user?.name ||
      bill.created_by ||
      bill.salesman ||
      "";
    const activeCounterName =
      bill.counterName ||
      bill.counter_name ||
      billMeta?.counterName ||
      session?.counterName ||
      counterName ||
      bill.counter ||
      bill.counter_id ||
      "";
    const createdAt = bill.createdAt || bill.created_at || Date.now();
    const dateParts = getReceiptDateParts(createdAt);
    const billNumber =
      bill.billNumber || bill.bill_number || bill.invoiceNumber || "-";
    const rawCustomerMobileValue =
      bill.customerMobile || bill.customer_mobile || customerMobile || "";
    const customerMobileValue = isKanpurReceipt
      ? maskReceiptMobileLast4(rawCustomerMobileValue)
      : rawCustomerMobileValue;
    const grandTotal = toNumber(
      bill.grand_total || bill.grandTotal || receipt.grandTotal || 0,
    );
    const receiptChangeDue = Math.max(
      0,
      toNumber(
        bill.changeDue ??
          bill.change_due ??
          receipt.changeDue ??
          billMeta?.changeDue ??
          0,
      ),
    );
    const subtotal = toNumber(bill.subtotal || receipt.subtotal || 0);
    const discountTotal = toNumber(
      bill.discount_total || bill.discountTotal || receipt.discount || 0,
    );
    const taxTotal = toNumber(
      bill.tax_total || bill.totalTax || receipt.taxTotal || 0,
    );
    const totalQty = items.reduce(
      (sum, item) => sum + toNumber(item.qty, 1),
      0,
    );
    const mrpTotal = items.reduce(
      (sum, item) =>
        sum +
        toNumber(item.qty, 1) *
          toNumber(item.mrp || item.selling_price || item.sellingPrice),
      0,
    );
    const ourRateTotal = items.reduce(
      (sum, item) =>
        sum +
        toNumber(
          item.line_total,
          toNumber(item.qty, 1) *
            toNumber(item.selling_price || item.sellingPrice),
        ),
      0,
    );
    const headerLines = String(receiptConfig.headerText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const taxGroups = new Map();
    for (const item of items) {
      const rate = toNumber(item.tax_rate || item.taxRate || 0);
      const qty = toNumber(item.qty, 1);
      const sellingPrice = toNumber(item.selling_price || item.sellingPrice);
      const discountAmount = toNumber(
        item.discount_amount || item.discountAmount,
      );
      const amount = toNumber(
        item.tax_amount || item.taxAmount,
        calculateGstLine({
          qty,
          sellingPrice,
          discountAmount,
          taxRate: rate,
          includeTax: item.include_tax ?? item.includeTax,
        }).gstAmount,
      );
      if (rate <= 0 || amount <= 0) continue;
      taxGroups.set(rate, (taxGroups.get(rate) || 0) + amount);
    }
    const taxBreakup = taxGroups.size
      ? Array.from(taxGroups.entries())
          .map(([rate, amount]) => {
            const halfRate = rate / 2;
            const halfAmount = amount / 2;
            return `CGST ${halfRate}% = ${formatReceiptMoney(halfAmount)} SGST ${halfRate}% = ${formatReceiptMoney(halfAmount)}`;
          })
          .join("<br>")
      : "CGST 0% = 0.00 SGST 0% = 0.00";

    const rows = items
      .map((item, index) => {
        const qty = toNumber(item.qty, 1);
        const mrp = toNumber(
          item.mrp || item.selling_price || item.sellingPrice,
        );
        const rate = toNumber(
          item.selling_price || item.sellingPrice || item.mrp,
        );
        const amount = toNumber(item.line_total, qty * rate);
        const productName = escapeReceiptHtml(
          item.name || item.product_name || "Product",
        );
        const hsn = escapeReceiptHtml(
          item.hsn || item.hsn_code || item.sku || "",
        );
        return `
          <div class="item">
            <div class="item-name"><span>${index + 1}</span><strong>${productName}</strong></div>
            <div class="item-grid">
              <span>${hsn}</span>
              <span>${formatReceiptMoney(mrp)}</span>
              <span>${formatReceiptMoney(rate)}</span>
              <span>${formatReceiptQty(qty)}</span>
              <span>${formatReceiptMoney(amount)}</span>
            </div>
          </div>
        `;
      })
      .join("");
    const printHint = receiptConfig.printerName
      ? `Select printer: ${receiptConfig.printerName}`
      : "Select your receipt printer in the print dialog";
    const autoCloseScript = receiptConfig.autoCloseAfterPrint
      ? "window.addEventListener('afterprint', () => setTimeout(() => window.close(), 1200), { once: true });"
      : "";

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Retail Invoice ${bill.billNumber || bill.bill_number || ""}</title>
          <style>
            ${receiptConfig.useCssPageSize ? `@page { size: ${receiptConfig.paperWidthMm}mm ${receiptConfig.paperHeightMm || 297}mm; margin: 0; }` : pageCss.pageRule}
            * { box-sizing: border-box; }
            html, body { max-width: 100%; height: auto !important; min-height: 0 !important; overflow-wrap: anywhere; background: #fff !important; }
            body { font-family: "Arial Narrow", Arial, sans-serif; color: #111; background: #fff !important; margin: 0; padding: 0; width: ${receiptConfig.useCssPageSize ? pageCss.paperWidth : pageCss.bodyWidth}; font-size: 11px; line-height: 1.18; }
            .print-tools { display: flex; gap: 8px; align-items: center; justify-content: center; width: ${receiptConfig.useCssPageSize ? pageCss.paperWidth : pageCss.bodyWidth}; padding: 8px; border-bottom: 1px solid #cbd5e1; font-family: Arial, sans-serif; }
            .print-tools button { border: 0; border-radius: 6px; background: #111827; color: #fff; cursor: pointer; font-size: 12px; font-weight: 800; padding: 8px 12px; }
            .print-hint { margin: 0 0 6px; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 4px; color: #334155; font-family: Arial, sans-serif; font-size: 10px; font-weight: 700; text-align: center; }
            .receipt { display: block; width: ${receiptConfig.useCssPageSize ? pageCss.paperWidth : pageCss.bodyWidth}; margin: 0; padding: ${receiptConfig.useCssPageSize ? pageCss.margin : "0"}; break-inside: auto; page-break-inside: auto; break-after: avoid; page-break-after: avoid; }
            .center { text-align: center; }
            .invoice-title { font-size: 15px; font-weight: 900; letter-spacing: .4px; }
            .store-name { font-size: 17px; font-weight: 900; letter-spacing: .3px; }
            .store-extra { text-align: center; font-size: 9px; font-weight: 700; line-height: 1.18; margin-top: 2px; }
            .store-phone { font-size: 10px; font-weight: 800; }
            .small { font-size: 10px; }
            .line { border-top: 1px solid #111; margin: 5px 0; }
            .dash { border-top: 1px dashed #111; margin: 5px 0; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; font-size: 11px; }
            .meta-grid strong { font-size: 13px; letter-spacing: .3px; }
            .mobile { text-align: center; font-size: 22px; font-weight: 900; letter-spacing: 1px; margin: 2px 0; }
            .mobile-kanpur { font-size: 13px; letter-spacing: .3px; }
            .item-head { display: grid; grid-template-columns: 1.1fr .9fr .9fr .65fr .9fr; gap: 3px; font-size: 10px; font-weight: 700; }
            .item { margin: 5px 0; page-break-inside: avoid; }
            .item-name { display: grid; grid-template-columns: 15px 1fr; gap: 3px; font-size: 11px; text-transform: uppercase; }
            .item-name strong { font-weight: 700; }
            .item-grid { display: grid; grid-template-columns: 1.1fr .9fr .9fr .65fr .9fr; gap: 3px; align-items: end; font-size: 12px; font-weight: 800; }
            .item-grid span { text-align: right; }
            .item-grid span:first-child { text-align: left; font-size: 10px; font-weight: 500; }
            .summary-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
            .summary-row strong { font-size: 13px; }
            .net { font-size: 14px; font-weight: 900; }
            .words { text-align: center; font-size: 12px; font-weight: 800; margin-top: 4px; }
            .savings { font-size: 13px; font-weight: 900; }
            .tax { font-size: 10px; }
            .footer { text-align: center; font-size: 12px; font-weight: 800; }
            .terms { font-size: 9px; }
            @media print { html, body { height: auto !important; min-height: 0 !important; background: #fff !important; } body { padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; } .print-tools, .print-hint { display: none !important; } .receipt { break-after: avoid; page-break-after: avoid; } }
          </style>
        </head>
        <body>
          <div class="print-tools">
            <button type="button" onclick="window.print()">Print Receipt</button>
          </div>
          <div class="print-hint">${escapeReceiptHtml(printHint)} - Paper ${receiptConfig.paperWidthMm}mm${receiptConfig.paperHeightMm ? ` x ${receiptConfig.paperHeightMm}mm` : " continuous"}</div>
          <div class="receipt">
            <div class="center">
              <div class="invoice-title">RETAIL INVOICE</div>
              <div class="store-name">${escapeReceiptHtml(receiptStoreName)}</div>
              ${
                isKanpurReceipt
                  ? `
                    <div class="store-extra">GST NO: ${escapeReceiptHtml(KANPUR_RECEIPT_DETAILS.gstNo)}</div>
                    <div class="store-extra">${escapeReceiptHtml(KANPUR_RECEIPT_DETAILS.address)}</div>
                    <div class="store-extra store-phone">Store No: ${escapeReceiptHtml(KANPUR_RECEIPT_DETAILS.phone)}</div>
                  `
                  : `
                    ${receiptStoreAddress ? `<div class="store-extra">${escapeReceiptHtml(receiptStoreAddress)}</div>` : ""}
                    ${receiptStorePhone ? `<div class="store-extra store-phone">PHNO. ${escapeReceiptHtml(receiptStorePhone)}</div>` : ""}
                  `
              }
              ${headerLines.map((line) => `<div class="small">${escapeReceiptHtml(line)}</div>`).join("")}
            </div>
            <div class="line"></div>
            <div class="meta-grid">
              <div>Bill No: <strong>${escapeReceiptHtml(billNumber)}</strong></div>
              <div>DATE: <strong>${dateParts.date}</strong></div>
              <div>TIME: <strong>${dateParts.time}</strong></div>
              <div>Salesman: <strong>${escapeReceiptHtml(salesPerson || "-")}</strong></div>
              <div>COUNTER: <strong>${escapeReceiptHtml(activeCounterName || "-")}</strong></div>
              <div>AMOUNT: <strong>Rs. ${formatReceiptMoney(grandTotal)}</strong></div>
            </div>
            ${customerMobileValue ? `<div class="small">MOBILE NO:</div><div class="mobile${isKanpurReceipt ? " mobile-kanpur" : ""}">${escapeReceiptHtml(customerMobileValue)}</div>` : ""}
            <div class="line"></div>
            <div class="item-head">
              <span>HSN</span><span>MRP</span><span>OUR RATE</span><span>QTY</span><span>Amount</span>
            </div>
            <div class="dash"></div>
            ${rows}
            <div class="line"></div>
            <div class="summary-row"><span>SERIAL NO : ${items.length.toFixed(2)}</span><strong>TOTAL QTY: ${formatReceiptQty(totalQty)}</strong></div>
            <div class="line"></div>
            <div class="summary-row net"><span>NET AMOUNT(R/O)</span><strong>${formatReceiptMoney(grandTotal)}</strong></div>
            <div class="words">${escapeReceiptHtml(numberToIndianWords(grandTotal))}</div>
            <div class="center small">(INCL. OF ALL GST TAXES)</div>
            <div class="line"></div>
            <div class="summary-row"><span>MRP RATE SE TOTAL</span><span>${formatReceiptMoney(mrpTotal)}</span></div>
            <div class="summary-row"><span>HAMARE RATE SE TOTAL</span><span>${formatReceiptMoney(ourRateTotal || grandTotal)}</span></div>
            <div class="summary-row savings"><span>MRP RATE SE BACHAT</span><span>${formatReceiptMoney(Math.max(0, mrpTotal - (ourRateTotal || grandTotal)))}</span></div>
            ${discountTotal ? `<div class="summary-row"><span>DISCOUNT</span><span>${formatReceiptMoney(discountTotal)}</span></div>` : ""}
            ${subtotal ? `<div class="summary-row"><span>SUBTOTAL</span><span>${formatReceiptMoney(subtotal)}</span></div>` : ""}
            ${taxTotal ? `<div class="summary-row"><span>GST TOTAL</span><span>${formatReceiptMoney(taxTotal)}</span></div>` : ""}
            <div class="line"></div>
            <div class="tax">${taxBreakup}</div>
            <div class="line"></div>
            <div class="footer">${escapeReceiptHtml(receiptConfig.footerText || "For Latest Offer / Feedback Please Contact Store")}</div>
            <div class="center small">Paid By: ${escapeReceiptHtml(paymentText)}</div>
            ${receiptChangeDue > 0.01 ? `<div class="center small"><strong>Return: ${formatReceiptMoney(receiptChangeDue)}</strong></div>` : ""}
            <div class="line"></div>
            <div class="item-head"><span>Qty</span><span style="grid-column: span 3; text-align:center;">Description</span><span>MRP</span></div>
            <div class="line"></div>
            ${
              isKanpurReceipt
                ? `<div class="terms">${escapeReceiptHtml(KANPUR_RECEIPT_DETAILS.exchangePolicy)}</div>`
                : `<div class="terms">
                    1. MRP inclusive of all taxes<br>
                    2. After billing complaints must be same day.<br>
                    3. Warranty/exchange is allowed as per product policy.<br>
                    4. Goods once sold are subject to store return policy.
                  </div>`
            }
            ${qrBlock}
          </div>
          <script>
            ${autoCloseScript}
            const injectQr = async () => {
              const holder = document.getElementById("receipt-qr-block");
              if (!holder || !${JSON.stringify(token && receiptConfig.showQr)}) return;
              try {
                const QRCode = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
                const qrData = await QRCode.default.toDataURL(${JSON.stringify(token ? getInvoiceURL(token) : "")}, { width: 160, margin: 1 });
                holder.insertAdjacentHTML("afterbegin", '<img src="' + qrData + '" alt="QR" style="width:96px;height:96px" />');
              } catch {}
            };
            const printWhenRendered = async () => {
              injectQr();
              if (document.fonts?.ready) {
                try { await document.fonts.ready; } catch {}
              }
              requestAnimationFrame(() => requestAnimationFrame(() => {
                setTimeout(() => {
                  if (!document.querySelector(".receipt")?.textContent?.trim()) return;
                  window.focus();
                  window.print();
                }, 150);
              }));
            };
            if (document.readyState === "complete") printWhenRendered();
            else window.addEventListener("load", printWhenRendered, { once: true });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const openReceiptFromBill = async (bill) => {
    const billId =
      bill.billNumber || bill.invoiceNumber || bill.bill_number || bill.id;
    if (!billId) return;
    try {
      const res = await fetch(
        `/api/pos/billing?bill_id=${encodeURIComponent(billId)}`,
      );
      const json = await res.json();
      if (!json.success) {
        showToast(json.message || "Failed to load receipt", "error");
        return;
      }
      setReceiptData(json.data);
      setReceiptModal(true);
    } catch {
      showToast("Failed to load receipt", "error");
    }
  };

  const openBillReceipt = (bill) => {
    if (bill.isOffline) {
      setReceiptData({
        bill: {
          ...bill,
          publicToken: null,
        },
        items: [],
        subtotal: bill.subtotal || bill.grandTotal || 0,
        discount: bill.discountTotal || 0,
        taxTotal: bill.taxTotal || 0,
        grandTotal: bill.grandTotal || 0,
      });
      setReceiptModal(true);
      return;
    }
    openReceiptFromBill(bill);
  };

  const resetCashReturnForm = () => {
    setCashReturnAmount("");
    setCashReturnReason("");
    setCashReturnTenderMethod("upi");
    setCashReturnReferenceNo("");
    setCashReturnOpen(false);
  };

  const recordCashReturn = async () => {
    const activeBill = receiptData?.bill || {};
    const billId =
      activeBill.billNumber ||
      activeBill.invoiceNumber ||
      activeBill.bill_number ||
      activeBill.id;
    const amount = toNumber(cashReturnAmount);
    const reason = cashReturnReason.trim();
    if (!billId || activeBill.isOffline) return;
    if (amount <= 0) {
      showToast("Enter cash return amount", "error");
      return;
    }
    if (!reason) {
      showToast("Enter reason for returning cash", "error");
      return;
    }
    setCashReturnSaving(true);
    try {
      const res = await fetch("/api/pos/billing", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "return_cash",
          bill_id: billId,
          amount,
          reason,
          tender_method: cashReturnTenderMethod,
          referenceNo: cashReturnReferenceNo,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || "Failed to record cash return", "error");
        return;
      }
      showToast(json.message || "Cash return recorded", "success");
      resetCashReturnForm();
      await openReceiptFromBill({ billNumber: billId });
    } catch {
      showToast("Failed to record cash return", "error");
    } finally {
      setCashReturnSaving(false);
    }
  };

  const deleteBill = async (bill) => {
    if (!canDeleteBills || bill?.isOffline) return;
    const billId =
      bill?.billNumber || bill?.invoiceNumber || bill?.bill_number || bill?.id;
    if (!billId) return;
    const label =
      bill?.billNumber ||
      bill?.invoiceNumber ||
      bill?.bill_number ||
      `Bill ${billId}`;
    const confirmed = window.confirm(
      `Delete ${label}? Inventory for this bill will be added back to the original store.`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(
        `/api/pos/billing?bill_id=${encodeURIComponent(billId)}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || "Failed to delete bill", "error");
        return;
      }

      setRecentBills((current) =>
        current.filter((entry) => {
          const entryId =
            entry.billNumber ||
            entry.invoiceNumber ||
            entry.bill_number ||
            entry.id;
          return String(entryId) !== String(billId);
        }),
      );
      const activeBill = receiptData?.bill || {};
      const activeId =
        activeBill.billNumber ||
        activeBill.invoiceNumber ||
        activeBill.bill_number ||
        activeBill.id;
      if (String(activeId || "") === String(billId)) {
        setReceiptModal(false);
        setReceiptData(null);
      }
      showToast(
        json.message || "Bill deleted and inventory restored",
        "success",
      );
    } catch {
      showToast("Failed to delete bill", "error");
    }
  };

  // ── SESSION ──
  const openCloseSessionModal = async () => {
    if (!session?.sessionId) {
      showToast("No active session", "error");
      return;
    }
    setCloseSessionModal(true);
    setClosingLoading(true);
    try {
      const params = new URLSearchParams({ sessionId: session.sessionId });
      const res = await fetch(`/api/sales-order/closing?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success && json.data) {
        setClosingSummary(json.data);
        const expectedCash = json.data.totals?.expectedCash;
        if (expectedCash !== undefined && expectedCash !== null)
          setActualCash(String(expectedCash));
      } else
        showToast(json.message || "Failed to load closing summary", "error");
    } catch {
      showToast("Failed to load closing summary", "error");
    } finally {
      setClosingLoading(false);
    }
  };

  const openSession = async () => {
    if (!user) {
      showToast("Login first", "error");
      return;
    }
    if (!selectedStoreId) {
      showToast("Select a store", "error");
      return;
    }
    const openingCashAmount =
      openingCash === "" && isSuperAdmin ? 0 : Number(openingCash);
    if (!Number.isFinite(openingCashAmount) || openingCashAmount < 0) {
      showToast("Opening cash must be zero or greater", "error");
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch("/api/employee/user-counter-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          storeId: Number(selectedStoreId),
          counterName: counterName || "POS Counter",
          deviceUid,
          counterUid: deviceUid,
          openingCash: openingCashAmount,
        }),
      });
      const json = await res.json();
      if (res.ok && (json.success || json.id)) {
        const openedSession = json.data?.session || json;
        setSession(openedSession);
        setSelectedStoreId(String(openedSession.storeId || selectedStoreId));
        setOpeningCash(String(openedSession.openingCash ?? openingCashAmount));
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "pos-counter-name-v1",
            counterName || "POS Counter",
          );
        }
        setOpenSessionModal(false);
        loadPOSData(openedSession.storeId || selectedStoreId);
        showToast("Session opened successfully");
      } else showToast(json.error || "Failed to open session", "error");
    } catch {
      showToast("Failed to open session", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const closeSession = async () => {
    if (!session?.sessionId) {
      showToast("No active session", "error");
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch("/api/sales-order/closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          actualCash: toNumber(actualCash),
          handoverAmount: toNumber(actualCash),
          remarks: closingRemarks,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSession(null);
        setCloseSessionModal(false);
        setClosingSummary(null);
        setClosingRemarks("");
        setActualCash("0");
        clearCart();
        showToast("Session closed. Cash is pending manager verification.");
      } else showToast(json.message || "Failed to close session", "error");
    } catch {
      showToast("Failed to close session", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── CHECKOUT ──
  const saveBillOffline = (
    payload,
    toastMessage = "Bill saved offline - will sync when back online",
    billCart = cart,
  ) => {
    const receiptStoreId =
      payload.storeId || session?.storeId || selectedStoreId;
    const receiptStoreName =
      session?.storeName ||
      stores.find((store) => String(store.id) === String(receiptStoreId))
        ?.name ||
      "";
    const offlineBill = {
      id: `OFFLINE-${Date.now()}`,
      billNumber: payload.invoiceNumber,
      invoiceNumber: payload.invoiceNumber,
      storeId: receiptStoreId,
      storeName: receiptStoreName,
      counterName: payload.counterName || session?.counterName || counterName,
      customerName: payload.customerName,
      customerMobile,
      paymentMode,
      grandTotal: cartTotals.grandTotal,
      subtotal: cartTotals.subtotal,
      discountTotal: cartTotals.discount,
      taxTotal: cartTotals.taxTotal,
      createdAt: new Date().toISOString(),
      isOffline: true,
      status: "pending_sync",
    };

    const queue = readStorage(STORAGE_KEYS.QUEUE, []);
    queue.push({
      payload,
      totals: cartTotals,
      createdAt: new Date().toISOString(),
    });
    writeStorage(STORAGE_KEYS.QUEUE, queue);
    setPendingQueueCount(queue.length);

    const offlineBills = readStorage(STORAGE_KEYS.OFFLINE_BILLS, []);
    writeStorage(
      STORAGE_KEYS.OFFLINE_BILLS,
      [offlineBill, ...offlineBills].slice(0, 20),
    );
    setRecentBills((current) => [offlineBill, ...current].slice(0, 20));

    const receiptItems = billCart.map((item) => ({
      ...item,
      name: item.name,
      selling_price: item.sellingPrice,
      line_total: calculateGstLine(item, canManageDiscounts).lineTotal,
    }));

    setReceiptData({
      bill: {
        ...offlineBill,
        publicToken: null,
      },
      items: receiptItems,
      subtotal: cartTotals.subtotal,
      discount: cartTotals.discount,
      taxTotal: cartTotals.taxTotal,
      grandTotal: cartTotals.grandTotal,
    });
    setReceiptModal(true);

    showToast(toastMessage, "info");
    clearCart();
  };

  const createBill = async () => {
    if (!session?.sessionId) {
      showToast("Open session first", "error");
      return;
    }
    if (cart.length === 0) {
      showToast("Add products to cart", "error");
      return;
    }
    const billingCart = getCartWithCommittedQtyDrafts();
    if (billingCart.some((item) => toNumber(item.qty) <= 0)) {
      showToast("Enter a valid quantity for all products", "error");
      return;
    }
    if (Object.keys(qtyDrafts).length) {
      setCart(billingCart);
      setQtyDrafts({});
      showToast(
        "Quantity updated. Please review the total and generate again.",
      );
      return;
    }
    const normalizedCustomerName = customerName.trim() || "Walk-in Customer";
    if (!customerMobile.trim()) {
      showToast("Customer mobile number is required for billing", "error");
      return;
    }
    if (!validatePhoneNumber(customerMobile).isValid) {
      showToast(validatePhoneNumber(customerMobile).error, "error");
      return;
    }
    if (!isPaymentCovered) {
      showToast(
        `Payment is short by ${formatCurrency(Math.max(0, paymentBalance))}`,
        "error",
      );
      return;
    }
    if (!isChangeAllowed) {
      showToast(
        `Extra payment can be accepted only for cash/UPI change return. Return ${formatCurrency(changeDue)} in cash`,
        "error",
      );
      return;
    }
    if (
      activeDiscountRequest?.status === "approved" &&
      (isOffline || !navigator.onLine)
    ) {
      showToast(
        "Approved manual discounts can only be billed while online",
        "error",
      );
      return;
    }
    setIsProcessing(true);
    let payload = null;
    try {
      payload = {
        sessionId: session.sessionId,
        storeId: session.storeId || selectedStoreId,
        deviceUid,
        counterUid: deviceUid,
        counterName: session.counterName || counterName,
        customerName: normalizedCustomerName,
        customerMobile,
        paymentMode:
          normalizedPayments.length > 1
            ? "split"
            : normalizedPayments[0]?.method || paymentMode,
        payments: normalizedPayments,
        cartSessionId,
        deletedCartItemIds,
        items: billingCart.map((item) => ({
          cartKey: getCartItemKey(item),
          productId: item.id,
          name: item.name,
          qty: item.qty,
          sellingPrice: item.sellingPrice,
          mrp: item.mrp,
          barcode: item.barcode,
          sku: item.sku,
          selectedBatchId: item.selectedBatchId,
          selectedBatchIds: item.selectedBatchIds || [],
          taxRate: item.taxRate || 0,
          includeTax: item.includeTax,
          discountAmount:
            item.promotionFreeItem ||
            item.approvedManualDiscount ||
            (canManageDiscounts && item.allowDiscountOnPos)
              ? toNumber(item.discountAmount)
              : 0,
          promotionFreeItem: !!item.promotionFreeItem,
          promotionId: item.promotionId || null,
          promotionName: item.promotionName || null,
        })),
        orderDiscount: canApplyOrderDiscount ? toNumber(orderDiscount) : 0,
        discountApprovalId: activeDiscountRequest?.id || null,
        roundOff: cartTotals.roundValue,
        invoiceNumber: generateInvoiceNumber(),
      };
      if (isOffline || !navigator.onLine) {
        const receiptStoreId =
          payload.storeId || session?.storeId || selectedStoreId;
        const receiptStoreName =
          session?.storeName ||
          stores.find((store) => String(store.id) === String(receiptStoreId))
            ?.name ||
          "";
        // 1. Build a local offline bill object
        const offlineBill = {
          id: `OFFLINE-${Date.now()}`,
          billNumber: payload.invoiceNumber,
          invoiceNumber: payload.invoiceNumber,
          storeId: receiptStoreId,
          storeName: receiptStoreName,
          counterName:
            payload.counterName || session?.counterName || counterName,
          customerName: payload.customerName,
          customerMobile,
          paymentMode: payload.paymentMode,
          payments: normalizedPayments,
          changeDue,
          grandTotal: cartTotals.grandTotal,
          subtotal: cartTotals.subtotal,
          discountTotal: cartTotals.discount,
          taxTotal: cartTotals.taxTotal,
          createdAt: new Date().toISOString(),
          isOffline: true,
          status: "pending_sync",
        };

        // 2. Save to offline queue for later server sync
        const queue = readStorage(STORAGE_KEYS.QUEUE, []);
        queue.push({
          payload,
          totals: cartTotals,
          createdAt: new Date().toISOString(),
        });
        writeStorage(STORAGE_KEYS.QUEUE, queue);
        setPendingQueueCount(queue.length);

        // 3. Persist offline bill so it survives page refresh
        const offlineBills = readStorage(STORAGE_KEYS.OFFLINE_BILLS, []);
        writeStorage(
          STORAGE_KEYS.OFFLINE_BILLS,
          [offlineBill, ...offlineBills].slice(0, 20),
        );

        // 4. Add to recent bills immediately (visible in UI right now)
        setRecentBills((current) => [offlineBill, ...current].slice(0, 20));

        // 5. Build receipt items for printing
        const receiptItems = billingCart.map((item) => ({
          ...item,
          name: item.name,
          selling_price: item.sellingPrice,
          line_total: calculateGstLine(item, canManageDiscounts).lineTotal,
        }));

        // 6. Show receipt modal so cashier can print immediately
        setReceiptData({
          bill: {
            ...offlineBill,
            publicToken: null,
          },
          items: receiptItems,
          subtotal: cartTotals.subtotal,
          discount: cartTotals.discount,
          taxTotal: cartTotals.taxTotal,
          grandTotal: cartTotals.grandTotal,
        });
        setReceiptModal(true);

        showToast("Bill saved offline — will sync when back online", "info");
        clearCart();
        return;
      }
      const res = await fetch("/api/sales-order/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        const savedBill = json.data?.bill;
        const receiptStoreId =
          savedBill?.storeId || savedBill?.store_id || payload.storeId;
        const receiptStoreName =
          savedBill?.storeName ||
          savedBill?.store_name ||
          session?.storeName ||
          stores.find((store) => String(store.id) === String(receiptStoreId))
            ?.name ||
          "";
        const receiptItems = billingCart.map((item) => ({
          ...item,
          name: item.name,
          selling_price: item.sellingPrice,
          line_total: calculateGstLine(item, canManageDiscounts).lineTotal,
        }));
        showToast(
          json.data?.message || `Bill ${payload.invoiceNumber} created!`,
        );
        setRecentBills((current) =>
          [savedBill, ...current].filter(Boolean).slice(0, 10),
        );
        setReceiptData({
          bill: {
            ...savedBill,
            customerName: payload.customerName,
            customerMobile,
            publicToken:
              savedBill?.publicToken ?? savedBill?.public_token ?? null,
            storeId: receiptStoreId,
            storeName: receiptStoreName,
            counterName:
              payload.counterName || session?.counterName || counterName,
            subtotal: cartTotals.subtotal,
            discountTotal: cartTotals.discount,
            taxTotal: cartTotals.taxTotal,
            grandTotal: cartTotals.grandTotal,
            paymentMode: payload.paymentMode,
            payments: normalizedPayments,
            createdAt: savedBill?.createdAt || new Date().toISOString(),
          },
          items: receiptItems,
          subtotal: cartTotals.subtotal,
          discount: cartTotals.discount,
          taxTotal: cartTotals.taxTotal,
          grandTotal: cartTotals.grandTotal,
        });
        setReceiptModal(true);
        if (
          savedBill &&
          (savedBill.customerMobile === customerMobile ||
            savedBill.customerName?.toLowerCase() ===
              customerName.toLowerCase())
        )
          setCustomerHistory((current) => [savedBill, ...current].slice(0, 50));
        clearCart();
        loadPOSData();
      } else showToast(json.message || "Failed to create bill", "error");
    } catch (err) {
      console.error("Checkout error:", err);
      if (payload) {
        saveBillOffline(
          payload,
          "Network error. Bill saved locally and will sync automatically.",
          billingCart,
        );
      } else {
        showToast("Network error. Bill could not be saved locally.", "error");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const renderReceiptPreview = () => {
    if (!receiptData) return null;
    const bill = receiptData.bill || {};
    const items = receiptData.items || [];
    const billMeta = (() => {
      try {
        return typeof bill.meta === "string"
          ? JSON.parse(bill.meta || "{}")
          : bill.meta || {};
      } catch {
        return {};
      }
    })();
    const activeStore =
      stores.find(
        (store) =>
          String(store.id) ===
          String(
            bill.storeId ||
              bill.store_id ||
              session?.storeId ||
              selectedStoreId,
          ),
      ) || null;
    const storeName =
      bill.storeName ||
      bill.store_name ||
      session?.storeName ||
      activeStore?.name ||
      "Store";
    const isKanpurReceipt = isKanpurReceiptStore(
      storeName,
      bill.storeName,
      bill.store_name,
      activeStore?.name,
      activeStore?.code,
      activeStore?.slug,
    );
    const receiptStoreName = isKanpurReceipt
      ? getKanpurReceiptDisplayStoreName(storeName)
      : storeName;
    const receiptStoreAddress = getReceiptStoreAddress(bill, activeStore);
    const receiptStorePhone = getReceiptStorePhone(bill, activeStore);
    const billNumber =
      bill.billNumber || bill.bill_number || bill.invoiceNumber || "-";
    const createdAt = bill.createdAt || bill.created_at || Date.now();
    const dateParts = getReceiptDateParts(createdAt);
    const salesPerson =
      billMeta?.billed_by?.name ||
      billMeta?.billedBy ||
      user?.name ||
      bill.created_by ||
      bill.salesman ||
      "-";
    const activeCounterName =
      bill.counterName ||
      bill.counter_name ||
      billMeta?.counterName ||
      session?.counterName ||
      counterName ||
      bill.counter ||
      bill.counter_id ||
      "-";
    const rawCustomerMobileValue =
      bill.customerMobile || bill.customer_mobile || customerMobile || "";
    const customerMobileValue = isKanpurReceipt
      ? maskReceiptMobileLast4(rawCustomerMobileValue)
      : rawCustomerMobileValue;
    const grandTotal = toNumber(
      bill.grand_total || bill.grandTotal || receiptData.grandTotal || 0,
    );
    const receiptChangeDue = Math.max(
      0,
      toNumber(
        bill.changeDue ??
          bill.change_due ??
          receiptData.changeDue ??
          billMeta?.changeDue ??
          0,
      ),
    );
    const subtotal = toNumber(bill.subtotal || receiptData.subtotal || 0);
    const discountTotal = toNumber(
      bill.discount_total || bill.discountTotal || receiptData.discount || 0,
    );
    const taxTotal = toNumber(
      bill.tax_total || bill.totalTax || receiptData.taxTotal || 0,
    );
    const totalQty = items.reduce(
      (sum, item) => sum + toNumber(item.qty, 1),
      0,
    );
    const mrpTotal = items.reduce(
      (sum, item) =>
        sum +
        toNumber(item.qty, 1) *
          toNumber(item.mrp || item.selling_price || item.sellingPrice),
      0,
    );
    const ourRateTotal = items.reduce(
      (sum, item) =>
        sum +
        toNumber(
          item.line_total,
          toNumber(item.qty, 1) *
            toNumber(item.selling_price || item.sellingPrice),
        ),
      0,
    );
    const taxGroups = new Map();
    for (const item of items) {
      const rate = toNumber(item.tax_rate || item.taxRate || 0);
      const qty = toNumber(item.qty, 1);
      const sellingPrice = toNumber(item.selling_price || item.sellingPrice);
      const amount = toNumber(
        item.tax_amount || item.taxAmount,
        calculateGstLine({
          qty,
          sellingPrice,
          discountAmount: toNumber(item.discount_amount || item.discountAmount),
          taxRate: rate,
          includeTax: item.include_tax ?? item.includeTax,
        }).gstAmount,
      );
      if (rate <= 0 || amount <= 0) continue;
      taxGroups.set(rate, (taxGroups.get(rate) || 0) + amount);
    }
    const taxLines = taxGroups.size
      ? Array.from(taxGroups.entries()).map(([rate, amount]) => ({
          rate,
          cgstRate: rate / 2,
          cgstAmount: amount / 2,
          sgstAmount: amount / 2,
        }))
      : [{ rate: 0, cgstRate: 0, cgstAmount: 0, sgstAmount: 0 }];

    return (
      <div className="mx-auto my-4 w-[320px] bg-white px-4 py-3 font-mono text-[11px] leading-tight text-black shadow-sm">
        {receiptData.bill?.isOffline && (
          <div className="mb-2 border border-black px-2 py-1 text-center text-[10px] font-bold">
            OFFLINE RECEIPT - PENDING SYNC
          </div>
        )}
        <div className="text-center">
          <div className="text-[15px] font-black tracking-wide">
            RETAIL INVOICE
          </div>
          <div className="text-[18px] font-black tracking-wide">
            {receiptStoreName}
          </div>
          {isKanpurReceipt && (
            <>
              <div className="text-[9px] font-bold">
                GST NO: {KANPUR_RECEIPT_DETAILS.gstNo}
              </div>
              <div className="text-[9px] font-bold uppercase">
                {KANPUR_RECEIPT_DETAILS.address}
              </div>
              <div className="text-[10px] font-extrabold">
                Store No: {KANPUR_RECEIPT_DETAILS.phone}
              </div>
            </>
          )}
          {!isKanpurReceipt && receiptStoreAddress && (
            <div className="text-[10px] uppercase">{receiptStoreAddress}</div>
          )}
          {!isKanpurReceipt && receiptStorePhone && (
            <div className="text-[10px]">PHNO. {receiptStorePhone}</div>
          )}
        </div>
        <div className="my-1 border-t border-black" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div>
            Bill No: <span className="font-black">{billNumber}</span>
          </div>
          <div>
            DATE: <span className="font-black">{dateParts.date}</span>
          </div>
          <div>
            TIME: <span className="font-black">{dateParts.time}</span>
          </div>
          <div>
            Salesman: <span className="font-black">{salesPerson}</span>
          </div>
          <div>
            COUNTER: <span className="font-black">{activeCounterName}</span>
          </div>
          <div>
            AMOUNT:{" "}
            <span className="font-black">
              Rs. {formatReceiptMoney(grandTotal)}
            </span>
          </div>
        </div>
        {customerMobileValue && (
          <>
            <div className="mt-1">MOBILE NO:</div>
            <div
              className={`text-center font-black ${
                isKanpurReceipt
                  ? "text-[13px] tracking-normal"
                  : "text-[23px] tracking-wider"
              }`}
            >
              {customerMobileValue}
            </div>
          </>
        )}
        <div className="my-1 border-t border-black" />
        <div className="grid grid-cols-[1.2fr_.9fr_.9fr_.6fr_.9fr] gap-1 text-[10px] font-black">
          <span>HSN</span>
          <span className="text-right">MRP</span>
          <span className="text-right">OUR RATE</span>
          <span className="text-right">QTY</span>
          <span className="text-right">Amount</span>
        </div>
        <div className="my-1 border-t border-dashed border-black" />
        {items.map((item, idx) => {
          const qty = toNumber(item.qty, 1);
          const mrp = toNumber(
            item.mrp || item.selling_price || item.sellingPrice,
          );
          const rate = toNumber(
            item.selling_price || item.sellingPrice || item.mrp,
          );
          const amount = toNumber(item.line_total, qty * rate);
          return (
            <div key={item.id || idx} className="mb-1.5">
              <div className="grid grid-cols-[18px_1fr] gap-1 text-[11px] font-bold uppercase">
                <span>{idx + 1}</span>
                <span>{item.name || item.product_name || "Product"}</span>
              </div>
              <div className="grid grid-cols-[1.2fr_.9fr_.9fr_.6fr_.9fr] gap-1 text-[12px] font-black">
                <span className="text-[10px] font-normal">
                  {item.hsn || item.hsn_code || item.sku || ""}
                </span>
                <span className="text-right">{formatReceiptMoney(mrp)}</span>
                <span className="text-right">{formatReceiptMoney(rate)}</span>
                <span className="text-right">{formatReceiptQty(qty)}</span>
                <span className="text-right">{formatReceiptMoney(amount)}</span>
              </div>
            </div>
          );
        })}
        <div className="my-1 border-t border-black" />
        <div className="flex justify-between font-bold">
          <span>SERIAL NO : {items.length.toFixed(2)}</span>
          <span>TOTAL QTY: {formatReceiptQty(totalQty)}</span>
        </div>
        <div className="my-1 border-t border-black" />
        <div className="flex justify-between text-[14px] font-black">
          <span>NET AMOUNT(R/O)</span>
          <span>{formatReceiptMoney(grandTotal)}</span>
        </div>
        <div className="mt-1 text-center text-[12px] font-black">
          {numberToIndianWords(grandTotal)}
        </div>
        <div className="text-center text-[10px]">(INCL. OF ALL GST TAXES)</div>
        <div className="my-1 border-t border-black" />
        <div className="flex justify-between">
          <span>MRP RATE SE TOTAL</span>
          <span>{formatReceiptMoney(mrpTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>HAMARE RATE SE TOTAL</span>
          <span>{formatReceiptMoney(ourRateTotal || grandTotal)}</span>
        </div>
        <div className="flex justify-between text-[13px] font-black">
          <span>MRP RATE SE BACHAT</span>
          <span>
            {formatReceiptMoney(
              Math.max(0, mrpTotal - (ourRateTotal || grandTotal)),
            )}
          </span>
        </div>
        {discountTotal > 0 && (
          <div className="flex justify-between">
            <span>DISCOUNT</span>
            <span>{formatReceiptMoney(discountTotal)}</span>
          </div>
        )}
        {subtotal > 0 && (
          <div className="flex justify-between">
            <span>SUBTOTAL</span>
            <span>{formatReceiptMoney(subtotal)}</span>
          </div>
        )}
        {taxTotal > 0 && (
          <div className="flex justify-between">
            <span>GST TOTAL</span>
            <span>{formatReceiptMoney(taxTotal)}</span>
          </div>
        )}
        <div className="my-1 border-t border-black" />
        <div className="text-[10px]">
          {taxLines.map((line, index) => (
            <div key={`${line.rate}-${index}`}>
              CGST {line.cgstRate}% = {formatReceiptMoney(line.cgstAmount)} SGST{" "}
              {line.cgstRate}% = {formatReceiptMoney(line.sgstAmount)}
            </div>
          ))}
        </div>
        <div className="my-1 border-t border-black" />
        <div className="text-center text-[12px] font-black">
          For Latest Offer / Feedback Please
        </div>
        <div className="text-center text-[10px]">
          Paid By:{" "}
          {formatPaymentBreakup(
            getReceiptPayments(receiptData),
            bill.paymentMode || bill.payment_mode || "cash",
          )}
        </div>
        {receiptChangeDue > 0.01 && (
          <div className="text-center text-[10px] font-black">
            Return: {formatReceiptMoney(receiptChangeDue)}
          </div>
        )}
        <div className="my-1 border-t border-black" />
        <div className="grid grid-cols-[.7fr_1.8fr_.8fr] font-black">
          <span>Qty</span>
          <span>Description</span>
          <span className="text-right">MRP</span>
        </div>
        <div className="my-1 border-t border-black" />
        {isKanpurReceipt ? (
          <div className="text-[9px]">
            {KANPUR_RECEIPT_DETAILS.exchangePolicy}
          </div>
        ) : (
          <div className="text-[9px]">
            1. MRP inclusive of all taxes
            <br />
            2. After billing complaints must be same day.
            <br />
            3. Warranty/exchange is allowed as per product policy.
            <br />
            4. Goods once sold are subject to store return policy.
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all";

  return (
    <MainLayout>
      <div style={{ background: "#f1f5f9", minHeight: "100%" }}>
        {/* ── TOAST ── */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-white text-sm font-bold transition-all ${
              toast.type === "success"
                ? "bg-emerald-500"
                : toast.type === "error"
                  ? "bg-rose-500"
                  : "bg-indigo-500"
            }`}
          >
            <span className="text-base leading-none">
              {toast.type === "success"
                ? "✓"
                : toast.type === "error"
                  ? "✕"
                  : "ℹ"}
            </span>
            {toast.msg}
          </div>
        )}

        {customerDemandModal &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-6">
              <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Customer Demand
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Enter product requested by customer. It will go to the
                      manager for this store.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomerDemandModal(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600">
                      Product demanded *
                    </span>
                    <input
                      value={customerDemandForm.productName}
                      onChange={(event) =>
                        setCustomerDemandForm((prev) => ({
                          ...prev,
                          productName: event.target.value,
                        }))
                      }
                      placeholder="Enter product name / brand / size"
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600">
                      Requested Qty
                    </span>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={customerDemandForm.requestedQty}
                      onChange={(event) =>
                        setCustomerDemandForm((prev) => ({
                          ...prev,
                          requestedQty: event.target.value,
                        }))
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600">
                      Remarks
                    </span>
                    <textarea
                      value={customerDemandForm.remarks}
                      onChange={(event) =>
                        setCustomerDemandForm((prev) => ({
                          ...prev,
                          remarks: event.target.value,
                        }))
                      }
                      placeholder="Optional notes"
                      className={`${inputCls} min-h-[90px] resize-none`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={submitCustomerDemand}
                    disabled={customerDemandSaving}
                    className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-60"
                  >
                    {customerDemandSaving
                      ? "Saving..."
                      : "Submit Customer Demand"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
        {priceVariantOptions.length > 0 &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 sm:p-6">
              <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Select Price
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Same barcode/product has multiple stock-in price batches.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPriceVariantOptions([])}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {priceVariantOptions.map((product) => (
                    <button
                      key={product.variantKey || product.id}
                      type="button"
                      onClick={() => {
                        addProduct(product);
                        setPriceVariantOptions([]);
                        setSearch("");
                        searchInputRef.current?.focus();
                      }}
                      className="mb-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-400 hover:bg-indigo-50/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">
                            {product.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            SKU: {product.sku || "-"} · Barcode:{" "}
                            {product.barcode || "-"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Stock: {product.availableStock}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-indigo-700">
                            Bill {formatCurrency(product.sellingPrice)}
                          </p>
                          {product.sellingPrice !== product.mrp && (
                            <p className="text-xs text-slate-500">
                              MRP {formatCurrency(product.mrp)}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* ── TOP BAR ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
          }}
          className="rounded-2xl mb-4 px-5 py-3.5 flex items-center justify-between gap-4 shadow-lg shadow-indigo-900/20"
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <div className="md:hidden flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="w-9 h-9 rounded-xl border border-white/20 bg-white/10 text-white flex items-center justify-center active:bg-white/20"
                aria-label="Go back"
                title="Back"
              >
                <i className="ti ti-arrow-left text-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => router.push("/home")}
                className="w-9 h-9 rounded-xl border border-white/20 bg-white/10 text-white flex items-center justify-center active:bg-white/20"
                aria-label="Go home"
                title="Home"
              >
                <i className="ti ti-home text-[18px]" />
              </button>
            </div>
            <div>
              <p className="text-indigo-300 text-[10px] font-black tracking-[0.15em] uppercase">
                Point of Sale
              </p>
              <h1 className="text-xl font-black text-white mt-0.5 leading-tight">
                POS Billing
              </h1>
            </div>
            {session?.sessionId ? (
              <div className="hidden sm:flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400"></span>
                <span className="text-indigo-100 text-xs font-semibold truncate max-w-[200px]">
                  {session.userName || "POS User"}
                  {session.storeName ? ` · ${session.storeName}` : ""}
                </span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 bg-rose-500/20 rounded-lg px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                <span className="text-rose-200 text-xs font-semibold">
                  No active session
                </span>
              </div>
            )}
            {/* Offline / Auto-sync status */}
            {isOffline ? (
              <div className="flex items-center gap-1.5 bg-rose-500/25 border border-rose-400/30 rounded-lg px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0 animate-pulse"></span>
                <span className="text-rose-200 text-xs font-bold">OFFLINE</span>
                {pendingQueueCount > 0 && (
                  <span className="text-rose-300 text-[10px] font-semibold">
                    · {pendingQueueCount} pending
                  </span>
                )}
              </div>
            ) : pendingQueueCount > 0 ? (
              <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg px-3 py-1.5">
                <svg
                  className="w-3 h-3 text-emerald-400 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                  />
                </svg>
                <span className="text-emerald-300 text-xs font-semibold">
                  Syncing {pendingQueueCount} bill
                  {pendingQueueCount > 1 ? "s" : ""}…
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {!session?.sessionId ? (
              <button
                onClick={() => setOpenSessionModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-400 hover:bg-indigo-300 text-white font-bold text-sm transition-all shadow-md shadow-indigo-900/30"
              >
                ▶ Open Session
              </button>
            ) : (
              <>
                <button
                  onClick={openCloseSessionModal}
                  className="px-3 py-2 rounded-xl border border-white/20 text-indigo-200 hover:bg-white/10 font-semibold text-xs transition-all"
                >
                  Close Session
                </button>
                <button
                  type="button"
                  onClick={scaleConnected ? disconnectScale : connectScale}
                  className={`px-3 py-2 rounded-xl border font-semibold text-xs transition-all ${
                    scaleConnected
                      ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                      : "border-white/20 text-indigo-200 hover:bg-white/10"
                  }`}
                  title={
                    scaleLastData
                      ? `Last scale data: ${scaleLastData}`
                      : "Connect USB weighing scale"
                  }
                >
                  {scaleConnected
                    ? `Scale ${scaleStatus || formatScaleWeight(scaleWeightKg)}`
                    : "Connect Scale"}
                </button>
                <button
                  onClick={holdCurrentBill}
                  disabled={cart.length === 0}
                  className="px-3 py-2 rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  ⏸ Hold Bill
                </button>
                <button
                  onClick={createBill}
                  disabled={!canGenerateBill}
                  className={`flex items-center gap-1.5 px-5 py-2 rounded-xl font-black text-sm transition-all ${
                    canGenerateBill
                      ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-900/30"
                      : "bg-slate-600/50 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {isProcessing
                    ? "⟳ Processing…"
                    : `⚡ ${formatCurrency(cartTotals.grandTotal)}`}
                </button>
              </>
            )}
          </div>
        </div>

        {scaleConnected && scaleStatus === "Connected · waiting" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 shadow-sm">
            Scale connected, but no readable weight data received yet.{" "}
            {isAndroidRuntime()
              ? "This Android POS needs the local scale bridge service if direct USB data stays unreadable. "
              : ""}
            Press the scale PRINT key once, or set the scale data transmission
            mode to continuous / print output at 9600 baud, 8 data bits, no
            parity, 1 stop bit. The POS will also auto-try common baud rates for
            USB-RS232 converters.{" "}
            {scaleLastData ? (
              <span className="block break-all font-mono font-black">
                Last data: {scaleLastData}
              </span>
            ) : (
              <span className="font-black">No raw data received.</span>
            )}
          </div>
        ) : null}

        {/* Mobile Tab Bar Switcher */}
        <div className="flex border-b border-slate-200 bg-white rounded-2xl p-1 mb-3 lg:hidden shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("catalog")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === "catalog"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            📦 Products
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === "catalog"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {filteredProducts.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cart")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === "cart"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            🛒 Cart
            {cart.length > 0 && (
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  activeTab === "cart"
                    ? "bg-white/25 text-white"
                    : "bg-indigo-600 text-white"
                }`}
              >
                {cart.length}
              </span>
            )}
          </button>
        </div>

        {/* ── MAIN GRID ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_330px] 2xl:grid-cols-[minmax(0,1fr)_370px]">
          {/* ══ LEFT: PRODUCTS PANEL ══ */}
          <div
            className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${activeTab === "catalog" ? "flex" : "hidden lg:flex"}`}
          >
            {/* Search strip */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700 tracking-widest uppercase">
                    Products
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {filteredProducts.length}
                  </span>
                </div>
                {loading && (
                  <span className="text-[10px] text-indigo-500 font-semibold animate-pulse">
                    Syncing…
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
                    🔍
                  </span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleBarcode(e.currentTarget.value);
                      }
                    }}
                    placeholder="Search, type or scan barcode"
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="h-10 w-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                  title="Open mobile camera scanner"
                >
                  <i className="ti ti-camera text-base" />
                </button>
              </div>
            </div>

            {/* Product Grid */}
            <div
              className="grid flex-1 grid-cols-2 content-start gap-2 overflow-auto p-2 md:grid-cols-3 2xl:grid-cols-4"
              style={{ maxHeight: "62vh", gridAutoRows: "126px" }}
            >
              {loading ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                  <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-500 animate-spin mb-4"></div>
                  <span className="text-sm font-semibold">
                    Loading products…
                  </span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                  <span className="text-4xl mb-3">📦</span>
                  <span className="text-sm font-semibold">
                    No products found
                  </span>
                  <span className="text-xs mt-1 text-slate-400">
                    Try a different search
                  </span>
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <button
                    key={product.variantKey || product.id}
                    onClick={() => addProduct(product)}
                    disabled={
                      product.availableStock <= 0 && product.expiredStock <= 0
                    }
                    className={`flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border p-2 text-left transition-all group ${
                      product.availableStock > 0
                        ? "border-slate-200 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-100/60 bg-white cursor-pointer active:scale-[0.98]"
                        : product.expiredStock > 0
                          ? "border-rose-100 bg-rose-50/40 opacity-80 cursor-pointer hover:border-rose-300"
                          : "border-slate-100 bg-slate-50/70 opacity-55 cursor-not-allowed"
                    }`}
                  >
                    {/* Top row: category + stock pill */}
                    <div className="mb-1.5 flex min-h-[18px] min-w-0 items-center justify-between gap-1">
                      <span className="max-w-[58%] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold leading-none text-slate-500">
                        {product.categoryName}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                          product.availableStock > 10
                            ? "bg-emerald-50 text-emerald-700"
                            : product.availableStock > 0
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {product.availableStock > 0
                          ? `${product.availableStock} left`
                          : product.expiredStock > 0
                            ? "Expired"
                            : "OOS"}
                      </span>
                    </div>

                    {/* Product name */}
                    <p
                      className="min-h-[32px] overflow-hidden text-[11px] font-black leading-4 text-slate-800 transition-colors group-hover:text-indigo-700 2xl:text-xs"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {product.name}
                    </p>

                    {/* SKU + billing price row */}
                    <div className="mt-auto grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-slate-50 pt-1.5">
                      <span className="min-w-0 text-[9px] leading-tight text-slate-400">
                        <span className="block truncate font-mono">
                          {product.sku || product.barcode || "-"}
                          {isWeightedUnit(product.unit)
                            ? ` · ${product.unit}`
                            : ""}
                        </span>
                        {product.nearestExpiryDate && (
                          <span className="mt-0.5 block truncate font-semibold text-amber-700">
                            Exp:{" "}
                            {String(product.nearestExpiryDate)
                              .slice(0, 10)
                              .split("-")
                              .reverse()
                              .join("/")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-right leading-tight">
                        {product.sellingPrice !== product.mrp && (
                          <span className="block text-[9px] font-bold text-slate-400">
                            MRP ₹{toNumber(product.mrp).toLocaleString("en-IN")}
                          </span>
                        )}
                        <span className="block text-[11px] font-black text-rose-700 2xl:text-xs">
                          Bill ₹
                          {toNumber(product.sellingPrice).toLocaleString(
                            "en-IN",
                          )}
                        </span>
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ══ RIGHT: ORDER PANEL ══ */}
          <aside
            className={`flex min-w-0 flex-col gap-3 ${activeTab === "cart" ? "flex" : "hidden lg:flex"}`}
          >
            {/* ── CART ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700 tracking-widest uppercase">
                    Cart
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      cart.length > 0
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {cart.length}
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={() => clearCart({ trackDeletedItems: true })}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <span className="text-4xl mb-2.5">🛒</span>
                  <span className="text-xs font-bold text-slate-500">
                    Cart is empty
                  </span>
                  <span className="text-[11px] mt-1 text-slate-400">
                    Tap a product to add it
                  </span>
                </div>
              ) : (
                <>
                  <div className="overflow-auto" style={{ maxHeight: "190px" }}>
                    {cart.map((item) => {
                      const itemKey = getCartItemKey(item);
                      const { weightedUnit, weighted, qtyStep, minQty } =
                        getCartQtyRules(item);
                      const isScaleLinked = activeScaleCartKey === itemKey;
                      const isPromotionFreeItem = Boolean(
                        item.promotionFreeItem,
                      );
                      const qtyDraft = qtyDrafts[itemKey];
                      return (
                        <div
                          key={itemKey}
                          className={`border-b border-slate-50 px-2.5 py-2 transition-colors last:border-0 hover:bg-slate-50/50 ${
                            isScaleLinked ? "bg-emerald-50/60" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-800 text-xs leading-snug line-clamp-2">
                                {item.name}
                              </p>
                              {isScaleLinked && (
                                <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                                  Live scale sync
                                </p>
                              )}
                              {isPromotionFreeItem && (
                                <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                                  FREE -{" "}
                                  {item.promotionName || "Scheme applied"}
                                </p>
                              )}
                            </div>
                            {!isPromotionFreeItem && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeCartItem(itemKey);
                                }}
                                className="w-5 h-5 rounded-md bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white text-[10px] font-black flex items-center justify-center transition-all shrink-0 mt-0.5"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Qty +/- */}
                            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden shrink-0">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (isPromotionFreeItem) return;
                                  unlinkScaleFromCartItem(itemKey);
                                  clearQtyDraft(itemKey);
                                  updateCartItem(
                                    itemKey,
                                    "qty",
                                    Math.max(
                                      minQty,
                                      Number((item.qty - qtyStep).toFixed(3)),
                                    ),
                                  );
                                }}
                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 font-bold text-base transition-colors disabled:opacity-40"
                                disabled={isPromotionFreeItem}
                              >
                                −
                              </button>
                              <input
                                type="text"
                                inputMode={weighted ? "decimal" : "numeric"}
                                pattern={
                                  weighted ? "[0-9]*[.]?[0-9]*" : "[0-9]*"
                                }
                                min={minQty}
                                step={qtyStep}
                                value={qtyDraft ?? item.qty}
                                disabled={isPromotionFreeItem}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => unlinkScaleFromCartItem(itemKey)}
                                onBlur={() =>
                                  commitCartQtyDraft(
                                    itemKey,
                                    item,
                                    qtyDraft ?? item.qty,
                                  )
                                }
                                onChange={(e) => {
                                  unlinkScaleFromCartItem(itemKey);
                                  const nextValue = e.target.value.replace(
                                    ",",
                                    ".",
                                  );
                                  if (
                                    weighted
                                      ? /^\d*\.?\d{0,3}$/.test(nextValue)
                                      : /^\d*$/.test(nextValue)
                                  ) {
                                    setQtyDrafts((current) => ({
                                      ...current,
                                      [itemKey]: nextValue,
                                    }));
                                  }
                                }}
                                className={`h-7 text-center text-xs font-bold text-slate-900 bg-white border-x border-slate-200 outline-none ${
                                  weighted ? "w-16" : "w-9"
                                }`}
                              />
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (isPromotionFreeItem) return;
                                  unlinkScaleFromCartItem(itemKey);
                                  clearQtyDraft(itemKey);
                                  updateCartItem(
                                    itemKey,
                                    "qty",
                                    Math.min(
                                      Number((item.qty + qtyStep).toFixed(3)),
                                      item.availableStock,
                                    ),
                                  );
                                }}
                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 font-bold text-base transition-colors disabled:opacity-40"
                                disabled={isPromotionFreeItem}
                              >
                                +
                              </button>
                            </div>
                            {weighted && (
                              <>
                                <span className="text-[10px] font-bold text-slate-500">
                                  {item.qty} {weightedUnit}
                                </span>
                                {!isPromotionFreeItem && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (isScaleLinked) {
                                        unlinkScaleFromCartItem(itemKey);
                                      } else {
                                        linkScaleToCartItem(itemKey);
                                      }
                                    }}
                                    className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors ${
                                      isScaleLinked
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-700"
                                    }`}
                                  >
                                    {isScaleLinked
                                      ? "Scale linked"
                                      : "Use scale"}
                                  </button>
                                )}
                              </>
                            )}

                            {canManageDiscounts &&
                              item.allowDiscountOnPos &&
                              !isPromotionFreeItem && (
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  <span className="text-[9px] text-slate-400 font-bold shrink-0 uppercase">
                                    Disc
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.discountAmount}
                                    onChange={(e) =>
                                      updateCartItem(
                                        itemKey,
                                        "discountAmount",
                                        toNumber(e.target.value, 0),
                                      )
                                    }
                                    className="flex-1 min-w-0 rounded-md border border-slate-200 px-1.5 h-7 text-xs text-slate-900 outline-none focus:border-indigo-400 bg-white"
                                  />
                                </div>
                              )}

                            <span className="ml-auto font-black text-slate-900 text-xs whitespace-nowrap">
                              {formatCurrency(
                                item.qty * item.sellingPrice -
                                  (item.promotionFreeItem ||
                                  item.approvedManualDiscount ||
                                  (canManageDiscounts &&
                                    item.allowDiscountOnPos)
                                    ? toNumber(item.discountAmount)
                                    : 0),
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals */}
                  <div className="px-4 py-3 bg-gradient-to-b from-slate-50 to-white border-t border-slate-100 space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Subtotal</span>
                      <span className="font-semibold text-slate-700">
                        {formatCurrency(cartTotals.subtotal)}
                      </span>
                    </div>
                    {cartTotals.discount > 0 && (
                      <div className="flex justify-between text-xs text-emerald-600">
                        <span>Discount</span>
                        <span className="font-semibold">
                          −{formatCurrency(cartTotals.discount)}
                        </span>
                      </div>
                    )}
                    {cartTotals.taxTotal > 0 && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>GST</span>
                        <span className="font-semibold text-slate-700">
                          {formatCurrency(cartTotals.taxTotal)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="text-sm font-black text-slate-800">
                        Total
                      </span>
                      <span className="text-xl font-black text-indigo-700">
                        {formatCurrency(cartTotals.grandTotal)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── PAYMENT ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <span className="text-xs font-black text-slate-700 tracking-widest uppercase">
                  Payment
                </span>
              </div>
              <div className="space-y-2 p-2.5">
                {/* Customer fields */}
                <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                    className={inputCls}
                    style={{ fontSize: "12px" }}
                  />
                  <div>
                    <input
                      type="tel"
                      value={customerMobile}
                      onChange={(e) => {
                        const digits = String(e.target.value)
                          .replace(/\D/g, "")
                          .slice(0, 10);
                        setCustomerMobile(digits);
                        if (digits.length === 10) checkForHeldBills(digits);
                      }}
                      placeholder="Mobile (10 digits) *"
                      maxLength="10"
                      required
                      className={`${inputCls} ${cart.length > 0 && !customerMobile.trim() ? "border-rose-300 bg-rose-50/40" : ""}`}
                      style={{ fontSize: "12px" }}
                    />
                    {customerMobile &&
                      !validatePhoneNumber(customerMobile).isValid && (
                        <p className="text-[10px] text-rose-500 mt-0.5 px-1">
                          {validatePhoneNumber(customerMobile).error}
                        </p>
                      )}
                  </div>
                </div>

                {/* View history */}
                <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
                  <button
                    onClick={loadCustomerHistory}
                    className="w-full text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-xl py-2 transition-colors"
                  >
                    View Customer History
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerDemandModal(true)}
                    className="w-full text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl py-2 transition-colors"
                  >
                    Customer Demand
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-1.5">
                    Payment Method Amounts
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FIXED_PAYMENT_METHODS.map((method) => {
                      const paymentRow = payments.find(
                        (payment) => payment.method === method.method,
                      ) || { method: method.method, amount: "" };
                      return (
                        <div
                          key={method.method}
                          className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <i
                                className={`ti ${method.icon} text-base text-slate-600`}
                              />
                              <span className="text-xs font-bold text-slate-800">
                                {method.label}
                              </span>
                            </div>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max={
                              method.method === "cash"
                                ? undefined
                                : Math.max(
                                    0,
                                    Math.round(
                                      (cartTotals.grandTotal -
                                        getOtherPaymentTotal(method.method)) *
                                        100,
                                    ) / 100,
                                  )
                            }
                            step="0.01"
                            value={paymentRow.amount}
                            onChange={(e) =>
                              handlePaymentAmountChange(
                                method.method,
                                e.target.value,
                              )
                            }
                            disabled={isPaymentMethodDisabled(method.method)}
                            placeholder="Amount"
                            className={`${inputCls} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                            style={{ fontSize: "12px" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div
                    className={`text-[11px] font-bold ${isPaymentBalanced ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    Paid {formatCurrency(paidTotal)} /{" "}
                    {changeDue > 0.01 ? "Return " : "Balance "}
                    {formatCurrency(
                      changeDue > 0.01
                        ? changeDue
                        : Math.max(0, paymentBalance),
                    )}
                  </div>
                  {changeDue > 0.01 && (
                    <div className="text-[10.5px] font-semibold text-slate-500">
                      Return {formatCurrency(changeDue)} from cash drawer
                    </div>
                  )}
                </div>

                {canRequestDiscount && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={openDiscountRequest}
                      disabled={
                        !cart.length ||
                        activeDiscountRequest?.status === "pending" ||
                        activeDiscountRequest?.status === "approved"
                      }
                      className="w-full rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-xs font-black text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Request Discount Approval
                    </button>
                    {activeDiscountRequest && (
                      <div
                        className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${
                          activeDiscountRequest.status === "approved"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {activeDiscountRequest.requestCode}:{" "}
                        {activeDiscountRequest.status === "approved"
                          ? `${formatCurrency(activeDiscountRequest.approvedAmount)} approved`
                          : "Waiting for Super Admin approval"}
                      </div>
                    )}
                  </div>
                )}

                {user?.role === "super_admin" && (
                  <button
                    type="button"
                    onClick={() => loadDiscountApprovals(true)}
                    className="w-full rounded-xl border border-violet-200 bg-white py-2.5 text-xs font-black text-violet-700 transition-colors hover:bg-violet-50"
                  >
                    Discount Approvals
                    {discountApprovalRows.length > 0
                      ? ` (${discountApprovalRows.length})`
                      : ""}
                  </button>
                )}

                {/* Order discount */}
                {canApplyOrderDiscount && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase block mb-1">
                      Order Discount
                    </label>
                    <input
                      type="number"
                      value={orderDiscount}
                      onChange={(e) =>
                        canManageDiscounts && setOrderDiscount(e.target.value)
                      }
                      readOnly={hasApprovedOrderDiscount}
                      placeholder="0"
                      className={`${inputCls} ${
                        hasApprovedOrderDiscount
                          ? "cursor-not-allowed bg-emerald-50"
                          : ""
                      }`}
                      style={{ fontSize: "12px" }}
                    />
                  </div>
                )}

                {/* Round off */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase block mb-1">
                    Round Off
                  </label>
                  <input
                    type="number"
                    value={roundOff}
                    readOnly
                    className={`${inputCls} cursor-not-allowed bg-slate-100`}
                    style={{ fontSize: "12px" }}
                  />
                </div>

                {/* Generate Bill */}
                <button
                  onClick={createBill}
                  disabled={!canGenerateBill}
                  className={`w-full py-3.5 rounded-xl font-black text-sm transition-all ${
                    canGenerateBill
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-200 active:scale-[0.99]"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {!session?.sessionId
                    ? "🔒 Open Session First"
                    : isProcessing
                      ? "⟳ Generating…"
                      : `⚡ Generate Bill · ${formatCurrency(cartTotals.grandTotal)}`}
                </button>

                {/* Hold Bill */}
                <button
                  onClick={holdCurrentBill}
                  disabled={cart.length === 0}
                  className="w-full py-2 rounded-xl font-bold text-xs border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  ⏸ Hold Bill
                </button>
              </div>
            </div>

            {/* ── HELD BILLS ── */}
            {heldBills.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between bg-amber-50/50">
                  <span className="text-xs font-black text-amber-800 tracking-widest uppercase">
                    Held Bills
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {heldBills.length}
                  </span>
                </div>
                <div className="max-h-52 overflow-auto divide-y divide-slate-50">
                  {heldBills.map((heldBill, idx) => (
                    <div
                      key={heldBill.id || idx}
                      className="px-3 py-2.5 hover:bg-amber-50/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-xs truncate">
                            {heldBill.customerName || "Walk-in"}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {(heldBill.cart || []).length} items
                            {heldBill.customerMobile
                              ? ` · ${heldBill.customerMobile}`
                              : ""}
                          </p>
                        </div>
                        <span className="font-black text-amber-700 text-xs shrink-0">
                          {formatCurrency(heldBill.totals?.grandTotal || 0)}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => resumeHeldBill(heldBill)}
                          className="flex-1 text-[10px] font-bold text-indigo-700 border border-indigo-200 bg-white hover:bg-indigo-50 rounded-lg py-1.5 transition-colors"
                        >
                          Resume
                        </button>
                        <button
                          onClick={() => removeHeldBill(heldBill.id)}
                          className="text-[10px] font-bold text-rose-600 border border-rose-200 bg-white hover:bg-rose-50 rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── RECENT BILLS ── */}
            <div
              className={`bg-white rounded-2xl shadow-sm overflow-hidden ${
                salesTracker.pendingCount
                  ? "border border-amber-200"
                  : "border border-slate-200"
              }`}
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-slate-700 tracking-widest uppercase">
                    Sales Tracker
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Bills from the selected start date until now
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                  {session?.storeName || "POS"}
                </span>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-100 p-3">
                <label className="min-w-0">
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Start date
                  </span>
                  <input
                    type="date"
                    value={salesDateFrom}
                    max={getDateInputValue()}
                    onChange={(event) => setSalesDateFrom(event.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-indigo-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={loadSalesTrackerData}
                  disabled={salesTrackerLoading || !salesDateFrom}
                  className="mt-4 h-9 rounded-lg bg-indigo-600 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {salesTrackerLoading ? "Loading..." : "Show bills"}
                </button>
              </div>

              <div className="border-b border-slate-100 px-3 py-2">
                <p className="mb-1.5 text-[9px] font-bold text-slate-400">
                  {salesDateLabel} · through now
                </p>
                <input
                  type="search"
                  value={salesBillSearch}
                  onChange={(event) => setSalesBillSearch(event.target.value)}
                  placeholder="Search bill, customer, mobile, payment..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 p-3">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Total bills
                  </p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {salesTracker.billCount}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Sales
                  </p>
                  <p className="mt-1 text-sm font-black text-indigo-600">
                    {formatCurrency(salesTracker.salesTotal)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Avg bill
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-900">
                    {formatCurrency(salesTracker.averageBill)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Pending sync
                  </p>
                  <p
                    className={`mt-1 text-xl font-black ${
                      salesTracker.pendingCount
                        ? "text-amber-700"
                        : "text-slate-900"
                    }`}
                  >
                    {salesTracker.pendingCount}
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Bills list
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  Showing {visibleRecentBills.length} of{" "}
                  {salesTracker.billCount}
                </span>
              </div>
            </div>

            {recentBills.length > 0 && (
              <div
                className={`bg-white rounded-2xl shadow-sm overflow-hidden ${
                  recentBills.some((b) => b.isOffline)
                    ? "border border-amber-200"
                    : "border border-slate-200"
                }`}
              >
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-700 tracking-widest uppercase">
                      Bill List
                    </span>
                    {recentBills.some((b) => b.isOffline) && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 animate-pulse">
                        {recentBills.filter((b) => b.isOffline).length} PENDING
                        SYNC
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {visibleRecentBills.length}
                    </span>
                  </div>
                </div>
                <div className="max-h-72 overflow-auto divide-y divide-slate-50">
                  {visibleRecentBills.length === 0 && (
                    <p className="px-4 py-8 text-center text-[11px] font-semibold text-slate-400">
                      No bills match this search.
                    </p>
                  )}
                  {visibleRecentBills.map((bill, idx) => (
                    <div
                      key={bill.id || bill.billNumber || idx}
                      className={`px-3 py-2.5 transition-colors ${
                        bill.isOffline
                          ? "bg-amber-50/40 hover:bg-amber-50"
                          : "hover:bg-slate-50/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-slate-900 text-xs truncate">
                              {bill.billNumber || `Bill ${idx + 1}`}
                            </p>
                            {bill.isOffline && (
                              <span className="text-[8px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0 uppercase tracking-wide">
                                Offline
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                            {bill.customerName || "Walk-in"}
                            {bill.customerMobile
                              ? ` · ${bill.customerMobile}`
                              : ""}
                          </p>
                          <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                            {formatIndianDateTime(
                              bill.createdAt || bill.created_at,
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`font-black text-xs ${bill.isOffline ? "text-amber-700" : "text-indigo-600"}`}
                          >
                            {formatCurrency(bill.grandTotal)}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {formatPaymentBreakup(
                              bill.payments,
                              bill.paymentMode || "cash",
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            if (bill.isOffline) {
                              // For offline bills, reconstruct receipt from stored data
                              setReceiptData({
                                bill: {
                                  ...bill,
                                  publicToken: null,
                                },
                                items: [],
                                subtotal: bill.subtotal || bill.grandTotal || 0,
                                discount: bill.discountTotal || 0,
                                taxTotal: bill.taxTotal || 0,
                                grandTotal: bill.grandTotal || 0,
                              });
                              setReceiptModal(true);
                            } else {
                              openReceiptFromBill(bill);
                            }
                          }}
                          className={`flex-1 text-[10px] font-bold rounded-lg py-1.5 transition-colors ${
                            bill.isOffline
                              ? "text-amber-700 border border-amber-200 bg-white hover:bg-amber-50"
                              : "text-indigo-600 border border-indigo-100 bg-white hover:bg-indigo-50"
                          }`}
                        >
                          {bill.isOffline
                            ? "🖨 Print Offline Receipt"
                            : "View Receipt"}
                        </button>
                        {canDeleteBills && !bill.isOffline && (
                          <button
                            type="button"
                            onClick={() => deleteBill(bill)}
                            className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-rose-600 transition-colors hover:bg-rose-50"
                            title="Delete bill and restore inventory"
                          >
                            <i className="ti ti-trash text-[13px]" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* ══════════════════════ MODALS ══════════════════════ */}

        {/* ── Receipt Modal ── */}
        {receiptModal && receiptData && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-auto">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Bill Receipt
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {receiptData.bill?.billNumber ||
                      receiptData.bill?.bill_number ||
                      receiptData.bill?.invoiceNumber}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canDeleteBills && !receiptData.bill?.isOffline && (
                    <button
                      type="button"
                      onClick={() => deleteBill(receiptData.bill)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => setReceiptModal(false)}
                    className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Print Setup
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Save printer and print without scrolling
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={saveReceiptPrintSettings}
                    disabled={receiptPrintSaving}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    {receiptPrintSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px_120px_120px]">
                  <input
                    value={receiptPrintConfig.printerName || ""}
                    onChange={(event) =>
                      updateReceiptPrintConfig(
                        "printerName",
                        event.target.value,
                      )
                    }
                    placeholder="Printer name"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                  />
                  <select
                    value={receiptPrintConfig.template}
                    onChange={(event) =>
                      updateReceiptPrintConfig("template", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                  >
                    <option value="thermal-80">Thermal 80mm</option>
                    <option value="thermal-57">Thermal 57mm</option>
                    <option value="thermal-58">Thermal 58mm</option>
                    <option value="thermal-72">Thermal 72mm</option>
                    <option value="thermal-76">Thermal 76mm</option>
                    <option value="thermal-82">Thermal 82mm</option>
                    <option value="printer-default">Printer Default</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input
                    type="number"
                    min="40"
                    max="300"
                    value={receiptPrintConfig.paperWidthMm}
                    onChange={(event) =>
                      updateReceiptPrintConfig(
                        "paperWidthMm",
                        event.target.value,
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                  />
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={receiptPrintConfig.cutFeedLines}
                    onChange={(event) =>
                      updateReceiptPrintConfig(
                        "cutFeedLines",
                        event.target.value,
                      )
                    }
                    title="Paper feed after receipt"
                    aria-label="Paper feed after receipt"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                  />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => directPrintReceipt()}
                    disabled={directPrintLoading}
                    className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-red-800 disabled:opacity-60"
                  >
                    {directPrintLoading ? "Printing..." : "Direct Print"}
                  </button>
                  <button
                    onClick={() => printReceipt()}
                    className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800"
                  >
                    Browser Print
                  </button>
                </div>
              </div>

              <div className="bg-slate-100 px-5 py-4">
                {renderReceiptPreview()}
              </div>

              {!receiptData.bill?.isOffline && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        Return Cash
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        Record cash returned after this bill was generated
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCashReturnOpen((open) => !open)}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      {cashReturnOpen ? "Hide" : "Add"}
                    </button>
                  </div>

                  {getBillCashReturns(receiptData).length > 0 && (
                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      {getBillCashReturns(receiptData).map((entry, index) => (
                        <div
                          key={`${entry.createdAt || index}-${entry.amount}`}
                          className="text-[11px] text-slate-600"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-black text-slate-800">
                              {formatCurrency(entry.amount)}
                            </span>
                            <span className="uppercase text-slate-400">
                              {entry.tenderMethod || "UPI"}
                            </span>
                          </div>
                          {entry.reason && (
                            <p className="mt-0.5 font-semibold text-slate-500">
                              {entry.reason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {cashReturnOpen && (
                    <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-slate-600">
                          Cash Returned
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashReturnAmount}
                          onChange={(event) =>
                            setCashReturnAmount(event.target.value)
                          }
                          placeholder="Amount"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-slate-600">
                          Extra Received In
                        </span>
                        <select
                          value={cashReturnTenderMethod}
                          onChange={(event) =>
                            setCashReturnTenderMethod(event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-400"
                        >
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                          <option value="wallet">Wallet</option>
                          <option value="online">Online</option>
                        </select>
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-bold text-slate-600">
                          Reference No.
                        </span>
                        <input
                          value={cashReturnReferenceNo}
                          onChange={(event) =>
                            setCashReturnReferenceNo(event.target.value)
                          }
                          placeholder="UPI transaction/reference number"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-bold text-slate-600">
                          Reason
                        </span>
                        <textarea
                          rows={2}
                          value={cashReturnReason}
                          onChange={(event) =>
                            setCashReturnReason(event.target.value)
                          }
                          placeholder="Example: Customer paid extra by UPI, cash returned"
                          className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-400"
                        />
                      </label>
                      <div className="flex gap-2 sm:col-span-2">
                        <button
                          type="button"
                          onClick={recordCashReturn}
                          disabled={cashReturnSaving}
                          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
                        >
                          {cashReturnSaving ? "Saving..." : "Save Cash Return"}
                        </button>
                        <button
                          type="button"
                          onClick={resetCashReturnForm}
                          disabled={cashReturnSaving}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="hidden">
                {/* Offline bill notice */}
                {receiptData.bill?.isOffline && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <span className="text-amber-500 text-base shrink-0">
                      ⚠️
                    </span>
                    <div>
                      <p className="text-xs font-black text-amber-800">
                        Offline Bill — Pending Server Sync
                      </p>
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        This bill will be confirmed & stock updated once
                        internet is restored.
                      </p>
                    </div>
                  </div>
                )}
                <div className="mb-3 flex flex-col items-center text-center">
                  <img
                    src="/ascent-sync-logo.svg"
                    alt="Ascent Sync"
                    className="h-12 w-auto object-contain"
                  />
                  <p className="text-xs text-slate-500">
                    {receiptData.bill?.isOffline
                      ? "OFFLINE RECEIPT"
                      : "GST Invoice / POS Receipt"}
                  </p>
                </div>
                <div className="my-3 border-t border-dashed border-slate-300" />
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-slate-500">
                      Bill No.
                    </span>
                    <span className="font-bold text-slate-900 text-right">
                      {receiptData.bill?.billNumber ||
                        receiptData.bill?.bill_number ||
                        receiptData.bill?.invoiceNumber ||
                        "-"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-slate-500">
                      Date & Time
                    </span>
                    <span className="font-bold text-slate-900 text-right">
                      {formatReceiptDateTime(
                        receiptData.bill?.createdAt ||
                          receiptData.bill?.created_at,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-slate-500">
                      Customer
                    </span>
                    <span className="font-bold text-slate-900 text-right">
                      {receiptData.bill?.customerName ||
                        receiptData.bill?.customer_name ||
                        "Walk-in Customer"}
                    </span>
                  </div>
                  {(receiptData.bill?.customerMobile ||
                    receiptData.bill?.customer_mobile) && (
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold text-slate-500">
                        Mobile
                      </span>
                      <span className="font-bold text-slate-900">
                        {receiptData.bill?.customerMobile ||
                          receiptData.bill?.customer_mobile}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-slate-500">
                      Payment
                    </span>
                    <span className="font-bold text-slate-900 text-right">
                      {formatPaymentBreakup(
                        getReceiptPayments(receiptData),
                        receiptData.bill?.paymentMode ||
                          receiptData.bill?.payment_mode ||
                          "cash",
                      )}
                    </span>
                  </div>
                </div>
                <div className="my-3 border-t border-dashed border-slate-300" />
                <div className="space-y-2">
                  {(receiptData.items || []).map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="flex justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-900">
                          {item.name || item.product_name || "Product"}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          Qty {toNumber(item.qty, 1)} ×{" "}
                          {formatCurrency(
                            item.selling_price || item.sellingPrice,
                          )}
                        </p>
                      </div>
                      <p className="font-black text-slate-900 shrink-0">
                        {formatCurrency(
                          item.line_total ||
                            toNumber(item.qty, 1) *
                              toNumber(item.selling_price || item.sellingPrice),
                        )}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="my-3 border-t border-dashed border-slate-300" />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <strong className="text-slate-900">
                      {formatCurrency(
                        receiptData.bill?.subtotal || receiptData.subtotal || 0,
                      )}
                    </strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Discount</span>
                    <strong className="text-slate-900">
                      {formatCurrency(
                        receiptData.bill?.discount_total ||
                          receiptData.bill?.discountTotal ||
                          receiptData.discount ||
                          0,
                      )}
                    </strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>GST</span>
                    <strong className="text-slate-900">
                      {formatCurrency(
                        receiptData.bill?.tax_total ||
                          receiptData.bill?.totalTax ||
                          receiptData.taxTotal ||
                          0,
                      )}
                    </strong>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-black text-indigo-700">
                    <span>Total</span>
                    <span>
                      {formatCurrency(
                        receiptData.bill?.grand_total ||
                          receiptData.bill?.grandTotal ||
                          receiptData.grandTotal ||
                          0,
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {false && receiptQR && (
                <div className="flex items-center gap-4 mx-5 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <img
                    src={receiptQR}
                    alt="Invoice QR"
                    className="w-20 h-20 rounded-xl border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-xs">
                      Digital Invoice
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Scan to view, download or print this invoice anytime.
                    </p>
                    {(receiptData?.bill?.publicToken ||
                      receiptData?.bill?.public_token) && (
                      <a
                        href={getInvoiceURL(
                          receiptData.bill.publicToken ||
                            receiptData.bill.public_token,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-indigo-600 font-bold hover:underline mt-1 inline-block"
                      >
                        Open invoice →
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Print Setup
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Saved printer profile and receipt paper size
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={saveReceiptPrintSettings}
                    disabled={receiptPrintSaving}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    {receiptPrintSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">
                      Printer Name
                    </span>
                    <input
                      value={receiptPrintConfig.printerName || ""}
                      onChange={(event) =>
                        updateReceiptPrintConfig(
                          "printerName",
                          event.target.value,
                        )
                      }
                      placeholder="Example: TVS RP 3200, Epson TM-T82"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">
                      Paper
                    </span>
                    <select
                      value={receiptPrintConfig.template}
                      onChange={(event) =>
                        updateReceiptPrintConfig("template", event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                    >
                      <option value="printer-default">Printer Default</option>
                      <option value="thermal-57">Thermal 57mm</option>
                      <option value="thermal-80">Thermal 80mm</option>
                      <option value="thermal-58">Thermal 58mm</option>
                      <option value="thermal-72">Thermal 72mm</option>
                      <option value="thermal-76">Thermal 76mm</option>
                      <option value="thermal-82">Thermal 82mm</option>
                      <option value="a5">A5 Invoice</option>
                      <option value="a4">A4 Invoice</option>
                      <option value="letter">Letter</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">
                      Margin (mm)
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="25"
                      value={receiptPrintConfig.printMarginMm}
                      onChange={(event) =>
                        updateReceiptPrintConfig(
                          "printMarginMm",
                          event.target.value,
                        )
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">
                      Width (mm)
                    </span>
                    <input
                      type="number"
                      min="40"
                      max="300"
                      value={receiptPrintConfig.paperWidthMm}
                      onChange={(event) =>
                        updateReceiptPrintConfig(
                          "paperWidthMm",
                          event.target.value,
                        )
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">
                      Height (sheet only)
                    </span>
                    <input
                      type="number"
                      min="20"
                      max="1000"
                      value={receiptPrintConfig.paperHeightMm}
                      disabled={
                        !isReceiptSheetTemplate(receiptPrintConfig.template)
                      }
                      onChange={(event) =>
                        updateReceiptPrintConfig(
                          "paperHeightMm",
                          event.target.value,
                        )
                      }
                      placeholder="Auto"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">
                      Paper feed after receipt
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={receiptPrintConfig.cutFeedLines}
                      onChange={(event) =>
                        updateReceiptPrintConfig(
                          "cutFeedLines",
                          event.target.value,
                        )
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-400"
                    />
                  </label>
                </div>
                <label className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <span className="text-xs font-bold text-slate-700">
                    Apply software paper size
                  </span>
                  <input
                    type="checkbox"
                    checked={!!receiptPrintConfig.useCssPageSize}
                    onChange={(event) =>
                      updateReceiptPrintConfig(
                        "useCssPageSize",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 accent-slate-900"
                  />
                </label>
                <label className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <span className="text-xs font-bold text-slate-700">
                    Close print tab after print
                  </span>
                  <input
                    type="checkbox"
                    checked={!!receiptPrintConfig.autoCloseAfterPrint}
                    onChange={(event) =>
                      updateReceiptPrintConfig(
                        "autoCloseAfterPrint",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 accent-slate-900"
                  />
                </label>
                <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-500">
                  For Browser Print on a thermal printer, select its 80mm/58mm
                  roll paper in the print dialog and turn off Headers and
                  footers. The printer driver controls the receipt cut length.
                </p>
              </div>

              <div className="px-5 pb-5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => directPrintReceipt()}
                    disabled={directPrintLoading}
                    className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-red-800 disabled:opacity-60"
                  >
                    {directPrintLoading ? "Printing..." : "Direct Print"}
                  </button>
                  <button
                    onClick={() => printReceipt()}
                    className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800"
                  >
                    Browser Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {discountRequestOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Request Discount Approval
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Approval is valid for this cart for 15 minutes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDiscountRequestOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
                >
                  Close
                </button>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-600">
                    Discount Type
                  </label>
                  <select
                    value={discountRequestForm.scope}
                    onChange={(event) =>
                      setDiscountRequestForm((current) => ({
                        ...current,
                        scope: event.target.value,
                      }))
                    }
                    className={inputCls}
                  >
                    <option value="order">Entire Order</option>
                    <option value="item">Specific Product</option>
                  </select>
                </div>

                {discountRequestForm.scope === "item" && (
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">
                      Product
                    </label>
                    <select
                      value={discountRequestForm.targetCartKey}
                      onChange={(event) =>
                        setDiscountRequestForm((current) => ({
                          ...current,
                          targetCartKey: event.target.value,
                        }))
                      }
                      className={inputCls}
                    >
                      {cart
                        .filter((item) => !item.promotionFreeItem)
                        .map((item) => (
                          <option
                            key={getCartItemKey(item)}
                            value={getCartItemKey(item)}
                          >
                            {item.name} -{" "}
                            {formatCurrency(item.qty * item.sellingPrice)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-600">
                    Requested Discount Amount
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={discountRequestForm.amount}
                    onChange={(event) =>
                      setDiscountRequestForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    placeholder="Enter amount"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-600">
                    Reason
                  </label>
                  <textarea
                    value={discountRequestForm.reason}
                    onChange={(event) =>
                      setDiscountRequestForm((current) => ({
                        ...current,
                        reason: event.target.value,
                      }))
                    }
                    rows="3"
                    placeholder="Why is this discount required?"
                    className={`${inputCls} resize-none`}
                  />
                </div>

                <button
                  type="button"
                  onClick={submitDiscountRequest}
                  disabled={discountRequestSaving}
                  className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {discountRequestSaving
                    ? "Sending Request..."
                    : "Send to Super Admin"}
                </button>
              </div>
            </div>
          </div>
        )}

        {discountApprovalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Discount Approvals
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Review pending POS discount requests from all stores.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDiscountApprovalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {discountApprovalLoading ? (
                  <div className="py-10 text-center text-sm font-semibold text-slate-500">
                    Loading requests...
                  </div>
                ) : discountApprovalRows.length === 0 ? (
                  <div className="py-10 text-center text-sm font-semibold text-slate-500">
                    No pending discount requests.
                  </div>
                ) : (
                  discountApprovalRows.map((requestRow) => (
                    <div
                      key={requestRow.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">
                            {requestRow.requestCode}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {requestRow.requestedByName} ·{" "}
                            {requestRow.storeName ||
                              `Store ${requestRow.storeId}`}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-700">
                            {requestRow.scope === "item"
                              ? `Product: ${requestRow.targetProductName || requestRow.targetProductId}`
                              : "Entire Order"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-violet-700">
                            {formatCurrency(requestRow.requestedAmount)}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-500">
                            Expires{" "}
                            {requestRow.expiresAt
                              ? new Date(
                                  requestRow.expiresAt,
                                ).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                        <span className="font-bold">Reason:</span>{" "}
                        {requestRow.reason}
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            reviewDiscountRequest(requestRow, "reject")
                          }
                          disabled={discountReviewingId === requestRow.id}
                          className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            reviewDiscountRequest(requestRow, "approve")
                          }
                          disabled={discountReviewingId === requestRow.id}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Open Session Modal ── */}
        {scannerOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Scan Barcode
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {scannerStatus || "Camera scanner"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  Close
                </button>
              </div>
              <div className="bg-slate-950">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-72 w-full object-cover"
                />
              </div>
              {scannerError && (
                <div className="px-4 py-3 text-xs font-semibold text-rose-600">
                  {scannerError}
                </div>
              )}
              <div className="px-4 pb-4 pt-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setScannerOpen(false);
                      handleBarcode(e.currentTarget.value);
                    }
                  }}
                  placeholder="Or enter/scan barcode"
                  className={inputClassName}
                />
              </div>
            </div>
          </div>
        )}

        {openSessionModal &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-3 sm:p-4">
              <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-lg font-bold text-slate-900">
                    Open Session
                  </h3>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="Opening cash"
                    className={inputClassName}
                  />
                  <p className="text-xs font-medium text-slate-500">
                    {isSuperAdmin
                      ? "Opening cash is optional for Super Admin. A blank amount is treated as 0."
                      : "Enter the opening float physically handed to this employee drawer. For the first session of a new store with zero cash, 0 is allowed."}
                  </p>
                  <input
                    type="text"
                    value={counterName}
                    onChange={(e) => setCounterName(e.target.value)}
                    placeholder="Counter name"
                    className={inputClassName}
                  />
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900"
                  >
                    <option value="">Select store</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-none gap-2 border-t border-slate-100 bg-white px-5 py-4">
                  <button
                    onClick={() => setOpenSessionModal(false)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={openSession}
                    disabled={
                      isProcessing ||
                      (!isSuperAdmin && openingCash === "") ||
                      !Number.isFinite(Number(openingCash)) ||
                      Number(openingCash) < 0
                    }
                    className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isProcessing ? "Opening…" : "Open Session"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* ── Close Session Modal ── */}
        {closeSessionModal &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
              <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex-none border-b border-slate-100 px-5 py-4 sm:px-6">
                  <h3 className="text-base font-black text-slate-900">
                    Close POS Session
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Review today's summary before closing the session.
                  </p>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                  {closingLoading ? (
                    <div className="flex items-center justify-center gap-3 py-6 text-slate-500">
                      <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"></div>
                      <span className="text-sm font-semibold">
                        Loading session summary…
                      </span>
                    </div>
                  ) : closingSummary?.totals ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Session Summary
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <ClosingStat
                          label="Opening Cash"
                          value={formatCurrency(
                            closingSummary.totals.openingCash,
                          )}
                        />
                        <ClosingStat
                          label="Total Sale"
                          value={formatCurrency(
                            closingSummary.totals.grossSales,
                          )}
                        />
                        <ClosingStat
                          label="Cash Sale"
                          value={formatCurrency(
                            closingSummary.totals.cashSales,
                          )}
                        />
                        <ClosingStat
                          label="Withdrawn"
                          value={formatCurrency(
                            closingSummary.totals.cashWithdrawals,
                          )}
                        />
                        <ClosingStat
                          label="Card Sale"
                          value={formatCurrency(
                            closingSummary.totals.cardSales,
                          )}
                        />
                        <ClosingStat
                          label="UPI Sale"
                          value={formatCurrency(closingSummary.totals.upiSales)}
                        />
                        <ClosingStat
                          label="Paid Total"
                          value={formatCurrency(
                            closingSummary.totals.paidTotal,
                          )}
                        />
                        <ClosingStat
                          label="Bills"
                          value={closingSummary.totals.billCount || 0}
                        />
                        <ClosingStat
                          label="Expected Cash"
                          value={formatCurrency(
                            closingSummary.totals.expectedCash,
                          )}
                          strong
                        />
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase block mb-1.5">
                      Counted Cash / Handover Amount
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                      className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-lg font-black text-emerald-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                    <p className="mt-1 text-[11px] font-medium text-emerald-700">
                      This is the cash the employee is handing to manager.
                      Variance is tracked against expected cash.
                    </p>
                  </div>
                  {!canCloseSessionNow && isCloseTimeRestricted && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      This session can only be closed after 9:00 PM IST.
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase block mb-1.5">
                      Remarks (optional)
                    </label>
                    <textarea
                      value={closingRemarks}
                      onChange={(e) => setClosingRemarks(e.target.value)}
                      placeholder="Any notes about today's session…"
                      rows="2"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
                    />
                  </div>
                </div>
                <div className="flex flex-none gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
                  <button
                    onClick={() => {
                      setCloseSessionModal(false);
                      setClosingSummary(null);
                    }}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={closeSession}
                    disabled={
                      isProcessing || closingLoading || !canCloseSessionNow
                    }
                    className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
                  >
                    {isProcessing
                      ? "Closing…"
                      : canCloseSessionNow
                        ? "Close Session"
                        : "Available after 9 PM"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* ── Hold Bill Detection Modal ── */}
        {holdDetectModal && detectedHeldBills.length > 0 && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-100 px-5 py-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl shrink-0">
                  ⏸
                </div>
                <div className="min-w-0">
                  <p className="font-black text-slate-900 text-sm">
                    Held Bill Found
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {detectedHeldBills.length === 1
                      ? `1 held bill for ${detectedHeldBills[0].customerMobile}`
                      : `${detectedHeldBills.length} held bills for ${detectedHeldBills[0].customerMobile}`}
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-2 max-h-72 overflow-auto">
                {detectedHeldBills.map((heldBill) => (
                  <button
                    key={heldBill.id}
                    type="button"
                    onClick={() => holdCurrentAndResume(heldBill)}
                    className="w-full text-left rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-3 hover:bg-amber-100 hover:border-amber-400 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate">
                          {heldBill.customerName || "Walk-in Customer"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {(heldBill.cart || []).length} item
                          {(heldBill.cart || []).length !== 1 ? "s" : ""}
                          {heldBill.heldAt
                            ? ` · ${new Date(heldBill.heldAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                            : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-amber-700 text-sm">
                          {formatCurrency(heldBill.totals?.grandTotal || 0)}
                        </p>
                        <p className="text-[10px] text-indigo-600 font-bold group-hover:underline mt-0.5">
                          Resume →
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {cart.length > 0 && (
                <div className="mx-4 mb-3 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700 font-semibold">
                  Your current cart ({cart.length} item
                  {cart.length !== 1 ? "s" : ""}) will be auto-held when you
                  resume.
                </div>
              )}

              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => {
                    setHoldDetectModal(false);
                    setDetectedHeldBills([]);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Start Fresh Billing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Customer History Modal ── */}
        {customerHistoryModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[85vh] overflow-auto">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Customer History
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {customerName || customerMobile}
                  </p>
                </div>
                <button
                  onClick={() => setCustomerHistoryModal(false)}
                  className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors"
                >
                  ✕ Close
                </button>
              </div>

              <div className="p-5">
                {customerHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <span className="text-4xl mb-3">🔍</span>
                    <span className="text-sm font-semibold">
                      No history found
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {customerHistory.map((bill, idx) => (
                      <button
                        key={bill.id || idx}
                        type="button"
                        onClick={() => selectCustomerFromHistory(bill)}
                        className="text-left rounded-xl border border-slate-200 p-4 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 text-sm">
                              {bill.billNumber || "Bill #"}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {formatIndianDate(bill.createdAt, "-")}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                              {bill.customerName || "Walk-in"}
                              {bill.customerMobile
                                ? ` · ${bill.customerMobile}`
                                : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-indigo-600 text-sm">
                              {formatCurrency(bill.grandTotal)}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {formatPaymentBreakup(
                                bill.payments,
                                bill.paymentMode,
                              )}
                            </p>
                          </div>
                        </div>
                        {bill.itemCount && (
                          <p className="text-[11px] text-slate-500 mt-2">
                            {bill.itemCount} items
                          </p>
                        )}
                        <p className="text-[11px] font-bold text-indigo-600 mt-2">
                          ↑ Use this customer
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

function ClosingStat({ label, value, strong = false }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${strong ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"}`}
    >
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className={`text-sm ${strong ? "font-black text-indigo-700" : "font-bold text-slate-800"}`}
      >
        {value}
      </p>
    </div>
  );
}
