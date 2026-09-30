"use client";
import Icon from "@/components/Icon";

import { useState } from "react";

function getLocationType(store) {
  return String(
    store?.location_type ||
      store?.locationType ||
      store?.meta?.locationType ||
      store?.meta?.location_type ||
      "",
  )
    .trim()
    .toLowerCase();
}

export default function DestinationPickerModal({ stores, onConfirm, onCancel }) {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");

  const filteredStores = (stores || []).filter((store) =>
    `${store.name || ""} ${store.id || ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-[17px] font-bold text-gray-900">
            Select Destination Warehouse
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Choose the warehouse for this bulk stock in. Direct stock-in to
            stores is not allowed.
          </p>
        </div>

        <div className="px-6 pb-2 pt-4">
          <input
            autoFocus
            type="text"
            placeholder="Search warehouse..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
          />
        </div>

        <div className="max-h-60 overflow-y-auto px-6 pb-2">
          {filteredStores.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No stores found.
            </p>
          ) : (
            <div className="space-y-1 py-1">
              {filteredStores.map((store) => {
                const locationType = getLocationType(store);
                const isWarehouse = locationType === "warehouse";
                const isSelected = String(store.id) === String(selectedId);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => setSelectedId(String(store.id))}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "border border-blue-300 bg-blue-50"
                        : "border border-transparent hover:bg-gray-50"
                    }`}
                  >
                    <div>
                      <span className="block text-sm font-medium text-gray-800">
                        {store.name}
                      </span>
                      <span className="block text-[11px] text-gray-400">
                        ID: {store.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {locationType && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            isWarehouse
                              ? "bg-purple-100 text-purple-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {isWarehouse ? "Warehouse" : locationType || "Store"}
                        </span>
                      )}
                      {isSelected && (
                        <Icon name="ti ti-check text-blue-600" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => onConfirm(selectedId)}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
