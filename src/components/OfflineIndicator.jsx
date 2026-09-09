'use client';

/**
 * OfflineIndicator
 *
 * A fixed floating pill in the bottom-right corner that communicates the
 * current offline / sync state to the cashier without interrupting billing.
 *
 * States:
 *   • Fully hidden  — online and nothing pending
 *   • Red pill      — offline (pending bills stored locally)
 *   • Amber spinner — syncing pending bills
 *   • Amber pill    — online but pending bills not yet synced
 */

import { useOfflineSync } from '@/contexts/OfflineSyncContext';

export default function OfflineIndicator() {
  const { isOnline, pendingCount, isSyncing, lastSyncTime, syncError } =
    useOfflineSync();

  // Nothing to show when fully up-to-date
  if (isOnline && pendingCount === 0 && !syncError) return null;

  const formattedTime = lastSyncTime
    ? new Date(lastSyncTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed bottom-5 right-5 z-[9999]
        flex items-center gap-2.5
        px-4 py-2.5 rounded-2xl shadow-xl
        text-[12.5px] font-semibold select-none
        transition-all duration-300
        ${!isOnline
          ? 'bg-red-600 text-white'
          : syncError
            ? 'bg-orange-50 border border-orange-200 text-orange-700'
            : 'bg-amber-50 border border-amber-200 text-amber-800'
        }
      `}
    >
      {/* Status dot / spinner */}
      {isSyncing ? (
        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
      ) : !isOnline ? (
        <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse flex-shrink-0" />
      ) : (
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${syncError ? 'bg-orange-500' : 'bg-amber-500'}`} />
      )}

      {/* Message */}
      <span>
        {!isOnline ? (
          <>
            Offline mode
            {pendingCount > 0 && (
              <span className="ml-1 opacity-80">
                — {pendingCount} bill{pendingCount !== 1 ? 's' : ''} queued
              </span>
            )}
          </>
        ) : isSyncing ? (
          <>Syncing {pendingCount} bill{pendingCount !== 1 ? 's' : ''}…</>
        ) : syncError ? (
          <>Sync error — will retry</>
        ) : (
          <>
            {pendingCount} bill{pendingCount !== 1 ? 's' : ''} pending sync
            {formattedTime && (
              <span className="ml-1 font-normal opacity-70">
                · last synced {formattedTime}
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}
