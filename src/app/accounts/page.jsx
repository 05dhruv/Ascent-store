"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import InventoryShell from "@/components/inventory/InventoryShell";

const accountPages = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/accounts",
    tab: "dashboard",
    title: "Accounts Dashboard",
    subtitle: "Cash, vendor dues and imprest alerts.",
  },
  {
    key: "cash-bank",
    label: "Store Cash",
    href: "/accounts/cash-bank",
    tab: "cash",
    title: "Store Cash",
    subtitle: "Opening, closing, live cash and deposits.",
  },
  {
    key: "vendor-payables",
    label: "Vendor Payables",
    href: "/accounts/vendor-payables",
    tab: "vendor",
    title: "Vendor Payables",
    subtitle: "PO, confirmed GRN, due date and UTR.",
  },
  {
    key: "expenses-imprest",
    label: "Imprest",
    href: "/accounts/expenses-imprest",
    tab: "expense",
    title: "Imprest",
    subtitle: "Spend records and controlled replenishment.",
  },
  {
    key: "reports",
    label: "Reports",
    href: "/accounts/reports",
    tab: "reports",
    title: "Accounts Reports",
    subtitle: "Vendor, cash and imprest summaries.",
  },
];

function getPageFromPath(pathname) {
  const slug = pathname.split("/").filter(Boolean)[1] || "dashboard";
  const aliases = {
    "bank-accounts": "cash-bank",
    "daily-cash": "cash-bank",
    "cash-deposits": "cash-bank",
    "pdc-udc": "cash-bank",
    vendors: "vendor-payables",
    "vendor-payments": "vendor-payables",
    "payment-proposals": "vendor-payables",
    expenses: "expenses-imprest",
    imprest: "expenses-imprest",
    calendar: "reports",
    documents: "reports",
    "tally-sync": "reports",
    "audit-trail": "reports",
  };
  const normalizedSlug = aliases[slug] || slug;
  return (
    accountPages.find((page) => page.key === normalizedSlug) || accountPages[0]
  );
}

const initialForms = {
  bank: {},
  cashClose: {},
  deposit: {},
  proposal: {},
  vendorNote: { noteType: "credit" },
  paid: {},
  cheque: { direction: "received", chequeType: "PDC", partyType: "customer" },
  chequeStatus: {},
  expense: {},
  expenseStatus: {},
  imprest: {},
  calendar: {},
  document: {},
};

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function shortDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function statusLabel(value) {
  return String(value || "-").replace(/_/g, " ");
}

function statusTone(value) {
  const text = String(value || "").toLowerCase();
  if (
    text.includes("blocked") ||
    text.includes("reject") ||
    text.includes("bounce") ||
    text.includes("missing")
  ) {
    return "border-rose-100 bg-rose-50 text-rose-700";
  }
  if (
    text.includes("pending") ||
    text.includes("due") ||
    text.includes("proposed") ||
    text.includes("submitted")
  ) {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }
  return "border-emerald-100 bg-emerald-50 text-emerald-700";
}

function uniqueOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    const key = String(option.value || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Badge({ value }) {
  return (
    <span
      className={`inline-flex max-w-full rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold capitalize leading-tight sm:px-2.5 sm:py-1 sm:text-[11px] ${statusTone(value)}`}
    >
      {statusLabel(value)}
    </span>
  );
}

function Section({ title, right, children }) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 px-2 py-2 sm:gap-2 sm:px-4 sm:py-3">
        <h2 className="min-w-0 text-[12px] font-black text-slate-900 [overflow-wrap:anywhere] sm:text-[15px]">
          {title}
        </h2>
        {right}
      </div>
      <div className="min-w-0 p-2 [&_form]:gap-2 sm:p-3 sm:[&_form]:gap-3">
        {children}
      </div>
    </section>
  );
}

function EmptyRow({ colSpan, label = "No records found" }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-2 py-7 text-center text-[11px] font-semibold text-slate-400 sm:px-3 sm:py-10 sm:text-[13px]"
      >
        {label}
      </td>
    </tr>
  );
}

function Table({ headers, rows, renderRow, emptyLabel }) {
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const visibleRows = rows.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-slate-100">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed [&_td]:!px-1.5 [&_td]:!py-2 [&_td]:!text-[11px] [&_td]:align-top [&_td]:leading-tight [&_td]:[overflow-wrap:anywhere] [&_th]:!px-1.5 [&_th]:!py-2 [&_th]:align-top sm:[&_td]:!px-3 sm:[&_td]:!py-3 sm:[&_td]:!text-[13px] sm:[&_th]:!px-3">
          <thead className="bg-white shadow-[0_1px_0_0_#e2e8f0]">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="text-left text-[9px] font-bold uppercase leading-tight text-slate-500 [overflow-wrap:anywhere] sm:text-[11px]"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totalRows ? (
              visibleRows.map(renderRow)
            ) : (
              <EmptyRow colSpan={headers.length} label={emptyLabel} />
            )}
          </tbody>
        </table>
      </div>
      {totalRows > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-2.5 py-2 sm:px-3">
          <span className="text-[10.5px] font-semibold text-slate-500 sm:text-[12px]">
            Showing {startIndex + 1}-
            {Math.min(startIndex + pageSize, totalRows)} of {totalRows}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="h-8 rounded-md border border-slate-200 px-2.5 text-[11px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="min-w-16 text-center text-[10.5px] font-semibold text-slate-500 sm:text-[12px]">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="h-8 rounded-md border border-slate-200 px-2.5 text-[11px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10.5px] font-semibold leading-tight text-slate-500 sm:text-[12px]">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-full min-w-0 rounded-md border border-slate-200 px-2.5 text-[12px] text-slate-800 outline-none focus:border-indigo-400 sm:h-10 sm:rounded-lg sm:px-3 sm:text-[13px]"
      />
    </Field>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
}) {
  const choices = uniqueOptions(options);
  return (
    <Field label={label}>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={!choices.length}
        className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] text-slate-800 outline-none focus:border-indigo-400 sm:h-10 sm:rounded-lg sm:px-3 sm:text-[13px]"
      >
        <option value="" disabled hidden>
          {choices.length ? placeholder : "No eligible records"}
        </option>
        {choices.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function SubmitButton({ children, busy }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="h-8 w-full self-end rounded-md bg-indigo-600 px-3 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:w-auto sm:rounded-lg sm:px-4 sm:text-[13px]"
    >
      {busy ? "Saving..." : children}
    </button>
  );
}

export default function AccountsModulePage() {
  const pathname = usePathname();
  const page = getPageFromPath(pathname);
  const activeTab = page.tab;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [forms, setForms] = useState(initialForms);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load accounts");
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      if (!silent) setData(null);
      setMessage(err.message || "Failed to load accounts");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        load({ silent: true });
      }
    }, 15000);
    const refreshOnFocus = () => load({ silent: true });
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  const updateForm = (name, key, value) => {
    setForms((current) => ({
      ...current,
      [name]: { ...current[name], [key]: value },
    }));
  };

  const submit = async (name, payload, reset = true) => {
    setBusy(name);
    setMessage("");
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      if (reset) {
        setForms((current) => ({
          ...current,
          [name]: initialForms[name] || {},
        }));
      }
      setMessage("Saved successfully");
      await load({ silent: true });
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Action failed");
    } finally {
      setBusy("");
    }
  };

  const stores = data?.stores || [];
  const vendors = data?.vendors || [];
  const customers = data?.customers || [];
  const vendorInvoices = data?.vendorInvoices || [];
  const vendorNotes = data?.vendorNotes || [];
  const paymentProposals = data?.paymentProposals || [];
  const bankAccounts = data?.bankAccounts || [];
  const storeCashSummary = data?.storeCashSummary || [];
  const cashTransactions = data?.cashTransactions || [];
  const cashDeposits = data?.cashDeposits || [];
  const cheques = data?.cheques || [];
  const expenses = data?.expenses || [];
  const imprest = data?.imprest || [];
  const imprestEmployees = data?.imprestEmployees || [];
  const calendar = data?.calendar || [];
  const documents = data?.documents || [];
  const tally = data?.tally || [];
  const audit = data?.audit || [];
  const purchaseOrders = data?.purchaseOrders || [];
  const grns = data?.grns || [];

  const storeOptions = uniqueOptions(
    stores.map((store) => ({ value: store.id, label: store.name })),
  );
  const imprestEmployeeOptions = uniqueOptions(
    imprestEmployees.map((employee) => ({
      value: employee.id,
      label: `${employee.name}${employee.employeeCode ? ` (${employee.employeeCode})` : ""}`,
    })),
  );
  const depositBankOptions = uniqueOptions(
    bankAccounts
      .filter(
        (account) =>
          !forms.deposit.storeId ||
          String(account.store_id) === String(forms.deposit.storeId),
      )
      .map((account) => ({
        value: account.id,
        label: `${account.store_name || "HO"} - ${account.bank_name} ${account.account_number}`,
      })),
  );
  const chequePartyOptions = uniqueOptions(
    (forms.cheque.partyType === "vendor"
      ? vendors
      : customers.filter(
          (party) =>
            !forms.cheque.storeId ||
            String(party.store_id) === String(forms.cheque.storeId),
        )
    ).map((party) => ({
      value: party.id,
      label: party.mobile_number
        ? `${party.name} (${party.mobile_number})`
        : party.name,
    })),
  );
  const chequeBankOptions = uniqueOptions(
    bankAccounts
      .filter(
        (account) =>
          !forms.cheque.storeId ||
          String(account.store_id) === String(forms.cheque.storeId),
      )
      .map((account) => ({
        value: account.id,
        label: `${account.bank_name} ${account.account_number}`,
      })),
  );
  const statusCheque = cheques.find(
    (row) => String(row.id) === String(forms.chequeStatus.chequeId),
  );
  const statusBankOptions = uniqueOptions(
    bankAccounts
      .filter(
        (account) =>
          !statusCheque?.store_id ||
          String(account.store_id) === String(statusCheque.store_id),
      )
      .map((account) => ({
        value: account.id,
        label: `${account.bank_name} ${account.account_number}`,
      })),
  );
  const invoiceOptions = uniqueOptions(
    vendorInvoices
      .filter(
        (invoice) =>
          invoice.hasPurchaseOrder &&
          invoice.hasFinalGrn &&
          invoice.amountLeft > 0 &&
          !invoice.hasActiveProposal,
      )
      .map((invoice) => ({
        value: invoice.id,
        label: `${invoice.vendorName} / ${invoice.invoiceNumber} / Due ${shortDate(invoice.dueDate)} / ${money(invoice.amountLeft)}`,
      })),
  );
  const noteInvoiceOptions = uniqueOptions(
    vendorInvoices
      .filter((invoice) => !invoice.hasActiveProposal)
      .map((invoice) => ({
        value: invoice.id,
        label: `${invoice.vendorName} / ${invoice.invoiceNumber} / Outstanding ${money(invoice.amountLeft)}`,
      })),
  );
  const approvalProposalOptions = uniqueOptions(
    paymentProposals
      .filter((proposal) =>
        ["proposed", "verified"].includes(
          String(proposal.status || "").toLowerCase(),
        ),
      )
      .map((proposal) => ({
        value: proposal.id,
        label: `${proposal.vendorName} / ${proposal.invoiceNumber} / ${money(proposal.amount)}`,
      })),
  );
  const approvedPaymentOptions = uniqueOptions(
    paymentProposals
      .filter(
        (proposal) =>
          String(proposal.status || "").toLowerCase() === "approved",
      )
      .map((proposal) => ({
        value: proposal.id,
        label: `${proposal.vendorName} / ${proposal.invoiceNumber} / ${money(proposal.amount)}`,
      })),
  );

  const stats = useMemo(() => {
    const dashboard = data?.dashboard || {};
    return [
      {
        label: "Cash collected today",
        value: money(dashboard.cashToday),
        note: "From POS cash sales",
      },
      {
        label: "Store bank balances",
        value: money(dashboard.bankBalance),
        note: "Recorded finance balances",
      },
      {
        label: "Vendor payments due",
        value: money(dashboard.vendorDue),
        note: "Unpaid vendor invoices",
      },
      {
        label: "PDCs due",
        value: String(dashboard.pdcDue || 0),
        note: "Due in next 7 days",
      },
    ];
  }, [data]);

  return (
    <InventoryShell
      breadcrumb={[{ label: "Accounts" }, { label: page.label }]}
      title={page.title}
      subtitle={page.subtitle}
      searchPlaceholder="Search accounts"
      stats={activeTab === "dashboard" ? stats : []}
      showTable={false}
      compactMobile
    >
      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-1.5 sm:mb-5 sm:rounded-2xl sm:p-2">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 sm:gap-2">
          {accountPages.map((navPage) => (
            <Link
              key={navPage.key}
              href={navPage.href}
              className={`flex min-h-8 items-center justify-center rounded-lg px-1.5 py-1.5 text-center text-[10.5px] font-bold leading-tight transition-colors sm:min-h-10 sm:px-2 sm:py-2 sm:text-[12.5px] ${
                page.key === navPage.key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {navPage.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10.5px] font-semibold text-slate-500 sm:mb-4 sm:rounded-xl sm:px-3 sm:text-[12px]">
        <span>
          {lastUpdated
            ? `Live data updated ${lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
            : "Live database data"}
        </span>
        <button
          type="button"
          onClick={() => load({ silent: true })}
          disabled={Boolean(busy)}
          className="h-7 rounded-lg border border-slate-200 px-2.5 text-[10.5px] font-bold text-slate-700 disabled:opacity-50 sm:h-8 sm:px-3 sm:text-[12px]"
        >
          Refresh
        </button>
      </div>

      {message && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 sm:mb-4 sm:rounded-xl sm:px-4 sm:py-3 sm:text-[13px]">
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-center text-[12px] font-semibold text-slate-400 sm:rounded-2xl sm:px-4 sm:py-12 sm:text-sm">
          Loading accounts data...
        </div>
      ) : (
        <>
          {activeTab === "dashboard" && (
            <div className="grid min-w-0 gap-3 xl:grid-cols-2 xl:gap-4">
              <Section title="Finance Alerts">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <Alert
                    label="Vendor dues"
                    value={money(data?.dashboard?.vendorDue)}
                  />
                  <Alert
                    label="PDCs due"
                    value={data?.dashboard?.pdcDue || 0}
                  />
                  <Alert
                    label="Receivables"
                    value={money(data?.dashboard?.outstandingReceivables)}
                  />
                  <Alert
                    label="Low imprest stores"
                    value={data?.dashboard?.lowImprest || 0}
                  />
                  <Alert
                    label="Cash not deposited"
                    value={data?.dashboard?.cashNotDeposited || 0}
                  />
                  <Alert
                    label="Pending approvals"
                    value={data?.dashboard?.pendingApprovals || 0}
                  />
                </div>
              </Section>
              <Section title="Operational Sources">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <SourceCard label="Stores" value={stores.length} />
                  <SourceCard label="Vendors" value={vendors.length} />
                  <SourceCard
                    label="Purchase Orders"
                    value={purchaseOrders.length}
                  />
                  <SourceCard
                    label="Final GRNs"
                    value={
                      grns.filter((row) => row.status === "confirmed").length
                    }
                  />
                </div>
              </Section>
              <Section title="Vendor Invoices Needing Finance">
                <VendorInvoiceTable rows={vendorInvoices.slice(0, 8)} />
              </Section>
              <Section title="Recent Finance Audit">
                <AuditTable rows={audit.slice(0, 8)} />
              </Section>
            </div>
          )}

          {activeTab === "cash" && (
            <div className="grid gap-3 sm:gap-4">
              <Section title="Store Opening / Closing Cash">
                <Table
                  headers={[
                    "Store",
                    "Opening",
                    "Closing",
                    "Current Cash",
                    "Cash In Today",
                    "Cash Out Today",
                    "Last Activity",
                  ]}
                  rows={storeCashSummary}
                  renderRow={(row) => (
                    <tr key={row.store_id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.opening_time || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.closing_time || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.current_cash)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-emerald-700">
                        {money(row.cash_in_today)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-rose-700">
                        {money(row.cash_out_today)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-500">
                        {shortDate(row.last_cash_activity)}
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Record Store Closing Cash">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("cashClose", {
                      action: "cash_close",
                      ...forms.cashClose,
                    });
                  }}
                >
                  <SelectInput
                    label="Store"
                    value={forms.cashClose.storeId}
                    onChange={(value) =>
                      updateForm("cashClose", "storeId", value)
                    }
                    options={storeOptions}
                  />
                  <TextInput
                    label="Closing cash"
                    type="number"
                    value={forms.cashClose.closingCash}
                    onChange={(value) =>
                      updateForm("cashClose", "closingCash", value)
                    }
                  />
                  <TextInput
                    label="Closing date"
                    type="date"
                    value={forms.cashClose.closingDate}
                    onChange={(value) =>
                      updateForm("cashClose", "closingDate", value)
                    }
                  />
                  <TextInput
                    label="Remarks"
                    value={forms.cashClose.remarks}
                    onChange={(value) =>
                      updateForm("cashClose", "remarks", value)
                    }
                  />
                  <SubmitButton busy={busy === "cashClose"}>
                    Save Closing
                  </SubmitButton>
                </form>
              </Section>
              <Section title="Bank Accounts">
                <Table
                  headers={["Store", "Bank", "Account", "Balance", "Status"]}
                  rows={bankAccounts}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name || "Head Office"}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.bank_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.account_number}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.current_balance)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Add Store Bank Account">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("bank", { action: "bank_account", ...forms.bank });
                  }}
                >
                  <SelectInput
                    label="Store"
                    value={forms.bank.storeId}
                    onChange={(value) => updateForm("bank", "storeId", value)}
                    options={storeOptions}
                    placeholder="Select store"
                  />
                  <TextInput
                    label="Bank"
                    value={forms.bank.bankName}
                    onChange={(value) => updateForm("bank", "bankName", value)}
                  />
                  <TextInput
                    label="Account number"
                    value={forms.bank.accountNumber}
                    onChange={(value) =>
                      updateForm("bank", "accountNumber", value)
                    }
                  />
                  <TextInput
                    label="IFSC"
                    value={forms.bank.ifsc}
                    onChange={(value) => updateForm("bank", "ifsc", value)}
                  />
                  <TextInput
                    label="Balance"
                    type="number"
                    value={forms.bank.currentBalance}
                    onChange={(value) =>
                      updateForm("bank", "currentBalance", value)
                    }
                  />
                  <SubmitButton busy={busy === "bank"}>
                    Save Account
                  </SubmitButton>
                </form>
              </Section>
              <Section title="Cash Deposit Tracking">
                <Table
                  headers={[
                    "Date",
                    "Store",
                    "Bank",
                    "Amount",
                    "Reference",
                    "Status",
                  ]}
                  rows={cashDeposits}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {shortDate(row.deposit_date)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.bank_name || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.reference_no || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Store Cash Activity">
                <Table
                  headers={[
                    "Date",
                    "Store",
                    "Type",
                    "In / Out",
                    "Amount",
                    "Balance",
                    "User",
                  ]}
                  rows={cashTransactions}
                  emptyLabel="No store cash activity found"
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {shortDate(row.transaction_date)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {statusLabel(row.transaction_type)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.direction} />
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {money(row.balance_after)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-500">
                        {row.user_name || "-"}
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Record Cash Deposit">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("deposit", {
                      action: "cash_deposit",
                      ...forms.deposit,
                    });
                  }}
                >
                  <SelectInput
                    label="Store"
                    value={forms.deposit.storeId}
                    onChange={(value) =>
                      setForms((current) => ({
                        ...current,
                        deposit: {
                          ...current.deposit,
                          storeId: value,
                          bankAccountId: "",
                        },
                      }))
                    }
                    options={storeOptions}
                  />
                  <SelectInput
                    label="Bank account"
                    value={forms.deposit.bankAccountId}
                    onChange={(value) =>
                      updateForm("deposit", "bankAccountId", value)
                    }
                    options={depositBankOptions}
                  />
                  <TextInput
                    label="Amount"
                    type="number"
                    value={forms.deposit.amount}
                    onChange={(value) => updateForm("deposit", "amount", value)}
                  />
                  <TextInput
                    label="Deposit date"
                    type="date"
                    value={forms.deposit.depositDate}
                    onChange={(value) =>
                      updateForm("deposit", "depositDate", value)
                    }
                  />
                  <TextInput
                    label="Reference"
                    value={forms.deposit.referenceNo}
                    onChange={(value) =>
                      updateForm("deposit", "referenceNo", value)
                    }
                  />
                  <SubmitButton busy={busy === "deposit"}>
                    Record Deposit
                  </SubmitButton>
                </form>
              </Section>
            </div>
          )}

          {activeTab === "vendor" && (
            <div className="grid gap-3 sm:gap-4">
              <Section title="Payment Rules">
                <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                  <SourceCard label="PO required" value="Yes" />
                  <SourceCard
                    label="Confirmed GRN / Stock In"
                    value="Required"
                  />
                  <SourceCard label="Payment mode" value="Bank UTR only" />
                </div>
              </Section>
              <Section
                title="Vendors"
                right={
                  <span className="text-[10.5px] font-semibold text-slate-500 sm:text-[12px]">
                    {vendors.length} total
                  </span>
                }
              >
                <div className="max-h-44 overflow-y-auto overscroll-contain sm:max-h-48">
                  <Table
                    headers={["Vendor", "Status"]}
                    rows={vendors}
                    emptyLabel="No vendors found"
                    renderRow={(row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-50 last:border-b-0"
                      >
                        <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                          {row.name}
                        </td>
                        <td className="px-3 py-3">
                          <Badge value={row.status} />
                        </td>
                      </tr>
                    )}
                  />
                </div>
              </Section>
              <Section title="Vendor Invoices and Payment Due Dates">
                <VendorInvoiceTable rows={vendorInvoices} />
              </Section>
              <Section title="Add Credit Note / Debit Note">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("vendorNote", {
                      action: "vendor_note",
                      ...forms.vendorNote,
                    });
                  }}
                >
                  <SelectInput
                    label="Note type"
                    value={forms.vendorNote.noteType}
                    onChange={(value) =>
                      updateForm("vendorNote", "noteType", value)
                    }
                    options={[
                      { value: "credit", label: "Credit Note" },
                      { value: "debit", label: "Debit Note" },
                    ]}
                  />
                  <SearchableSelectInput
                    label="Vendor invoice"
                    value={forms.vendorNote.invoiceId}
                    onChange={(value) =>
                      updateForm("vendorNote", "invoiceId", value)
                    }
                    options={noteInvoiceOptions}
                    placeholder="Select invoice"
                    searchPlaceholder="Search vendor or invoice number"
                  />
                  <TextInput
                    label="Note number"
                    value={forms.vendorNote.noteNumber}
                    onChange={(value) =>
                      updateForm("vendorNote", "noteNumber", value)
                    }
                  />
                  <TextInput
                    label="Amount"
                    type="number"
                    value={forms.vendorNote.amount}
                    onChange={(value) =>
                      updateForm("vendorNote", "amount", value)
                    }
                  />
                  <TextInput
                    label="Note date"
                    type="date"
                    value={forms.vendorNote.noteDate}
                    onChange={(value) =>
                      updateForm("vendorNote", "noteDate", value)
                    }
                  />
                  <TextInput
                    label="Reason"
                    value={forms.vendorNote.reason}
                    onChange={(value) =>
                      updateForm("vendorNote", "reason", value)
                    }
                  />
                  <SubmitButton busy={busy === "vendorNote"}>
                    Add Note
                  </SubmitButton>
                </form>
                <p className="mt-2 text-[10.5px] font-semibold leading-snug text-slate-500 sm:mt-3 sm:text-[12px]">
                  Credit notes reduce the outstanding payable; debit notes
                  increase it. Notes cannot be added while a payment proposal is
                  active.
                </p>
              </Section>
              <Section title="Credit and Debit Note History">
                <VendorNoteTable rows={vendorNotes} />
              </Section>
              <Section title="Generate Payment Proposal">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("proposal", {
                      action: "payment_proposal",
                      ...forms.proposal,
                    });
                  }}
                >
                  <SelectInput
                    label="Vendor invoice"
                    value={forms.proposal.invoiceId}
                    onChange={(value) =>
                      updateForm("proposal", "invoiceId", value)
                    }
                    options={invoiceOptions}
                  />
                  <TextInput
                    label="Remarks"
                    value={forms.proposal.remarks}
                    onChange={(value) =>
                      updateForm("proposal", "remarks", value)
                    }
                  />
                  <SubmitButton busy={busy === "proposal"}>
                    Generate Proposal
                  </SubmitButton>
                </form>
              </Section>
              <Section title="Approval and UTR Entry">
                <div className="grid min-w-0 gap-3 xl:grid-cols-2 xl:gap-4">
                  <form
                    className="grid gap-2 sm:grid-cols-2 sm:gap-3 2xl:grid-cols-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit(
                        "proposal",
                        { action: "approve_proposal", ...forms.proposal },
                        false,
                      );
                    }}
                  >
                    <SelectInput
                      label="Proposal"
                      value={forms.proposal.proposalId}
                      onChange={(value) =>
                        updateForm("proposal", "proposalId", value)
                      }
                      options={approvalProposalOptions}
                    />
                    <TextInput
                      label="Approval reason"
                      value={forms.proposal.reason}
                      onChange={(value) =>
                        updateForm("proposal", "reason", value)
                      }
                    />
                    <SubmitButton busy={busy === "proposal"}>
                      Approve
                    </SubmitButton>
                  </form>
                  <form
                    className="grid gap-2 sm:grid-cols-2 sm:gap-3 2xl:grid-cols-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit("paid", {
                        action: "mark_vendor_paid",
                        ...forms.paid,
                      });
                    }}
                  >
                    <SelectInput
                      label="Approved proposal"
                      value={forms.paid.proposalId}
                      onChange={(value) =>
                        updateForm("paid", "proposalId", value)
                      }
                      options={approvedPaymentOptions}
                    />
                    <TextInput
                      label="UTR number"
                      value={forms.paid.utrNumber}
                      onChange={(value) =>
                        updateForm("paid", "utrNumber", value)
                      }
                    />
                    <TextInput
                      label="Paid date"
                      type="date"
                      value={forms.paid.paidDate}
                      onChange={(value) =>
                        updateForm("paid", "paidDate", value)
                      }
                    />
                    <SubmitButton busy={busy === "paid"}>
                      Record UTR
                    </SubmitButton>
                  </form>
                </div>
              </Section>
              <Section title="Payment Proposals">
                <PaymentProposalTable rows={paymentProposals} />
              </Section>
            </div>
          )}

          {activeTab === "expense" && (
            <div className="grid gap-3 sm:gap-4">
              <Section title="Imprest Rule">
                <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                  <SourceCard label="Next imprest" value="After approval" />
                  <SourceCard label="Bill record" value="Required" />
                </div>
              </Section>
              <Section title="Imprest Register">
                <Table
                  headers={[
                    "Store",
                    "Employee",
                    "Limit",
                    "Balance",
                    "Low Alert",
                    "Status",
                  ]}
                  rows={imprest}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.employee_name || "Not assigned"}
                        {row.employee_code ? (
                          <span className="block text-[10px] text-slate-400">
                            {row.employee_code}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {money(row.limit_amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.current_balance)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {money(row.low_balance_threshold)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Issue / Replenish Store Imprest">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("imprest", { action: "imprest", ...forms.imprest });
                  }}
                >
                  <SelectInput
                    label="Store"
                    value={forms.imprest.storeId}
                    onChange={(value) =>
                      updateForm("imprest", "storeId", value)
                    }
                    options={storeOptions}
                  />
                  <SelectInput
                    label="Employee"
                    value={forms.imprest.employeeId}
                    onChange={(value) =>
                      updateForm("imprest", "employeeId", value)
                    }
                    options={imprestEmployeeOptions}
                    placeholder="Select employee"
                  />
                  <TextInput
                    label="Limit"
                    type="number"
                    value={forms.imprest.limitAmount}
                    onChange={(value) =>
                      updateForm("imprest", "limitAmount", value)
                    }
                  />
                  <TextInput
                    label="Current balance"
                    type="number"
                    value={forms.imprest.currentBalance}
                    onChange={(value) =>
                      updateForm("imprest", "currentBalance", value)
                    }
                  />
                  <TextInput
                    label="Low alert"
                    type="number"
                    value={forms.imprest.lowBalanceThreshold}
                    onChange={(value) =>
                      updateForm("imprest", "lowBalanceThreshold", value)
                    }
                  />
                  <SubmitButton busy={busy === "imprest"}>
                    Save Imprest
                  </SubmitButton>
                </form>
                <p className="mt-2 text-[10.5px] font-semibold leading-snug text-slate-500 sm:mt-3 sm:text-[12px]">
                  Replenishment is blocked until earlier submitted imprest spend
                  records for that store are approved.
                </p>
              </Section>
              <Section title="Imprest Spend Records">
                <Table
                  headers={[
                    "Date",
                    "Store",
                    "Head",
                    "Amount",
                    "Bill",
                    "Status",
                  ]}
                  rows={expenses}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {shortDate(row.expense_date)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.expense_head}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.bill_note || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Record Imprest Spend">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("expense", { action: "expense", ...forms.expense });
                  }}
                >
                  <SelectInput
                    label="Store"
                    value={forms.expense.storeId}
                    onChange={(value) =>
                      updateForm("expense", "storeId", value)
                    }
                    options={storeOptions}
                  />
                  <TextInput
                    label="Spend head"
                    value={forms.expense.expenseHead}
                    onChange={(value) =>
                      updateForm("expense", "expenseHead", value)
                    }
                  />
                  <TextInput
                    label="Amount"
                    type="number"
                    value={forms.expense.amount}
                    onChange={(value) => updateForm("expense", "amount", value)}
                  />
                  <TextInput
                    label="Date"
                    type="date"
                    value={forms.expense.expenseDate}
                    onChange={(value) =>
                      updateForm("expense", "expenseDate", value)
                    }
                  />
                  <TextInput
                    label="Bill note"
                    value={forms.expense.billNote}
                    onChange={(value) =>
                      updateForm("expense", "billNote", value)
                    }
                  />
                  <SubmitButton busy={busy === "expense"}>Submit</SubmitButton>
                </form>
              </Section>
              <Section title="Verify / Approve Imprest Record">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("expenseStatus", {
                      action: "expense_status",
                      ...forms.expenseStatus,
                    });
                  }}
                >
                  <SelectInput
                    label="Expense"
                    value={forms.expenseStatus.expenseId}
                    onChange={(value) =>
                      updateForm("expenseStatus", "expenseId", value)
                    }
                    options={expenses.map((row) => ({
                      value: row.id,
                      label: `${row.store_name || "-"} / ${row.expense_head} / ${money(row.amount)}`,
                    }))}
                  />
                  <SelectInput
                    label="Status"
                    value={forms.expenseStatus.status}
                    onChange={(value) =>
                      updateForm("expenseStatus", "status", value)
                    }
                    options={[
                      { value: "area_verified", label: "Area verified" },
                      { value: "approved", label: "Accounts approved" },
                      { value: "rejected", label: "Rejected" },
                    ]}
                  />
                  <TextInput
                    label="Reason"
                    value={forms.expenseStatus.remarks}
                    onChange={(value) =>
                      updateForm("expenseStatus", "remarks", value)
                    }
                  />
                  <SubmitButton busy={busy === "expenseStatus"}>
                    Update
                  </SubmitButton>
                </form>
              </Section>
            </div>
          )}

          {activeTab === "reports" && (
            <div className="grid min-w-0 grid-cols-1 gap-3 xl:gap-4">
              <Section title="PDC / UDC Register">
                <Table
                  headers={[
                    "Flow",
                    "Store",
                    "Type",
                    "Party",
                    "Cheque",
                    "Due Date",
                    "Amount",
                    "Bank",
                    "Status",
                    "Proof",
                  ]}
                  rows={cheques}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3">
                        <Badge
                          value={row.direction === "issued" ? "Given" : "Taken"}
                        />
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.store_name || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {row.cheque_type}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-700">
                        {row.party_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.cheque_number}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {shortDate(row.due_date)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.bank_name || row.bank_account_number || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                      <td className="px-3 py-3 text-[13px]">
                        {row.document_url ? (
                          <a
                            href={row.document_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-indigo-600 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Add PDC / UDC (Give or Take)">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("cheque", { action: "cheque", ...forms.cheque });
                  }}
                >
                  <SelectInput
                    label="Flow"
                    value={forms.cheque.direction}
                    onChange={(value) =>
                      updateForm("cheque", "direction", value)
                    }
                    options={[
                      { value: "received", label: "Take / Received" },
                      { value: "issued", label: "Give / Issued" },
                    ]}
                  />
                  <SelectInput
                    label="Store"
                    value={forms.cheque.storeId}
                    onChange={(value) => {
                      updateForm("cheque", "storeId", value);
                      updateForm("cheque", "bankAccountId", "");
                    }}
                    options={storeOptions}
                  />
                  <SelectInput
                    label="Type"
                    value={forms.cheque.chequeType}
                    onChange={(value) => {
                      updateForm("cheque", "chequeType", value);
                      if (value === "UDC") updateForm("cheque", "dueDate", "");
                    }}
                    options={[
                      { value: "PDC", label: "PDC — Post-dated" },
                      { value: "UDC", label: "UDC — Undated" },
                    ]}
                  />
                  <SelectInput
                    label="Party type"
                    value={forms.cheque.partyType}
                    onChange={(value) => {
                      updateForm("cheque", "partyType", value);
                      updateForm("cheque", "partyId", "");
                      updateForm("cheque", "partyName", "");
                    }}
                    options={[
                      { value: "customer", label: "Customer" },
                      { value: "vendor", label: "Vendor" },
                      { value: "other", label: "Other" },
                    ]}
                  />
                  {forms.cheque.partyType === "other" ? (
                    <TextInput
                      label="Party"
                      value={forms.cheque.partyName}
                      onChange={(value) =>
                        updateForm("cheque", "partyName", value)
                      }
                    />
                  ) : (
                    <SelectInput
                      label={
                        forms.cheque.partyType === "vendor"
                          ? "Vendor"
                          : "Customer"
                      }
                      value={forms.cheque.partyId}
                      onChange={(value) =>
                        updateForm("cheque", "partyId", value)
                      }
                      options={chequePartyOptions}
                    />
                  )}
                  <TextInput
                    label="Cheque number"
                    value={forms.cheque.chequeNumber}
                    onChange={(value) =>
                      updateForm("cheque", "chequeNumber", value)
                    }
                  />
                  {forms.cheque.chequeType === "PDC" && (
                    <TextInput
                      label="Due date"
                      type="date"
                      value={forms.cheque.dueDate}
                      onChange={(value) =>
                        updateForm("cheque", "dueDate", value)
                      }
                    />
                  )}
                  <TextInput
                    label="Amount"
                    type="number"
                    value={forms.cheque.amount}
                    onChange={(value) => updateForm("cheque", "amount", value)}
                  />
                  <TextInput
                    label="Cheque bank"
                    value={forms.cheque.bankName}
                    onChange={(value) =>
                      updateForm("cheque", "bankName", value)
                    }
                  />
                  <SelectInput
                    label="Settlement bank account"
                    value={forms.cheque.bankAccountId}
                    onChange={(value) =>
                      updateForm("cheque", "bankAccountId", value)
                    }
                    options={chequeBankOptions}
                  />
                  <TextInput
                    label="Cheque image / proof URL"
                    value={forms.cheque.documentUrl}
                    onChange={(value) =>
                      updateForm("cheque", "documentUrl", value)
                    }
                  />
                  <TextInput
                    label="Cheque / undertaking note"
                    value={forms.cheque.documentNote}
                    onChange={(value) =>
                      updateForm("cheque", "documentNote", value)
                    }
                  />
                  <SubmitButton busy={busy === "cheque"}>
                    Save Cheque
                  </SubmitButton>
                </form>
              </Section>
              <Section title="Update PDC / UDC Status">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("chequeStatus", {
                      action: "cheque_status",
                      ...forms.chequeStatus,
                    });
                  }}
                >
                  <SelectInput
                    label="Cheque"
                    value={forms.chequeStatus.chequeId}
                    onChange={(value) => {
                      updateForm("chequeStatus", "chequeId", value);
                      updateForm("chequeStatus", "bankAccountId", "");
                    }}
                    options={cheques
                      .filter(
                        (row) =>
                          !["cleared", "cancelled", "returned"].includes(
                            row.status,
                          ),
                      )
                      .map((row) => ({
                        value: row.id,
                        label: `${row.direction === "issued" ? "Given" : "Taken"} / ${row.party_name} / ${row.cheque_number} / ${money(row.amount)}`,
                      }))}
                  />
                  <SelectInput
                    label="Bank account"
                    value={
                      forms.chequeStatus.bankAccountId ||
                      statusCheque?.bank_account_id ||
                      ""
                    }
                    onChange={(value) =>
                      updateForm("chequeStatus", "bankAccountId", value)
                    }
                    options={statusBankOptions}
                  />
                  <SelectInput
                    label="Status"
                    value={forms.chequeStatus.status}
                    onChange={(value) =>
                      updateForm("chequeStatus", "status", value)
                    }
                    options={[
                      { value: "deposit_due", label: "Deposit due" },
                      { value: "deposited", label: "Deposited" },
                      { value: "cleared", label: "Cleared" },
                      { value: "bounced", label: "Bounced / legal follow-up" },
                      { value: "returned", label: "Returned to party" },
                      { value: "cancelled", label: "Cancelled" },
                    ]}
                  />
                  <TextInput
                    label="Reason / note"
                    value={forms.chequeStatus.remarks}
                    onChange={(value) =>
                      updateForm("chequeStatus", "remarks", value)
                    }
                  />
                  <SubmitButton busy={busy === "chequeStatus"}>
                    Update Status
                  </SubmitButton>
                </form>
              </Section>
              <Section title="Vendor Outstanding">
                <VendorInvoiceTable rows={vendorInvoices} />
              </Section>
              <Section title="Vendor Ledger">
                <VendorInvoiceTable rows={vendorInvoices} />
              </Section>
              <Section title="Payment Register">
                <Table
                  headers={[
                    "Vendor",
                    "Invoice",
                    "Proposal",
                    "Amount",
                    "UTR",
                    "Status",
                  ]}
                  rows={paymentProposals.filter(
                    (row) =>
                      String(row.status || "").toLowerCase() !== "proposed",
                  )}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.vendorName}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.invoiceNumber}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        #{row.id}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.utrNumber || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Cash Deposit Report">
                <Table
                  headers={["Date", "Store", "Bank", "Amount", "Reference"]}
                  rows={cashDeposits}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {shortDate(row.deposit_date)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.bank_name || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.reference_no || "-"}
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Bank Reconciliation">
                <Table
                  headers={["Store", "Bank", "Account", "Balance", "Status"]}
                  rows={bankAccounts}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name || "Head Office"}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.bank_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.account_number}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.current_balance)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Expense Register">
                <Table
                  headers={[
                    "Date",
                    "Store",
                    "Head",
                    "Amount",
                    "Bill",
                    "Status",
                  ]}
                  rows={expenses}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {shortDate(row.expense_date)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.expense_head}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.bill_note || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Imprest Register">
                <Table
                  headers={["Store", "Limit", "Balance", "Low Alert", "Status"]}
                  rows={imprest}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.store_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {money(row.limit_amount)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.current_balance)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {money(row.low_balance_threshold)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Finance Calendar">
                <Table
                  headers={["Due Date", "Task", "Category", "Owner", "Status"]}
                  rows={calendar}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {shortDate(row.due_date)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.title}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.category}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.owner || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Add Calendar Reminder">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("calendar", {
                      action: "calendar",
                      ...forms.calendar,
                    });
                  }}
                >
                  <TextInput
                    label="Task"
                    value={forms.calendar.title}
                    onChange={(value) => updateForm("calendar", "title", value)}
                  />
                  <TextInput
                    label="Category"
                    value={forms.calendar.category}
                    onChange={(value) =>
                      updateForm("calendar", "category", value)
                    }
                  />
                  <TextInput
                    label="Due date"
                    type="date"
                    value={forms.calendar.dueDate}
                    onChange={(value) =>
                      updateForm("calendar", "dueDate", value)
                    }
                  />
                  <TextInput
                    label="Owner"
                    value={forms.calendar.owner}
                    onChange={(value) => updateForm("calendar", "owner", value)}
                  />
                  <SubmitButton busy={busy === "calendar"}>
                    Add Reminder
                  </SubmitButton>
                </form>
              </Section>
              <Section title="Document Vault">
                <Table
                  headers={[
                    "Document",
                    "Module",
                    "Linked",
                    "Status",
                    "Created",
                  ]}
                  rows={documents}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.document_name}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.module}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {row.linked_type || "-"} {row.linked_id || ""}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-500">
                        {shortDate(row.created_at)}
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Link Document">
                <form
                  className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("document", {
                      action: "document",
                      ...forms.document,
                    });
                  }}
                >
                  <TextInput
                    label="Module"
                    value={forms.document.module}
                    onChange={(value) =>
                      updateForm("document", "module", value)
                    }
                  />
                  <TextInput
                    label="Linked type"
                    value={forms.document.linkedType}
                    onChange={(value) =>
                      updateForm("document", "linkedType", value)
                    }
                  />
                  <TextInput
                    label="Linked ID"
                    value={forms.document.linkedId}
                    onChange={(value) =>
                      updateForm("document", "linkedId", value)
                    }
                  />
                  <TextInput
                    label="Document name"
                    value={forms.document.documentName}
                    onChange={(value) =>
                      updateForm("document", "documentName", value)
                    }
                  />
                  <TextInput
                    label="Note"
                    value={forms.document.documentNote}
                    onChange={(value) =>
                      updateForm("document", "documentNote", value)
                    }
                  />
                  <SubmitButton busy={busy === "document"}>
                    Link Document
                  </SubmitButton>
                </form>
              </Section>
              <Section title="Tally Sync Queue">
                <Table
                  headers={[
                    "Voucher",
                    "Source",
                    "Amount",
                    "Status",
                    "Created",
                    "Action",
                  ]}
                  rows={tally}
                  renderRow={(row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
                        {row.voucher_number || `Voucher ${row.id}`}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">
                        {statusLabel(row.source_type)} #{row.source_id || "-"}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge value={row.status} />
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-500">
                        {shortDate(row.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={row.status === "pushed" || busy === "tally"}
                          onClick={() =>
                            submit(
                              "tally",
                              { action: "tally_push", itemId: row.id },
                              false,
                            )
                          }
                          className="h-7 rounded-md border border-indigo-200 px-2 text-[10.5px] font-bold text-indigo-700 disabled:opacity-50 sm:h-9 sm:rounded-lg sm:px-3 sm:text-[12px]"
                        >
                          Mark Pushed
                        </button>
                      </td>
                    </tr>
                  )}
                />
              </Section>
              <Section title="Audit Trail">
                <AuditTable rows={audit} />
              </Section>
              <Section title="Daily Finance Summary">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <SourceCard
                    label="Cash collected today"
                    value={money(data?.dashboard?.cashToday)}
                  />
                  <SourceCard
                    label="Vendor payable"
                    value={money(data?.dashboard?.vendorDue)}
                  />
                  <SourceCard
                    label="PDCs due"
                    value={data?.dashboard?.pdcDue || 0}
                  />
                  <SourceCard
                    label="Receivables"
                    value={money(data?.dashboard?.outstandingReceivables)}
                  />
                  <SourceCard
                    label="Cash deposits"
                    value={cashDeposits.length}
                  />
                  <SourceCard
                    label="Imprest records pending"
                    value={
                      expenses.filter((row) =>
                        ["submitted", "area_verified"].includes(row.status),
                      ).length
                    }
                  />
                </div>
              </Section>
            </div>
          )}
        </>
      )}
    </InventoryShell>
  );
}

function Alert({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-2.5 sm:p-4">
      <p className="text-[9.5px] font-bold uppercase leading-tight text-slate-500 [overflow-wrap:anywhere] sm:text-[12px]">
        {label}
      </p>
      <p className="mt-1 text-[16px] font-black leading-tight text-slate-900 [overflow-wrap:anywhere] sm:mt-2 sm:text-2xl">
        {value}
      </p>
    </div>
  );
}

function SourceCard({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-4">
      <p className="text-[10px] font-semibold leading-tight text-slate-500 [overflow-wrap:anywhere] sm:text-[12px]">
        {label}
      </p>
      <p className="mt-1 text-[16px] font-black leading-tight text-indigo-700 [overflow-wrap:anywhere] sm:mt-2 sm:text-xl">
        {value}
      </p>
    </div>
  );
}

function VendorInvoiceTable({ rows }) {
  return (
    <Table
      headers={[
        "Vendor",
        "Invoice",
        "Source",
        "Source Date",
        "GRN",
        "Due",
        "Notes",
        "Outstanding",
        "Proposal",
      ]}
      rows={rows}
      emptyLabel="No vendor invoices found"
      renderRow={(row) => (
        <tr key={row.id} className="border-b border-slate-50">
          <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
            {row.vendorName}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {row.invoiceNumber}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            <span className="block font-semibold text-slate-700">
              {row.sourceType ||
                (row.poNumber
                  ? "Purchase Order"
                  : row.grnNumber
                    ? "Stock In"
                    : "Manual Invoice")}
            </span>
            <span className="block text-[12px] text-slate-500">
              {row.sourceTransactionId || row.poNumber || row.grnNumber || "-"}
            </span>
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {shortDate(row.sourceDate || row.invoiceDate)}
          </td>
          <td className="px-3 py-3">
            <Badge value={row.hasFinalGrn ? "Final GRN" : "Blocked"} />
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {shortDate(row.dueDate)}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            <span className="block text-emerald-700">
              CR {money(row.creditTotal)}
            </span>
            <span className="block text-rose-700">
              DR {money(row.debitTotal)}
            </span>
          </td>
          <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
            {money(row.amountLeft)}
          </td>
          <td className="px-3 py-3">
            <Badge value={row.proposalStatus || "not proposed"} />
          </td>
        </tr>
      )}
    />
  );
}

function SearchableSelectInput({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
  searchPlaceholder = "Search options",
}) {
  const choices = uniqueOptions(options);
  const selected = choices.find(
    (option) => String(option.value) === String(value),
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const searchText = search.trim().toLowerCase();
  const filteredChoices = searchText
    ? choices.filter((option) =>
        option.label.toLowerCase().includes(searchText),
      )
    : choices;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <Field label={label}>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setOpen((current) => !current);
          }}
          disabled={!choices.length}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-left text-[12px] text-slate-800 outline-none focus:border-indigo-400 disabled:text-slate-400 sm:h-10 sm:rounded-lg sm:px-3 sm:text-[13px]"
        >
          <span className="min-w-0 truncate">
            {selected?.label ||
              (choices.length ? placeholder : "No eligible records")}
          </span>
          <span className="shrink-0 text-slate-400">⌄</span>
        </button>
        {open && (
          <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 p-2">
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setOpen(false);
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-md border border-slate-200 px-3 text-[12px] text-slate-800 outline-none focus:border-indigo-400"
              />
            </div>
            <div role="listbox" className="max-h-56 overflow-y-auto py-1">
              {filteredChoices.length ? (
                filteredChoices.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={String(option.value) === String(value)}
                    onClick={() => {
                      onChange(option.value);
                      setSearch("");
                      setOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-[12px] leading-snug hover:bg-indigo-50 ${
                      String(option.value) === String(value)
                        ? "bg-indigo-50 font-bold text-indigo-700"
                        : "text-slate-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <p className="px-3 py-5 text-center text-[12px] font-semibold text-slate-400">
                  No matching invoices
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

function VendorNoteTable({ rows }) {
  return (
    <Table
      headers={[
        "Date",
        "Type",
        "Note No.",
        "Vendor",
        "Invoice",
        "Amount",
        "Reason",
        "Created By",
      ]}
      rows={rows}
      emptyLabel="No credit or debit notes found"
      renderRow={(row) => (
        <tr key={row.id} className="border-b border-slate-50">
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {shortDate(row.note_date)}
          </td>
          <td className="px-3 py-3">
            <Badge value={`${row.note_type} note`} />
          </td>
          <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
            {row.note_number}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {row.vendor_name}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {row.invoice_number}
          </td>
          <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
            {money(row.amount)}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">{row.reason}</td>
          <td className="px-3 py-3 text-[13px] text-slate-500">
            {row.created_by_name || "-"}
          </td>
        </tr>
      )}
    />
  );
}

function PaymentProposalTable({ rows }) {
  return (
    <Table
      headers={["Vendor", "Invoice", "Amount", "Due", "Status", "UTR"]}
      rows={rows}
      emptyLabel="No payment proposals found"
      renderRow={(row) => (
        <tr key={row.id} className="border-b border-slate-50">
          <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
            {row.vendorName}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {row.invoiceNumber}
          </td>
          <td className="px-3 py-3 text-[13px] font-bold text-slate-800">
            {money(row.amount)}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {shortDate(row.dueDate)}
          </td>
          <td className="px-3 py-3">
            <Badge value={row.status} />
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {row.utrNumber || "-"}
          </td>
        </tr>
      )}
    />
  );
}

function AuditTable({ rows }) {
  return (
    <Table
      headers={["Time", "User", "Action", "Resource", "Details"]}
      rows={rows}
      emptyLabel="No finance audit logs found"
      renderRow={(row) => (
        <tr key={row.id} className="border-b border-slate-50">
          <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
            {shortDate(row.created_at)}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {row.user_name || "System"}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-700">
            {statusLabel(row.action)}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-600">
            {row.resource_type || "-"} #{row.resource_id || "-"}
          </td>
          <td className="px-3 py-3 text-[13px] text-slate-500">
            {JSON.stringify(row.details || {})}
          </td>
        </tr>
      )}
    />
  );
}
