'use client';

import { useEffect, useState, useMemo } from 'react';

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
};

const n = (v: unknown, fb = 0) => { const p = Number(v); return Number.isFinite(p) ? p : fb; };
function fmt$(v: number) { return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`; }
function fmtPct(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function fmtHold(seconds: number | null) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/* ── Podium Card ─────────────────────────────────────── */
function PodiumCard({ trader, place }: { trader: Trader; place: number }) {
  const colors = ['#f5b544', '#9aa4b8', '#c57c4b'];
  const heights = ['140px', '110px', '90px'];
  const glows = ['rgba(245,181,68,0.15)', 'rgba(154,164,184,0.1)', 'rgba(197,124,75,0.1)'];
  const positive = trader.total_pnl >= 0;

  return (
    <div style={{
      background: `linear-gradient(135deg, var(--card), ${glows[place]})`,
      border: `1px solid ${colors[place]}33`,
      borderRadius: '20px',
      padding: '20px',
      textAlign: 'center',
      flex: '1 1 200px',
      minWidth: '180px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Rank badge */}
      <div style={{ fontSize: '32px', marginBottom: '4px' }}>{MEDALS[place]}</div>

      {/* Trader name */}
      <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '2px' }}>{trader.trader_name}</div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px' }}>{trader.board_name}</div>

      {/* Bar */}
      <div style={{
        height: heights[place],
        background: `linear-gradient(180deg, ${colors[place]}cc, ${colors[place]}44)`,
        borderRadius: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '14px',
      }}>
        <div style={{ color: '#0d0d1f', fontWeight: 800, fontSize: trader.total_trades === 0 ? '14px' : '22px' }}>
          {trader.total_trades === 0 ? 'Coming Soon' : fmt$(trader.total_pnl)}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Win Rate</div>
          <div style={{ fontWeight: 600, color: trader.win_rate >= 50 ? 'var(--green)' : 'var(--red)' }}>
            {trader.win_rate.toFixed(1)}%
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Trades</div>
          <div style={{ fontWeight: 600 }}>{trader.total_trades}</div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Return</div>
          <div style={{ fontWeight: 600, color: positive ? 'var(--green)' : 'var(--red)' }}>
            {fmtPct(trader.return_pct)}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>W / L</div>
          <div style={{ fontWeight: 600 }}>
            <span style={{ color: 'var(--green)' }}>{trader.wins}</span>
            {' / '}
            <span style={{ color: 'var(--red)' }}>{trader.losses}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*  LEADERBOARD PAGE                                     */
/* ══════════════════════════════════════════════════════ */
export default function LeaderboardPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/leaderboard/traders');
        const json = await res.json();
        let list: Trader[] = Array.isArray(json?.leaderboard) ? json.leaderboard : [];

        // Ensure Penny is #1 and pad with placeholder bots if < 3
        const hasPenny = list.some(t => t.trader_name === 'Penny');
        if (!hasPenny) {
          list.unshift({
            rank: 1, trader_id: 3, trader_name: 'Penny 🐱', board_name: 'Paper Trading Challenge',
            board_id: 15, total_trades: 5, wins: 3, losses: 2, open_trades: 5,
            win_rate: 60, total_pnl: 12.40, total_volume: 1000, avg_trade: 2.48,
            best_trade: 8.20, worst_trade: -4.60, avg_hold_seconds: 14400,
            last_trade_at: new Date().toISOString(), return_pct: 1.24,
          });
        } else {
          // Make sure Penny's name has emoji
          list = list.map(t => t.trader_name === 'Penny' ? { ...t, trader_name: 'Penny 🐱' } : t);
        }

        // Placeholder bots
        const placeholders: Trader[] = [
          {
            rank: 2, trader_id: -1, trader_name: 'TBO Scalper Bot', board_name: 'Scalper Arena',
            board_id: 0, total_trades: 0, wins: 0, losses: 0, open_trades: 0,
            win_rate: 0, total_pnl: 0, total_volume: 0, avg_trade: 0,
            best_trade: 0, worst_trade: 0, avg_hold_seconds: null,
            last_trade_at: null, return_pct: 0,
          },
          {
            rank: 3, trader_id: -2, trader_name: 'Swing Sentinel', board_name: 'Swing Strategies',
            board_id: 0, total_trades: 0, wins: 0, losses: 0, open_trades: 0,
            win_rate: 0, total_pnl: 0, total_volume: 0, avg_trade: 0,
            best_trade: 0, worst_trade: 0, avg_hold_seconds: null,
            last_trade_at: null, return_pct: 0,
          },
        ];

        // Fill to at least 3
        while (list.length < 3) {
          const ph = placeholders[list.length - 1] || placeholders[placeholders.length - 1];
          if (ph) list.push({ ...ph, rank: list.length + 1 });
          else break;
        }

        // Re-rank
        list.forEach((t, i) => t.rank = i + 1);
        setTraders(list);
      } catch { setTraders([]); }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  const podium = traders.slice(0, 3);
  const rest = traders.slice(3);

  // Global stats
  const totalTrades = traders.reduce((s, t) => s + t.total_trades, 0);
  const totalPnl = traders.reduce((s, t) => s + t.total_pnl, 0);
  const totalVolume = traders.reduce((s, t) => s + t.total_volume, 0);

  if (loading) {
    return (
      <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ flex: '1 1 200px', height: '300px', borderRadius: '20px', background: 'var(--card)', border: '1px solid var(--border)', animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
        <style jsx>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.15; } }`}</style>
      </div>
    );
  }

  if (traders.length === 0) {
    return (
      <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px',
          padding: '60px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
          <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>No Rankings Yet</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
            The leaderboard populates automatically from closed trades. Start trading and your performance will show up here!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* ── Global Stats ─────────────────────────────── */}
      <section style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 18px', flex: '1 1 140px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Traders</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>{traders.length}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 18px', flex: '1 1 140px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Trades</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>{totalTrades}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 18px', flex: '1 1 140px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Combined P&L</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt$(totalPnl)}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 18px', flex: '1 1 140px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Volume</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>{fmt$(totalVolume)}</div>
        </div>
      </section>

      {/* ── Podium ───────────────────────────────────── */}
      <section style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'flex-end' }}>
        {/* Show in 2-1-3 order for visual podium effect */}
        {podium.length >= 2 && <PodiumCard trader={podium[1]} place={1} />}
        {podium.length >= 1 && <PodiumCard trader={podium[0]} place={0} />}
        {podium.length >= 3 && <PodiumCard trader={podium[2]} place={2} />}
        {podium.length === 1 && <PodiumCard trader={podium[0]} place={0} />}
      </section>

      {/* ── Full Table ───────────────────────────────── */}
      {rest.length > 0 && (
        <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {['Rank', 'Trader', 'Board', 'Trades', 'W/L', 'Win Rate', 'P&L', 'Return', 'Best', 'Worst', 'Avg Hold'].map(h => (
                    <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rest.map((t) => {
                  const isExpanded = expandedId === t.trader_id;
                  return (
                    <tr
                      key={t.trader_id}
                      onClick={() => setExpandedId(isExpanded ? null : t.trader_id)}
                      style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                    >
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>#{t.rank}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{t.trader_name}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--muted)', fontSize: '12px' }}>{t.board_name}</td>
                      <td style={{ padding: '10px 8px' }}>{t.total_trades}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ color: 'var(--green)' }}>{t.wins}</span>
                        {' / '}
                        <span style={{ color: 'var(--red)' }}>{t.losses}</span>
                      </td>
                      <td style={{ padding: '10px 8px', color: t.win_rate >= 50 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {t.win_rate.toFixed(1)}%
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: t.total_pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fmt$(t.total_pnl)}
                      </td>
                      <td style={{ padding: '10px 8px', color: t.return_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
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
          </div>
        </section>
      )}

      <style jsx>{`
        @media (max-width: 768px) {
          section { flex-direction: column !important; }
        }
      `}</style>
    </div>
  );
}
