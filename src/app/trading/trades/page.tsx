'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TradesRedirect() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/boards');
        const data = await res.json();
        const boards = Array.isArray(data?.boards) ? data.boards : [];
        const tradingBoard = boards.find((b: any) => b.board_type === 'trading');
        if (tradingBoard?.id) {
          router.replace(`/trading/${tradingBoard.id}`);
          return;
        }
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: 'var(--muted)', fontSize: '14px' }}>
        Loading trades...
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: 'var(--muted)', fontSize: '14px' }}>
      No trading board found. Start trading from the Dashboard first.
    </div>
  );
}
