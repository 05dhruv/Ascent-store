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

  const [file, setFile] = useState(null);

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
      let r;
      if (file) {
        const fd = new FormData();
        fd.set("entityType", form.entityType);
        fd.set("entityId", form.entityId);
        fd.set("file", file);
        if (form.fileName) fd.set("fileName", form.fileName);
        if (form.signatureData) fd.set("signatureData", form.signatureData);
        if (form.fileUrl) fd.set("fileUrl", form.fileUrl);
        r = await fetch("/api/construction/evidence", {
          method: "POST",
          body: fd,
        });
      } else {
        r = await fetch("/api/construction/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setForm({
        entityType: "transfer",
        entityId: "",
        fileUrl: "",
        fileName: "",
        signatureData: "",
      });
      setFile(null);
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
    <ConstructionShell
      title="Movement evidence"
      subtitle={`Upload photos/PDFs or paste a URL. Signatures accepted as data URLs and stored under /uploads/…. Limits: ${documentedKeys.join(", ") || "SITE_RECEIVER, DISPATCHER, QC_APPROVE"}.`}
    >
      {error && <ConstructionAlert>{error}</ConstructionAlert>}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Save evidence"
        description="Attach a file or URL to a transfer, GRN, or other entity."
      >
        <form
          onSubmit={saveEvidence}
          className="grid gap-3 sm:grid-cols-2"
        >
          <ConstructionField label="Entity type" required>
            <input
              className={constructionInput}
              placeholder="transfer, grn, …"
              value={form.entityType}
              onChange={(e) => setForm({ ...form, entityType: e.target.value })}
              required
            />
          </ConstructionField>
          <ConstructionField label="Entity ID" required>
            <input
              className={constructionInput}
              value={form.entityId}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })}
              required
            />
          </ConstructionField>
          <ConstructionField label="Upload file">
            <input
              className={constructionInput}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </ConstructionField>
          <ConstructionField label="Or file URL" required={!file}>
            <input
              className={constructionInput}
              placeholder="/uploads/filename.pdf"
              value={form.fileUrl}
              onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
              required={!file}
            />
          </ConstructionField>
          <ConstructionField label="File name">
            <input
              className={constructionInput}
              value={form.fileName}
              onChange={(e) => setForm({ ...form, fileName: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Signature data URL" className="sm:col-span-2">
            <textarea
              className={constructionInput}
              rows={2}
              placeholder="data:image/png;base64,…"
              value={form.signatureData}
              onChange={(e) =>
                setForm({ ...form, signatureData: e.target.value })
              }
            />
          </ConstructionField>
          <button
            type="submit"
            disabled={busy}
            className={constructionBtnPrimary}
          >
            Save evidence
          </button>
        </form>
      </ConstructionSection>

      <ConstructionSection title="Evidence records">
        <ConstructionTable headers={["Entity", "File", "By", "When"]}>
          {records.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 text-slate-700">
                {row.entity_type} #{row.entity_id}
              </td>
              <td className="px-4 py-3">
                <a
                  className="text-blue-600 underline"
                  href={row.file_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.file_name || row.file_url}
                </a>
                {row.signature_data ? " · signed" : ""}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.uploaded_by_name || "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.created_at
                  ? new Date(row.created_at).toLocaleString()
                  : "—"}
              </td>
            </tr>
          ))}
          {!records.length && (
            <ConstructionEmpty colSpan={4} message="No evidence yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>

      <ConstructionSection
        title="Approval limits"
        description="Set max amounts by role and permission key."
      >
        <form
          onSubmit={saveLimit}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <ConstructionField label="Role name" required>
            <input
              className={constructionInput}
              value={limitForm.roleName}
              onChange={(e) =>
                setLimitForm({ ...limitForm, roleName: e.target.value })
              }
              required
            />
          </ConstructionField>
          <ConstructionField label="Permission key">
            <select
              className={constructionInput}
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
          </ConstructionField>
          <ConstructionField label="Max amount" required>
            <input
              className={constructionInput}
              value={limitForm.maxAmount}
              onChange={(e) =>
                setLimitForm({ ...limitForm, maxAmount: e.target.value })
              }
              required
            />
          </ConstructionField>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className={constructionBtnPrimary}
            >
              Save limit
            </button>
          </div>
        </form>
        <ul className="mt-4 space-y-1 text-[13px] text-slate-600">
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
      </ConstructionSection>
    </ConstructionShell>
  );
}
