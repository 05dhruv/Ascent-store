"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

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
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-5 pb-10">
        <header className="rounded-2xl bg-slate-900 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Documents
          </p>
          <h1 className="mt-1 text-2xl font-black">Project documents</h1>
          <p className="mt-1 text-sm text-slate-300">
            Register drawings and docs with upload path references.
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
          onSubmit={save}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input
            className={input}
            placeholder="Project ID"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          />
          <input
            className={input}
            placeholder="Title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className={input}
            placeholder="Doc type"
            value={form.docType}
            onChange={(e) => setForm({ ...form, docType: e.target.value })}
          />
          <input
            className={input}
            placeholder="File URL / uploads/…"
            value={form.fileUrl}
            onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
          />
          <input
            className={input}
            placeholder="Revision"
            value={form.revision}
            onChange={(e) => setForm({ ...form, revision: e.target.value })}
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Add document
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Rev</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">File</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{row.title}</td>
                  <td className="px-3 py-2">{row.doc_type}</td>
                  <td className="px-3 py-2">{row.revision || "—"}</td>
                  <td className="px-3 py-2">{row.project_name || row.project_id || "—"}</td>
                  <td className="px-3 py-2">
                    {row.file_url ? (
                      <a
                        className="text-amber-700 underline"
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
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    No documents yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
