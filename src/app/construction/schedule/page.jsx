"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function SchedulePage() {
  const [records, setRecords] = useState([]);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    activityId: "",
    plannedStart: "",
    plannedEnd: "",
    dependsOnActivityId: "",
    baselineProgress: "0",
  });

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/schedule", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setRecords(j.data?.records || []);
      setActivities(j.data?.activities || []);
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
      const r = await fetch("/api/construction/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setMessage("Schedule saved.");
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
            Scheduling
          </p>
          <h1 className="mt-1 text-2xl font-black">Activity schedule</h1>
          <p className="mt-1 text-sm text-slate-300">
            Plan start/end, dependencies and baseline progress for work activities.
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
          <select
            className={input}
            required
            value={form.activityId}
            onChange={(e) => setForm({ ...form, activityId: e.target.value })}
          >
            <option value="">Activity</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.project_name} — {a.name}
              </option>
            ))}
          </select>
          <input
            className={input}
            type="date"
            value={form.plannedStart}
            onChange={(e) =>
              setForm({ ...form, plannedStart: e.target.value })
            }
          />
          <input
            className={input}
            type="date"
            value={form.plannedEnd}
            onChange={(e) => setForm({ ...form, plannedEnd: e.target.value })}
          />
          <select
            className={input}
            value={form.dependsOnActivityId}
            onChange={(e) =>
              setForm({ ...form, dependsOnActivityId: e.target.value })
            }
          >
            <option value="">Depends on (optional)</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            className={input}
            placeholder="Baseline %"
            value={form.baselineProgress}
            onChange={(e) =>
              setForm({ ...form, baselineProgress: e.target.value })
            }
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Save schedule
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Activity</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Depends</th>
                <th className="px-3 py-2">Baseline %</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">
                    {row.project_name} — {row.activity_name}
                  </td>
                  <td className="px-3 py-2">{row.planned_start || "—"}</td>
                  <td className="px-3 py-2">{row.planned_end || "—"}</td>
                  <td className="px-3 py-2">{row.depends_on_name || "—"}</td>
                  <td className="px-3 py-2">{row.baseline_progress}</td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No schedule rows yet. Create activities under BOQ controls first.
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
