"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    assetCode: "",
    name: "",
    category: "",
    projectId: "",
  });
  const [logForm, setLogForm] = useState({
    equipmentId: "",
    hoursUsed: "",
    operatorName: "",
    notes: "",
  });

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/equipment", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setEquipment(j.data?.equipment || []);
      setLogs(j.data?.logs || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const post = async (body) => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/construction/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setMessage("Saved.");
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
            Equipment
          </p>
          <h1 className="mt-1 text-2xl font-black">Plant & equipment</h1>
          <p className="mt-1 text-sm text-slate-300">
            Register assets and log daily usage hours.
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
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            post({ type: "equipment", ...form });
          }}
        >
          <input
            className={input}
            placeholder="Asset code"
            required
            value={form.assetCode}
            onChange={(e) => setForm({ ...form, assetCode: e.target.value })}
          />
          <input
            className={input}
            placeholder="Name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={input}
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Add equipment
          </button>
        </form>

        <form
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            post({ type: "log", ...logForm });
          }}
        >
          <select
            className={input}
            required
            value={logForm.equipmentId}
            onChange={(e) =>
              setLogForm({ ...logForm, equipmentId: e.target.value })
            }
          >
            <option value="">Equipment</option>
            {equipment.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.asset_code} — {eq.name}
              </option>
            ))}
          </select>
          <input
            className={input}
            placeholder="Hours used"
            value={logForm.hoursUsed}
            onChange={(e) =>
              setLogForm({ ...logForm, hoursUsed: e.target.value })
            }
          />
          <input
            className={input}
            placeholder="Operator"
            value={logForm.operatorName}
            onChange={(e) =>
              setLogForm({ ...logForm, operatorName: e.target.value })
            }
          />
          <button
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            Log usage
          </button>
        </form>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-black">Assets</h2>
            <ul className="space-y-2 text-sm">
              {equipment.map((eq) => (
                <li key={eq.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-semibold">
                    {eq.asset_code} — {eq.name}
                  </span>
                  <span className="ml-2 text-xs uppercase text-slate-500">
                    {eq.status}
                  </span>
                </li>
              ))}
              {!equipment.length && (
                <li className="text-slate-400">No equipment yet.</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-black">Usage logs</h2>
            <ul className="space-y-2 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  {l.log_date} · {l.asset_code} · {l.hours_used}h
                  {l.operator_name ? ` · ${l.operator_name}` : ""}
                </li>
              ))}
              {!logs.length && (
                <li className="text-slate-400">No logs yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
