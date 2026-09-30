"use client";

const listeners = new Set();

export function subscribeNotifications(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event) {
  listeners.forEach((listener) => listener(event));
}

function toText(message) {
  if (message == null) return "Something needs your attention.";
  if (typeof message === "string") return message;
  if (message instanceof Error) return message.message || "Something went wrong.";
  return String(message);
}

const ERROR_WORDS =
  /\b(fail(ed|ure)?|error|unable|cannot|can't|could not|couldn't|invalid|denied|not allowed|forbidden|exceed(s|ed)?|insufficient|missing|expired|rejected)\b/i;
const SUCCESS_WORDS =
  /\b(success(fully)?|saved|created|updated|deleted|removed|approved|confirmed|submitted|completed|sent|copied|imported|exported|added|assigned|restored|generated|uploaded)\b/i;

/** Legacy alert() calls carry no type, so infer one from the wording. */
export function inferTone(message) {
  const text = toText(message);
  if (ERROR_WORDS.test(text)) return "error";
  if (SUCCESS_WORDS.test(text)) return "success";
  return "warning";
}

export function toast(message, { type, duration } = {}) {
  const text = toText(message);
  emit({
    kind: "toast",
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: type || inferTone(text),
    message: text,
    duration,
  });
}

toast.success = (message, options) => toast(message, { ...options, type: "success" });
toast.error = (message, options) => toast(message, { ...options, type: "error" });
toast.warning = (message, options) => toast(message, { ...options, type: "warning" });
toast.info = (message, options) => toast(message, { ...options, type: "info" });

/**
 * Promise-based replacement for window.confirm().
 * Falls back to the native dialog if the notification host isn't mounted.
 */
export function confirmDialog(
  message,
  { title = "Please confirm", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {},
) {
  if (!listeners.size) return Promise.resolve(window.confirm(toText(message)));
  return new Promise((resolve) => {
    emit({
      kind: "confirm",
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message: toText(message),
      title,
      confirmLabel,
      cancelLabel,
      danger,
      resolve,
    });
  });
}
