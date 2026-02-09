'use client';

import { useEffect, useMemo, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';
import { PieChart } from '@/components/PieChart';

type PortfolioResponse = {
  summary?: {
    total_portfolio_value?: number;
    total_realized_pnl?: number;
    total_unrealized_pnl?: number;
    win_rate?: number;
    active_positions?: number;
    board_count?: number;
  };
  byCoin?: Array<{ coin_pair: string; total_trades: number; total_pnl: number }>;
};

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return `$${value.toFixed(decimals)}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

export default function TradingPortfolioPage() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [risk, setRisk] = useState(5);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/v1/portfolio');
        const json = await res.json();
        setData(json);
      } catch {
        setData(null);
      }
    };
    void load();
  }, []);

  const allocationData = useMemo(() => {
    if (!data?.byCoin?.length) return [];
    const colors = ['#7b7dff', '#00e676', '#ff9800', '#2196f3', '#e91e63', '#f5b544', '#44d9e6'];
    return data.byCoin.map((coin) => ({
      label: coin.coin_pair,
      value: Math.max(0, Number(coin.total_trades || 0)),
      color: colors[Math.abs(coin.coin_pair?.length ?? 0) % colors.length]
    }));
  }, [data]);

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '10px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>Trading Portfolio</h1>
        <div style={{ color: 'var(--muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          Allocation + Rebalancer
        </div>
      </header>
      <TradingNav activeTab="portfolio" />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Portfolio Value', value: formatCurrency(Number(data?.summary?.total_portfolio_value ?? 0)) },
          { label: 'Realized P&L', value: formatCurrency(Number(data?.summary?.total_realized_pnl ?? 0)) },
          { label: 'Unrealized P&L', value: formatCurrency(Number(data?.summary?.total_unrealized_pnl ?? 0)) },
          { label: 'Win Rate', value: formatPercent(Number(data?.summary?.win_rate ?? 0)) },
        ].map((stat) => (
          <div key={stat.label} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{stat.label}</div>
            <div style={{ marginTop: '10px', fontSize: '20px', fontWeight: 700 }}>{stat.value}</div>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: '12px' }}>
            Allocation Breakdown
          </div>
          {allocationData.length > 0 ? (
            <PieChart data={allocationData} size={200} centerLabel={`${allocationData.length} assets`} />
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No allocation data yet.</div>
          )}
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', display: 'grid', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)' }}>
            Rebalancer Controls
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Risk Level</label>
            <input
              type="range"
              min={1}
              max={10}
              value={risk}
              onChange={(e) => setRisk(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Target risk: {risk}/10</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button style={primaryBtnStyle}>Run Rebalance</button>
            <button style={secondaryBtnStyle}>Adjust Targets</button>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Automation hooks coming soon. Connect a bot to apply live allocations.
          </div>
        </div>
      </section>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
  color: '#0d0d1f',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '999px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '13px',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  padding: '10px 18px',
  borderRadius: '999px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '13px',
};
