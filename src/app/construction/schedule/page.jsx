"use client";

import Button from "@/components/ui/Button";

import { useEffect, useState } from "react";
import ConstructionShell, {
  ConstructionAlert,
  ConstructionEmpty,
  ConstructionField,
  ConstructionSection,
  ConstructionTable,
  constructionInput,
} from "@/components/construction/ConstructionShell";

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
    <ConstructionShell
      title="Activity schedule"
      subtitle="Plan start/end, dependencies and baseline progress for work activities."
    >
      {error && <ConstructionAlert>{error}</ConstructionAlert>}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Save schedule"
        description="Assign planned dates and optional dependency for an activity."
      >
        <form
          onSubmit={save}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <ConstructionField label="Activity" required>
            <select
              className={constructionInput}
              required
              value={form.activityId}
              onChange={(e) => setForm({ ...form, activityId: e.target.value })}
            >
              <option value="">Select activity</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.project_name} — {a.name}
                </option>
              ))}
            </select>
          </ConstructionField>
          <ConstructionField label="Planned start">
            <input
              className={constructionInput}
              type="date"
              value={form.plannedStart}
              onChange={(e) =>
                setForm({ ...form, plannedStart: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Planned end">
            <input
              className={constructionInput}
              type="date"
              value={form.plannedEnd}
              onChange={(e) => setForm({ ...form, plannedEnd: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Depends on">
            <select
              className={constructionInput}
              value={form.dependsOnActivityId}
              onChange={(e) =>
                setForm({ ...form, dependsOnActivityId: e.target.value })
              }
            >
              <option value="">Optional</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </ConstructionField>
          <ConstructionField label="Baseline %">
            <input
              className={constructionInput}
              value={form.baselineProgress}
              onChange={(e) =>
                setForm({ ...form, baselineProgress: e.target.value })
              }
            />
          </ConstructionField>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy}
            >
              Save schedule
            </Button>
          </div>
        </form>
      </ConstructionSection>

      <ConstructionSection title="Schedule rows">
        <ConstructionTable
          headers={["Activity", "Start", "End", "Depends", "Baseline %"]}
        >
          {records.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 text-slate-700">
                {row.project_name} — {row.activity_name}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.planned_start || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.planned_end || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.depends_on_name || "—"}
              </td>
              <td className="px-4 py-3">{row.baseline_progress}</td>
            </tr>
          ))}
          {!records.length && (
            <ConstructionEmpty
              colSpan={5}
              message="No schedule rows yet. Create activities under BOQ controls first."
            />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
