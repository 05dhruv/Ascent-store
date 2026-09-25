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

export default function RaBillsPage() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    billNumber: "",
    contractorId: "",
    description: "",
    qty: "",
    rate: "",
    retentionAmount: "0",
  });

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/ra-bills", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setRecords(j.data?.records || []);
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
      const qty = Number(form.qty || 0);
      const rate = Number(form.rate || 0);
      const r = await fetch("/api/construction/ra-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          billNumber: form.billNumber,
          contractorId: form.contractorId || null,
          retentionAmount: Number(form.retentionAmount || 0),
          lineItems: [
            {
              description: form.description || "Work item",
              qty,
              rate,
              amount: qty * rate,
            },
          ],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setMessage("RA bill created.");
      setForm({
        ...form,
        billNumber: "",
        description: "",
        qty: "",
        rate: "",
      });
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    setBusy(true);
    try {
      const r = await fetch("/api/construction/ra-bills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
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
      title="RA bills"
      subtitle="Running account bills with line items and retention."
    >
      {error && <ConstructionAlert>{error}</ConstructionAlert>}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Create RA bill"
        description="Enter project, bill number, line item, and retention."
      >
        <form
          onSubmit={save}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <ConstructionField label="Project ID" required>
            <input
              className={constructionInput}
              required
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Bill number" required>
            <input
              className={constructionInput}
              required
              value={form.billNumber}
              onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Contractor ID">
            <input
              className={constructionInput}
              value={form.contractorId}
              onChange={(e) =>
                setForm({ ...form, contractorId: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Line description">
            <input
              className={constructionInput}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Qty">
            <input
              className={constructionInput}
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Rate">
            <input
              className={constructionInput}
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Retention">
            <input
              className={constructionInput}
              value={form.retentionAmount}
              onChange={(e) =>
                setForm({ ...form, retentionAmount: e.target.value })
              }
            />
          </ConstructionField>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className={constructionBtnPrimary}
            >
              Create RA bill
            </button>
          </div>
        </form>
      </ConstructionSection>

      <ConstructionSection title="RA bills">
        <ConstructionTable
          headers={["Bill", "Project", "Gross", "Net", "Status", "Actions"]}
        >
          {records.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-900">
                {row.bill_number}
              </td>
              <td className="px-4 py-3 text-slate-700">{row.project_name}</td>
              <td className="px-4 py-3 text-slate-700">
                ₹{Number(row.gross_amount || 0).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3 text-slate-700">
                ₹{Number(row.net_amount || 0).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3 uppercase text-slate-600">{row.status}</td>
              <td className="px-4 py-3">
                {row.status === "draft" && (
                  <button
                    type="button"
                    disabled={busy}
                    className={constructionBtnSecondary}
                    onClick={() => setStatus(row.id, "submitted")}
                  >
                    Submit
                  </button>
                )}
                {row.status === "submitted" && (
                  <button
                    type="button"
                    disabled={busy}
                    className={constructionBtnPrimary}
                    onClick={() => setStatus(row.id, "approved")}
                  >
                    Approve
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!records.length && (
            <ConstructionEmpty colSpan={6} message="No RA bills yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
