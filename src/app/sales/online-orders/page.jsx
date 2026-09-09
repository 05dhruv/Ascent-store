'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';

const STATUS_LABELS = {
  pending_store_acceptance: 'New',
  accepted: 'Accepted',
  picking: 'Picking',
  packed: 'Packed',
  billed: 'Receipt generated',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const NEXT_ACTION = {
  pending_store_acceptance: { action: 'accept', label: 'Accept order' },
  accepted: { action: 'start_picking', label: 'Start picking' },
  picking: { action: 'mark_packed', label: 'Mark packed' },
  packed: { action: 'generate_receipt', label: 'Generate receipt' },
};

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function historyLabel(status) {
  return (
    {
      payment_pending: 'Payment started',
      pending_store_acceptance: 'Order received',
      accepted: 'Accepted',
      picking: 'Picking started',
      packed: 'Packed',
      billed: 'Receipt generated',
      dispatched: 'Dispatched',
      delivered: 'Delivered',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
    }[status] ||
    STATUS_LABELS[status] ||
    status
  );
}

function statusClass(status) {
  if (['rejected', 'cancelled'].includes(status)) return 'bg-red-50 text-red-700';
  if (status === 'delivered') return 'bg-emerald-50 text-emerald-700';
  if (status === 'pending_store_acceptance') return 'bg-amber-50 text-amber-800';
  return 'bg-blue-50 text-blue-700';
}

function paymentLabel(order) {
  if (order.payment_method === 'razorpay') {
    const method = order.payment_method_detail
      ? ` via ${order.payment_method_detail.toUpperCase()}`
      : '';
    return `Paid online${method}`;
  }
  return order.payment_method === 'upi_on_delivery'
    ? 'UPI on delivery'
    : 'Cash on delivery';
}

export default function OnlineOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [deliveryAgents, setDeliveryAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active');
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogReason, setDialogReason] = useState('');
  const [dialogError, setDialogError] = useState('');

  const loadOrders = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (filter === 'active') {
        params.set(
          'status',
          'pending_store_acceptance,accepted,picking,packed,billed,dispatched',
        );
      } else if (filter !== 'all') {
        params.set('status', filter);
      }
      const response = await fetch(`/api/ecommerce-orders?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Unable to load orders');
      }
      setOrders(payload.data?.orders || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadOrders();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  useEffect(() => {
    fetch('/api/delivery/agents', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success !== false) {
          setDeliveryAgents(payload.data?.agents || []);
        }
      })
      .catch(() => {});
  }, []);

  const pendingCount = useMemo(
    () => orders.filter((order) => order.status === 'pending_store_acceptance').length,
    [orders],
  );

  const filterLabel = useMemo(
    () =>
      (
        {
          active: 'active orders',
          pending_store_acceptance: 'new orders',
          packed: 'packed orders',
          delivered: 'delivered history',
          rejected: 'rejected history',
          all: 'order history',
        }[filter] || 'orders'
      ),
    [filter],
  );

  async function runAction(order, action, reason = '', extra = {}) {
    setBusyId(order.id);
    setError('');
    try {
      const response = await fetch('/api/ecommerce-orders', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, action, reason, ...extra }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Unable to update order');
      }
      await loadOrders();
      return { ok: true };
    } catch (requestError) {
      setError(requestError.message);
      return { ok: false, message: requestError.message };
    } finally {
      setBusyId(null);
    }
  }

  function requestAction(order, action) {
    if (action === 'reject' || action === 'generate_receipt') {
      setDialog({ order, action });
      setDialogReason('');
      setDialogError('');
      return;
    }
    runAction(order, action);
  }

  function closeDialog() {
    if (dialog && busyId === dialog.order.id) return;
    setDialog(null);
    setDialogReason('');
    setDialogError('');
  }

  async function confirmDialogAction() {
    if (!dialog) return;
    const reason = dialogReason.trim();
    if (dialog.action === 'reject' && !reason) {
      setDialogError('Enter a reason before rejecting this order.');
      return;
    }

    setDialogError('');
    const result = await runAction(dialog.order, dialog.action, reason);
    if (result.ok) {
      closeDialog();
    } else {
      setDialogError(result.message);
    }
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-red-700">Ecommerce operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Online Orders</h1>
          <p className="mt-1 text-sm text-slate-500">
            Accept, fulfil and bill website orders without changing the POS workflow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">
            {pendingCount} new
          </span>
          <button
            type="button"
            onClick={loadOrders}
            className="h-9 w-9 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            title="Refresh orders"
          >
            <i className="ti ti-refresh" />
          </button>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {[
          ['active', 'Active'],
          ['pending_store_acceptance', 'New'],
          ['packed', 'Packed'],
          ['delivered', 'Delivered'],
          ['rejected', 'Rejected'],
          ['all', 'All'],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setFilter(value)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              filter === value
                ? 'border-red-700 text-red-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="border border-dashed border-slate-300 py-16 text-center">
          <i className="ti ti-package text-3xl text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            No {filterLabel} in this view
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Use Delivered or All to review completed ecommerce orders.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const next = NEXT_ACTION[order.status];
            const address = order.delivery_address || {};
            const history = Array.isArray(order.status_history)
              ? order.status_history
              : [];
            return (
              <article key={order.id} className="border border-slate-200 bg-white">
                <div className="grid gap-4 border-b border-slate-100 px-4 py-3 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-slate-950">{order.order_number}</strong>
                      <span className={`px-2 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.store_name} · {new Date(order.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium text-slate-800">{address.name || order.account_name}</p>
                    <p className="text-slate-500">{address.phone || order.account_phone}</p>
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-slate-900">{money(order.grand_total)}</p>
                    <p className="text-slate-500">{paymentLabel(order)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {['accepted', 'picking', 'packed', 'billed'].includes(
                      order.status,
                    ) && (
                      <select
                        value={order.delivery_agent_id || ''}
                        disabled={busyId === order.id}
                        onChange={(event) => {
                          const agentId = Number(event.target.value);
                          if (agentId) {
                            runAction(order, 'assign_rider', '', { agentId });
                          }
                        }}
                        className="border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                        title="Assign store rider"
                      >
                        <option value="">Assign rider</option>
                        {deliveryAgents
                          .filter(
                            (agent) =>
                              Number(agent.storeId) === Number(order.store_id),
                          )
                          .map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                      </select>
                    )}
                    {order.status === 'pending_store_acceptance' && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => requestAction(order, 'reject')}
                        className="border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    )}
                    {next && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => requestAction(order, next.action)}
                        className="bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                      >
                        {busyId === order.id ? 'Working...' : next.label}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.5fr_1fr]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="text-xs uppercase text-slate-500">
                        <tr>
                          <th className="pb-2 font-medium">Product</th>
                          <th className="pb-2 font-medium">SKU</th>
                          <th className="pb-2 text-right font-medium">Qty</th>
                          <th className="pb-2 text-right font-medium">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item) => (
                          <tr key={item.id} className="border-t border-slate-100">
                            <td className="py-2 font-medium text-slate-800">{item.name}</td>
                            <td className="py-2 text-slate-500">{item.sku || item.barcode || '-'}</td>
                            <td className="py-2 text-right">{Number(item.qty)}</td>
                            <td className="py-2 text-right">{money(item.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-l-0 border-slate-200 text-sm lg:border-l lg:pl-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Delivery</p>
                    <p className="mt-2 font-medium text-slate-800">
                      {address.line}, {address.city} - {address.pincode}
                    </p>
                    {address.landmark && <p className="mt-1 text-slate-500">{address.landmark}</p>}
                    <p className="mt-3 text-slate-500">{order.delivery_slot || 'No slot selected'}</p>
                    {order.tbm_bill_number && (
                      <p className="mt-3 font-medium text-emerald-700">
                        Receipt: {order.tbm_bill_number}
                      </p>
                    )}
                    {order.rejection_reason && (
                      <p className="mt-3 text-red-700">Reason: {order.rejection_reason}</p>
                    )}
                    {history.length > 0 && (
                      <div className="mt-4 border-t border-slate-200 pt-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Order history
                        </p>
                        <div className="mt-2 space-y-2">
                          {history.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-start justify-between gap-3 text-xs"
                            >
                              <span className="font-medium text-slate-700">
                                {historyLabel(item.to_status)}
                              </span>
                              <span className="shrink-0 text-slate-400">
                                {formatDateTime(item.created_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </div>

      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="online-order-dialog-title"
            className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                    dialog.action === 'reject'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  <i
                    className={
                      dialog.action === 'reject'
                        ? 'ti ti-package-off text-xl'
                        : 'ti ti-receipt-2 text-xl'
                    }
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {dialog.order.order_number}
                  </p>
                  <h2
                    id="online-order-dialog-title"
                    className="mt-1 text-lg font-bold text-slate-950"
                  >
                    {dialog.action === 'reject'
                      ? 'Reject this order?'
                      : 'Generate final receipt?'}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={busyId === dialog.order.id}
                className="grid h-9 w-9 shrink-0 place-items-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                title="Close"
              >
                <i className="ti ti-x text-xl" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <p className="text-sm leading-6 text-slate-600">
                {dialog.action === 'reject'
                  ? 'The customer will see the order as rejected and its reserved stock will be released.'
                  : 'This creates the final TBM POS bill and deducts the packed items from store inventory.'}
              </p>

              <div className="grid grid-cols-2 gap-4 border-y border-slate-200 py-3 text-sm">
                <span>
                  <small className="block text-xs text-slate-500">Store</small>
                  <b className="mt-1 block text-slate-900">
                    {dialog.order.store_name}
                  </b>
                </span>
                <span className="text-right">
                  <small className="block text-xs text-slate-500">Order total</small>
                  <b className="mt-1 block text-slate-900">
                    {money(dialog.order.grand_total)}
                  </b>
                </span>
              </div>

              {dialog.action === 'reject' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">
                    Rejection reason
                  </span>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    autoFocus
                    value={dialogReason}
                    onChange={(event) => setDialogReason(event.target.value)}
                    placeholder="Example: Item unavailable at this store"
                    className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  />
                </label>
              )}

              {dialogError && (
                <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {dialogError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={closeDialog}
                disabled={busyId === dialog.order.id}
                className="min-h-10 border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Keep order
              </button>
              <button
                type="button"
                onClick={confirmDialogAction}
                disabled={busyId === dialog.order.id}
                className={`min-h-10 px-4 text-sm font-semibold text-white disabled:opacity-50 ${
                  dialog.action === 'reject'
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {busyId === dialog.order.id
                  ? 'Processing...'
                  : dialog.action === 'reject'
                    ? 'Reject order'
                    : 'Generate receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}

