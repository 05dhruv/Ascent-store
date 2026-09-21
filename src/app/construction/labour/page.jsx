"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function LabourPage() {
  const [crews, setCrews] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [crewForm, setCrewForm] = useState({
    name: "",
    projectId: "",
    siteId: "",
    trade: "",
  });
  const [attForm, setAttForm] = useState({
    crewId: "",
    siteId: "",
    workDate: new Date().toISOString().slice(0, 10),
    headcount: "",
    hours: "",
    notes: "",
  });

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/labour", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setCrews(j.data?.crews || []);
      setAttendance(j.data?.attendance || []);
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
      const r = await fetch("/api/construction/labour", {
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
            Labour
          </p>
          <h1 className="mt-1 text-2xl font-black">Crews & attendance</h1>
          <p className="mt-1 text-sm text-slate-300">
            Track site headcount and hours by crew.
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
            post({ type: "crew", ...crewForm });
          }}
        >
          <input
            className={input}
            placeholder="Crew name"
            required
            value={crewForm.name}
            onChange={(e) => setCrewForm({ ...crewForm, name: e.target.value })}
          />
          <input
            className={input}
            placeholder="Project ID"
            value={crewForm.projectId}
            onChange={(e) =>
              setCrewForm({ ...crewForm, projectId: e.target.value })
            }
          />
          <input
            className={input}
            placeholder="Trade"
            value={crewForm.trade}
            onChange={(e) =>
              setCrewForm({ ...crewForm, trade: e.target.value })
            }
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Add crew
          </button>
        </form>

        <form
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            post({ type: "attendance", ...attForm });
          }}
        >
          <select
            className={input}
            required
            value={attForm.crewId}
            onChange={(e) => setAttForm({ ...attForm, crewId: e.target.value })}
          >
            <option value="">Crew</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className={input}
            type="date"
            value={attForm.workDate}
            onChange={(e) =>
              setAttForm({ ...attForm, workDate: e.target.value })
            }
          />
          <input
            className={input}
            placeholder="Headcount"
            value={attForm.headcount}
            onChange={(e) =>
              setAttForm({ ...attForm, headcount: e.target.value })
            }
          />
          <input
            className={input}
            placeholder="Hours"
            value={attForm.hours}
            onChange={(e) => setAttForm({ ...attForm, hours: e.target.value })}
          />
          <input
            className={input}
            placeholder="Notes"
            value={attForm.notes}
            onChange={(e) => setAttForm({ ...attForm, notes: e.target.value })}
          />
          <button
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            Log attendance
          </button>
        </form>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-black">Crews</h2>
            <ul className="space-y-2 text-sm">
              {crews.map((c) => (
                <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-semibold">{c.name}</span>
                  {c.trade ? ` · ${c.trade}` : ""}
                  {c.project_name ? ` · ${c.project_name}` : ""}
                </li>
              ))}
              {!crews.length && (
                <li className="text-slate-400">No crews yet.</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-black">Recent attendance</h2>
            <ul className="space-y-2 text-sm">
              {attendance.map((a) => (
                <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  {a.work_date} · {a.crew_name} · {a.headcount} pax · {a.hours}h
                </li>
              ))}
              {!attendance.length && (
                <li className="text-slate-400">No attendance yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
