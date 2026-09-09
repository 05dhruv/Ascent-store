"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MainLayout from "@/components/MainLayout";

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(value || 0));
}

export default function RiderDeliveriesPage() {
  const [rider, setRider] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [otpByOrder, setOtpByOrder] = useState({});
  const [mode, setMode] = useState("rider");
  const lastLocationSentAt = useRef(0);

  const loadOrders = useCallback(async () => {
    try {
      const response = await fetch("/api/delivery/orders", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || "Unable to load deliveries");
      }
      setRider(payload.data?.rider || null);
      setOrders(payload.data?.orders || []);
      setMode(payload.data?.mode || "rider");
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 15000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  async function patchOrder(orderId, action, extra = {}) {
    const response = await fetch("/api/delivery/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, action, ...extra }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || "Unable to update delivery");
    }
    return payload.data;
  }

  function currentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location is not supported on this device"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          }),
        () => reject(new Error("Allow location access to start delivery")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    });
  }

  async function startDelivery(order) {
    setBusyId(order.id);
    setError("");
    try {
      const location = await currentPosition();
      await patchOrder(order.id, "start_delivery", location);
      await patchOrder(order.id, "update_location", location);
      await loadOrders();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  async function completeDelivery(order) {
    const otp = String(otpByOrder[order.id] || "").trim();
    if (!/^\d{4}$/.test(otp)) {
      setError("Enter the 4 digit OTP from the customer");
      return;
    }
    setBusyId(order.id);
    setError("");
    try {
      await patchOrder(order.id, "deliver", { otp });
      await loadOrders();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  const isAdminView = mode === "admin";
  const activeOrder = isAdminView
    ? null
    : orders.find((order) => order.status === "dispatched");
  useEffect(() => {
    if (!activeOrder || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const now = Date.now();
        if (now - lastLocationSentAt.current < 8000) return;
        lastLocationSentAt.current = now;
        patchOrder(activeOrder.id, "update_location", {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }).catch(() => {});
      },
      () => setError("Keep location permission enabled during delivery"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeOrder?.id]);

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-5 pb-12">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-xs font-semibold uppercase text-red-700">
            Store delivery
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            My Deliveries
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {rider
              ? isAdminView
                ? `${rider.name} - viewing all assigned deliveries`
                : `${rider.name} - ${rider.storeName}`
              : "Loading rider profile..."}
          </p>
        </header>

        {error && (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-slate-500">
            Loading deliveries...
          </p>
        ) : orders.length === 0 ? (
          <div className="border border-dashed border-slate-300 py-14 text-center text-slate-500">
            No delivery is assigned right now.
          </div>
        ) : (
          orders.map((order) => {
            const address = order.delivery_address || {};
            const latitude = Number(address.latitude);
            const longitude = Number(address.longitude);
            const hasCoordinates =
              address.latitude != null &&
              address.latitude !== "" &&
              address.longitude != null &&
              address.longitude !== "" &&
              Number.isFinite(latitude) &&
              latitude >= -90 &&
              latitude <= 90 &&
              Number.isFinite(longitude) &&
              longitude >= -180 &&
              longitude <= 180;
            const destination = hasCoordinates
              ? `${latitude},${longitude}`
              : [address.line, address.city, address.state, address.pincode]
                  .filter(Boolean)
                  .join(", ");
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
            return (
              <article
                key={order.id}
                className="border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <small className="text-slate-500">
                      {order.order_number}
                    </small>
                    <h2 className="text-lg font-bold text-slate-900">
                      {address.name || order.account_name}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {address.phone || order.account_phone}
                    </p>
                    {isAdminView && (
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {[order.store_name, order.delivery_agent_name]
                          .filter(Boolean)
                          .join(" - ")}
                      </p>
                    )}
                  </div>
                  <b className="text-lg">{money(order.grand_total)}</b>
                </div>
                <p className="mt-4 text-sm font-medium text-slate-800">
                  {address.line}, {address.city} - {address.pincode}
                </p>
                {address.landmark && (
                  <p className="mt-1 text-sm text-slate-500">
                    Landmark: {address.landmark}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={`tel:${address.phone || order.account_phone}`}
                    className="border border-slate-300 px-4 py-2 text-sm font-semibold"
                  >
                    Call customer
                  </a>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-slate-300 px-4 py-2 text-sm font-semibold"
                  >
                    Open navigation
                  </a>
                </div>

                {isAdminView ? (
                  <div className="mt-5 border-t border-slate-200 pt-4 text-sm font-semibold text-slate-600">
                    Status: {order.status}
                  </div>
                ) : order.status === "billed" ? (
                  <button
                    type="button"
                    onClick={() => startDelivery(order)}
                    disabled={busyId === order.id}
                    className="mt-5 w-full bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {busyId === order.id
                      ? "Starting..."
                      : "Picked up - Start delivery"}
                  </button>
                ) : (
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <p className="mb-2 text-sm font-semibold text-emerald-700">
                      Live location sharing is active
                    </p>
                    <div className="flex gap-2">
                      <input
                        inputMode="numeric"
                        maxLength={4}
                        value={otpByOrder[order.id] || ""}
                        onChange={(event) =>
                          setOtpByOrder((current) => ({
                            ...current,
                            [order.id]: event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 4),
                          }))
                        }
                        placeholder="Delivery OTP"
                        className="min-w-0 flex-1 border border-slate-300 px-3 py-2"
                      />
                      <button
                        type="button"
                        onClick={() => completeDelivery(order)}
                        disabled={busyId === order.id}
                        className="bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                      >
                        Delivered
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </MainLayout>
  );
}
