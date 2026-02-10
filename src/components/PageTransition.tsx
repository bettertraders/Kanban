'use client';

import { usePathname } from 'next/navigation';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div key={pathname} style={{ opacity: 0, animation: 'pageFadeIn 0.25s ease forwards' }}>
        {children}
      </div>
      <style jsx global>{`
        @keyframes pageFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
