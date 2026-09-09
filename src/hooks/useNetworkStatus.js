'use client';

import { useState, useEffect } from 'react';

/**
 * useNetworkStatus
 *
 * Returns true when the browser reports it has network access.
 *
 * Uses both navigator.onLine (fast, fires on NIC events) and a lightweight
 * server health-check poll (catches captive portals and DNS-only outages that
 * navigator.onLine misses).
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Sync with the browser's current state on mount
    setIsOnline(navigator.onLine);

    const markOnline  = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);

    window.addEventListener('online',  markOnline);
    window.addEventListener('offline', markOffline);

    // Optional: real connectivity check every 20 s.
    const probeHealth = async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'HEAD',
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) {
          setIsOnline(true);
          return;
        }

        const fallbackResponse = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        });
        setIsOnline(fallbackResponse.ok);
      } catch {
        setIsOnline(false);
      }
    };

    probeHealth();
    const probe = setInterval(probeHealth, 30_000);

    return () => {
      window.removeEventListener('online',  markOnline);
      window.removeEventListener('offline', markOffline);
      clearInterval(probe);
    };
  }, []);

  return isOnline;
}
