"use client";

import Button from "@/components/ui/Button";

import { useEffect, useState } from "react";
import { downloadFromUrl, usePagedList } from "@/hooks/usePagedList";
import ConstructionShell, {
  ConstructionAlert,
  ConstructionEmpty,
  ConstructionField,
  ConstructionSection,
  ConstructionTable,
  constructionInput,
} from "@/components/construction/ConstructionShell";

export default function ContractorsPage() {
  const list = usePagedList("/api/construction/contractors");
  const records = list.records;
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

  const loadVariance = async () => {
    setError("");
    try {
      const v = await fetch("/api/construction/boq-variance", { cache: "no-store" });
      const vj = await v.json();
      if (v.ok) setVariance((vj.data?.records || []).slice(0, 20));
    } catch (e) {
      setError(e.message);
    }
  };

  const load = () => list.refresh();

  useEffect(() => {
    loadVariance();
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
    <ConstructionShell loading={list.loading}
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
      {(error || list.error) && <ConstructionAlert>{error || list.error}</ConstructionAlert>}
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
          <Button
            type="submit"
            disabled={busy}
          >
            Add contractor
          </Button>
        </form>
      </ConstructionSection>

      <ConstructionSection
        title="Contractors"
        action={
          <Button
            variant="secondary"
            size="sm"
            icon="ti-download"
            onClick={() => downloadFromUrl(list.exportUrl())}
          >
            Download
          </Button>
        }
      >
        <ConstructionTable
          headers={["Name", "Phone", "GSTIN", "Active", ""]}
          pagination={list.pagination}
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
                  <Button
                    type="button"
                    disabled={busy} variant="secondary"
                    onClick={() => deactivate(row.id)}
                  >
                    Deactivate
                  </Button>
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
