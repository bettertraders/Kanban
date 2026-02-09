'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TradingNav } from '@/components/TradingNav';

type CoinPulse = {
  pair: string;
  price: number;
  change24h: number;
  volume24h: number;
};

type Bot = {
  id: number;
  name: string;
  status: string;
};

type Execution = {
  id: number;
  action: string;
  executed_at: string;
  bot_name?: string;
  board_name?: string;
};

type PortfolioStats = {
  summary?: {
    total_realized_pnl?: number;
    total_unrealized_pnl?: number;
  };
};

type LeaderboardEntry = {
  name: string;
  total_return: number;
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

function formatTime(ts: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TradingDashboardPage() {
  const [pulse, setPulse] = useState<CoinPulse[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [boardHref, setBoardHref] = useState('/trading');

  useEffect(() => {
    const load = async () => {
      try {
        const [coinsRes, botsRes, portfolioRes, leaderboardRes, execRes, boardsRes] = await Promise.all([
          fetch('/api/v1/prices?top=5'),
          fetch('/api/v1/bots'),
          fetch('/api/v1/portfolio'),
          fetch('/api/v1/leaderboard?period=1d'),
          fetch('/api/v1/bots/executions?limit=10'),
          fetch('/api/v1/boards'),
        ]);

        const coinsJson = await coinsRes.json();
        setPulse(Array.isArray(coinsJson?.coins) ? coinsJson.coins : []);

        const botsJson = await botsRes.json();
        setBots(Array.isArray(botsJson?.bots) ? botsJson.bots : []);

        const portfolioJson = await portfolioRes.json();
        setPortfolio(portfolioJson || null);

        const leaderboardJson = await leaderboardRes.json();
        setLeaderboard(Array.isArray(leaderboardJson?.leaderboard) ? leaderboardJson.leaderboard : []);

        const execJson = await execRes.json();
        setExecutions(Array.isArray(execJson?.executions) ? execJson.executions : []);

        const boardsJson = await boardsRes.json();
        const boards = Array.isArray(boardsJson?.boards) ? boardsJson.boards : [];
        const tradingBoard = boards.find((b: any) => b.board_type === 'trading');
        if (tradingBoard?.id) setBoardHref(`/trading/${tradingBoard.id}`);
      } catch {
        setPulse([]);
      }
    };
    void load();
  }, []);

  const runningBots = useMemo(() => bots.filter(b => b.status === 'running').length, [bots]);
  const totalPnl = useMemo(() => {
    const realized = Number(portfolio?.summary?.total_realized_pnl ?? 0);
    const unrealized = Number(portfolio?.summary?.total_unrealized_pnl ?? 0);
    return realized + unrealized;
  }, [portfolio]);
  const bestPerformer = leaderboard[0];

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/icons/clawdesk-mark.png" alt="" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>Trading Command Center</h1>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          Live Ops + Automation
        </div>
      </header>
      <TradingNav activeTab="dashboard" />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Total Bots', value: bots.length },
          { label: 'Running Bots', value: runningBots },
          { label: 'Total P&L', value: formatCurrency(totalPnl) },
          { label: 'Best Performer Today', value: bestPerformer ? `${bestPerformer.name} (${formatPercent(bestPerformer.total_return)})` : '—' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{stat.label}</div>
            <div style={{ marginTop: '10px', fontSize: '20px', fontWeight: 700 }}>{stat.value}</div>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', display: 'grid', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)' }}>Market Pulse</div>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Top 5</span>
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {pulse.map((coin) => (
              <div key={coin.pair} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                <div style={{ fontWeight: 600 }}>{coin.pair}</div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span>{formatCurrency(Number(coin.price))}</span>
                  <span style={{ color: Number(coin.change24h) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {formatPercent(Number(coin.change24h))}
                  </span>
                </div>
              </div>
            ))}
            {!pulse.length && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading prices...</span>}
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', display: 'grid', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)' }}>Quick Actions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <Link href="/bots" style={{ ...primaryBtnStyle, textDecoration: 'none' }}>Create Bot</Link>
            <Link href={boardHref} style={{ ...secondaryBtnStyle, textDecoration: 'none' }}>Start Paper Trading</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Board', href: boardHref },
              { label: 'Bots', href: '/bots' },
              { label: 'Leaderboard', href: '/leaderboard' },
              { label: 'Portfolio', href: '/trading/portfolio' },
              { label: 'Journal', href: '/trading/journal' },
            ].map((card) => (
              <Link key={card.label} href={card.href} style={{ textDecoration: 'none', color: 'var(--text)' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '10px', background: 'var(--panel-2)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{card.label}</div>
                  <div style={{ marginTop: '6px', fontSize: '13px', fontWeight: 600 }}>Open</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', display: 'grid', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)' }}>Recent Bot Activity</div>
          <div style={{ display: 'grid', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
            {executions.map((ex) => (
              <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{ex.bot_name || 'Bot'} · {ex.action}</div>
                  <div style={{ color: 'var(--muted)' }}>{ex.board_name || '—'}</div>
                </div>
                <div style={{ color: 'var(--muted)' }}>{formatTime(ex.executed_at)}</div>
              </div>
            ))}
            {!executions.length && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>No recent executions.</span>}
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
