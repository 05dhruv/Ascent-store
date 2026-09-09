"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function SearchableMultiSelect({
  values = [],
  onChange,
  options = [],
  placeholder = "Select",
  searchPlaceholder = "Search...",
  selectionNoun = "items",
  className = "",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const normalizedOptions = useMemo(
    () =>
      options.map((option) =>
        typeof option === "string"
          ? { value: option, label: option }
          : {
              value: String(option.value ?? option.id ?? ""),
              label: String(option.label ?? option.name ?? ""),
              disabled: option.disabled,
            },
      ),
    [options],
  );
  const normalizedValues = useMemo(
    () => values.map((value) => String(value)),
    [values],
  );
  const selectedValues = useMemo(
    () => new Set(normalizedValues),
    [normalizedValues],
  );
  const selectedOptions = useMemo(
    () =>
      normalizedOptions.filter((option) => selectedValues.has(option.value)),
    [normalizedOptions, selectedValues],
  );
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return normalizedOptions;
    return normalizedOptions.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [normalizedOptions, query]);
  const selectableValues = useMemo(
    () =>
      normalizedOptions
        .filter((option) => !option.disabled && option.value)
        .map((option) => option.value),
    [normalizedOptions],
  );
  const allSelected =
    selectableValues.length > 0 &&
    selectableValues.every((value) => selectedValues.has(value));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const clickedInsideRoot =
        rootRef.current && rootRef.current.contains(event.target);
      const clickedInsideMenu =
        menuRef.current && menuRef.current.contains(event.target);
      if (!clickedInsideRoot && !clickedInsideMenu) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const updateCoords = () => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom, left: rect.left, width: rect.width });
  };

  useEffect(() => {
    if (!open) return undefined;
    updateCoords();
    const handleScrollAndResize = () => updateCoords();
    window.addEventListener("scroll", handleScrollAndResize, true);
    window.addEventListener("resize", handleScrollAndResize);
    return () => {
      window.removeEventListener("scroll", handleScrollAndResize, true);
      window.removeEventListener("resize", handleScrollAndResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
    else setQuery("");
  }, [open]);

  const toggleValue = (value) => {
    if (selectedValues.has(value)) {
      onChange(normalizedValues.filter((item) => item !== value));
    } else {
      onChange([...normalizedValues, value]);
    }
  };

  const selectionLabel =
    selectedOptions.length === 1
      ? selectedOptions[0].label
      : selectedOptions.length > 1
        ? `${selectedOptions.length} ${selectionNoun} selected`
        : placeholder;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {open ? (
        <div className="relative w-full">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            placeholder={selectionLabel}
            aria-label={searchPlaceholder}
            className="w-full rounded-lg border border-blue-500 bg-white px-3 py-2.5 pr-10 text-sm text-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close brand list"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            <svg
              className="h-4 w-4 rotate-180"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm text-gray-800 outline-none transition focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        >
          <span
            className={
              selectedOptions.length ? "truncate" : "truncate text-gray-400"
            }
          >
            {selectionLabel}
          </span>
          <svg
            className="h-4 w-4 shrink-0 text-gray-400"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      {open &&
        mounted &&
        createPortal(
          <div
            ref={menuRef}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
            style={{
              position: "fixed",
              top: `${coords.top + 4}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 99999,
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-xs">
              <span className="font-medium text-gray-500">
                {selectedOptions.length} selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onChange(selectableValues)}
                  disabled={allSelected || !selectableValues.length}
                  className="font-semibold text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-300"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  disabled={!selectedOptions.length}
                  className="font-semibold text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-300"
                >
                  Clear all
                </button>
              </div>
            </div>
            <div className="max-h-72 overflow-auto py-1" role="listbox">
              {filteredOptions.length ? (
                filteredOptions.map((option) => {
                  const checked = selectedValues.has(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      disabled={option.disabled}
                      onClick={() => toggleValue(option.value)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300 ${
                        checked
                          ? "bg-blue-50 font-semibold text-blue-700"
                          : "text-gray-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none h-4 w-4 shrink-0 accent-blue-600"
                      />
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-xs text-gray-400">
                  No matching brands
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
