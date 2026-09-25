"use client";

import { useEffect, useState } from "react";
import ConstructionShell, {
  ConstructionAlert,
  ConstructionEmpty,
  ConstructionField,
  ConstructionSection,
  ConstructionTable,
  constructionBtnPrimary,
  constructionInput,
} from "@/components/construction/ConstructionShell";

export default function BoqVariancePage() {
  const [records, setRecords] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/construction/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProjects(j.data?.records || []))
      .catch(() => setProjects([]));
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const q = projectId ? `?projectId=${projectId}` : "";
      const r = await fetch(`/api/construction/boq-variance${q}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "Failed to load");
      setRecords(j.data?.records || []);
    } catch (e) {
      setError(e.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const totals = records.reduce(
    (acc, row) => {
      acc.planned += Number(row.planned_qty || 0);
      acc.actual += Number(row.actual_qty || 0);
      acc.variance += Number(row.variance_qty || 0);
      acc.budget += Number(row.budget_amount || 0);
      return acc;
    },
    { planned: 0, actual: 0, variance: 0, budget: 0 },
  );

  return (
    <ConstructionShell
      title="BOQ variance"
      subtitle="Planned BOQ qty vs movements and activity issues."
      actions={[
        {
          label: "BOQ controls",
          href: "/construction/controls",
          icon: "ti ti-adjustments",
          primary: false,
        },
        {
          label: "Refresh",
          icon: "ti ti-refresh",
          onClick: load,
          primary: true,
        },
      ]}
    >
      {error && <ConstructionAlert>{error}</ConstructionAlert>}

      <ConstructionSection
        title="Filter"
        description="Narrow variance rows by project."
      >
        <div className="flex flex-wrap items-end gap-3">
          <ConstructionField label="Project" className="min-w-[16rem]">
            <select
              className={constructionInput}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.project_code}
                </option>
              ))}
            </select>
          </ConstructionField>
          <button
            type="button"
            onClick={load}
            className={constructionBtnPrimary}
          >
            Refresh
          </button>
        </div>
      </ConstructionSection>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Planned qty", value: totals.planned },
          { label: "Actual qty", value: totals.actual },
          { label: "Variance", value: totals.variance },
          {
            label: "BOQ budget",
            value: `₹${totals.budget.toLocaleString("en-IN")}`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {typeof card.value === "number"
                ? card.value.toLocaleString("en-IN", {
                    maximumFractionDigits: 2,
                  })
                : card.value}
            </p>
          </div>
        ))}
      </div>

      <ConstructionSection title="Variance rows">
        <ConstructionTable
          headers={["Project", "Item", "Planned", "Actual", "Variance", "%"]}
        >
          {loading ? (
            <ConstructionEmpty colSpan={6} message="Loading…" />
          ) : (
            records.map((row) => (
              <tr
                key={row.boq_id || `${row.project_id}-${row.item_code}`}
                className="hover:bg-slate-50/80"
              >
                <td className="px-4 py-3 text-slate-700">
                  {row.project_name || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {row.item_code || "—"}
                  </div>
                  <div className="text-[12px] text-slate-500">
                    {row.description || ""}
                  </div>
                </td>
                <td className="px-4 py-3">{Number(row.planned_qty || 0)}</td>
                <td className="px-4 py-3">{Number(row.actual_qty || 0)}</td>
                <td
                  className={`px-4 py-3 font-medium ${
                    Number(row.variance_qty || 0) < 0
                      ? "text-red-600"
                      : "text-emerald-700"
                  }`}
                >
                  {Number(row.variance_qty || 0)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {Number(row.consumption_pct || 0).toFixed(1)}%
                </td>
              </tr>
            ))
          )}
          {!loading && !records.length && (
            <ConstructionEmpty colSpan={6} message="No BOQ variance rows." />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
