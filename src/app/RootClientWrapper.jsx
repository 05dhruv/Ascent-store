'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const AppProviders = dynamic(() => import('./AppProviders'), {
  ssr: false,
});

const PUBLIC_PATHS = ['/login'];
const PUBLIC_PREFIXES = ['/invoice/'];

export function RootClientWrapper({ children }) {
  const pathname = usePathname() || '';
  const isPublicRoute =
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isPublicRoute) return children;

  return <AppProviders>{children}</AppProviders>;
}
