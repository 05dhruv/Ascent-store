"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function QuarantinePage() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    batchId: "",
    storeId: "",
    productId: "",
    qty: "",
    reason: "",
  });

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/quarantine", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "Unable to load");
      setRecords(j.data?.records || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const requestRelease = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/construction/quarantine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: form.batchId || null,
          storeId: form.storeId || null,
          productId: form.productId || null,
          qty: Number(form.qty),
          reason: form.reason,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setForm({ batchId: "", storeId: "", productId: "", qty: "", reason: "" });
      setMessage("Release requested.");
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (id, status) => {
    setBusy(true);
    try {
      const r = await fetch("/api/construction/quarantine", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-5 pb-10">
        <header className="rounded-2xl bg-slate-900 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Material controls
          </p>
          <h1 className="mt-1 text-2xl font-black">Quarantine releases</h1>
          <p className="mt-1 text-sm text-slate-300">
            Request and approve release of quarantined stock to usable inventory.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}{" "}
            <button className="underline" onClick={load}>
              Retry
            </button>
          </div>
        )}
        {message && (
          <p className="text-sm font-semibold text-slate-700">{message}</p>
        )}

        <form
          onSubmit={requestRelease}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input
            className={input}
            placeholder="Batch ID"
            value={form.batchId}
            onChange={(e) => setForm({ ...form, batchId: e.target.value })}
          />
          <input
            className={input}
            placeholder="Store ID"
            value={form.storeId}
            onChange={(e) => setForm({ ...form, storeId: e.target.value })}
          />
          <input
            className={input}
            placeholder="Product ID"
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
          />
          <input
            className={input}
            placeholder="Qty"
            required
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value })}
          />
          <input
            className={`${input} sm:col-span-2`}
            placeholder="Reason"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Request release
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.id}</td>
                  <td className="px-3 py-2">
                    {row.product_name || row.product_id || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.store_name || row.store_id || "—"}
                  </td>
                  <td className="px-3 py-2">{row.qty}</td>
                  <td className="px-3 py-2 uppercase">{row.status}</td>
                  <td className="px-3 py-2">
                    {row.requested_by_name || "—"}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    {row.status === "pending" && (
                      <>
                        <button
                          disabled={busy}
                          className="text-emerald-700 font-semibold"
                          onClick={() => resolve(row.id, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          disabled={busy}
                          className="text-red-700 font-semibold"
                          onClick={() => resolve(row.id, "rejected")}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No quarantine release requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
