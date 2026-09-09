"use client";

import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { fetchAuthEndpoint } from "@/lib/auth-endpoints";
import { formatIndianDateTime } from "@/lib/dateUtils";
import { generateQRDataURL, getInvoiceURL } from "@/lib/qrService";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function escapeReceiptHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatReceiptMoney(
  value,
  { negative = false, parentheses = false } = {},
) {
  const amount = Math.abs(toNumber(value));
  const formatted = amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (parentheses) return `(${formatted})`;
  return negative ? `-${formatted}` : formatted;
}

function formatReceiptQty(
  value,
  { negative = false, parentheses = false } = {},
) {
  const qty = Math.abs(toNumber(value));
  const formatted = qty.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (parentheses) return `(${formatted})`;
  return negative ? `-${formatted}` : formatted;
}

function getReceiptDateParts(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  return {
    date: date.toLocaleDateString("en-IN"),
    time: date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

function formatReceiptDateTime(value) {
  return formatIndianDateTime(value || Date.now(), "");
}

const DEFAULT_RECEIPT_CONFIG = {
  businessName: "Buyzaar Sync",
  subtitle: "Return Product Receipt",
  headerText: "",
  footerText: "Thank you. Visit again.",
  showQr: true,
  showCustomerMobile: true,
  showSku: true,
};

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
    return {
      ...DEFAULT_RECEIPT_CONFIG,
      ...config,
      businessName:
        config.businessName ||
        business.legalName ||
        DEFAULT_RECEIPT_CONFIG.businessName,
      headerText: config.headerText || business.address || "",
      subtitle: "Return Product Receipt",
    };
  } catch {
    return DEFAULT_RECEIPT_CONFIG;
  }
}

export default function ReturnsPage() {
  const [formData, setFormData] = useState({
    bill_number: "",
    return_type: "return",
    reason: "",
    items: [],
    refund_amount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [searchedBill, setSearchedBill] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [returnHistory, setReturnHistory] = useState([]);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [receiptQR, setReceiptQR] = useState("");

  const canReviewRequests = useMemo(
    () =>
      user?.role === "super_admin" ||
      user?.role === "admin" ||
      user?.permissions?.includes("*") ||
      user?.permissions?.includes("APPROVE_STORE_BILL_EXCHANGE") ||
      user?.permissions?.includes("PROCESS_STORE_BILL_EXCHANGE"),
    [user],
  );

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadUser() {
    try {
      const res = await fetchAuthEndpoint("/api/auth/me");
      const json = await res.json();
      setUser(json.data?.user || null);
    } catch {
      setUser(null);
    }
  }

  async function loadRequests() {
    try {
      const res = await fetch("/api/pos/returns?status=pending&pageSize=50", {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success) setRequests(Array.isArray(json.data) ? json.data : []);
    } catch {
      setRequests([]);
    }
  }

  async function loadMyRequests() {
    try {
      const res = await fetch("/api/pos/returns?scope=mine&pageSize=20", {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success)
        setMyRequests(Array.isArray(json.data) ? json.data : []);
    } catch {
      setMyRequests([]);
    }
  }

  async function loadReturnHistory() {
    try {
      const res = await fetch("/api/pos/returns?status=completed&pageSize=50", {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success)
        setReturnHistory(Array.isArray(json.data) ? json.data : []);
    } catch {
      setReturnHistory([]);
    }
  }

  useEffect(() => {
    loadUser();
    loadRequests();
    loadMyRequests();
    loadReturnHistory();
  }, []);

  useEffect(() => {
    const token =
      activeReceipt?.original_public_token ||
      activeReceipt?.public_token ||
      activeReceipt?.bill?.public_token;
    if (!activeReceipt || !token) {
      setReceiptQR("");
      return;
    }
    generateQRDataURL(getInvoiceURL(token), { size: 160 })
      .then(setReceiptQR)
      .catch(() => setReceiptQR(""));
  }, [activeReceipt]);

  async function searchBill() {
    if (!formData.bill_number.trim()) {
      showToast("Enter bill number", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/pos/billing?bill_id=${encodeURIComponent(formData.bill_number.trim())}`,
      );
      const json = await res.json();

      if (json.success) {
        setSearchedBill(json.data);
        setSelectedItems([]);
      } else {
        showToast("Bill not found", "error");
        setSearchedBill(null);
      }
    } catch (err) {
      showToast("Error searching bill", "error");
    } finally {
      setLoading(false);
    }
  }

  function toggleItemSelection(item) {
    if (item.return_status && item.return_status !== "declined") {
      showToast(getReturnStatusMessage(item), "error");
      return;
    }
    const maxQty = getMaxReturnQty(item);
    if (maxQty <= 0) {
      showToast(
        `${item.name || "Product"} has no returnable quantity left`,
        "error",
      );
      return;
    }
    if (selectedItems.find((i) => i.product_id === item.product_id)) {
      setSelectedItems(
        selectedItems.filter((i) => i.product_id !== item.product_id),
      );
    } else {
      setSelectedItems([
        ...selectedItems,
        { ...item, return_qty: Math.min(1, maxQty) },
      ]);
    }
  }

  function getMaxReturnQty(item) {
    const explicit = Number(item?.returnable_qty);
    const fallback = Number(item?.qty);
    const max = Number.isFinite(explicit) ? explicit : fallback;
    return Math.max(0, Math.floor(Number(max) || 0));
  }

  function clampReturnQty(productId, value) {
    const sourceItem = searchedBill?.items?.find(
      (item) => Number(item.product_id) === Number(productId),
    );
    const maxQty = getMaxReturnQty(sourceItem);
    const numeric = parseInt(value, 10);
    if (!Number.isFinite(numeric)) return maxQty > 0 ? 1 : 0;
    return Math.max(1, Math.min(numeric, maxQty));
  }

  function updateReturnQty(productId, qty) {
    const normalizedQty = clampReturnQty(productId, qty);
    setSelectedItems(
      selectedItems.map((item) =>
        Number(item.product_id) === Number(productId)
          ? { ...item, return_qty: normalizedQty }
          : item,
      ),
    );
  }

  async function submitReturn() {
    if (selectedItems.length === 0) {
      showToast("Select items to return", "error");
      return;
    }
    const blockedItem = selectedItems.find(
      (item) => item.return_status && item.return_status !== "declined",
    );
    if (blockedItem) {
      showToast(getReturnStatusMessage(blockedItem), "error");
      return;
    }
    const invalidQtyItem = selectedItems.find((item) => {
      const sourceItem = searchedBill?.items?.find(
        (billItem) => Number(billItem.product_id) === Number(item.product_id),
      );
      const maxQty = getMaxReturnQty(sourceItem);
      const returnQty = Number(item.return_qty);
      return (
        !Number.isFinite(returnQty) || returnQty <= 0 || returnQty > maxQty
      );
    });
    if (invalidQtyItem) {
      showToast(
        `${invalidQtyItem.name || "Product"} return qty cannot exceed purchased qty`,
        "error",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/pos/returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original_bill_id: formData.bill_number,
          return_type: formData.return_type,
          reason: formData.reason,
          items: selectedItems.map((item) => ({
            product_id: item.product_id,
            qty: item.return_qty,
            original_price: item.selling_price,
          })),
          refund_amount: calculateRefund(),
          store_id: searchedBill?.bill?.store_id,
        }),
      });

      const json = await res.json();

      if (json.success) {
        if (
          formData.return_type === "exchange" &&
          user?.permissions?.includes("PROCESS_STORE_BILL_EXCHANGE")
        ) {
          const approvalRes = await fetch("/api/pos/returns", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              return_id: json.data?.return_id,
              action: "approve",
            }),
          });
          const approvalJson = await approvalRes.json().catch(() => ({}));
          if (!approvalRes.ok || !approvalJson.success) {
            throw new Error(
              approvalJson.message ||
                "Exchange created but automatic approval failed",
            );
          }
          showToast("Exchange approved and stock updated");
        } else {
          showToast("Return request sent for approval");
        }
        setFormData({
          bill_number: "",
          return_type: "return",
          reason: "",
          items: [],
          refund_amount: 0,
        });
        setSearchedBill(null);
        setSelectedItems([]);
        loadRequests();
        loadMyRequests();
        loadReturnHistory();
      } else {
        showToast(json.message || "Error processing return", "error");
      }
    } catch (err) {
      showToast("Error processing return", "error");
    } finally {
      setLoading(false);
    }
  }

  function calculateRefund() {
    return selectedItems.reduce(
      (sum, item) => sum + item.return_qty * item.selling_price,
      0,
    );
  }

  function getReceiptDetails(request) {
    if (!request) return {};
    const meta = typeof request.meta === "string" ? {} : request.meta || {};
    return request.receipt || meta.receipt || {};
  }

  function buildReturnReceiptModel(
    request,
    receiptConfig = DEFAULT_RECEIPT_CONFIG,
  ) {
    const details = getReceiptDetails(request);
    const dateParts = getReceiptDateParts(
      request?.completed_at ||
        details.completedAt ||
        request?.updated_at ||
        request?.created_at,
    );
    const items = Array.isArray(request?.items) ? request.items : [];
    const rows = items.map((item, index) => {
      const qty = toNumber(item.qty, 1);
      const ourRate = toNumber(
        item.original_price || item.selling_price || item.rate || 0,
      );
      const mrp = toNumber(
        item.mrp || item.original_mrp || item.product_mrp || ourRate,
      );
      const amount = toNumber(item.line_total || qty * ourRate);
      const taxRate = toNumber(item.tax_rate || item.taxRate || 0);
      const taxable = taxRate > 0 ? amount / (1 + taxRate / 100) : amount;
      const taxAmount = Math.max(0, amount - taxable);
      return {
        key: item.id || item.product_id || index,
        serial: index + 1,
        name: item.product_name || item.name || "Product",
        sku: item.sku || "",
        hsn: item.hsn || item.hsn_code || "",
        qty,
        mrp,
        ourRate,
        amount,
        taxRate,
        taxAmount,
        taxable,
      };
    });
    const totalQty = rows.reduce((sum, item) => sum + item.qty, 0);
    const refundAmount = toNumber(
      request?.refund_amount ||
        details.refundAmount ||
        rows.reduce((sum, item) => sum + item.amount, 0),
    );
    const mrpTotal = rows.reduce((sum, item) => sum + item.mrp * item.qty, 0);
    const ourTotal =
      refundAmount || rows.reduce((sum, item) => sum + item.amount, 0);
    const bachat = mrpTotal - ourTotal;
    const taxGroups = rows.reduce((groups, item) => {
      if (item.taxRate <= 0 || item.taxAmount <= 0) return groups;
      const key = String(item.taxRate);
      const current = groups[key] || {
        rate: item.taxRate,
        taxable: 0,
        taxAmount: 0,
      };
      current.taxable += item.taxable;
      current.taxAmount += item.taxAmount;
      groups[key] = current;
      return groups;
    }, {});
    const storeName =
      request?.store_name ||
      request?.storeName ||
      details.storeName ||
      receiptConfig.businessName ||
      "STORE";
    const storeAddress =
      request?.store_address ||
      [
        request?.store_address_line1,
        request?.store_address_line2,
        request?.store_city,
        request?.store_state,
        request?.store_pincode,
      ]
        .filter(Boolean)
        .join(", ") ||
      receiptConfig.headerText ||
      "";
    return {
      title: "RETAIL INVOICE",
      storeName,
      storeAddress,
      storeMobile:
        request?.store_phone ||
        request?.store_mobile ||
        request?.manager_mobile ||
        "",
      gstNo: request?.store_gst_no || request?.gst_no || "",
      fssaiNo: request?.store_fssai_no || request?.fssai_no || "",
      billNo:
        details.returnNumber ||
        request?.return_number ||
        `RET-${request?.id || ""}`,
      originalBillNo:
        request?.bill_number ||
        details.billNumber ||
        request?.original_bill_id ||
        "-",
      date: dateParts.date,
      time: dateParts.time,
      salesman: request?.completed_by_name || user?.name || "RETURN",
      counter: request?.counter_no || request?.counter || "-",
      customerMobile: details.customerMobile || request?.customer_mobile || "",
      refundPaymentMode:
        request?.refund_payment_mode ||
        details.refundPaymentMode ||
        request?.original_payment_mode ||
        "cash",
      rows,
      totalQty,
      refundAmount,
      mrpTotal,
      ourTotal,
      bachat,
      taxGroups: Object.values(taxGroups),
      footerText: receiptConfig.footerText || DEFAULT_RECEIPT_CONFIG.footerText,
      showSku: receiptConfig.showSku,
    };
  }

  function getReturnStatusMessage(item) {
    const productName = item.name || item.product_name || "This product";
    if (item.return_status === "completed")
      return `${productName} is already returned on this invoice`;
    if (item.return_status === "approved")
      return `${productName} return is approved. Proceed from My Return Requests`;
    if (item.return_status === "pending")
      return `${productName} return request is already pending`;
    return `${productName} cannot be returned again`;
  }

  function getReturnStatusLabel(status) {
    if (status === "completed") return "Returned";
    if (status === "approved") return "Approved - proceed pending";
    if (status === "pending") return "Approval pending";
    return "";
  }

  async function reviewRequest(returnId, action) {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/returns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_id: returnId, action }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(
          action === "approve"
            ? "Return approved and stock updated"
            : "Return request declined",
        );
        loadRequests();
        loadMyRequests();
        loadReturnHistory();
      } else {
        showToast(json.message || "Unable to review request", "error");
      }
    } catch {
      showToast("Unable to review request", "error");
    } finally {
      setLoading(false);
    }
  }

  async function proceedReturn(request) {
    setLoading(true);
    try {
      const paymentMode =
        request.original_payment_mode || request.refund_payment_mode || "cash";
      const res = await fetch("/api/pos/returns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          return_id: request.id,
          action: "complete",
          refund_payment_mode: paymentMode,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActiveReceipt({
          ...request,
          ...(json.data || {}),
          receipt: json.data?.receipt,
          refund_payment_mode: paymentMode,
          status: "completed",
        });
        showToast("Return completed and receipt generated");
        loadRequests();
        loadMyRequests();
        loadReturnHistory();
      } else {
        showToast(json.message || "Unable to complete return", "error");
      }
    } catch {
      showToast("Unable to complete return", "error");
    } finally {
      setLoading(false);
    }
  }

  async function printReturnReceipt(request = activeReceipt) {
    if (!request || typeof window === "undefined") return;
    const receiptConfig = await loadReceiptConfig();
    const receipt = buildReturnReceiptModel(request, receiptConfig);
    const token =
      request.original_public_token ||
      request.public_token ||
      request.bill?.public_token;
    let qrBlock = "";

    if (false && token && receiptConfig.showQr) {
      try {
        const url = getInvoiceURL(token);
        const qrData = await generateQRDataURL(url, { size: 160 });
        qrBlock = `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed #94a3b8;text-align:center"><img src="${qrData}" alt="QR" style="width:96px;height:96px" /><p style="font-size:9px;color:#64748b;margin:4px 0 2px;font-weight:700">SCAN TO VIEW ORIGINAL INVOICE</p><p style="font-size:8px;color:#94a3b8;word-break:break-all">${url}</p></div>`;
      } catch {}
    }

    const printWindow = window.open("", "_blank", "width=380,height=720");
    if (!printWindow) {
      showToast(
        "Popup blocked. Please allow popups to print receipt.",
        "error",
      );
      return;
    }

    const rows = receipt.rows
      .map(
        (item) => `
      <div class="item">
        <div class="item-name">${item.serial} ${escapeReceiptHtml(item.name)}</div>
        <div class="item-grid">
          <span>${escapeReceiptHtml(item.hsn || item.sku || "")}</span>
          <span>${formatReceiptMoney(item.mrp)}</span>
          <span>${formatReceiptMoney(item.ourRate, { negative: true })}</span>
          <span>${formatReceiptQty(item.qty, { negative: true })}</span>
          <span>${formatReceiptMoney(item.amount, { negative: true })}</span>
        </div>
      </div>
    `,
      )
      .join("");
    const taxRows = receipt.taxGroups
      .map((group) => {
        const splitRate = group.rate / 2;
        const splitTaxable = group.taxable / 2;
        const splitTax = group.taxAmount / 2;
        return `<div>CGST ${splitRate}% on -${formatReceiptMoney(splitTaxable)} = -${formatReceiptMoney(splitTax)} SGST ${splitRate}% on -${formatReceiptMoney(splitTaxable)} = -${formatReceiptMoney(splitTax)}</div>`;
      })
      .join("");

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Return Invoice ${escapeReceiptHtml(receipt.billNo)}</title>
          <style>
            body { font-family: "Courier New", monospace; color: #111; margin: 0; padding: 10px; font-size: 12px; line-height: 1.16; }
            .center { text-align: center; }
            .title { font-size: 16px; font-weight: 800; letter-spacing: 1px; }
            .store { font-size: 15px; font-weight: 800; text-transform: uppercase; text-decoration: underline; margin-top: 4px; }
            .small { font-size: 10px; }
            .line { border-top: 1px dashed #111; margin: 7px 0; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }
            .label { display: inline-block; min-width: 64px; }
            .value { font-weight: 800; }
            .amount { font-size: 15px; font-weight: 800; }
            .cols, .item-grid { display: grid; grid-template-columns: 1.1fr .7fr .9fr .8fr 1fr; gap: 3px; align-items: start; }
            .cols { font-weight: 800; border-bottom: 1px solid #111; padding-bottom: 2px; }
            .item { padding: 3px 0; }
            .item-name { font-weight: 700; text-transform: uppercase; }
            .item-grid span:nth-child(n+2), .cols span:nth-child(n+2) { text-align: right; }
            .summary { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; }
            .bold { font-weight: 800; }
            .net { font-size: 15px; }
            .tax { font-size: 11px; }
            .terms { font-size: 10px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="title">${escapeReceiptHtml(receipt.title)}</div>
            <div class="store">${escapeReceiptHtml(receipt.storeName)}</div>
            ${receipt.storeAddress ? `<div class="small">${escapeReceiptHtml(receipt.storeAddress)}</div>` : ""}
            ${receipt.gstNo || receipt.storeMobile ? `<div class="small">GST NO:- ${escapeReceiptHtml(receipt.gstNo || "-")} ${receipt.storeMobile ? `, ${escapeReceiptHtml(receipt.storeMobile)}` : ""}</div>` : ""}
            ${receipt.fssaiNo ? `<div class="small">fssai No. : ${escapeReceiptHtml(receipt.fssaiNo)}</div>` : ""}
          </div>
          <div class="line"></div>
          <div class="meta">
            <div><span class="label">Bill No:</span> <span class="value">${escapeReceiptHtml(receipt.billNo)}</span></div>
            <div><span class="label">DATE:</span> ${escapeReceiptHtml(receipt.date)}</div>
            <div><span class="label">TIME:</span> <span class="value">${escapeReceiptHtml(receipt.time)}</span></div>
            <div>Salesman: ${escapeReceiptHtml(receipt.salesman)}</div>
            <div><span class="label">COUNTER:</span> ${escapeReceiptHtml(receipt.counter)}</div>
            <div>AMOUN <span class="amount">Rs.${formatReceiptMoney(receipt.refundAmount, { parentheses: true })}</span></div>
            ${receipt.customerMobile ? `<div style="grid-column:1 / -1"><span class="label">MOBILE NO:</span> <span class="amount">${escapeReceiptHtml(receipt.customerMobile)}</span></div>` : ""}
          </div>
          <div class="line"></div>
          <div class="cols"><span>HSN</span><span>MRP</span><span>OUR RATE</span><span>QTY</span><span>Amount</span></div>
          ${rows}
          <div class="line"></div>
          <div class="summary">
            <span>SERIAL NO : ${receipt.rows.length.toFixed(2)}</span><span>TOTAL QTY: ${formatReceiptQty(receipt.totalQty, { parentheses: true })}</span>
            <span class="bold net">NET AMOUNT(R/O)</span><span class="bold net">${formatReceiptMoney(receipt.refundAmount, { parentheses: true })}</span>
          </div>
          <div class="line"></div>
          <div class="center small">(INCL. OF All GST TAXES)</div>
          <div class="line"></div>
          <div class="summary">
            <span>MRP RATE SE TOTAL</span><span>-${formatReceiptMoney(receipt.mrpTotal)}</span>
            <span>HAMARE RATE SE TOTAL</span><span>-${formatReceiptMoney(receipt.ourTotal)}</span>
            <span class="bold">MRP RATE SE BACHAT</span><span class="bold">-${formatReceiptMoney(receipt.bachat)}</span>
          </div>
          <div class="line"></div>
          <div class="tax">${taxRows || "CGST 0% on 0.00 = 0.00"}</div>
          <div class="line"></div>
          <div class="terms">
            <div class="bold">Qty&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Description&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;MRP</div>
            <div class="line"></div>
            <div>1. MRP (Inclusive of all taxes)</div>
            <div>2. All EXCHANGE / Complaints Must be Supported By Invoice</div>
            <div>3. No Cash Refund</div>
            <div>4. No Warranty/Exchange is allowed for Items Purchased on discount</div>
            <div>5. Gift Items & Basket will not be Returned.</div>
            <div>6. Festive Items will not be Returned.</div>
            <div>7. Any Replacement after 2 days for bill date will not be accepted</div>
            <div>8. We are updating GST as Govt Revised GST on various items</div>
            <div>9. Inconvenience caused is deeply regretted.</div>
          </div>
          ${qrBlock}
          <script>window.onload = () => { window.print(); window.close(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function renderReturnReceiptPreview(request) {
    const receipt = buildReturnReceiptModel(request);
    return (
      <div className="mx-auto w-[320px] bg-white px-4 py-5 font-mono text-[11px] leading-tight text-black shadow-sm">
        <div className="text-center">
          <div className="text-base font-extrabold tracking-wide">
            {receipt.title}
          </div>
          <div className="mt-1 text-sm font-extrabold uppercase underline">
            {receipt.storeName}
          </div>
          {receipt.storeAddress && (
            <div className="text-[10px]">{receipt.storeAddress}</div>
          )}
          {(receipt.gstNo || receipt.storeMobile) && (
            <div className="text-[10px]">
              GST NO:- {receipt.gstNo || "-"}
              {receipt.storeMobile ? `, ${receipt.storeMobile}` : ""}
            </div>
          )}
          {receipt.fssaiNo && (
            <div className="text-[10px]">fssai No. : {receipt.fssaiNo}</div>
          )}
        </div>

        <div className="my-2 border-t border-dashed border-black" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div>
            Bill No: <span className="font-extrabold">{receipt.billNo}</span>
          </div>
          <div>DATE: {receipt.date}</div>
          <div>
            TIME: <span className="font-extrabold">{receipt.time}</span>
          </div>
          <div>Salesman: {receipt.salesman}</div>
          <div>COUNTER: {receipt.counter}</div>
          <div>
            AMOUN{" "}
            <span className="text-sm font-extrabold">
              Rs.
              {formatReceiptMoney(receipt.refundAmount, { parentheses: true })}
            </span>
          </div>
          {receipt.customerMobile && (
            <div className="col-span-2">
              MOBILE NO:{" "}
              <span className="text-sm font-extrabold">
                {receipt.customerMobile}
              </span>
            </div>
          )}
        </div>

        <div className="my-2 border-t border-dashed border-black" />
        <div className="grid grid-cols-[1.1fr_.7fr_.9fr_.8fr_1fr] gap-1 border-b border-black pb-1 font-extrabold">
          <span>HSN</span>
          <span className="text-right">MRP</span>
          <span className="text-right">OUR RATE</span>
          <span className="text-right">QTY</span>
          <span className="text-right">Amount</span>
        </div>
        {receipt.rows.map((item) => (
          <div key={item.key} className="py-1">
            <div className="font-bold uppercase">
              {item.serial} {item.name}
            </div>
            <div className="grid grid-cols-[1.1fr_.7fr_.9fr_.8fr_1fr] gap-1">
              <span>{item.hsn || item.sku || ""}</span>
              <span className="text-right">{formatReceiptMoney(item.mrp)}</span>
              <span className="text-right">
                -{formatReceiptMoney(item.ourRate)}
              </span>
              <span className="text-right">
                {formatReceiptQty(item.qty, { negative: true })}
              </span>
              <span className="text-right">
                -{formatReceiptMoney(item.amount)}
              </span>
            </div>
          </div>
        ))}

        <div className="my-2 border-t border-dashed border-black" />
        <div className="grid grid-cols-2 gap-y-1">
          <span>SERIAL NO : {receipt.rows.length.toFixed(2)}</span>
          <span className="text-right">
            TOTAL QTY:{" "}
            {formatReceiptQty(receipt.totalQty, { parentheses: true })}
          </span>
          <span className="text-sm font-extrabold">NET AMOUNT(R/O)</span>
          <span className="text-right text-sm font-extrabold">
            {formatReceiptMoney(receipt.refundAmount, { parentheses: true })}
          </span>
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center text-[10px]">(INCL. OF All GST TAXES)</div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="grid grid-cols-2 gap-y-1">
          <span>MRP RATE SE TOTAL</span>
          <span className="text-right">
            -{formatReceiptMoney(receipt.mrpTotal)}
          </span>
          <span>HAMARE RATE SE TOTAL</span>
          <span className="text-right">
            -{formatReceiptMoney(receipt.ourTotal)}
          </span>
          <span className="font-extrabold">MRP RATE SE BACHAT</span>
          <span className="text-right font-extrabold">
            -{formatReceiptMoney(receipt.bachat)}
          </span>
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-[10px]">
          {receipt.taxGroups.length > 0 ? (
            receipt.taxGroups.map((group) => {
              const splitRate = group.rate / 2;
              const splitTaxable = group.taxable / 2;
              const splitTax = group.taxAmount / 2;
              return (
                <div key={group.rate}>
                  CGST {splitRate}% on -{formatReceiptMoney(splitTaxable)} = -
                  {formatReceiptMoney(splitTax)} SGST {splitRate}% on -
                  {formatReceiptMoney(splitTaxable)} = -
                  {formatReceiptMoney(splitTax)}
                </div>
              );
            })
          ) : (
            <div>CGST 0% on 0.00 = 0.00</div>
          )}
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-[10px]">
          <div className="font-extrabold">
            Qty&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Description&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;MRP
          </div>
          <div className="my-1 border-t border-dashed border-black" />
          <div>1. MRP (Inclusive of all taxes)</div>
          <div>2. All EXCHANGE / Complaints Must be Supported By Invoice</div>
          <div>3. No Cash Refund</div>
          <div>
            4. No Warranty/Exchange is allowed for Items Purchased on discount
          </div>
          <div>5. Gift Items & Basket will not be Returned.</div>
          <div>6. Festive Items will not be Returned.</div>
          <div>
            7. Any Replacement after 2 days for bill date will not be accepted
          </div>
          <div>8. We are updating GST as Govt Revised GST on various items</div>
          <div>9. Inconvenience caused is deeply regretted.</div>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">
          Returns & Exchange
        </h1>

        {toast && (
          <div
            className={`mb-4 p-4 rounded ${toast.type === "error" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
          >
            {toast.msg}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Search & Bill Details */}
          <div>
            <div className="mb-6 rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Search Bill
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Bill Number / ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.bill_number}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          bill_number: e.target.value,
                        })
                      }
                      placeholder="Enter bill number..."
                      className="flex-1 rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={searchBill}
                      disabled={loading}
                      className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {searchedBill && (
                  <div className="rounded border border-blue-200 bg-blue-50 p-4">
                    <h3 className="mb-2 font-semibold text-gray-900">
                      Bill Details
                    </h3>
                    <div className="space-y-1 text-sm text-gray-700">
                      <p>
                        <strong className="text-gray-900">Bill ID:</strong>{" "}
                        {searchedBill.bill?.id}
                      </p>
                      <p>
                        <strong className="text-gray-900">Customer:</strong>{" "}
                        {searchedBill.bill?.customer_name || "Walk-in Customer"}{" "}
                        {searchedBill.bill?.customer_mobile
                          ? `(${searchedBill.bill.customer_mobile})`
                          : ""}
                      </p>
                      <p>
                        <strong className="text-gray-900">Payment:</strong>{" "}
                        <span className="capitalize">
                          {searchedBill.bill?.payment_mode || "cash"}
                        </span>
                      </p>
                      <p>
                        <strong className="text-gray-900">Amount:</strong> Rs.
                        {parseFloat(
                          searchedBill.bill?.grand_total ||
                            searchedBill.bill?.total_amount ||
                            0,
                        ).toFixed(2)}
                      </p>
                      <p>
                        <strong className="text-gray-900">Date:</strong>{" "}
                        {formatReceiptDateTime(searchedBill.bill?.created_at)}
                      </p>
                      <p>
                        <strong className="text-gray-900">Items Count:</strong>{" "}
                        {searchedBill.items?.length || 0}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Return Type & Reason */}
            {searchedBill && (
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Return Details
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Return Type
                    </label>
                    <select
                      value={formData.return_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          return_type: e.target.value,
                        })
                      }
                      className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="return">Return</option>
                      <option value="exchange">Exchange</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Reason
                    </label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) =>
                        setFormData({ ...formData, reason: e.target.value })
                      }
                      rows="4"
                      placeholder="Enter reason for return..."
                      className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="rounded bg-gray-50 p-3">
                    <p className="text-sm text-gray-700">
                      <strong className="text-gray-900">Refund Amount:</strong>
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      Rs.{calculateRefund().toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={submitReturn}
                    disabled={loading || selectedItems.length === 0}
                    className="w-full rounded bg-green-600 py-3 font-bold text-white hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {loading ? "Submitting..." : "Submit Return Request"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Item Selection */}
          <div>
            {searchedBill && (
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Select Items to Return
                </h2>

                {searchedBill.items?.length === 0 ? (
                  <p className="text-gray-500">No items in this bill</p>
                ) : (
                  <div className="space-y-3">
                    {searchedBill.items.map((item) => (
                      <div
                        key={item.product_id}
                        className={`rounded border p-3 transition ${
                          item.return_status &&
                          item.return_status !== "declined"
                            ? "cursor-not-allowed border-amber-200 bg-amber-50"
                            : selectedItems.find(
                                  (i) => i.product_id === item.product_id,
                                )
                              ? "border-blue-300 bg-blue-50"
                              : "bg-gray-50 hover:bg-gray-100"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedItems.some(
                              (i) => i.product_id === item.product_id,
                            )}
                            disabled={
                              item.return_status &&
                              item.return_status !== "declined"
                            }
                            onChange={() => toggleItemSelection(item)}
                            className="mt-1"
                          />

                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">
                              {item.name}
                            </h4>
                            <p className="text-sm text-gray-600">
                              SKU: {item.sku}
                            </p>
                            <p className="text-sm text-gray-700">
                              Qty Purchased: {item.qty}
                              {Number(item.returned_qty || 0) > 0
                                ? ` | Already returned/requested: ${item.returned_qty}`
                                : ""}{" "}
                              | Returnable: {getMaxReturnQty(item)} | Price: Rs.
                              {parseFloat(item.selling_price).toFixed(2)}
                            </p>
                            {item.return_status &&
                              item.return_status !== "declined" && (
                                <div className="mt-2 rounded border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-700">
                                  {getReturnStatusLabel(item.return_status)}
                                  {item.return_id
                                    ? ` (#${item.return_id})`
                                    : ""}
                                </div>
                              )}

                            {selectedItems.find(
                              (i) => i.product_id === item.product_id,
                            ) && (
                              <div className="mt-2">
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                  Return Qty
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  max={getMaxReturnQty(item)}
                                  value={
                                    selectedItems.find(
                                      (i) => i.product_id === item.product_id,
                                    )?.return_qty || 1
                                  }
                                  onKeyDown={(e) => {
                                    if (
                                      ["e", "E", "+", "-", "."].includes(e.key)
                                    )
                                      e.preventDefault();
                                  }}
                                  onPaste={(e) => {
                                    const pasted =
                                      e.clipboardData.getData("text");
                                    const nextValue = clampReturnQty(
                                      item.product_id,
                                      pasted,
                                    );
                                    e.preventDefault();
                                    updateReturnQty(item.product_id, nextValue);
                                    if (
                                      Number(pasted) > getMaxReturnQty(item)
                                    ) {
                                      showToast(
                                        `Maximum return qty is ${getMaxReturnQty(item)}`,
                                        "error",
                                      );
                                    }
                                  }}
                                  onInput={(e) => {
                                    const maxQty = getMaxReturnQty(item);
                                    const typed = Number(e.currentTarget.value);
                                    if (
                                      Number.isFinite(typed) &&
                                      typed > maxQty
                                    ) {
                                      e.currentTarget.value = String(maxQty);
                                    }
                                  }}
                                  onChange={(e) => {
                                    const maxQty = getMaxReturnQty(item);
                                    if (Number(e.target.value) > maxQty) {
                                      showToast(
                                        `Maximum return qty is ${maxQty}`,
                                        "error",
                                      );
                                    }
                                    updateReturnQty(
                                      item.product_id,
                                      e.target.value,
                                    );
                                  }}
                                  onBlur={(e) =>
                                    updateReturnQty(
                                      item.product_id,
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedItems.length > 0 && (
                  <div className="mt-4 rounded bg-gray-50 p-3">
                    <p className="text-sm text-gray-700">
                      <strong className="text-gray-900">
                        {selectedItems.length}
                      </strong>{" "}
                      item(s) selected for return
                    </p>
                  </div>
                )}
              </div>
            )}

            {!searchedBill && (
              <div className="rounded-lg bg-gray-50 p-12 text-center">
                <p className="text-gray-500">Search a bill to view items</p>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                My Return Requests
              </h2>
              <p className="text-sm text-gray-500">
                Your submitted return requests and approval status.
              </p>
            </div>
            <button
              onClick={loadMyRequests}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
          {myRequests.length === 0 ? (
            <p className="rounded bg-gray-50 p-4 text-sm text-gray-500">
              No return requests submitted yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Request</th>
                    <th className="px-3 py-2">Bill</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Refund</th>
                    <th className="px-3 py-2">Payment</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {myRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="px-3 py-3 font-medium text-gray-900">
                        #{request.id}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {request.bill_number || request.original_bill_id}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        <div className="font-medium text-gray-900">
                          {request.customer_name || "Walk-in Customer"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {request.customer_mobile || "No mobile"}
                        </div>
                      </td>
                      <td className="px-3 py-3 capitalize text-gray-700">
                        {request.return_type}
                      </td>
                      <td className="px-3 py-3 font-semibold text-gray-900">
                        Rs.{parseFloat(request.refund_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 capitalize text-gray-700">
                        {request.refund_payment_mode ||
                          request.original_payment_mode ||
                          "-"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${
                            request.status === "completed"
                              ? "bg-blue-100 text-blue-700"
                              : request.status === "approved"
                                ? "bg-green-100 text-green-700"
                                : request.status === "declined"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {request.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {request.completed_at
                          ? formatReceiptDateTime(request.completed_at)
                          : request.approved_at
                            ? formatReceiptDateTime(request.approved_at)
                            : request.rejected_at
                              ? formatReceiptDateTime(request.rejected_at)
                              : formatReceiptDateTime(request.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        {request.status === "approved" ? (
                          <button
                            onClick={() => proceedReturn(request)}
                            disabled={loading}
                            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:bg-gray-400"
                          >
                            Proceed
                          </button>
                        ) : request.status === "completed" ? (
                          <button
                            onClick={() => setActiveReceipt(request)}
                            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                          >
                            Receipt
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {canReviewRequests && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Pending Return Requests
                </h2>
                <p className="text-sm text-gray-500">
                  Store admins see their store requests. Super admin sees all
                  stores.
                </p>
              </div>
              <button
                onClick={loadRequests}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
            {requests.length === 0 ? (
              <p className="rounded bg-gray-50 p-4 text-sm text-gray-500">
                No pending return requests.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Request</th>
                      <th className="px-3 py-2">Store</th>
                      <th className="px-3 py-2">Bill</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Refund</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requests.map((request) => (
                      <tr key={request.id}>
                        <td className="px-3 py-3 font-medium text-gray-900">
                          #{request.id}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {request.store_name ||
                            `Store ${request.store_id || "-"}`}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {request.bill_number || request.original_bill_id}
                        </td>
                        <td className="px-3 py-3 capitalize text-gray-700">
                          {request.return_type}
                        </td>
                        <td className="px-3 py-3 font-semibold text-gray-900">
                          Rs.{parseFloat(request.refund_amount || 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                reviewRequest(request.id, "approve")
                              }
                              disabled={loading}
                              className="rounded bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:bg-gray-400"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() =>
                                reviewRequest(request.id, "decline")
                              }
                              disabled={loading}
                              className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:bg-gray-400"
                            >
                              Decline
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {canReviewRequests && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Return Product History
                </h2>
                <p className="text-sm text-gray-500">
                  Completed return receipts for your store access.
                </p>
              </div>
              <button
                onClick={loadReturnHistory}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
            {returnHistory.length === 0 ? (
              <p className="rounded bg-gray-50 p-4 text-sm text-gray-500">
                No completed return history yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Return No.</th>
                      <th className="px-3 py-2">Store</th>
                      <th className="px-3 py-2">Bill</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Products</th>
                      <th className="px-3 py-2">Refund</th>
                      <th className="px-3 py-2">Completed</th>
                      <th className="px-3 py-2">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {returnHistory.map((request) => (
                      <tr key={request.id}>
                        <td className="px-3 py-3 font-medium text-gray-900">
                          {request.return_number || `RET-${request.id}`}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {request.store_name ||
                            `Store ${request.store_id || "-"}`}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {request.bill_number || request.original_bill_id}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          <div className="font-medium text-gray-900">
                            {request.customer_name || "Walk-in Customer"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {request.customer_mobile || "No mobile"}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {(request.items || [])
                            .slice(0, 2)
                            .map((item) => item.product_name)
                            .join(", ") || "-"}
                          {(request.items || []).length > 2
                            ? ` +${request.items.length - 2}`
                            : ""}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-gray-900">
                            Rs.
                            {parseFloat(request.refund_amount || 0).toFixed(2)}
                          </div>
                          <div className="text-xs capitalize text-gray-500">
                            {request.refund_payment_mode ||
                              request.original_payment_mode ||
                              "cash"}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-600">
                          {request.completed_at
                            ? formatReceiptDateTime(request.completed_at)
                            : "-"}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setActiveReceipt(request)}
                            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeReceipt && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Return Product Receipt
                  </h2>
                  <p className="text-sm text-gray-500">
                    {getReceiptDetails(activeReceipt).returnNumber ||
                      activeReceipt.return_number ||
                      `RET-${activeReceipt.id}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveReceipt(null)}
                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                >
                  <i className="ti ti-x text-lg" />
                </button>
              </div>

              <div className="max-h-[75vh] overflow-auto bg-gray-100 p-5">
                {renderReturnReceiptPreview(activeReceipt)}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => printReturnReceipt(activeReceipt)}
                    className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveReceipt(null)}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Done
                  </button>
                </div>
              </div>

              <div className="hidden">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded border border-gray-200 p-3">
                    <p className="text-xs font-bold uppercase text-gray-500">
                      Customer
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {getReceiptDetails(activeReceipt).customerName ||
                        activeReceipt.customer_name ||
                        "Walk-in Customer"}
                    </p>
                    <p className="text-sm text-gray-600">
                      {getReceiptDetails(activeReceipt).customerMobile ||
                        activeReceipt.customer_mobile ||
                        "No mobile"}
                    </p>
                  </div>
                  <div className="rounded border border-gray-200 p-3">
                    <p className="text-xs font-bold uppercase text-gray-500">
                      Original Bill
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {activeReceipt.bill_number ||
                        activeReceipt.original_bill_id}
                    </p>
                    <p className="text-sm capitalize text-gray-600">
                      Paid by {activeReceipt.original_payment_mode || "cash"}
                    </p>
                  </div>
                  <div className="rounded border border-gray-200 p-3">
                    <p className="text-xs font-bold uppercase text-gray-500">
                      Refund
                    </p>
                    <p className="mt-1 text-xl font-bold text-green-700">
                      {formatCurrency(
                        activeReceipt.refund_amount ||
                          getReceiptDetails(activeReceipt).refundAmount ||
                          0,
                      )}
                    </p>
                    <p className="text-sm capitalize text-gray-600">
                      {activeReceipt.refund_payment_mode ||
                        getReceiptDetails(activeReceipt).refundPaymentMode ||
                        activeReceipt.original_payment_mode ||
                        "cash"}
                    </p>
                  </div>
                  <div className="rounded border border-gray-200 p-3">
                    <p className="text-xs font-bold uppercase text-gray-500">
                      Processed
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {activeReceipt.completed_by_name || user?.name || "-"}
                    </p>
                    <p className="text-sm text-gray-600">
                      {activeReceipt.completed_at
                        ? formatReceiptDateTime(activeReceipt.completed_at)
                        : getReceiptDetails(activeReceipt).completedAt
                          ? formatReceiptDateTime(
                              getReceiptDetails(activeReceipt).completedAt,
                            )
                          : "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(activeReceipt.items || []).map((item) => (
                        <tr key={item.id || item.product_id}>
                          <td className="px-3 py-3 text-gray-900">
                            <div className="font-medium">
                              {item.product_name || item.name || "Product"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {item.sku || ""}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {Number(item.qty || 0)}
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {formatCurrency(
                              item.original_price || item.selling_price || 0,
                            )}
                          </td>
                          <td className="px-3 py-3 font-semibold text-gray-900">
                            {formatCurrency(
                              item.line_total ||
                                (item.qty || 0) *
                                  (item.original_price ||
                                    item.selling_price ||
                                    0),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(receiptQR || activeReceipt.original_public_token) && (
                  <div className="mt-5 flex items-end justify-between gap-4 border-t border-gray-100 pt-4">
                    <div className="text-center">
                      {receiptQR ? (
                        <img
                          src={receiptQR}
                          alt="Original invoice QR"
                          className="h-24 w-24 rounded border border-gray-200"
                        />
                      ) : (
                        <div className="h-24 w-24 rounded bg-gray-100" />
                      )}
                      <p className="mt-1 text-[10px] font-bold text-gray-400">
                        SCAN ORIGINAL INVOICE
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <p>
                        This return receipt is linked to the original invoice.
                      </p>
                      <p>No signature required.</p>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => printReturnReceipt(activeReceipt)}
                    className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveReceipt(null)}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
