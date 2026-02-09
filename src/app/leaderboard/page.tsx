'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TradingNav } from '@/components/TradingNav';

type LeaderboardEntry = {
  bot_id: number;
  name: string;
  strategy_style: string;
  strategy_substyle: string;
  total_return: number;
  win_rate: number;
  total_trades: number;
  sharpe_ratio: number;
  status?: string;
  auto_trade?: boolean;
  owner?: string;
  balance?: number;
};

const PERIODS = ['1d', '7d', '10d', '30d', 'All'];

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [period, setPeriod] = useState('7d');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const param = period === 'All' ? '' : `?period=${period}`;
        const res = await fetch(`/api/v1/leaderboard${param}`);
        const json = await res.json();
        setEntries(Array.isArray(json?.leaderboard) ? json.leaderboard : []);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [period]);

  const podium = entries.slice(0, 3);

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/icons/clawdesk-mark.png" alt="" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>Bot Leaderboard</h1>
            <div style={{ color: 'var(--muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
              Performance Overview
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                background: p === period ? 'var(--accent)' : 'transparent',
                color: p === period ? '#0d0d1f' : 'var(--text)',
                border: '1px solid var(--border)',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </header>
      <TradingNav activeTab="leaderboard" />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {podium.map((entry, index) => {
          const heights = ['120px', '150px', '100px'];
          const colors = ['#f5b544', '#9aa4b8', '#c57c4b'];
          return (
            <div key={entry.bot_id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>#{index + 1}</div>
              <div style={{ fontSize: '16px', fontWeight: 700, margin: '8px 0' }}>{entry.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{entry.strategy_style} — {entry.strategy_substyle}</div>
              <div style={{ height: heights[index], marginTop: '14px', background: colors[index], borderRadius: '12px', opacity: 0.8 }} />
              <div style={{ marginTop: '10px', fontWeight: 600, color: toNumber(entry.total_return) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {formatPercent(toNumber(entry.total_return))}
              </div>
            </div>
          );
        })}
      </section>

      <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
        {loading ? (
          <div style={{ color: 'var(--muted)' }}>Loading leaderboard...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  {['Rank', 'Bot Name', 'Strategy', 'Owner', 'Balance', 'P&L', 'Return %', 'Win Rate', 'Trades', 'Sharpe'].map((label) => (
                    <th key={label} style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const positive = toNumber(entry.total_return) >= 0;
                  const balance = toNumber(entry.balance, 0);
                  const pnlDollar = balance ? balance * (toNumber(entry.total_return) / 100) : null;
                  return (
                    <tr
                      key={entry.bot_id}
                      onClick={() => router.push(`/bots/${entry.bot_id}`)}
                      style={{
                        cursor: 'pointer',
                        background: positive ? 'rgba(0,230,118,0.06)' : 'rgba(255,82,82,0.06)'
                      }}
                    >
                      <td style={{ padding: '8px 6px' }}>#{index + 1}</td>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>{entry.name}</td>
                      <td style={{ padding: '8px 6px' }}>{entry.strategy_style} — {entry.strategy_substyle}</td>
                      <td style={{ padding: '8px 6px' }}>{entry.owner || '—'}</td>
                      <td style={{ padding: '8px 6px' }}>{balance ? `$${balance.toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '8px 6px', color: positive ? 'var(--green)' : 'var(--red)' }}>
                        {pnlDollar !== null ? `$${pnlDollar.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>{formatPercent(toNumber(entry.total_return))}</td>
                      <td style={{ padding: '8px 6px' }}>{formatPercent(toNumber(entry.win_rate))}</td>
                      <td style={{ padding: '8px 6px' }}>{toNumber(entry.total_trades)}</td>
                      <td style={{ padding: '8px 6px' }}>{toNumber(entry.sharpe_ratio).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
