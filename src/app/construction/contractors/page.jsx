"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function ContractorsPage() {
  const [records, setRecords] = useState([]);
  const [variance, setVariance] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    gstin: "",
  });

  const load = async () => {
    setError("");
    try {
      const [c, v] = await Promise.all([
        fetch("/api/construction/contractors", { cache: "no-store" }),
        fetch("/api/construction/boq-variance", { cache: "no-store" }),
      ]);
      const cj = await c.json();
      const vj = await v.json();
      if (!c.ok) throw new Error(cj.message || cj.error);
      setRecords(cj.data?.records || []);
      if (v.ok) setVariance((vj.data?.records || []).slice(0, 20));
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
      const r = await fetch("/api/construction/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setForm({ name: "", phone: "", email: "", gstin: "" });
      setMessage("Contractor saved.");
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (id) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/construction/contractors?id=${id}`, {
        method: "DELETE",
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
            Project controls
          </p>
          <h1 className="mt-1 text-2xl font-black">Contractors</h1>
          <p className="mt-1 text-sm text-slate-300">
            Maintain contractor master. Link to work activities via contractor_id.{" "}
            <Link href="/construction/controls" className="text-amber-400 underline">
              BOQ controls
            </Link>
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
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input
            className={input}
            placeholder="Name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={input}
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className={input}
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className={input}
            placeholder="GSTIN"
            value={form.gstin}
            onChange={(e) => setForm({ ...form, gstin: e.target.value })}
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Add contractor
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">GSTIN</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{row.name}</td>
                  <td className="px-3 py-2">{row.phone || "—"}</td>
                  <td className="px-3 py-2">{row.gstin || "—"}</td>
                  <td className="px-3 py-2">{row.is_active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    {row.is_active && (
                      <button
                        disabled={busy}
                        className="text-red-700 font-semibold"
                        onClick={() => deactivate(row.id)}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-black text-slate-900">BOQ variance (snapshot)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Planned</th>
                  <th className="px-3 py-2">Actual</th>
                  <th className="px-3 py-2">Variance</th>
                </tr>
              </thead>
              <tbody>
                {variance.map((row) => (
                  <tr key={row.boq_id} className="border-t">
                    <td className="px-3 py-2">{row.project_name}</td>
                    <td className="px-3 py-2">
                      {row.item_code || row.description?.slice(0, 40)}
                    </td>
                    <td className="px-3 py-2">{row.planned_qty}</td>
                    <td className="px-3 py-2">{row.actual_qty}</td>
                    <td className="px-3 py-2">{row.variance_qty}</td>
                  </tr>
                ))}
                {!variance.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-slate-400"
                    >
                      No BOQ rows yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
