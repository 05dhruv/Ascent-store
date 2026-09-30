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

export default function QuarantinePage() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    batchId: "",
    storeId: "",
    productId: "",
    qty: "",
    reason: "",
  });

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/quarantine", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "Unable to load");
      setRecords(j.data?.records || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const requestRelease = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/construction/quarantine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: form.batchId || null,
          storeId: form.storeId || null,
          productId: form.productId || null,
          qty: Number(form.qty),
          reason: form.reason,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setForm({ batchId: "", storeId: "", productId: "", qty: "", reason: "" });
      setMessage("Release requested.");
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (id, status) => {
    setBusy(true);
    try {
      const r = await fetch("/api/construction/quarantine", {
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
      title="Quarantine releases"
      subtitle="Request and approve release of quarantined stock to usable inventory."
    >
      {error && (
        <ConstructionAlert>
          {error}{" "}
          <button type="button" className="underline" onClick={load}>
            Retry
          </button>
        </ConstructionAlert>
      )}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Request release"
        description="Specify batch, store, product, and quantity to release."
      >
        <form
          onSubmit={requestRelease}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <ConstructionField label="Batch ID">
            <input
              className={constructionInput}
              value={form.batchId}
              onChange={(e) => setForm({ ...form, batchId: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Store ID">
            <input
              className={constructionInput}
              value={form.storeId}
              onChange={(e) => setForm({ ...form, storeId: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Product ID">
            <input
              className={constructionInput}
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Qty" required>
            <input
              className={constructionInput}
              required
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Reason" className="sm:col-span-2">
            <input
              className={constructionInput}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </ConstructionField>
          <Button
            type="submit"
            disabled={busy}
          >
            Request release
          </Button>
        </form>
      </ConstructionSection>

      <ConstructionSection title="Release requests">
        <ConstructionTable
          headers={[
            "ID",
            "Product",
            "Store",
            "Qty",
            "Status",
            "Requested",
            "Actions",
          ]}
        >
          {records.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 text-slate-700">{row.id}</td>
              <td className="px-4 py-3 text-slate-700">
                {row.product_name || row.product_id || "—"}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {row.store_name || row.store_id || "—"}
              </td>
              <td className="px-4 py-3">{row.qty}</td>
              <td className="px-4 py-3 uppercase text-slate-600">{row.status}</td>
              <td className="px-4 py-3 text-slate-600">
                {row.requested_by_name || "—"}
              </td>
              <td className="px-4 py-3">
                {row.status === "pending" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => resolve(row.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      disabled={busy} variant="secondary"
                      onClick={() => resolve(row.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {!records.length && (
            <ConstructionEmpty
              colSpan={7}
              message="No quarantine release requests yet."
            />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
