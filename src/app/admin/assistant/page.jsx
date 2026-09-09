"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";

const quickPrompts = [
  "Tata Tea Premium 1kg",
  "Show Tata Tea Premium 1kg stock in store 2",
  "Show today's employee sales performance",
  "Show top cashier for the last 7 days",
  "Show employee activity from yesterday",
  "Show near-expiry product risk",
];

const initialBotMessage = {
  role: "assistant",
  title: "Admin Assistant",
  answer:
    "Ready for Super Admin. Enter a product name, SKU, or barcode to view store-wise stock, pricing, batch, and expiry details.",
  cards: [
    { label: "Sales", value: "employee wise" },
    { label: "Activity", value: "audit logs" },
    { label: "Expiry", value: "risk view" },
  ],
};

function StatusBadge({ value }) {
  const status = String(value || "").toLowerCase();
  const tone = status.includes("out")
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : status.includes("low")
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ring-1 ${tone}`}
    >
      {value}
    </span>
  );
}

function AssistantResult({ message, onSelectProduct }) {
  const columns = message.table?.columns || [];
  const rows = message.table?.rows || [];
  const isProduct = message.title === "Product inventory lookup";
  const needsProductChoice = message.title === "Choose a product";

  return (
    <div className="space-y-4">
      {message.title ? (
        <h3 className="text-[15px] font-semibold text-slate-950">
          {message.title}
        </h3>
      ) : null}
      <p className="text-[13.5px] leading-6 text-slate-700">{message.answer}</p>

      {message.cards?.length ? (
        <div
          className={`grid gap-3 ${isProduct ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}
        >
          {message.cards.map((card) => (
            <div
              key={`${card.label}-${card.value}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
            >
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                {card.label}
              </div>
              <div className="mt-1 break-words text-[15px] font-bold text-indigo-600">
                {card.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {needsProductChoice && rows.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <button
              key={`${row.Product}-${row.SKU}-${row.Barcode}`}
              type="button"
              onClick={() => onSelectProduct(row)}
              className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <div className="font-semibold text-slate-900">{row.Product}</div>
              <div className="mt-1 text-xs text-slate-500">
                SKU: {row.SKU} · Barcode: {row.Barcode}
              </div>
              <div className="mt-2 text-[11px] font-medium text-indigo-600">
                View store-wise details →
              </div>
            </button>
          ))}
        </div>
      ) : rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-[12.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap px-3 py-3 font-semibold"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {rows.map((row, index) => (
                <tr
                  key={`${index}-${columns.map((column) => row[column]).join("-")}`}
                >
                  {columns.map((column) => (
                    <td key={column} className="whitespace-nowrap px-3 py-3">
                      {column === "Status" ? (
                        <StatusBadge value={row[column]} />
                      ) : (
                        (row[column] ?? "-")
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {message.links?.length ? (
        <div className="flex flex-wrap gap-2">
          {message.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-indigo-200 px-3 py-2 text-[12px] font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminAssistantPage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([initialBotMessage]);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lastProduct, setLastProduct] = useState("");
  const conversationRef = useRef(null);
  const inputRef = useRef(null);

  const isSuperAdmin = useMemo(
    () => user?.role === "super_admin" || user?.permissions?.includes("*"),
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setUser(json?.data?.user || null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/stores", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) =>
        setStores(json?.data?.stores || json?.data?.records || []),
      )
      .catch(() => setStores([]));
  }, [isSuperAdmin]);

  useEffect(() => {
    const term = input.trim();
    if (
      term.length < 2 ||
      /\b(sales?|employee|activity|expiry|audit|cashier)\b/i.test(term)
    ) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const params = new URLSearchParams({
          search: term,
          pageSize: "6",
          is_active: "true",
        });
        if (selectedStoreId) params.set("store_id", selectedStoreId);
        const res = await fetch(`/api/catalog/products?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        setSuggestions(json?.success ? json?.data?.records || [] : []);
        setShowSuggestions(true);
      } catch (error) {
        if (error.name !== "AbortError") setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input, selectedStoreId]);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [messages, loading]);

  async function askAssistant(prompt = input) {
    let message = prompt.trim();
    if (!message || loading) return;

    if (
      lastProduct &&
      /^(?:sirf|only|show|dikhao|batao)?\s*(?:store|at|price|batch|expiry|stock|qty|quantity)\b/i.test(
        message,
      )
    ) {
      message = `${lastProduct} ${message}`;
    }

    if (selectedStoreId && !/\b(?:store|at)\s*#?\s*\d+\b/i.test(message)) {
      message = `${message} store ${selectedStoreId}`;
    }

    setInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    setLoading(true);
    setMessages((current) => [{ role: "user", answer: message }, ...current]);

    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Assistant failed");
      }
      const productCard = json?.data?.cards?.find(
        (card) => card.label === "Product",
      );
      if (productCard?.value) setLastProduct(String(productCard.value));
      setMessages((current) => [
        current[0],
        { role: "assistant", ...json.data },
        ...current.slice(1),
      ]);
    } catch (err) {
      setMessages((current) => [
        current[0],
        {
          role: "assistant",
          title: "Unable to answer",
          answer:
            err.message ||
            "The data could not be fetched. Please try again in a moment.",
        },
        ...current.slice(1),
      ]);
    } finally {
      setLoading(false);
    }
  }

  function chooseProduct(product) {
    const exactIdentifier =
      product.barcode || product.sku || product.product_id || product.name;
    setInput(String(exactIdentifier));
    setSuggestions([]);
    setShowSuggestions(false);
    askAssistant(String(exactIdentifier));
  }

  function chooseAmbiguousProduct(row) {
    chooseProduct({
      barcode: row.Barcode !== "-" ? row.Barcode : "",
      sku: row.SKU !== "-" ? row.SKU : "",
      name: row.Product,
    });
  }

  if (authLoading) {
    return (
      <MainLayout>
        <div className="p-6 text-sm text-slate-500">Loading assistant...</div>
      </MainLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <MainLayout>
        <div className="mx-auto mt-10 max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">Access denied</h1>
          <p className="mt-2 text-sm text-slate-600">
            Admin Assistant is available to Super Admin users only.
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-[calc(100vh-110px)] bg-slate-50 px-3 py-4 sm:px-5 sm:py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 md:flex-row md:items-end">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">
                Super Admin
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                Admin Assistant
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Ask in English, Hindi, or Hinglish. The assistant will always
                respond in English with store-wise stock and product details.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <label className="min-w-52">
                <span className="sr-only">Filter by store</span>
                <select
                  value={selectedStoreId}
                  onChange={(event) => setSelectedStoreId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">All stores</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} (#{store.id})
                    </option>
                  ))}
                </select>
              </label>
              <Link
                href="/inventory/expiry-alerts"
                className="rounded-lg border border-indigo-200 px-4 py-2 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                Near Expiry
              </Link>
            </div>
          </div>

          <div className="grid gap-4 lg:min-h-[620px] lg:grid-cols-[280px_1fr]">
            <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-[13px] font-bold text-slate-950">
                Quick questions
              </h2>
              <div className="mt-3 space-y-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => askAssistant(prompt)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-3 text-left text-[12.5px] font-medium text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-lg bg-slate-50 p-3 text-[12px] leading-5 text-slate-600">
                You can enter only the product name. Use an SKU or barcode for
                the most precise match. Filter with a store number or exact
                store name.
              </div>
            </aside>

            <section className="flex min-h-[520px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm lg:min-h-[620px]">
              <div
                ref={conversationRef}
                className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4"
              >
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={
                        message.role === "user"
                          ? "max-w-[90%] rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white sm:max-w-[78%]"
                          : "max-w-full rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm sm:max-w-[94%]"
                      }
                    >
                      {message.role === "user" ? (
                        message.answer
                      ) : (
                        <AssistantResult
                          message={message}
                          onSelectProduct={chooseAmbiguousProduct}
                        />
                      )}
                    </div>
                  </div>
                ))}
                {loading ? (
                  <div className="flex justify-start">
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                      fetching the data...
                    </div>
                  </div>
                ) : null}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  askAssistant();
                }}
                className="order-first border-b border-slate-200 bg-white p-3 sm:p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </div>
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(event) => {
                        setInput(event.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setShowSuggestions(false);
                      }}
                      autoComplete="off"
                      placeholder="Product name, SKU/barcode, store-wise stock, sales, activity..."
                      className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-12 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                    {input ? (
                      <button
                        type="button"
                        onClick={() => {
                          setInput("");
                          setSuggestions([]);
                          inputRef.current?.focus();
                        }}
                        className="absolute inset-y-0 right-0 px-4 text-lg text-slate-400 hover:text-slate-700"
                        aria-label="Clear search"
                      >
                        ×
                      </button>
                    ) : null}
                    {showSuggestions &&
                    (suggestionsLoading || suggestions.length > 0) ? (
                      <div className="absolute top-full z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                        {suggestionsLoading ? (
                          <div className="px-3 py-3 text-xs text-slate-500">
                            Searching products...
                          </div>
                        ) : null}
                        {suggestions.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => chooseProduct(product)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-indigo-50"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                              {String(product.name || "P")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {product.name}
                              </div>
                              <div className="truncate text-[11px] text-slate-500">
                                SKU: {product.sku || product.product_id || "-"}{" "}
                                · Barcode: {product.barcode || "-"}
                              </div>
                            </div>
                            <div className="text-right text-xs">
                              <div className="font-bold text-indigo-600">
                                ₹
                                {Number(
                                  product.selling_price || 0,
                                ).toLocaleString("en-IN")}
                              </div>
                              <div className="text-slate-400">
                                Qty{" "}
                                {Number(
                                  product.actual_stock || 0,
                                ).toLocaleString("en-IN")}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                  >
                    Ask
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
