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

export default function DocumentsPage() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    title: "",
    docType: "drawing",
    fileUrl: "",
    revision: "A",
  });

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/documents", { cache: "no-store" });
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
      const r = await fetch("/api/construction/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setMessage("Document registered.");
      setForm({
        projectId: form.projectId,
        title: "",
        docType: "drawing",
        fileUrl: "",
        revision: "A",
      });
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConstructionShell
      title="Project documents"
      subtitle="Register drawings and docs with upload path references."
    >
      {error && <ConstructionAlert>{error}</ConstructionAlert>}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Add document"
        description="Link a title, type, revision, and file URL to a project."
      >
        <form
          onSubmit={save}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <ConstructionField label="Project ID">
            <input
              className={constructionInput}
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Title" required>
            <input
              className={constructionInput}
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Doc type">
            <input
              className={constructionInput}
              value={form.docType}
              onChange={(e) => setForm({ ...form, docType: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="File URL">
            <input
              className={constructionInput}
              placeholder="/uploads/…"
              value={form.fileUrl}
              onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Revision">
            <input
              className={constructionInput}
              value={form.revision}
              onChange={(e) => setForm({ ...form, revision: e.target.value })}
            />
          </ConstructionField>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className={constructionBtnPrimary}
            >
              Add document
            </button>
          </div>
        </form>
      </ConstructionSection>

      <ConstructionSection title="Documents">
        <ConstructionTable
          headers={["Title", "Type", "Rev", "Project", "File"]}
        >
          {records.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-900">{row.title}</td>
              <td className="px-4 py-3 text-slate-600">{row.doc_type}</td>
              <td className="px-4 py-3 text-slate-600">{row.revision || "—"}</td>
              <td className="px-4 py-3 text-slate-600">
                {row.project_name || row.project_id || "—"}
              </td>
              <td className="px-4 py-3">
                {row.file_url ? (
                  <a
                    className="text-blue-600 underline"
                    href={row.file_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
          {!records.length && (
            <ConstructionEmpty colSpan={5} message="No documents yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
