"use client";

import Button from "@/components/ui/Button";

import { useState } from "react";
import { downloadFromUrl, usePagedList } from "@/hooks/usePagedList";
import ConstructionShell, {
  ConstructionAlert,
  ConstructionEmpty,
  ConstructionField,
  ConstructionSection,
  ConstructionTable,
  constructionInput,
} from "@/components/construction/ConstructionShell";

export default function EquipmentPage() {
  const list = usePagedList("/api/construction/equipment");
  const logs = list.records;
  const equipment = list.extra.equipment || [];
  const error = list.error;
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

  const load = () => list.refresh();

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
    <ConstructionShell loading={list.loading}
      title="Plant & equipment"
      subtitle="Register assets and log daily usage hours."
    >
      {error && <ConstructionAlert>{error}</ConstructionAlert>}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Add equipment"
        description="Register a plant or equipment asset."
      >
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            post({ type: "equipment", ...form });
          }}
        >
          <ConstructionField label="Asset code" required>
            <input
              className={constructionInput}
              required
              value={form.assetCode}
              onChange={(e) => setForm({ ...form, assetCode: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Name" required>
            <input
              className={constructionInput}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Category">
            <input
              className={constructionInput}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </ConstructionField>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy}
            >
              Add equipment
            </Button>
          </div>
        </form>
      </ConstructionSection>

      <ConstructionSection
        title="Log usage"
        description="Record hours used and operator for an asset."
      >
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            post({ type: "log", ...logForm });
          }}
        >
          <ConstructionField label="Equipment" required>
            <select
              className={constructionInput}
              required
              value={logForm.equipmentId}
              onChange={(e) =>
                setLogForm({ ...logForm, equipmentId: e.target.value })
              }
            >
              <option value="">Select equipment</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.asset_code} — {eq.name}
                </option>
              ))}
            </select>
          </ConstructionField>
          <ConstructionField label="Hours used">
            <input
              className={constructionInput}
              value={logForm.hoursUsed}
              onChange={(e) =>
                setLogForm({ ...logForm, hoursUsed: e.target.value })
              }
            />
          </ConstructionField>
          <ConstructionField label="Operator">
            <input
              className={constructionInput}
              value={logForm.operatorName}
              onChange={(e) =>
                setLogForm({ ...logForm, operatorName: e.target.value })
              }
            />
          </ConstructionField>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy}
            >
              Log usage
            </Button>
          </div>
        </form>
      </ConstructionSection>

      <ConstructionSection title="Assets">
        <ConstructionTable headers={["Asset", "Name", "Category", "Status"]}>
          {equipment.map((eq) => (
            <tr key={eq.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-900">
                {eq.asset_code}
              </td>
              <td className="px-4 py-3 text-slate-700">{eq.name}</td>
              <td className="px-4 py-3 text-slate-600">{eq.category || "—"}</td>
              <td className="px-4 py-3 uppercase text-slate-600">
                {eq.status || "—"}
              </td>
            </tr>
          ))}
          {!equipment.length && (
            <ConstructionEmpty colSpan={4} message="No equipment yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>

      <ConstructionSection
        title="Usage logs"
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
          headers={["Date", "Asset", "Hours", "Operator"]}
          pagination={list.pagination}
        >
          {logs.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 text-slate-700">{l.log_date || "—"}</td>
              <td className="px-4 py-3 text-slate-700">{l.asset_code || "—"}</td>
              <td className="px-4 py-3">{l.hours_used ?? "—"}</td>
              <td className="px-4 py-3 text-slate-600">
                {l.operator_name || "—"}
              </td>
            </tr>
          ))}
          {!logs.length && (
            <ConstructionEmpty colSpan={4} message="No logs yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
