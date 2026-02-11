'use client';

import { useEffect, useState } from 'react';

type Trader = {
  rank: number;
  trader_id: number;
  trader_name: string;
  board_name: string;
  board_id: number;
  total_trades: number;
  wins: number;
  losses: number;
  open_trades: number;
  win_rate: number;
  total_pnl: number;
  total_volume: number;
  avg_trade: number;
  best_trade: number;
  worst_trade: number;
  avg_hold_seconds: number | null;
  last_trade_at: string | null;
  return_pct: number;
  avatar?: string;
};

const n = (v: unknown, fb = 0) => { const p = Number(v); return Number.isFinite(p) ? p : fb; };
function fmt$(v: number) { return `${v < 0 ? '-' : v > 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`; }
function fmtPct(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function fmtHold(seconds: number | null) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

const RANK_COLORS = ['#f5b544', '#9aa4b8', '#c57c4b'];
const AVATARS: Record<string, { type: 'emoji' | 'img'; src: string }> = {
  'Penny 🐱': { type: 'img', src: '/icons/penny.png' },
  'TBO Scalper Bot': { type: 'emoji', src: '🤖' },
  'Swing Sentinel': { type: 'emoji', src: '⚔️' },
};

/* ── Stat Card ───────────────────────────────────────── */
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px',
      padding: '14px 18px', flex: '1 1 140px', minWidth: '140px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

/* ── Trader Card (Top 3) ─────────────────────────────── */
function TraderCard({ trader, place }: { trader: Trader; place: number }) {
  const color = RANK_COLORS[place] || 'var(--muted)';
  const avatarInfo = AVATARS[trader.trader_name] || { type: 'emoji' as const, src: trader.avatar || '👤' };
  const positive = trader.total_pnl >= 0;

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${color}40`,
      borderRadius: '18px',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
      flex: '1 1 300px',
      minWidth: '280px',
    }}>
      {/* Rank badge */}
      <div style={{
        position: 'absolute', top: '16px', right: '16px',
        width: '36px', height: '36px', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: color, color: '#0d0d1f', fontWeight: 800, fontSize: '14px',
      }}>
        {place + 1}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px', background: `${color}20`, overflow: 'hidden',
        }}>
          {avatarInfo.type === 'img'
            ? <img src={avatarInfo.src} alt="" style={{ width: '48px', height: '48px', borderRadius: '14px', objectFit: 'cover' }} />
            : avatarInfo.src}
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>{trader.trader_name}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{trader.board_name}</div>
        </div>
      </div>

      {/* Big P&L */}
      <div style={{
        fontSize: '28px', fontWeight: 800, marginBottom: '16px',
        color: positive ? 'var(--green)' : 'var(--red)',
      }}>
        {fmt$(trader.total_pnl)}
      </div>

      {/* 6-stat grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px',
        paddingTop: '16px', borderTop: '1px solid var(--border)',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Win Rate</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--green)' }}>{trader.win_rate.toFixed(1)}%</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Trades</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{trader.total_trades}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Return</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: positive ? 'var(--green)' : 'var(--red)' }}>{fmtPct(trader.return_pct)}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Best Trade</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--green)' }}>{fmt$(trader.best_trade)}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Worst Trade</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--red)' }}>{fmt$(trader.worst_trade)}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Avg Hold</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{fmtHold(trader.avg_hold_seconds)}</div>
        </div>
      </div>

      {/* Win rate bar */}
      <div style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--panel)', marginTop: '14px' }}>
        <div style={{
          height: '100%', borderRadius: '3px',
          width: `${trader.total_trades > 0 ? trader.win_rate : 0}%`,
          background: `linear-gradient(90deg, var(--green), rgba(0,230,118,0.5))`,
        }} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*  LEADERBOARD PAGE — MOCKUP C                         */
/* ══════════════════════════════════════════════════════ */
export default function LeaderboardPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/leaderboard/traders');
        const json = await res.json();
        let list: Trader[] = Array.isArray(json?.leaderboard) ? json.leaderboard : [];

        // Rename Penny with emoji
        list = list.map(t => t.trader_name === 'Penny' ? { ...t, trader_name: 'Penny 🐱' } : t);

        // Dummy bots with realistic data
        const dummyBots: Trader[] = [
          {
            rank: 2, trader_id: -1, trader_name: 'TBO Scalper Bot', board_name: 'Scalper Arena',
            board_id: 0, total_trades: 22, wins: 15, losses: 7, open_trades: 3,
            win_rate: 68.2, total_pnl: 142.80, total_volume: 4000, avg_trade: 6.49,
            best_trade: 28.60, worst_trade: -12.40, avg_hold_seconds: 5040,
            last_trade_at: new Date().toISOString(), return_pct: 3.57, avatar: '🤖',
          },
          {
            rank: 3, trader_id: -2, trader_name: 'Swing Sentinel', board_name: 'Swing Strategies',
            board_id: 0, total_trades: 7, wins: 4, losses: 3, open_trades: 2,
            win_rate: 57.1, total_pnl: 86.30, total_volume: 1400, avg_trade: 12.33,
            best_trade: 31.80, worst_trade: -22.10, avg_hold_seconds: 66240,
            last_trade_at: new Date().toISOString(), return_pct: 6.16, avatar: '⚔️',
          },
        ];

        // Add dummy bots if not enough real traders
        while (list.length < 3) {
          const bot = dummyBots[list.length - 1];
          if (bot) list.push(bot);
          else break;
        }

        // Re-rank by P&L
        list.sort((a, b) => b.total_pnl - a.total_pnl);
        list.forEach((t, i) => t.rank = i + 1);

        setTraders(list);
      } catch { setTraders([]); }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  const top3 = traders.slice(0, 3);
  const rest = traders.slice(3);
  const totalTrades = traders.reduce((s, t) => s + t.total_trades, 0);
  const totalPnl = traders.reduce((s, t) => s + t.total_pnl, 0);
  const totalVolume = traders.reduce((s, t) => s + t.total_volume, 0);

  // Best streak (find max consecutive wins for top trader)
  const bestStreak = top3.length ? top3[0] : null;

  if (loading) {
    return (
      <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ flex: '1 1 300px', height: '360px', borderRadius: '18px', background: 'var(--card)', border: '1px solid var(--border)', animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
        <style jsx>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.15; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* ── Global Stats ─────────────────────────────── */}
      <section style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatCard label="Traders" value={String(traders.length)} />
        <StatCard label="Total Trades" value={String(totalTrades)} />
        <StatCard label="Combined P&L" value={`${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}`} color={totalPnl >= 0 ? 'var(--green)' : 'var(--red)'} />
        <StatCard label="Total Volume" value={`$${totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
      </section>

      {/* ── Top 3 Cards ──────────────────────────────── */}
      <section style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {top3.map((trader, i) => (
          <TraderCard key={trader.trader_id} trader={trader} place={i} />
        ))}
      </section>

      {/* ── Full Table ───────────────────────────────── */}
      <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {['Rank', 'Trader', 'Board', 'Trades', 'W/L', 'Win Rate', 'P&L', 'Return', 'Best', 'Worst', 'Avg Hold'].map(h => (
                <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {traders.map((t) => {
              const medal = t.rank <= 3 ? ['🥇', '🥈', '🥉'][t.rank - 1] : `#${t.rank}`;
              const positive = t.total_pnl >= 0;
              return (
                <tr key={t.trader_id} style={{ transition: 'background 0.15s' }}>
                  <td style={{ padding: '10px 8px', fontSize: t.rank <= 3 ? '16px' : '13px' }}>{medal}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 700 }}>{t.trader_name}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--muted)', fontSize: '12px' }}>{t.board_name}</td>
                  <td style={{ padding: '10px 8px' }}>{t.total_trades}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ color: 'var(--green)' }}>{t.wins}</span>
                    {' / '}
                    <span style={{ color: 'var(--red)' }}>{t.losses}</span>
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--green)', fontWeight: 600 }}>
                    {t.win_rate.toFixed(1)}%
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 700, color: positive ? 'var(--green)' : 'var(--red)' }}>
                    {fmt$(t.total_pnl)}
                  </td>
                  <td style={{ padding: '10px 8px', color: positive ? 'var(--green)' : 'var(--red)' }}>
                    {fmtPct(t.return_pct)}
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--green)', fontSize: '12px' }}>{fmt$(t.best_trade)}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--red)', fontSize: '12px' }}>{fmt$(t.worst_trade)}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--muted)', fontSize: '12px' }}>{fmtHold(t.avg_hold_seconds)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
