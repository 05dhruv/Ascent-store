'use client';

import { useEffect, useRef, useState } from 'react';

function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export default function PasswordChangeWatcher() {
  const [approval, setApproval] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const seenApprovedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId = null;

    const checkStatus = async () => {
      let nextDelay = 30000;

      try {
        const res = await fetch('/api/auth/password-change-status', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const json = await res.json().catch(() => null);
        const data = json?.data || {};

        if (cancelled) return;

        if (data.forceLogout) {
          alert(data.message || 'Your new password is active. Please login again.');
          window.location.href = '/login';
          return;
        }

        if (data.status === 'approved') {
          seenApprovedRef.current = true;
          setApproval({
            secondsRemaining: Number(data.secondsRemaining || 0),
            effectiveAt: data.effectiveAt || null,
          });
          nextDelay = 1000;
        } else if (data.status !== 'pending' && !seenApprovedRef.current) {
          setApproval(null);
        }
      } catch {
        // Silent polling: auth status checks should not interrupt work.
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(checkStatus, nextDelay);
        }
      }
    };

    checkStatus();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  if (!approval) return null;

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="fixed bottom-4 right-4 z-[80] flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-[12px] font-semibold text-gray-800 shadow-lg hover:bg-amber-50"
        title="Password approval logout timer"
      >
        <i className="ti ti-clock-hour-4 text-[16px] text-amber-600" />
        <span>Logout in {formatCountdown(approval.secondsRemaining)}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <i className="ti ti-check text-[22px]" />
        </div>
        <h2 className="text-[17px] font-bold text-gray-900">Password request approved</h2>
        <p className="mt-2 text-[13px] leading-6 text-gray-600">
          Your password change request is approved. This ID will be logged out in{' '}
          <span className="font-semibold text-gray-900">{formatCountdown(approval.secondsRemaining)}</span>.
          Please login again with your new password after logout.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
        >
          Continue working
        </button>
      </div>
    </div>
  );
}
