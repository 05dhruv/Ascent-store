'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/home/master-dashboard');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f4ef]">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
        <p className="text-sm font-bold text-slate-700">Loading Construction Dashboard...</p>
      </div>
    </div>
  );
}
