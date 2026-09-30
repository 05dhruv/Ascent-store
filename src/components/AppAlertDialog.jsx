'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from "@/components/Icon";
import { subscribeNotifications, toast } from "@/lib/notify";

const TONES = {
  success: { icon: 'ti-circle-check', bar: 'bg-emerald-500', iconClass: 'text-emerald-600', title: 'Done' },
  error: { icon: 'ti-alert-circle', bar: 'bg-red-500', iconClass: 'text-red-600', title: 'Something went wrong' },
  warning: { icon: 'ti-alert-triangle', bar: 'bg-amber-500', iconClass: 'text-amber-600', title: 'Please check' },
  info: { icon: 'ti-bell', bar: 'bg-sky-500', iconClass: 'text-sky-600', title: 'Notice' },
};

const DURATIONS = { success: 3500, info: 5000, warning: 6000, error: 9000 };
const MAX_TOASTS = 4;

function Toast({ item, onDismiss }) {
  const tone = TONES[item.type] || TONES.info;
  const timer = useRef(null);
  const onClose = useCallback(() => onDismiss(item.id), [item.id, onDismiss]);
  const start = useCallback(() => {
    timer.current = setTimeout(onClose, item.duration || DURATIONS[item.type] || 5000);
  }, [item.duration, item.type, onClose]);

  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
  }, [start]);

  return (
    <div
      role={item.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={start}
      className="pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-3 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden="true" />
      <Icon name={tone.icon} className={`mt-0.5 text-[20px] ${tone.iconClass}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900">{tone.title}</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">
          {item.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss notification"
      >
        <Icon name="ti-x" className="text-[16px]" />
      </button>
    </div>
  );
}

function ConfirmDialog({ item, onDone }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDone(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-message"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              item.danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            <Icon name={item.danger ? 'ti-alert-triangle' : 'ti-help-circle'} className="text-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="app-confirm-title" className="text-[15px] font-bold text-slate-900">
              {item.title}
            </h2>
            <p id="app-confirm-message" className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-slate-600">
              {item.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3.5">
          <button type="button" className="ui-button ui-button--secondary" onClick={() => onDone(false)}>
            {item.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`ui-button ${item.danger ? 'ui-button--danger' : 'ui-button--accent'}`}
            onClick={() => onDone(true)}
          >
            {item.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** App-wide host for toasts and confirm dialogs. Also turns legacy window.alert() calls into toasts. */
export default function AppAlertDialog() {
  const [toasts, setToasts] = useState([]);
  const [confirms, setConfirms] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeNotifications((event) => {
      if (event.kind === 'toast') {
        setToasts((items) => {
          if (items.some((existing) => existing.message === event.message)) return items;
          return [...items, event].slice(-MAX_TOASTS);
        });
      } else if (event.kind === 'confirm') {
        setConfirms((items) => [...items, event]);
      }
    });

    const originalAlert = window.alert;
    window.alert = (message) => toast(message);

    return () => {
      unsubscribe();
      window.alert = originalAlert;
    };
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const current = confirms[0];
  const finishConfirm = useCallback(
    (result) => {
      current?.resolve(result);
      setConfirms((items) => items.slice(1));
    },
    [current],
  );

  return (
    <>
      <div
        className="pointer-events-none fixed right-4 top-[68px] z-[10001] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <Toast key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
      {current ? <ConfirmDialog key={current.id} item={current} onDone={finishConfirm} /> : null}
    </>
  );
}
