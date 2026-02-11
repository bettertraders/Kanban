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

/* ── Pattern Detection (Advanced) ────────────────────── */
type Pattern = { icon: string; label: string; detail: string; color: string; tag: string };

function detectPatterns(closed: Trade[]) {
  const patterns: Pattern[] = [];
  if (closed.length < 2) return patterns;

  const wins = closed.filter(t => t.column_name === 'Wins');
  const losses = closed.filter(t => t.column_name === 'Losses');
  const sorted = [...closed].sort((a, b) => new Date(a.exited_at || a.created_at).getTime() - new Date(b.exited_at || b.created_at).getTime());

  // ── 1. Win/Loss Streak ──
  let streak = 0; let streakType = '';
  for (let i = sorted.length - 1; i >= 0; i--) {
    const isWin = sorted[i].column_name === 'Wins';
    if (i === sorted.length - 1) { streakType = isWin ? 'win' : 'loss'; streak = 1; }
    else if ((isWin && streakType === 'win') || (!isWin && streakType === 'loss')) streak++;
    else break;
  }
  if (streak >= 2) {
    patterns.push(streakType === 'win'
      ? { icon: '🔥', label: `${streak}-Trade Win Streak`, detail: 'Momentum is on your side', color: 'var(--green)', tag: 'Streak' }
      : { icon: '❄️', label: `${streak}-Trade Loss Streak`, detail: 'Consider pausing to reassess', color: 'var(--red)', tag: 'Streak' });
  }

  // ── 2. MACD Confirmation Edge ──
  const withMacd = closed.filter(t => t.macd_status);
  if (withMacd.length >= 3) {
    const macdBullish = withMacd.filter(t => (t.macd_status || '').toLowerCase().includes('bull') || (t.macd_status || '').toLowerCase().includes('positive') || (t.macd_status || '').toLowerCase().includes('above'));
    const macdOther = withMacd.filter(t => !macdBullish.includes(t));
    const bullWinRate = macdBullish.length ? (macdBullish.filter(t => t.column_name === 'Wins').length / macdBullish.length) * 100 : 0;
    const otherWinRate = macdOther.length ? (macdOther.filter(t => t.column_name === 'Wins').length / macdOther.length) * 100 : 0;
    const improvement = bullWinRate - otherWinRate;
    if (macdBullish.length >= 2 && improvement > 10) {
      patterns.push({
        icon: '📊', tag: 'Actionable',
        label: `MACD confirmation improves win rate by ${improvement.toFixed(0)}%`,
        detail: `Trades with bullish MACD at entry won ${bullWinRate.toFixed(0)}% vs ${otherWinRate.toFixed(0)}% without.`,
        color: 'var(--green)',
      });
    }
  }

  // ── 3. Loss Hold Time vs Win Hold Time ──
  const winHolds = wins.map(t => holdTimeMs(t.entered_at, t.exited_at)).filter((v): v is number => v !== null);
  const lossHolds = losses.map(t => holdTimeMs(t.entered_at, t.exited_at)).filter((v): v is number => v !== null);
  if (winHolds.length >= 2 && lossHolds.length >= 2) {
    const avgWinHold = winHolds.reduce((a, b) => a + b, 0) / winHolds.length;
    const avgLossHold = lossHolds.reduce((a, b) => a + b, 0) / lossHolds.length;
    const ratio = avgLossHold / (avgWinHold || 1);
    const fmtH = (ms: number) => { const h = ms / 3600000; return h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`; };
    if (ratio > 1.5) {
      patterns.push({
        icon: '⚠️', tag: 'Warning',
        label: `Losses hold ${ratio.toFixed(1)}x longer than wins`,
        detail: `Average loss held ${fmtH(avgLossHold)} vs ${fmtH(avgWinHold)} for wins. Consider tighter time-based stops.`,
        color: '#f5b544',
      });
    } else if (ratio < 0.7) {
      patterns.push({
        icon: '✅', tag: 'Positive',
        label: 'Quick loss cutting',
        detail: `Losses exit in ${fmtH(avgLossHold)} vs ${fmtH(avgWinHold)} for wins. Good discipline.`,
        color: 'var(--green)',
      });
    }
  }

  // ── 4. Oversold Bounce — Large Cap vs Small Cap ──
  const LARGE_CAPS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB'];
  const oversold = closed.filter(t => n(t.rsi_value) > 0 && n(t.rsi_value) < 40);
  if (oversold.length >= 3) {
    const largeCap = oversold.filter(t => LARGE_CAPS.includes(coinBase(t.coin_pair)));
    const smallCap = oversold.filter(t => !LARGE_CAPS.includes(coinBase(t.coin_pair)));
    const lcWinRate = largeCap.length ? (largeCap.filter(t => t.column_name === 'Wins').length / largeCap.length) * 100 : 0;
    const scWinRate = smallCap.length ? (smallCap.filter(t => t.column_name === 'Wins').length / smallCap.length) * 100 : 0;
    if (largeCap.length >= 2 && smallCap.length >= 1 && lcWinRate - scWinRate > 15) {
      const lcCoins = [...new Set(largeCap.map(t => coinBase(t.coin_pair)))].join('/');
      patterns.push({
        icon: '📊', tag: 'Insight',
        label: 'Oversold bounces work best on large caps',
        detail: `${lcCoins} oversold entries: ${lcWinRate.toFixed(0)}% win. Mid/small caps: ${scWinRate.toFixed(0)}% win.`,
        color: '#7b7dff',
      });
    }
  }

  // ── 5. Short vs Long Performance ──
  const shorts = closed.filter(t => (t.direction || '').toUpperCase() === 'SHORT');
  const longs = closed.filter(t => (t.direction || '').toUpperCase() === 'LONG');
  if (shorts.length >= 1 && longs.length >= 1) {
    const shortWR = shorts.length ? (shorts.filter(t => t.column_name === 'Wins').length / shorts.length) * 100 : 0;
    const longWR = longs.length ? (longs.filter(t => t.column_name === 'Wins').length / longs.length) * 100 : 0;
    if (shortWR > longWR && shortWR >= 60) {
      patterns.push({
        icon: '🩳', tag: 'Insight',
        label: 'Short trades show promise in current regime',
        detail: `Shorts: ${shortWR.toFixed(0)}% win rate (${shorts.length} trade${shorts.length > 1 ? 's' : ''}). Longs: ${longWR.toFixed(0)}%. Market may be bearish — lean into shorts.`,
        color: '#7b7dff',
      });
    } else if (longWR > shortWR && longWR >= 60) {
      patterns.push({
        icon: '📈', tag: 'Insight',
        label: 'Long bias is working',
        detail: `Longs: ${longWR.toFixed(0)}% win rate (${longs.length} trades). Shorts: ${shortWR.toFixed(0)}%. Stick with the trend.`,
        color: 'var(--green)',
      });
    }
  }

  // ── 6. Risk/Reward Ratio ──
  const winAmts = wins.map(t => n(t.pnl_dollar));
  const lossAmts = losses.map(t => Math.abs(n(t.pnl_dollar)));
  if (winAmts.length && lossAmts.length) {
    const avgWin = winAmts.reduce((a, b) => a + b, 0) / winAmts.length;
    const avgLoss = lossAmts.reduce((a, b) => a + b, 0) / lossAmts.length;
    const rr = avgWin / (avgLoss || 1);
    patterns.push(rr >= 1.5
      ? { icon: '📐', tag: 'Positive', label: `${rr.toFixed(1)}:1 Risk/Reward`, detail: 'Wins outsize losses — strong edge', color: 'var(--green)' }
      : rr < 1
        ? { icon: '⚠️', tag: 'Warning', label: `${rr.toFixed(1)}:1 Risk/Reward`, detail: 'Losses bigger than wins — tighten stops', color: 'var(--red)' }
        : { icon: '📐', tag: 'Neutral', label: `${rr.toFixed(1)}:1 Risk/Reward`, detail: 'Decent but room to improve', color: '#f5b544' });
  }

  // ── 7. Best Performing Coin ──
  const coinPnl = new Map<string, number>();
  for (const t of closed) {
    const c = coinBase(t.coin_pair);
    coinPnl.set(c, (coinPnl.get(c) || 0) + n(t.pnl_dollar));
  }
  const bestCoin = [...coinPnl.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestCoin && bestCoin[1] > 0) {
    patterns.push({ icon: '⭐', tag: 'Insight', label: `${bestCoin[0]} is your best coin`, detail: `${fmt$(bestCoin[1])} total profit`, color: 'var(--green)' });
  }

  // ── 8. Confidence Score Edge ──
  const withConf = closed.filter(t => t.confidence_score != null);
  if (withConf.length >= 4) {
    const highConf = withConf.filter(t => (t.confidence_score || 0) >= 70);
    const lowConf = withConf.filter(t => (t.confidence_score || 0) < 70);
    const highWR = highConf.length ? (highConf.filter(t => t.column_name === 'Wins').length / highConf.length) * 100 : 0;
    const lowWR = lowConf.length ? (lowConf.filter(t => t.column_name === 'Wins').length / lowConf.length) * 100 : 0;
    if (highConf.length >= 2 && highWR - lowWR > 15) {
      patterns.push({
        icon: '🎯', tag: 'Actionable',
        label: `High-confidence trades win ${(highWR - lowWR).toFixed(0)}% more`,
        detail: `Score ≥70: ${highWR.toFixed(0)}% win rate (${highConf.length} trades). Below 70: ${lowWR.toFixed(0)}%. Trust your signals.`,
        color: 'var(--green)',
      });
    }
  }

  // ── 9. Time-of-Day Edge ──
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
  if (bestHour >= 0 && bestWR > 0.6 && bestCount >= 2) {
    const period = bestHour < 12 ? `${bestHour === 0 ? 12 : bestHour}AM` : bestHour === 12 ? '12PM' : `${bestHour - 12}PM`;
    patterns.push({ icon: '🕐', tag: 'Insight', label: `Best entries around ${period}`, detail: `${(bestWR * 100).toFixed(0)}% win rate (${bestCount} trades)`, color: '#7b7dff' });
  }

  // ── 10. Volume Assessment Edge ──
  const withVol = closed.filter(t => t.volume_assessment);
  if (withVol.length >= 3) {
    const highVol = withVol.filter(t => (t.volume_assessment || '').toLowerCase().includes('high') || (t.volume_assessment || '').toLowerCase().includes('strong'));
    const lowVol = withVol.filter(t => !highVol.includes(t));
    const hvWR = highVol.length ? (highVol.filter(t => t.column_name === 'Wins').length / highVol.length) * 100 : 0;
    const lvWR = lowVol.length ? (lowVol.filter(t => t.column_name === 'Wins').length / lowVol.length) * 100 : 0;
    if (highVol.length >= 2 && hvWR - lvWR > 10) {
      patterns.push({
        icon: '📊', tag: 'Actionable',
        label: `High volume entries win ${(hvWR - lvWR).toFixed(0)}% more`,
        detail: `Strong volume: ${hvWR.toFixed(0)}% win rate. Low volume: ${lvWR.toFixed(0)}%. Wait for volume confirmation.`,
        color: 'var(--green)',
      });
    }
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

  // Patterns (hidden for now — re-enable when more data)
  // const stratPerf = useMemo(() => getStrategyPerformance(closed), [closed]);
  // const patterns = useMemo(() => detectPatterns(closed), [closed]);

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

      {/* Strategy Performance + Patterns Detected — hidden until more trade data accumulates */}

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
