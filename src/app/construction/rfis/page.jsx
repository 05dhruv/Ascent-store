"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function RfisPage() {
  const [records, setRecords] = useState([]);
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

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/construction/rfis", { cache: "no-store" });
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
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-5 pb-10">
        <header className="rounded-2xl bg-slate-900 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            RFIs
          </p>
          <h1 className="mt-1 text-2xl font-black">Requests for information</h1>
          <p className="mt-1 text-sm text-slate-300">
            Raise site questions and record answers.
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
          onSubmit={create}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2"
        >
          <input
            className={input}
            placeholder="Project ID"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          />
          <input
            className={input}
            placeholder="RFI number"
            value={form.rfiNumber}
            onChange={(e) => setForm({ ...form, rfiNumber: e.target.value })}
          />
          <input
            className={`${input} sm:col-span-2`}
            placeholder="Subject"
            required
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <textarea
            className={`${input} sm:col-span-2`}
            rows={3}
            placeholder="Question"
            required
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
          />
          <button
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Raise RFI
          </button>
        </form>

        <form
          onSubmit={submitAnswer}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3"
        >
          <select
            className={input}
            required
            value={answerId}
            onChange={(e) => setAnswerId(e.target.value)}
          >
            <option value="">Select open RFI</option>
            {records
              .filter((r) => r.status === "open")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} {r.subject}
                </option>
              ))}
          </select>
          <input
            className={input}
            placeholder="Answer"
            required
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            Save answer
          </button>
        </form>

        <div className="space-y-3">
          {records.map((row) => (
            <div key={row.id} className="rounded-xl border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-slate-900">
                  {row.rfi_number ? `${row.rfi_number} · ` : ""}
                  {row.subject}
                </p>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase text-amber-800">
                  {row.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{row.question}</p>
              {row.answer && (
                <p className="mt-2 text-sm text-emerald-800">
                  Answer: {row.answer}
                </p>
              )}
            </div>
          ))}
          {!records.length && (
            <p className="py-8 text-center text-sm text-slate-400">No RFIs yet.</p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
