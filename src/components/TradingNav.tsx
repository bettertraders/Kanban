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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0 18px', alignItems: 'center' }}>
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '999px',
          border: '1px solid rgba(34,197,94,0.4)',
          background: 'rgba(34,197,94,0.1)',
          color: '#22c55e',
          fontSize: '12px',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'all 0.2s ease',
          marginRight: '4px',
        }}
      >
        <img src="/icons/clawdesk-mark.png" alt="" style={{ width: '18px', height: '18px', borderRadius: '4px', filter: 'hue-rotate(90deg) saturate(1.5) brightness(1.2)' }} />
        ClawDesk
      </Link>
      <div style={{ width: '1px', height: '20px', background: 'var(--border)', marginRight: '4px' }} />
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
