"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function RaBillsPage() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    billNumber: "",
    contractorId: "",
    description: "",
    qty: "",
    rate: "",
    retentionAmount: "0",
  });

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/ra-bills", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setRecords(j.data?.records || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const qty = Number(form.qty || 0);
      const rate = Number(form.rate || 0);
      const r = await fetch("/api/construction/ra-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          billNumber: form.billNumber,
          contractorId: form.contractorId || null,
          retentionAmount: Number(form.retentionAmount || 0),
          lineItems: [
            {
              description: form.description || "Work item",
              qty,
              rate,
              amount: qty * rate,
            },
          ],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setMessage("RA bill created.");
      setForm({
        ...form,
        billNumber: "",
        description: "",
        qty: "",
        rate: "",
      });
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    setBusy(true);
    try {
      const r = await fetch("/api/construction/ra-bills", {
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
            Billing
          </p>
          <h1 className="mt-1 text-2xl font-black">RA bills</h1>
          <p className="mt-1 text-sm text-slate-300">
            Running account bills with line items and retention.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {message && (
          <p className="text-sm font-semibold text-slate-700">{message}</p>
        )}

        <form
          onSubmit={save}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input
            className={input}
            placeholder="Project ID"
            required
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          />
          <input
            className={input}
            placeholder="Bill number"
            required
            value={form.billNumber}
            onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
          />
          <input
            className={input}
            placeholder="Contractor ID"
            value={form.contractorId}
            onChange={(e) =>
              setForm({ ...form, contractorId: e.target.value })
            }
          />
          <input
            className={input}
            placeholder="Line description"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
          />
          <input
            className={input}
            placeholder="Qty"
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value })}
          />
          <input
            className={input}
            placeholder="Rate"
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
          />
          <input
            className={input}
            placeholder="Retention"
            value={form.retentionAmount}
            onChange={(e) =>
              setForm({ ...form, retentionAmount: e.target.value })
            }
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Create RA bill
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Bill</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Gross</th>
                <th className="px-3 py-2">Net</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{row.bill_number}</td>
                  <td className="px-3 py-2">{row.project_name}</td>
                  <td className="px-3 py-2">
                    ₹{Number(row.gross_amount || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2">
                    ₹{Number(row.net_amount || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 uppercase">{row.status}</td>
                  <td className="px-3 py-2 space-x-2">
                    {row.status === "draft" && (
                      <button
                        disabled={busy}
                        className="font-semibold text-amber-700"
                        onClick={() => setStatus(row.id, "submitted")}
                      >
                        Submit
                      </button>
                    )}
                    {row.status === "submitted" && (
                      <button
                        disabled={busy}
                        className="font-semibold text-emerald-700"
                        onClick={() => setStatus(row.id, "approved")}
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No RA bills yet.
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
