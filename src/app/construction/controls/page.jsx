"use client";

import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";

const empty = {
  code: "",
  name: "",
  category: "",
  budget: "",
  description: "",
  unit: "NOS",
  plannedQty: "",
  rate: "",
  activityName: "",
  contractorName: "",
  progressDate: new Date().toISOString().slice(0, 10),
  workDone: "",
  progressPercent: "",
  labourCount: "",
  labourHours: "",
  remarks: "",
};

export default function ProjectControlsPage() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState("boq");
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoadError("");
    try {
      const r = await fetch(
        `/api/construction/controls${projectId ? `?projectId=${projectId}` : ""}`,
        { cache: "no-store" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to load project controls");
      setData(j.data);
    } catch (error) {
      setLoadError(error.message || "Unable to load project controls");
    }
  };
  useEffect(() => {
    load();
  }, [projectId]);
  const codes = data?.costCodes || [],
    activities = data?.activities || [],
    boq = data?.boq || [],
    progress = data?.progress || [];
  const selectedProject = useMemo(
    () => data?.projects?.find((p) => String(p.id) === String(projectId)),
    [data, projectId],
  );
  const save = async (type, body) => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/construction/controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, projectId, ...body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setForm(empty);
      setMessage("Saved successfully.");
      await load();
    } catch (e) {
      setMessage(e.message || "Unable to save");
    } finally {
      setBusy(false);
    }
  };
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  if (loadError)
    return (
      <MainLayout>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-bold">Project Controls could not load</p>
          <p className="mt-1">{loadError}</p>
          <button
            className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-white"
            onClick={load}
          >
            Retry
          </button>
        </div>
      </MainLayout>
    );
  if (!data)
    return (
      <MainLayout>
        <div className="p-6 text-sm text-slate-500">
          Loading project controls…
        </div>
      </MainLayout>
    );
  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl space-y-5 pb-10">
        <header className="rounded-2xl bg-slate-900 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Construction controls
          </p>
          <h1 className="mt-1 text-2xl font-black">
            BOQ, work plan and daily progress
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Plan project quantities and budgets, assign work activities, then
            record daily labour and equipment progress.
          </p>
        </header>
        <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center">
          <select
            className={input}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Select a project</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_code} — {p.name}
              </option>
            ))}
          </select>
          {selectedProject && (
            <span className="text-sm font-semibold text-slate-700">
              Project budget: ₹
              {Number(selectedProject.budget || 0).toLocaleString("en-IN")}
            </span>
          )}
        </div>
        {!projectId ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-slate-500">
            Select a project to manage its controls.
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto">
              {[
                ["boq", "BOQ & Budget"],
                ["activities", "Activities"],
                ["progress", "Daily Progress"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-amber-500 text-slate-950" : "bg-slate-100 text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {message && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                {message}
              </p>
            )}
            {tab === "boq" && (
              <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("boq", form);
                  }}
                  className="space-y-3 rounded-xl border bg-white p-4"
                >
                  <h2 className="font-bold">Add BOQ line</h2>
                  <input
                    required
                    className={input}
                    placeholder="Item code"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                  <textarea
                    required
                    className={input}
                    placeholder="Work / material description"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      className={input}
                      placeholder="Unit"
                      value={form.unit}
                      onChange={(e) =>
                        setForm({ ...form, unit: e.target.value })
                      }
                    />
                    <input
                      required
                      type="number"
                      className={input}
                      placeholder="Qty"
                      value={form.plannedQty}
                      onChange={(e) =>
                        setForm({ ...form, plannedQty: e.target.value })
                      }
                    />
                    <input
                      required
                      type="number"
                      className={input}
                      placeholder="Rate"
                      value={form.rate}
                      onChange={(e) =>
                        setForm({ ...form, rate: e.target.value })
                      }
                    />
                  </div>
                  <select
                    className={input}
                    value={form.costCodeId || ""}
                    onChange={(e) =>
                      setForm({ ...form, costCodeId: e.target.value })
                    }
                  >
                    <option value="">No cost code</option>
                    {codes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy}
                    className="w-full rounded-lg bg-slate-900 py-2 text-sm font-bold text-white"
                  >
                    Save BOQ line
                  </button>
                </form>
                <Table
                  headers={["Code", "Description", "Qty", "Budget", "Actual"]}
                  rows={boq.map((x) => [
                    x.item_code || "—",
                    x.description,
                    `${x.planned_qty} ${x.unit}`,
                    `₹${Number(x.budget_amount).toLocaleString("en-IN")}`,
                    `₹${Number(x.actual_amount).toLocaleString("en-IN")}`,
                  ])}
                />
              </div>
            )}
            {tab === "activities" && (
              <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("cost_code", form);
                  }}
                  className="space-y-3 rounded-xl border bg-white p-4"
                >
                  <h2 className="font-bold">Cost code</h2>
                  <input
                    required
                    className={input}
                    placeholder="Code"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                  <input
                    required
                    className={input}
                    placeholder="Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <input
                    className={input}
                    placeholder="Category"
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                  />
                  <button
                    disabled={busy}
                    className="w-full rounded-lg bg-slate-900 py-2 text-sm font-bold text-white"
                  >
                    Add cost code
                  </button>
                </form>
                <Table
                  headers={["Code", "Name", "Category", "Budget"]}
                  rows={codes.map((x) => [
                    x.code,
                    x.name,
                    x.category || "—",
                    `₹${Number(x.budget).toLocaleString("en-IN")}`,
                  ])}
                />
              </div>
            )}
            {tab === "progress" && (
              <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("progress", form);
                  }}
                  className="space-y-3 rounded-xl border bg-white p-4"
                >
                  <h2 className="font-bold">Daily site progress</h2>
                  <input
                    type="date"
                    className={input}
                    value={form.progressDate}
                    onChange={(e) =>
                      setForm({ ...form, progressDate: e.target.value })
                    }
                  />
                  <textarea
                    required
                    className={input}
                    placeholder="Work completed today"
                    value={form.workDone}
                    onChange={(e) =>
                      setForm({ ...form, workDone: e.target.value })
                    }
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      className={input}
                      placeholder="%"
                      value={form.progressPercent}
                      onChange={(e) =>
                        setForm({ ...form, progressPercent: e.target.value })
                      }
                    />
                    <input
                      type="number"
                      className={input}
                      placeholder="Labour"
                      value={form.labourCount}
                      onChange={(e) =>
                        setForm({ ...form, labourCount: e.target.value })
                      }
                    />
                    <input
                      type="number"
                      className={input}
                      placeholder="Hours"
                      value={form.labourHours}
                      onChange={(e) =>
                        setForm({ ...form, labourHours: e.target.value })
                      }
                    />
                  </div>
                  <button
                    disabled={busy}
                    className="w-full rounded-lg bg-slate-900 py-2 text-sm font-bold text-white"
                  >
                    Submit progress
                  </button>
                </form>
                <Table
                  headers={[
                    "Date",
                    "Work done",
                    "Progress",
                    "Labour",
                    "Status",
                  ]}
                  rows={progress.map((x) => [
                    String(x.progress_date).slice(0, 10),
                    x.work_done,
                    `${x.progress_percent}%`,
                    `${x.labour_count} / ${x.labour_hours}h`,
                    x.approval_status,
                  ])}
                />
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
function Table({ headers, rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-10 text-center text-slate-400"
              >
                No records yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
