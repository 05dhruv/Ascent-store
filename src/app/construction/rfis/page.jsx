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

export default function RfisPage() {
  const list = usePagedList("/api/construction/rfis");
  const records = list.records;
  const [openRfis, setOpenRfis] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    subject: "",
    question: "",
    rfiNumber: "",
  });
  const [answerId, setAnswerId] = useState("");
  const [answer, setAnswer] = useState("");

  const loadOpen = async () => {
    try {
      const r = await fetch("/api/construction/rfis?status=open", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setOpenRfis(j.data?.records || []);
    } catch (e) {
      setError(e.message);
    }
  };

  const load = () => Promise.all([list.refresh(), loadOpen()]);

  useEffect(() => {
    loadOpen();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/construction/rfis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setForm({ projectId: form.projectId, subject: "", question: "", rfiNumber: "" });
      setMessage("RFI raised.");
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/construction/rfis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(answerId), answer, status: "answered" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      setAnswerId("");
      setAnswer("");
      setMessage("Answer saved.");
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConstructionShell loading={list.loading}
      title="Requests for information"
      subtitle="Raise site questions and record answers."
    >
      {(error || list.error) && <ConstructionAlert>{error || list.error}</ConstructionAlert>}
      {message && (
        <ConstructionAlert type="info">{message}</ConstructionAlert>
      )}

      <ConstructionSection
        title="Raise RFI"
        description="Open a new request for information on a project."
      >
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <ConstructionField label="Project ID">
            <input
              className={constructionInput}
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="RFI number">
            <input
              className={constructionInput}
              value={form.rfiNumber}
              onChange={(e) => setForm({ ...form, rfiNumber: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Subject" required className="sm:col-span-2">
            <input
              className={constructionInput}
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </ConstructionField>
          <ConstructionField label="Question" required className="sm:col-span-2">
            <textarea
              className={constructionInput}
              rows={3}
              required
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
            />
          </ConstructionField>
          <Button
            type="submit"
            disabled={busy}
          >
            Raise RFI
          </Button>
        </form>
      </ConstructionSection>

      <ConstructionSection
        title="Answer RFI"
        description="Select an open RFI and record the response."
      >
        <form
          onSubmit={submitAnswer}
          className="grid gap-3 sm:grid-cols-3"
        >
          <ConstructionField label="Open RFI" required>
            <select
              className={constructionInput}
              required
              value={answerId}
              onChange={(e) => setAnswerId(e.target.value)}
            >
              <option value="">Select open RFI</option>
              {openRfis.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} {r.subject}
                  </option>
                ))}
            </select>
          </ConstructionField>
          <ConstructionField label="Answer" required>
            <input
              className={constructionInput}
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </ConstructionField>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy}
            >
              Save answer
            </Button>
          </div>
        </form>
      </ConstructionSection>

      <ConstructionSection
        title="All RFIs"
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
          headers={["RFI", "Subject", "Status", "Question", "Answer"]}
          pagination={list.pagination}
        >
          {records.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 text-slate-700">
                {row.rfi_number || `#${row.id}`}
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {row.subject}
              </td>
              <td className="px-4 py-3 uppercase text-slate-600">{row.status}</td>
              <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                {row.question}
              </td>
              <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                {row.answer || "—"}
              </td>
            </tr>
          ))}
          {!records.length && (
            <ConstructionEmpty colSpan={5} message="No RFIs yet." />
          )}
        </ConstructionTable>
      </ConstructionSection>
    </ConstructionShell>
  );
}
