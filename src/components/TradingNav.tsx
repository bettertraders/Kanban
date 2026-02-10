'use client';

import Link from 'next/link';

type TradingNavProps = {
  activeTab: 'dashboard' | 'board' | 'bots' | 'leaderboard' | 'journal' | 'market';
};

const tabs = [
  { key: 'dashboard', label: 'Dashboard', href: '/trading' },
  { key: 'market', label: 'Market', href: '/trading/market' },
  { key: 'board', label: 'Trades', href: '/trading/trades' },
  // { key: 'bots', label: 'Active Bots', href: '/bots' },  // hidden for v1
  { key: 'leaderboard', label: 'Leaderboard', href: '/leaderboard' },
  { key: 'journal', label: 'Trade History', href: '/trading/history' },
];

export function TradingNav({ activeTab }: TradingNavProps) {
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
          border: '1px solid rgba(123,125,255,0.4)',
          background: 'rgba(123,125,255,0.1)',
          color: '#7b7dff',
          fontSize: '12px',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'all 0.2s ease',
          marginRight: '4px',
        }}
      >
        <img src="/icons/clawdesk-mark.png" alt="" style={{ width: '18px', height: '18px', borderRadius: '4px' }} />
        ClawDesk
      </Link>
      <div style={{ width: '1px', height: '20px', background: 'var(--border)', marginRight: '4px' }} />
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const href = tab.href;
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
