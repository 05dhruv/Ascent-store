"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";
import Pagination from "@/components/ui/Pagination";
import { downloadFromUrl, usePagedList } from "@/hooks/usePagedList";

const input = "rounded border border-slate-300 p-2 text-sm w-full";
const button =
  "rounded bg-indigo-700 px-3 py-2 text-sm text-white disabled:opacity-40";
const pretty = (value) => String(value || "").replaceAll("_", " ");
const num = (value) =>
  Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const EMPTY_FILTERS = {
  search: "",
  store: "",
  project: "",
  from: "",
  to: "",
};

export default function MovementTracker() {
  const attempts = useRef(new Map());
  const [tab, setTab] = useState("transfers"),
    [filters, setFilters] = useState(EMPTY_FILTERS),
    [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const list = usePagedList("/api/inventory/movement-tracker", {
    params: { ...appliedFilters, view: tab },
    pageSize: 50,
  });
  const data = list.extra;
  const loading = list.loading;
  const [error, setError] = useState(""),
    [detail, setDetail] = useState(null),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({}),
    [lines, setLines] = useState([]),
    [notice, setNotice] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [scanCode, setScanCode] = useState("");
  function load() {
    setError("");
    return list.refresh();
  }
  function applyFilters() {
    setError("");
    if (JSON.stringify(filters) === JSON.stringify(appliedFilters)) {
      list.refresh();
    } else {
      setAppliedFilters({ ...filters });
    }
  }
  async function open(id) {
    setError("");
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/stocktransfer/${id}/workflow`);
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setDetail(json);
      setForm({});
      setScanCode("");
      setQrDataUrl("");
      fetch(`/api/construction/transfer-qr?transferId=${id}`)
        .then((res) => res.json())
        .then((qr) => {
          if (qr?.data?.qrDataUrl) setQrDataUrl(qr.data.qrDataUrl);
          else if (qr?.qrDataUrl) setQrDataUrl(qr.qrDataUrl);
        })
        .catch(() => {});
      setLines(
        json.items.map((x) => ({
          ...x,
          dispatch: Number(x.qty),
          received: 0,
          accepted: 0,
          damaged: 0,
          rejected: 0,
          short: 0,
          excess: 0,
          pending:
            Number(x.dispatched_qty) -
            Number(x.received_qty) -
            Number(x.short_qty) +
            Number(x.excess_qty),
        })),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function action(name, extra = {}) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const items = ["dispatch", "approve_dispatch"].includes(name)
      ? lines.map((x) => ({ id: x.id, qty: x.dispatch }))
      : name === "receive"
        ? lines
            .filter((x) => Number(x.received) || Number(x.short))
            .map((x) => ({
              id: x.id,
              received: x.received,
              accepted: x.accepted,
              damaged: x.damaged,
              rejected: x.rejected,
              short: x.short,
              excess: x.excess,
            }))
        : undefined;
    const signature = JSON.stringify({
      id: detail.transfer.id,
      name,
      form,
      extra,
      items,
    });
    if (!attempts.current.has(signature))
      attempts.current.set(signature, crypto.randomUUID());
    try {
      const r = await fetch(
        `/api/inventory/stocktransfer/${detail.transfer.id}/workflow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            ...extra,
            eta: form.eta ? new Date(form.eta).toISOString() : undefined,
            action: name,
            items: extra.items || items,
            requestKey: attempts.current.get(signature),
          }),
        },
      );
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      attempts.current.delete(signature);
      setNotice(`${pretty(name)} recorded`);
      await open(detail.transfer.id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function updateReceiptLine(index, key, value) {
    setLines(
      lines.map((line, i) => {
        if (i !== index) return line;
        if (key !== "received") return { ...line, [key]: value };
        const previousReceived = Number(line.received || 0);
        return {
          ...line,
          received: value,
          accepted:
            Number(line.accepted || 0) === previousReceived
              ? value
              : line.accepted,
        };
      }),
    );
  }
  const rows = data?.view === tab ? list.records : [],
    state = detail?.transfer.workflow_status;
  const receiving = ["dispatched", "partially_received"].includes(state);
  const usableExcessApprovals = (detail?.events || [])
    .filter((event) => event.action === "approve_excess")
    .filter(
      (event) =>
        !(detail?.events || []).some(
          (receipt) =>
            receipt.action === "receive" &&
            String(receipt.details?.excessApprovalId || "") ===
              String(event.id),
        ),
    );
  const hasEnteredExcess = lines.some((line) => Number(line.excess) > 0);
  const cols =
    tab === "transfers"
      ? [
          "Transfer",
          "Source to destination",
          "Status",
          "Sent",
          "Accepted",
          "Transit",
          "Damaged / Rejected",
          "Short / Excess",
          "Open cases",
          "ETA",
        ]
      : tab === "buckets"
        ? [
            "Location",
            "Location type",
            "Material",
            "Unit",
            "Usable",
            "Reserved",
            "Quarantine",
            "Damaged",
            "Rejected",
            "Expired",
            "Inactive",
            "Actual physical qty",
          ]
        : [
            "Date / Time",
            "Location",
            "Material / Batch",
            "Unit",
            "In",
            "Out",
            "Recorded balance",
            "Document",
            "Actor",
          ];
  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Material movement</h1>
            <p className="text-sm text-slate-600">
              Dispatch, receipt, stock condition and material history
            </p>
          </div>
          <div className="flex gap-3">
            <Link className={button} href="/inventory/stocktransfer">
              Create transfer
            </Link>
            <Link className={button} href="/inventory/stockin">
              Stock In / GRN
            </Link>
          </div>
        </div>
        {(error || list.error) && (
          <p role="alert" className="rounded bg-red-50 p-3 text-red-800">
            {error || list.error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-green-800">
            {notice}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
        >
          <input
            aria-label="Search material or transfer"
            className={input}
            placeholder="Material, batch, transfer, vehicle"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          {["store", "project"].map((key) => (
            <select
              key={key}
              aria-label={key}
              className={input}
              value={filters[key]}
              onChange={(e) =>
                setFilters({ ...filters, [key]: e.target.value })
              }
            >
              <option value="">
                All {key === "store" ? "locations" : "projects"}
              </option>
              {data?.[key === "store" ? "stores" : "projects"]?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ))}
          {["from", "to"].map((key) => (
            <label key={key} className="text-xs">
              {key}
              <input
                type="date"
                className={input}
                value={filters[key]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <button className={button} disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {["transfers", "buckets", "ledger"].map((x) => (
            <button
              key={x}
              onClick={() => setTab(x)}
              className={`rounded px-4 py-2 ${tab === x ? "bg-slate-900 text-white" : "bg-slate-100"}`}
            >
              {x === "buckets" ? "Current stock by location" : pretty(x)}
            </button>
          ))}
          <button
            className="ml-auto text-indigo-700"
            onClick={() => downloadFromUrl(list.exportUrl())}
          >
            Export
          </button>
        </div>
        {tab === "buckets" && (
          <p className="text-xs text-slate-600">
            This is the current quantity physically recorded at each warehouse
            and site store. Select a location above to check one site or
            warehouse. Usable excludes reserved, expired and isolated material;
            transfers still in transit are shown in the Transfers tab.
          </p>
        )}
        {tab === "ledger" && (
          <p className="text-xs text-slate-600">
            Recorded balance follows retained movement history, including
            isolated stock. Historical corrections before this workflow may
            require opening reconciliation.
          </p>
        )}
        <div className="overflow-auto rounded border">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-100">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="p-3 text-left">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id || `${row.store_id}-${row.product_id}`}
                  className="border-t"
                >
                  {(tab === "transfers"
                    ? [
                        <button
                          className="text-indigo-700 underline"
                          onClick={() => open(row.id)}
                          key="open"
                        >
                          {row.transaction_id}
                        </button>,
                        `${row.source_name} to ${row.destination_name}`,
                        row.workflow_version === 2
                          ? pretty(row.status)
                          : `Historical: ${pretty(row.status)}`,
                        row.workflow_version === 2 ? num(row.dispatched) : "-",
                        row.workflow_version === 2 ? num(row.accepted) : "-",
                        row.workflow_version === 2 ? num(row.in_transit) : "-",
                        `${num(row.damaged)} / ${num(row.rejected)}`,
                        `${num(row.short)} / ${num(row.excess)}`,
                        row.open_cases,
                        row.expected_arrival_at
                          ? new Date(row.expected_arrival_at).toLocaleString()
                          : "-",
                      ]
                    : tab === "buckets"
                      ? [
                          row.location,
                          row.location_type,
                          row.product,
                          row.unit,
                          num(row.available),
                          num(row.reserved),
                          num(row.quarantine),
                          num(row.damaged),
                          num(row.rejected),
                          num(row.expired),
                          num(row.inactive),
                          num(row.physical_qty),
                        ]
                      : [
                          new Date(row.created_at).toLocaleString(),
                          row.location,
                          `${row.product} / ${row.batch_no || "-"}`,
                          row.unit,
                          row.direction === "in" ? num(row.qty) : "-",
                          row.direction === "out" ? num(row.qty) : "-",
                          num(row.recorded_balance),
                          `${pretty(row.reference_type)} ${row.meta?.transactionId || row.reference_id}`,
                          row.actor,
                        ]
                  ).map((cell, i) => (
                    <td key={i} className="p-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !loading && (
            <p className="p-8 text-center text-slate-500">
              No records match these filters.
            </p>
          )}
          <Pagination {...list.pagination} />
        </div>
        {detail &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/35 p-0 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label="Transfer dispatch details"
            >
              <section
                className="min-h-full bg-slate-50 p-4 shadow-2xl sm:mx-auto sm:min-h-0 sm:max-w-6xl sm:rounded-2xl sm:p-6"
                aria-label="Transfer detail"
              >
                <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-5 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:-mx-6 sm:-mt-6 sm:px-6">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">
                      Material movement
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      {detail.transfer.transaction_id} · {pretty(state)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {detail.transfer.source_name} to{" "}
                      {detail.transfer.destination_name}
                    </p>
                    {qrDataUrl && (
                      <div className="mt-3 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={qrDataUrl}
                          alt="Transfer QR"
                          className="h-20 w-20 rounded border border-slate-200 bg-white p-1"
                        />
                        <p className="max-w-xs text-xs text-slate-500">
                          Scan to confirm transfer #{detail.transfer.id}. Paste
                          the code below or open this receipt on site.
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                    onClick={() => setDetail(null)}
                  >
                    Close
                  </button>
                </div>
                {detail.transfer.workflow_version !== 2 ? (
                  <p>
                    Historical transfer. Its original stock posting is
                    preserved; receipt quantities were not captured in this
                    workflow.
                  </p>
                ) : (
                  <>
                    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                      {state === "submitted"
                        ? "Step 2 of 3: enter dispatch details, then approve and send this material to the site."
                        : receiving
                          ? "Step 3 of 3: confirm what reached the site."
                          : "Transfer status and material quantities are shown below."}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        "remarks",
                        "evidence",
                        ...(["submitted", "picked"].includes(state)
                          ? [
                              "vehicle",
                              "challan",
                              "transporter",
                              "driver",
                              "eta",
                            ]
                          : []),
                      ].map((key) => (
                        <label key={key} className="text-sm">
                          {key === "evidence"
                            ? "Dispatch proof / reference"
                            : pretty(key)}
                          <input
                            className={input}
                            type={key === "eta" ? "datetime-local" : "text"}
                            value={form[key] || ""}
                            onChange={(e) =>
                              setForm({ ...form, [key]: e.target.value })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="hidden overflow-auto md:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            {[
                              "Material",
                              "Requested",
                              "Dispatched",
                              "Accepted",
                              "Pending",
                              ...(["submitted", "picked"].includes(state)
                                ? ["Dispatch now"]
                                : receiving
                                  ? [
                                      "Received now",
                                      "Accepted now",
                                      "Damaged",
                                      "Rejected",
                                      "Short (final)",
                                      "Excess",
                                    ]
                                  : []),
                            ].map((c) => (
                              <th key={c} className="p-2 text-left">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line, index) => (
                            <tr key={line.id} className="border-t">
                              <td className="p-2">{line.product_name}</td>
                              {[
                                line.qty,
                                line.dispatched_qty,
                                line.accepted_qty,
                                line.pending,
                              ].map((n, i) => (
                                <td key={i} className="p-2">
                                  {num(n)}
                                </td>
                              ))}
                              {(["submitted", "picked"].includes(state)
                                ? ["dispatch"]
                                : receiving
                                  ? [
                                      "received",
                                      "accepted",
                                      "damaged",
                                      "rejected",
                                      "short",
                                      "excess",
                                    ]
                                  : []
                              ).map((key) => (
                                <td key={key} className="p-2">
                                  <input
                                    aria-label={`${line.product_name} ${key}`}
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    className={`${input} min-w-24`}
                                    value={line[key]}
                                    onChange={(e) =>
                                      key === "received"
                                        ? updateReceiptLine(
                                            index,
                                            key,
                                            e.target.value,
                                          )
                                        : setLines(
                                            lines.map((x, i) =>
                                              i === index
                                                ? {
                                                    ...x,
                                                    [key]: e.target.value,
                                                  }
                                                : x,
                                            ),
                                          )
                                    }
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {receiving && (
                      <p className="text-sm text-slate-600">
                        Enter this receipt only. Accepted + damaged + rejected
                        must equal received. Leave a later delivery pending; use
                        Short only for a declared shortage.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {detail.canApproveAndDispatch &&
                        state === "submitted" && (
                          <button
                            disabled={busy}
                            className={button}
                            onClick={() => action("approve_dispatch")}
                          >
                            Approve & dispatch to site
                          </button>
                        )}
                      {detail.canSend && state === "approved" && (
                        <button
                          disabled={busy}
                          className={button}
                          onClick={() => action("pick")}
                        >
                          Prepare dispatch
                        </button>
                      )}
                      {detail.canSend && state === "picked" && (
                        <button
                          disabled={busy}
                          className={button}
                          onClick={() => action("dispatch")}
                        >
                          Dispatch material
                        </button>
                      )}
                      {detail.canReceive && receiving && (
                        <>
                          <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                            <label className="min-w-[200px] flex-1 text-sm">
                              Scan transfer code
                              <input
                                className={input}
                                placeholder="Scan QR or type transfer id"
                                value={scanCode}
                                onChange={(e) => setScanCode(e.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              disabled={busy}
                              className={button}
                              onClick={() => {
                                const expected = String(
                                  detail.transfer.id || "",
                                );
                                const txn = String(
                                  detail.transfer.transaction_id || "",
                                );
                                let code = String(scanCode || "").trim();
                                try {
                                  const parsed = JSON.parse(code);
                                  if (parsed?.transferId != null) {
                                    code = String(parsed.transferId);
                                  } else if (parsed?.transferNumber) {
                                    code = String(parsed.transferNumber);
                                  }
                                } catch {
                                  /* plain id / txn */
                                }
                                const ok =
                                  !scanCode.trim() ||
                                  code === expected ||
                                  code === txn ||
                                  code.includes(expected);
                                if (!ok) {
                                  setError(
                                    "Scanned code does not match this transfer.",
                                  );
                                  return;
                                }
                                action("receive");
                              }}
                            >
                              Confirm scan & receive
                            </button>
                          </div>
                          {hasEnteredExcess && (
                            <select
                              aria-label="Approved excess"
                              className="rounded border p-2"
                              value={form.excessApprovalId || ""}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  excessApprovalId: e.target.value,
                                })
                              }
                            >
                              <option value="">Select approved excess</option>
                              {usableExcessApprovals.map((event) => (
                                <option key={event.id} value={event.id}>
                                  Approval #{event.id}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            disabled={
                              busy ||
                              (hasEnteredExcess && !form.excessApprovalId)
                            }
                            className={button}
                            onClick={() => action("receive")}
                          >
                            Confirm actual receipt
                          </button>
                        </>
                      )}
                      {detail.canSend && receiving && hasEnteredExcess && (
                        <button
                          disabled={busy}
                          className={button}
                          onClick={() =>
                            action("approve_excess", {
                              items: lines
                                .filter((x) => Number(x.excess) > 0)
                                .map((x) => ({ id: x.id, qty: x.excess })),
                            })
                          }
                        >
                          Approve excess
                        </button>
                      )}
                      {detail.canSend &&
                        ["submitted", "approved", "picked"].includes(state) && (
                          <button
                            disabled={busy}
                            className="rounded border px-3 py-2"
                            onClick={() => action("cancel")}
                          >
                            Cancel request
                          </button>
                        )}
                    </div>
                  </>
                )}
                <h3 className="font-semibold">Discrepancies</h3>
                {!detail.discrepancies.length && (
                  <p className="text-sm text-slate-500">
                    No discrepancies recorded.
                  </p>
                )}
                {detail.discrepancies.map((x) => (
                  <div
                    key={x.id}
                    className="flex flex-wrap justify-between gap-3 rounded bg-amber-50 p-3"
                  >
                    <span>
                      {x.discrepancy_number} · {num(x.quantity)}{" "}
                      {x.discrepancy_type} · {x.status}
                      <br />
                      {x.resolution}
                    </span>
                    {detail.canSend &&
                      ["open", "under_review"].includes(x.status) && (
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() =>
                            action("resolve", { discrepancyId: x.id })
                          }
                        >
                          Resolve with entered reason/proof
                        </button>
                      )}
                  </div>
                ))}
                <p className="text-xs text-slate-500">
                  Resolving a case records its investigation outcome.
                  Damaged/rejected goods remain isolated; resolution does not
                  make them usable.
                </p>
                <h3 className="font-semibold">Document timeline</h3>
                {detail.events.map((event) => (
                  <div
                    key={event.id}
                    className="border-l-2 border-indigo-200 pl-3 text-sm"
                  >
                    <strong>
                      #{event.id} {pretty(event.action)}
                    </strong>{" "}
                    · {new Date(event.created_at).toLocaleString()} ·{" "}
                    {event.details.actorName || `User ${event.actor_id}`}
                    <p>
                      {event.details.remarks} {event.details.evidence}
                    </p>
                  </div>
                ))}
              </section>
            </div>,
            document.body,
          )}
      </div>
    </MainLayout>
  );
}
