"use client";

import { useEffect, useState } from "react";
import ConstructionShell, {
  ConstructionAlert,
  ConstructionEmpty,
  ConstructionField,
  ConstructionSection,
  ConstructionTable,
  constructionBtnPrimary,
  constructionBtnSecondary,
  constructionInput,
} from "@/components/construction/ConstructionShell";

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
    <ConstructionShell
      title="Contractors"
      subtitle="Maintain contractor master. Link to work activities via contractor_id."
      actions={[
        {
          label: "BOQ controls",
          href: "/construction/controls",
          icon: "ti ti-adjustments",
          primary: false,
        },
      ]}
    >
      {error && <ConstructionAlert>{error}</ConstructionAlert>}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Add contractor"
        description="Register name, contact, and GSTIN."
      >
        <form
          onSubmit={save}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <ConstructionField label="Name" required>
            <input
              className={constructionInput}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Phone">
            <input
              className={constructionInput}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Email">
            <input
              className={constructionInput}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="GSTIN">
            <input
              className={constructionInput}
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
            />
          </ConstructionField>
          <button
            type="submit"
            disabled={busy}
            className={constructionBtnPrimary}
          >
            Add contractor
          </button>
        </form>
      </ConstructionSection>

      <ConstructionSection title="Contractors">
        <ConstructionTable
          headers={["Name", "Phone", "GSTIN", "Active", ""]}
        >
          {records.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
              <td className="px-4 py-3 text-slate-600">{row.phone || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{row.gstin || "—"}</td>
              <td className="px-4 py-3 text-slate-600">
                {row.is_active ? "Yes" : "No"}
              </td>
              <td className="px-4 py-3">
                {row.is_active && (
                  <button
                    type="button"
                    disabled={busy}
                    className={constructionBtnSecondary}
                    onClick={() => deactivate(row.id)}
                  >
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!records.length && (
            <ConstructionEmpty colSpan={5} message="No contractors yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>

      <ConstructionSection
        title="BOQ variance (snapshot)"
        description="Latest variance rows from BOQ vs actuals."
      >
        <ConstructionTable
          headers={["Project", "Item", "Planned", "Actual", "Variance"]}
        >
          {variance.map((row) => (
            <tr key={row.boq_id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 text-slate-700">{row.project_name}</td>
              <td className="px-4 py-3 text-slate-700">
                {row.item_code || row.description?.slice(0, 40)}
              </td>
              <td className="px-4 py-3">{row.planned_qty}</td>
              <td className="px-4 py-3">{row.actual_qty}</td>
              <td className="px-4 py-3">{row.variance_qty}</td>
            </tr>
          ))}
          {!variance.length && (
            <ConstructionEmpty colSpan={5} message="No BOQ rows yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
