'use client';

import { useEffect, useState, useMemo } from 'react';

/* ── types ───────────────────────────────────────────── */
type Trade = {
  id: number;
  coin_pair: string;
  direction: string;
  entry_price: string | number | null;
  exit_price: string | number | null;
  position_size: string | number | null;
  pnl_dollar: string | number | null;
  pnl_percent: string | number | null;
  column_name: string;
  status: string;
  created_at: string;
  entered_at: string | null;
  exited_at: string | null;
  stop_loss: string | number | null;
  take_profit: string | number | null;
  confidence_score: number | null;
  tbo_signal: string | null;
  notes: string | null;
  created_by_name: string | null;
  bot_id: number | null;
  rsi_value: string | number | null;
  volume_assessment: string | null;
  macd_status: string | null;
};

/* ── helpers ─────────────────────────────────────────── */
const n = (v: unknown, fb = 0) => { const p = Number(v); return Number.isFinite(p) ? p : fb; };
function fmt$(v: number) { return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`; }
function fmtPct(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

function fmtDateTime(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function holdTimeMs(entered: string | null, exited: string | null): number | null {
  if (!entered) return null;
  const start = new Date(entered).getTime();
  const end = exited ? new Date(exited).getTime() : Date.now();
  if (isNaN(start) || isNaN(end)) return null;
  return end - start;
}

function fmtHold(ms: number | null) {
  if (ms === null) return '—';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${mins}m`;
}

const COIN_ICONS: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', SOL: '◎', XRP: '✕', ADA: '₳', AVAX: '🔺', DOT: '●',
  LINK: '⬡', ATOM: '⚛', MATIC: '⬟', NEAR: 'Ⓝ', FTM: '👻', INJ: '💉',
  SUI: '💧', APT: '🅰', RENDER: '🎨', FET: '🤖', ARB: '🔵', OP: '🔴', TIA: '🌌',
};
function coinIcon(pair: string) {
  const base = pair.replace(/\/USDT|USDT/i, '');
  return COIN_ICONS[base] || '🪙';
}
function coinBase(pair: string) { return pair.replace(/\/USDT|USDT/i, ''); }

/* ── Stat Card ───────────────────────────────────────── */
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px',
      padding: '16px 18px', flex: '1 1 130px', minWidth: '130px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

/* ── Cumulative P&L Chart ────────────────────────────── */
function CumulativePnlChart({ trades }: { trades: Trade[] }) {
  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => new Date(a.exited_at!).getTime() - new Date(b.exited_at!).getTime());
  }, [trades]);

  if (sorted.length < 2) {
    return (
      <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px' }}>
        Need 2+ closed trades to show P&L curve
      </div>
    );
  }

  const points: { cumPnl: number }[] = [];
  let cum = 0;
  for (const t of sorted) { cum += n(t.pnl_dollar); points.push({ cumPnl: cum }); }

  const W = 600, H = 140, PX = 40, PY = 16;
  const minY = Math.min(0, ...points.map(p => p.cumPnl));
  const maxY = Math.max(0, ...points.map(p => p.cumPnl));
  const rangeY = maxY - minY || 1;
  const toX = (i: number) => PX + (i / (points.length - 1)) * (W - PX * 2);
  const toY = (v: number) => PY + (1 - (v - minY) / rangeY) * (H - PY * 2);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.cumPnl).toFixed(1)}`).join(' ');
  const zeroY = toY(0);
  const lastPnl = points[points.length - 1].cumPnl;
  const lineColor = lastPnl >= 0 ? '#00e676' : '#ff5252';
  const areaD = `${pathD} L${toX(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '160px' }}>
      <defs>
        <linearGradient id="pnlGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={PX} x2={W - PX} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4" />
      <text x={PX - 4} y={zeroY + 4} fill="var(--muted)" fontSize="10" textAnchor="end">$0</text>
      <path d={areaD} fill="url(#pnlGrad)" />
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={toX(0)} cy={toY(points[0].cumPnl)} r="3" fill={lineColor} />
      <circle cx={toX(points.length - 1)} cy={toY(lastPnl)} r="5" fill={lineColor} stroke="var(--bg)" strokeWidth="2" />
      <text x={toX(points.length - 1) + 8} y={toY(lastPnl) + 4} fill={lineColor} fontSize="12" fontWeight="700">{fmt$(lastPnl)}</text>
    </svg>
  );
}

/* ── Pattern Detection ───────────────────────────────── */
function detectPatterns(closed: Trade[]) {
  const patterns: { icon: string; label: string; detail: string; color: string }[] = [];
  if (closed.length < 3) return patterns;

  // Winning/losing streak
  const sorted = [...closed].sort((a, b) => new Date(a.exited_at || a.created_at).getTime() - new Date(b.exited_at || b.created_at).getTime());
  let streak = 0; let streakType = '';
  for (let i = sorted.length - 1; i >= 0; i--) {
    const isWin = sorted[i].column_name === 'Wins';
    if (i === sorted.length - 1) { streakType = isWin ? 'win' : 'loss'; streak = 1; }
    else if ((isWin && streakType === 'win') || (!isWin && streakType === 'loss')) streak++;
    else break;
  }
  if (streak >= 2) {
    patterns.push(streakType === 'win'
      ? { icon: '🔥', label: `${streak}-Trade Win Streak`, detail: 'Momentum is on your side', color: 'var(--green)' }
      : { icon: '❄️', label: `${streak}-Trade Loss Streak`, detail: 'Consider pausing to reassess', color: 'var(--red)' });
  }

  // Best performing coin
  const coinPnl = new Map<string, number>();
  for (const t of closed) {
    const c = coinBase(t.coin_pair);
    coinPnl.set(c, (coinPnl.get(c) || 0) + n(t.pnl_dollar));
  }
  const bestCoin = [...coinPnl.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestCoin && bestCoin[1] > 0) {
    patterns.push({ icon: '⭐', label: `${bestCoin[0]} is your best coin`, detail: `${fmt$(bestCoin[1])} total profit`, color: 'var(--green)' });
  }

  // Average win vs loss size
  const winAmts = closed.filter(t => t.column_name === 'Wins').map(t => n(t.pnl_dollar));
  const lossAmts = closed.filter(t => t.column_name === 'Losses').map(t => Math.abs(n(t.pnl_dollar)));
  if (winAmts.length && lossAmts.length) {
    const avgWin = winAmts.reduce((a, b) => a + b, 0) / winAmts.length;
    const avgLoss = lossAmts.reduce((a, b) => a + b, 0) / lossAmts.length;
    const rr = avgWin / (avgLoss || 1);
    patterns.push(rr >= 1.5
      ? { icon: '📐', label: `${rr.toFixed(1)}:1 Risk/Reward`, detail: 'Wins outsize losses — strong edge', color: 'var(--green)' }
      : rr < 1
        ? { icon: '⚠️', label: `${rr.toFixed(1)}:1 Risk/Reward`, detail: 'Losses bigger than wins — tighten stops', color: 'var(--red)' }
        : { icon: '📐', label: `${rr.toFixed(1)}:1 Risk/Reward`, detail: 'Decent but room to improve', color: '#f5b544' });
  }

  // Time-of-day edge
  const hourWins = new Map<number, number>();
  const hourTotal = new Map<number, number>();
  for (const t of closed) {
    if (!t.entered_at) continue;
    const h = new Date(t.entered_at).getHours();
    hourTotal.set(h, (hourTotal.get(h) || 0) + 1);
    if (t.column_name === 'Wins') hourWins.set(h, (hourWins.get(h) || 0) + 1);
  }
  let bestHour = -1, bestWR = 0, bestCount = 0;
  for (const [h, total] of hourTotal) {
    if (total < 2) continue;
    const wr = (hourWins.get(h) || 0) / total;
    if (wr > bestWR) { bestWR = wr; bestHour = h; bestCount = total; }
  }
  if (bestHour >= 0 && bestWR > 0.6 && bestCount >= 3) {
    const period = bestHour < 12 ? `${bestHour}AM` : bestHour === 12 ? '12PM' : `${bestHour - 12}PM`;
    patterns.push({ icon: '🕐', label: `Best entries around ${period}`, detail: `${(bestWR * 100).toFixed(0)}% win rate (${bestCount} trades)`, color: '#7b7dff' });
  }

  return patterns;
}

/* ── Strategy Performance ────────────────────────────── */
function getStrategyPerformance(closed: Trade[]) {
  // Group by signal type (TBO signal as proxy for strategy)
  const strategies = new Map<string, { trades: number; wins: number; pnl: number; avgConfidence: number; confidenceCount: number }>();

  for (const t of closed) {
    const key = t.tbo_signal || 'Manual';
    const entry = strategies.get(key) || { trades: 0, wins: 0, pnl: 0, avgConfidence: 0, confidenceCount: 0 };
    entry.trades++;
    entry.pnl += n(t.pnl_dollar);
    if (t.column_name === 'Wins') entry.wins++;
    if (t.confidence_score != null) { entry.avgConfidence += t.confidence_score; entry.confidenceCount++; }
    strategies.set(key, entry);
  }

  return [...strategies.entries()].map(([name, data]) => ({
    name,
    trades: data.trades,
    winRate: data.trades ? (data.wins / data.trades) * 100 : 0,
    pnl: data.pnl,
    avgConfidence: data.confidenceCount ? data.avgConfidence / data.confidenceCount : null,
  })).sort((a, b) => b.pnl - a.pnl);
}

/* ── Trade Detail (expanded) ─────────────────────────── */
function TradeDetail({ trade }: { trade: Trade }) {
  return (
    <div style={{
      background: 'var(--panel)', borderRadius: '12px', padding: '16px', marginTop: '8px',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px',
      fontSize: '12px', animation: 'slideFade 0.2s ease',
    }}>
      <div>
        <span style={{ color: 'var(--muted)' }}>Entry Price</span>
        <div style={{ fontWeight: 600 }}>{trade.entry_price ? `$${n(trade.entry_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}` : '—'}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>Exit Price</span>
        <div style={{ fontWeight: 600 }}>{trade.exit_price ? `$${n(trade.exit_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}` : '—'}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>Position Size</span>
        <div style={{ fontWeight: 600 }}>{trade.position_size ? fmt$(n(trade.position_size)) : '—'}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>Stop Loss</span>
        <div>{trade.stop_loss ? `$${n(trade.stop_loss)}` : '—'}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>Take Profit</span>
        <div>{trade.take_profit ? `$${n(trade.take_profit)}` : '—'}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>Hold Time</span>
        <div>{fmtHold(holdTimeMs(trade.entered_at, trade.exited_at))}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>Confidence</span>
        <div>{trade.confidence_score != null ? `${trade.confidence_score}/100` : '—'}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>TBO Signal</span>
        <div>{trade.tbo_signal || '—'}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>RSI</span>
        <div>{trade.rsi_value ? n(trade.rsi_value).toFixed(1) : '—'}</div>
      </div>
      <div>
        <span style={{ color: 'var(--muted)' }}>Trader</span>
        <div>{trade.created_by_name || '—'}</div>
      </div>
      {trade.notes && (
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ color: 'var(--muted)' }}>Notes</span>
          <div style={{ marginTop: '4px', lineHeight: 1.5 }}>{trade.notes}</div>
        </div>
      )}
      <style jsx>{`@keyframes slideFade { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*  MAIN PAGE                                            */
/* ══════════════════════════════════════════════════════ */
export default function TradeHistoryPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const settingsRes = await fetch('/api/trading/settings');
        const settingsJson = await settingsRes.json();
        const boardId = settingsJson?.settings?.boardId || settingsJson?.board_id || 15;
        const res = await fetch(`/api/trading/trades?boardId=${boardId}&status=all`);
        const json = await res.json();
        setTrades(Array.isArray(json?.trades) ? json.trades : []);
      } catch { setTrades([]); }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  // Only closed trades (Wins + Losses) — no Analyzing, Watchlist, Active, Parked
  const closed = useMemo(() =>
    trades.filter(t => t.column_name === 'Wins' || t.column_name === 'Losses')
      .sort((a, b) => new Date(b.exited_at || b.created_at).getTime() - new Date(a.exited_at || a.created_at).getTime()),
    [trades]
  );

  const active = useMemo(() => trades.filter(t => t.column_name === 'Active'), [trades]);

  // Stats
  const wins = closed.filter(t => t.column_name === 'Wins');
  const losses = closed.filter(t => t.column_name === 'Losses');
  const totalPnl = closed.reduce((s, t) => s + n(t.pnl_dollar), 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const avgTrade = closed.length ? totalPnl / closed.length : 0;
  const pnls = closed.map(t => n(t.pnl_dollar));
  const bestTrade = pnls.length ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length ? Math.min(...pnls) : 0;
  const bestTradeObj = closed.find(t => n(t.pnl_dollar) === bestTrade);
  const worstTradeObj = closed.find(t => n(t.pnl_dollar) === worstTrade);
  const holdTimes = closed.map(t => holdTimeMs(t.entered_at, t.exited_at)).filter((v): v is number => v !== null);
  const avgHoldMs = holdTimes.length ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : null;

  // Strategy performance + patterns
  const stratPerf = useMemo(() => getStrategyPerformance(closed), [closed]);
  const patterns = useMemo(() => detectPatterns(closed), [closed]);

  // Search within closed — last 10 by default, full list when searching
  const searchResults = useMemo(() => {
    if (!search.trim()) return closed.slice(0, 10);
    const q = search.toLowerCase();
    return closed.filter(t =>
      t.coin_pair.toLowerCase().includes(q) ||
      (t.created_by_name || '').toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q) ||
      (t.tbo_signal || '').toLowerCase().includes(q)
    );
  }, [closed, search]);

  if (loading) {
    return (
      <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ flex: '1 1 130px', height: '86px', borderRadius: '14px', background: 'var(--card)', border: '1px solid var(--border)', animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
        <style jsx>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.15; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* ── Stats Row ────────────────────────────────── */}
      <section style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatCard label="Closed Trades" value={String(closed.length)} sub={`${active.length} open`} />
        <StatCard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          sub={`${wins.length}W / ${losses.length}L`}
          color={winRate >= 50 ? 'var(--green)' : winRate > 0 ? 'var(--red)' : undefined}
        />
        <StatCard label="Total P&L" value={fmt$(totalPnl)} color={totalPnl >= 0 ? 'var(--green)' : 'var(--red)'} />
        <StatCard
          label="Best Trade"
          value={fmt$(bestTrade)}
          sub={bestTradeObj ? coinBase(bestTradeObj.coin_pair) : undefined}
          color="var(--green)"
        />
        <StatCard
          label="Worst Trade"
          value={fmt$(worstTrade)}
          sub={worstTradeObj ? coinBase(worstTradeObj.coin_pair) : undefined}
          color="var(--red)"
        />
        <StatCard label="Avg Hold Time" value={fmtHold(avgHoldMs)} sub={`Avg P&L: ${fmt$(avgTrade)}`} />
      </section>

      {/* ── P&L Chart + Strategy Performance ─────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

        {/* Cumulative P&L */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Cumulative P&L</div>
          <CumulativePnlChart trades={closed} />
          {/* Win/Loss bar */}
          {closed.length > 0 && (
            <>
              <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--panel-2)', marginTop: '12px' }}>
                <div style={{ width: `${winRate}%`, background: '#00e676' }} />
                <div style={{ width: `${100 - winRate}%`, background: '#ff5252' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                <span style={{ color: 'var(--green)' }}>● {wins.length} wins</span>
                <span style={{ color: 'var(--red)' }}>● {losses.length} losses</span>
              </div>
            </>
          )}
        </div>

        {/* Strategy Performance */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>Strategy Performance</div>
          {stratPerf.length === 0 && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No closed trades yet</div>}
          <div style={{ display: 'grid', gap: '10px' }}>
            {stratPerf.map(s => (
              <div key={s.name} style={{ padding: '12px', background: 'var(--panel)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: s.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt$(s.pnl)}</div>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--muted)' }}>
                  <span>{s.trades} trades</span>
                  <span style={{ color: s.winRate >= 50 ? 'var(--green)' : 'var(--red)' }}>{s.winRate.toFixed(0)}% win rate</span>
                  {s.avgConfidence !== null && <span>Avg conf: {s.avgConfidence.toFixed(0)}/100</span>}
                </div>
                {/* mini win rate bar */}
                <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', background: 'var(--panel-2)', marginTop: '8px' }}>
                  <div style={{ width: `${s.winRate}%`, background: '#00e676' }} />
                  <div style={{ width: `${100 - s.winRate}%`, background: '#ff5252' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Patterns Detected ────────────────────────── */}
      {patterns.length > 0 && (
        <section style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {patterns.map((p, i) => (
            <div key={i} style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px',
              padding: '14px 18px', flex: '1 1 200px', minWidth: '200px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '18px' }}>{p.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: p.color }}>{p.label}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.detail}</div>
            </div>
          ))}
        </section>
      )}

      {/* ── Recent Trades (last 10) + Search ─────────── */}
      <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>
            {search.trim() ? `Search Results (${searchResults.length})` : `Last ${Math.min(10, closed.length)} Trades`}
          </div>
          {/* Search */}
          <div style={{ position: 'relative', minWidth: '220px' }}>
            <input
              type="text"
              placeholder="Search trades..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 14px 8px 34px', borderRadius: '10px',
                border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)',
                fontSize: '12px', outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '13px' }}>🔍</span>
          </div>
        </div>

        {searchResults.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            {search.trim() ? 'No trades match your search' : 'No closed trades yet'}
          </div>
        )}

        <div style={{ display: 'grid', gap: '6px' }}>
          {searchResults.map((trade) => {
            const pnl = n(trade.pnl_dollar);
            const pnlPct = n(trade.pnl_percent);
            const isWin = trade.column_name === 'Wins';
            const isExpanded = expandedId === trade.id;
            const coin = coinBase(trade.coin_pair);

            return (
              <div key={trade.id}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px 1fr 60px 80px 90px 80px 80px',
                    alignItems: 'center',
                    padding: '10px 8px',
                    borderRadius: isExpanded ? '12px 12px 0 0' : '12px',
                    background: isExpanded ? 'rgba(123,125,255,0.06)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {/* Icon */}
                  <span style={{ fontSize: '18px', textAlign: 'center' }}>{coinIcon(trade.coin_pair)}</span>
                  {/* Coin + date */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{coin}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDateTime(trade.exited_at || trade.entered_at)}</div>
                  </div>
                  {/* Direction */}
                  <span style={{
                    padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, textAlign: 'center',
                    background: trade.direction === 'LONG' ? 'rgba(0,230,118,0.12)' : 'rgba(255,82,82,0.12)',
                    color: trade.direction === 'LONG' ? 'var(--green)' : 'var(--red)',
                  }}>
                    {trade.direction || '—'}
                  </span>
                  {/* Result */}
                  <span style={{ fontSize: '12px', fontWeight: 600, color: isWin ? 'var(--green)' : 'var(--red)' }}>
                    {isWin ? '✅ Win' : '❌ Loss'}
                  </span>
                  {/* P&L $ */}
                  <span style={{ fontWeight: 700, fontSize: '13px', color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fmt$(pnl)}
                  </span>
                  {/* P&L % */}
                  <span style={{ fontSize: '12px', color: pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fmtPct(pnlPct)}
                  </span>
                  {/* Hold time */}
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {fmtHold(holdTimeMs(trade.entered_at, trade.exited_at))}
                  </span>
                </div>
                {isExpanded && <TradeDetail trade={trade} />}
              </div>
            );
          })}
        </div>
      </section>

      {/* Responsive */}
      <style jsx>{`
        @media (max-width: 900px) {
          section { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
