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

  const exportCsv = () => {
    const rows = attendance.map((row) => ({
      date: row.work_date || "",
      crew_id: row.crew_id || "",
      crew_name:
        crews.find((c) => String(c.id) === String(row.crew_id))?.name || "",
      site_id: row.site_id || "",
      headcount: row.headcount ?? "",
      hours: row.hours ?? "",
      notes: row.notes || "",
    }));
    if (!rows.length) {
      setMessage("No attendance rows to export.");
      return;
    }
    const keys = Object.keys(rows[0]);
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => esc(r[k])).join(",")),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `labour-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ConstructionShell
      title="Crews & attendance"
      subtitle="Track site headcount and hours by crew. Export CSV for payroll."
      actions={[
        {
          label: "Export attendance CSV",
          icon: "ti ti-download",
          onClick: exportCsv,
          primary: true,
        },
      ]}
    >
      {error && <ConstructionAlert>{error}</ConstructionAlert>}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Add crew"
        description="Register a trade crew for a project or site."
      >
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            post({ action: "crew", ...crewForm });
            setCrewForm({ name: "", projectId: "", siteId: "", trade: "" });
          }}
        >
          <ConstructionField label="Crew name" required>
            <input
              className={constructionInput}
              required
              value={crewForm.name}
              onChange={(e) =>
                setCrewForm({ ...crewForm, name: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Trade">
            <input
              className={constructionInput}
              value={crewForm.trade}
              onChange={(e) =>
                setCrewForm({ ...crewForm, trade: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Project ID">
            <input
              className={constructionInput}
              value={crewForm.projectId}
              onChange={(e) =>
                setCrewForm({ ...crewForm, projectId: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Site ID">
            <input
              className={constructionInput}
              value={crewForm.siteId}
              onChange={(e) =>
                setCrewForm({ ...crewForm, siteId: e.target.value })
              }
            />
          </ConstructionField>
          <Button type="submit" disabled={busy}>
            Save crew
          </Button>
        </form>
      </ConstructionSection>

      <ConstructionSection
        title="Log attendance"
        description="Daily headcount and hours for a crew."
      >
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            post({ action: "attendance", ...attForm });
          }}
        >
          <ConstructionField label="Crew" required>
            <select
              className={constructionInput}
              required
              value={attForm.crewId}
              onChange={(e) =>
                setAttForm({ ...attForm, crewId: e.target.value })
              }
            >
              <option value="">Select crew</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </ConstructionField>
          <ConstructionField label="Work date" required>
            <input
              type="date"
              className={constructionInput}
              required
              value={attForm.workDate}
              onChange={(e) =>
                setAttForm({ ...attForm, workDate: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Site ID">
            <input
              className={constructionInput}
              value={attForm.siteId}
              onChange={(e) =>
                setAttForm({ ...attForm, siteId: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Headcount">
            <input
              type="number"
              min="0"
              className={constructionInput}
              value={attForm.headcount}
              onChange={(e) =>
                setAttForm({ ...attForm, headcount: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Hours">
            <input
              type="number"
              min="0"
              step="0.5"
              className={constructionInput}
              value={attForm.hours}
              onChange={(e) =>
                setAttForm({ ...attForm, hours: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Notes">
            <input
              className={constructionInput}
              value={attForm.notes}
              onChange={(e) =>
                setAttForm({ ...attForm, notes: e.target.value })
              }
            />
          </ConstructionField>
          <Button type="submit" disabled={busy}>
            Save attendance
          </Button>
        </form>
      </ConstructionSection>

      <ConstructionSection title="Crews">
        <ConstructionTable headers={["Name", "Trade", "Project", "Site"]}>
          {crews.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
              <td className="px-4 py-3 text-slate-600">{c.trade || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{c.project_id || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{c.site_id || "—"}</td>
            </tr>
          ))}
          {!crews.length && (
            <ConstructionEmpty colSpan={4} message="No crews yet — add one above." />
          )}
        </ConstructionTable>
      </ConstructionSection>

      <ConstructionSection title="Recent attendance">
        <ConstructionTable
          headers={["Date", "Crew", "Headcount", "Hours", "Notes"]}
        >
          {attendance.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 text-slate-700">
                {row.work_date
                  ? String(row.work_date).slice(0, 10)
                  : "—"}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {crews.find((c) => String(c.id) === String(row.crew_id))?.name ||
                  row.crew_id ||
                  "—"}
              </td>
              <td className="px-4 py-3">{row.headcount ?? "—"}</td>
              <td className="px-4 py-3">{row.hours ?? "—"}</td>
              <td className="px-4 py-3 text-slate-500">{row.notes || "—"}</td>
            </tr>
          ))}
          {!attendance.length && (
            <ConstructionEmpty colSpan={5} message="No attendance logged yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
