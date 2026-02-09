'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type TradingNavProps = {
  activeTab: 'dashboard' | 'board' | 'bots' | 'leaderboard' | 'portfolio' | 'journal';
};

const tabs = [
  { key: 'dashboard', label: 'Dashboard', href: '/trading' },
  { key: 'board', label: 'Board', href: '/trading' },
  { key: 'bots', label: 'Bots', href: '/bots' },
  { key: 'leaderboard', label: 'Leaderboard', href: '/leaderboard' },
  { key: 'portfolio', label: 'Portfolio', href: '/trading/portfolio' },
  { key: 'journal', label: 'Journal', href: '/trading/journal' },
];

export function TradingNav({ activeTab }: TradingNavProps) {
  const [boardHref, setBoardHref] = useState('/trading');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/v1/boards');
        const data = await res.json();
        const boards = Array.isArray(data?.boards) ? data.boards : [];
        const tradingBoard = boards.find((b: any) => b.board_type === 'trading');
        if (tradingBoard?.id) {
          setBoardHref(`/trading/${tradingBoard.id}`);
        }
      } catch {
      }
    };
    void load();
  }, []);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0 18px' }}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const href = tab.key === 'board' ? boardHref : tab.href;
        return (
          <Link
            key={tab.key}
            href={href}
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              border: '1px solid var(--border)',
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? '#0d0d1f' : 'var(--text)',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
