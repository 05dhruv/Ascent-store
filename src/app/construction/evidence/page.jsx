"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function EvidencePage() {
  const [records, setRecords] = useState([]);
  const [limits, setLimits] = useState([]);
  const [documentedKeys, setDocumentedKeys] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    entityType: "transfer",
    entityId: "",
    fileUrl: "",
    fileName: "",
    signatureData: "",
  });
  const [limitForm, setLimitForm] = useState({
    roleName: "",
    permissionKey: "QC_APPROVE",
    maxAmount: "",
  });

  const load = async () => {
    setError("");
    try {
      const [ev, lim] = await Promise.all([
        fetch("/api/construction/evidence", { cache: "no-store" }),
        fetch("/api/construction/approval-limits", { cache: "no-store" }),
      ]);
      const ej = await ev.json();
      const lj = await lim.json();
      if (!ev.ok) throw new Error(ej.message || ej.error || "Unable to load evidence");
      setRecords(ej.data?.records || []);
      if (lim.ok) {
        setLimits(lj.data?.records || []);
        setDocumentedKeys(lj.data?.documentedPermissionKeys || []);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveEvidence = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/construction/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setForm({
        entityType: "transfer",
        entityId: "",
        fileUrl: "",
        fileName: "",
        signatureData: "",
      });
      setMessage("Evidence saved.");
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveLimit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/construction/approval-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limitForm),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setMessage("Approval limit saved.");
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
            Evidence & approvals
          </p>
          <h1 className="mt-1 text-2xl font-black">Movement evidence</h1>
          <p className="mt-1 text-sm text-slate-300">
            Attach file URL / signature metadata. Store references under{" "}
            <code className="text-amber-300">/uploads/…</code>. Documented keys:{" "}
            {documentedKeys.join(", ") || "SITE_RECEIVER, DISPATCHER, QC_APPROVE"}.
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
          onSubmit={saveEvidence}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2"
        >
          <input
            className={input}
            placeholder="Entity type (transfer, grn, …)"
            value={form.entityType}
            onChange={(e) => setForm({ ...form, entityType: e.target.value })}
            required
          />
          <input
            className={input}
            placeholder="Entity ID"
            value={form.entityId}
            onChange={(e) => setForm({ ...form, entityId: e.target.value })}
            required
          />
          <input
            className={input}
            placeholder="File URL or uploads/filename.pdf"
            value={form.fileUrl}
            onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
            required
          />
          <input
            className={input}
            placeholder="File name"
            value={form.fileName}
            onChange={(e) => setForm({ ...form, fileName: e.target.value })}
          />
          <textarea
            className={`${input} sm:col-span-2`}
            rows={2}
            placeholder="Optional signature data"
            value={form.signatureData}
            onChange={(e) =>
              setForm({ ...form, signatureData: e.target.value })
            }
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Save evidence
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">
                    {row.entity_type} #{row.entity_id}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      className="text-amber-700 underline"
                      href={row.file_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.file_name || row.file_url}
                    </a>
                    {row.signature_data ? " · signed" : ""}
                  </td>
                  <td className="px-3 py-2">{row.uploaded_by_name || "—"}</td>
                  <td className="px-3 py-2">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No evidence yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <section className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-black text-slate-900">Approval limits</h2>
          <form
            onSubmit={saveLimit}
            className="grid gap-3 sm:grid-cols-4"
          >
            <input
              className={input}
              placeholder="Role name"
              value={limitForm.roleName}
              onChange={(e) =>
                setLimitForm({ ...limitForm, roleName: e.target.value })
              }
              required
            />
            <select
              className={input}
              value={limitForm.permissionKey}
              onChange={(e) =>
                setLimitForm({ ...limitForm, permissionKey: e.target.value })
              }
            >
              {(documentedKeys.length
                ? documentedKeys
                : ["SITE_RECEIVER", "DISPATCHER", "QC_APPROVE"]
              ).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="Max amount"
              value={limitForm.maxAmount}
              onChange={(e) =>
                setLimitForm({ ...limitForm, maxAmount: e.target.value })
              }
              required
            />
            <button
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              Save limit
            </button>
          </form>
          <ul className="text-sm text-slate-600 space-y-1">
            {limits.map((l) => (
              <li key={l.id}>
                {l.role_name} · {l.permission_key} · ₹
                {Number(l.max_amount).toLocaleString("en-IN")}
              </li>
            ))}
            {!limits.length && (
              <li className="text-slate-400">No limits configured.</li>
            )}
          </ul>
        </section>
      </div>
    </MainLayout>
  );
}
