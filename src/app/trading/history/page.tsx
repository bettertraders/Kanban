'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';

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
};

type Stats = {
  total_trades: number;
  open_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
  avg_trade: number;
  best_trade: number;
  worst_trade: number;
};

/* ── helpers ─────────────────────────────────────────── */
const n = (v: unknown, fb = 0) => { const p = Number(v); return Number.isFinite(p) ? p : fb; };

function fmt$(v: number) {
  const abs = Math.abs(v);
  return `${v < 0 ? '-' : ''}$${abs.toFixed(2)}`;
}

function fmtPct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function fmtDate(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function holdTime(entered: string | null, exited: string | null) {
  if (!entered) return '—';
  const start = new Date(entered).getTime();
  const end = exited ? new Date(exited).getTime() : Date.now();
  if (isNaN(start)) return '—';
  const ms = end - start;
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

/* ── Stat Card ───────────────────────────────────────── */
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px',
      padding: '16px 18px', flex: '1 1 140px', minWidth: '140px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

/* ── Mini Sparkline (SVG) ────────────────────────────── */
function CumulativePnlChart({ trades }: { trades: Trade[] }) {
  const sorted = useMemo(() => {
    return [...trades]
      .filter(t => t.exited_at)
      .sort((a, b) => new Date(a.exited_at!).getTime() - new Date(b.exited_at!).getTime());
  }, [trades]);

  if (sorted.length < 2) {
    return (
      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px' }}>
        Need 2+ closed trades to show P&L curve
      </div>
    );
  }

  const points: { date: string; cumPnl: number }[] = [];
  let cum = 0;
  for (const t of sorted) {
    cum += n(t.pnl_dollar);
    points.push({ date: t.exited_at!, cumPnl: cum });
  }

  const W = 700, H = 160, PX = 40, PY = 20;
  const minY = Math.min(0, ...points.map(p => p.cumPnl));
  const maxY = Math.max(0, ...points.map(p => p.cumPnl));
  const rangeY = maxY - minY || 1;

  const toX = (i: number) => PX + (i / (points.length - 1)) * (W - PX * 2);
  const toY = (v: number) => PY + (1 - (v - minY) / rangeY) * (H - PY * 2);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.cumPnl).toFixed(1)}`).join(' ');
  const zeroY = toY(0);
  const lastPnl = points[points.length - 1].cumPnl;
  const lineColor = lastPnl >= 0 ? '#00e676' : '#ff5252';

  // gradient fill
  const areaD = `${pathD} L${toX(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '180px' }}>
      <defs>
        <linearGradient id="pnlGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* zero line */}
      <line x1={PX} x2={W - PX} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4" />
      <text x={PX - 4} y={zeroY + 4} fill="var(--muted)" fontSize="10" textAnchor="end">$0</text>
      {/* area fill */}
      <path d={areaD} fill="url(#pnlGrad)" />
      {/* line */}
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* dots at start & end */}
      <circle cx={toX(0)} cy={toY(points[0].cumPnl)} r="4" fill={lineColor} />
      <circle cx={toX(points.length - 1)} cy={toY(lastPnl)} r="5" fill={lineColor} stroke="var(--bg)" strokeWidth="2" />
      {/* end label */}
      <text
        x={toX(points.length - 1) + 8}
        y={toY(lastPnl) + 4}
        fill={lineColor} fontSize="12" fontWeight="700"
      >
        {fmt$(lastPnl)}
      </text>
      {/* date labels */}
      <text x={toX(0)} y={H - 2} fill="var(--muted)" fontSize="9" textAnchor="middle">{fmtDate(points[0].date)}</text>
      <text x={toX(points.length - 1)} y={H - 2} fill="var(--muted)" fontSize="9" textAnchor="middle">{fmtDate(points[points.length - 1].date)}</text>
    </svg>
  );
}

/* ── Win/Loss Bar ────────────────────────────────────── */
function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (!total) return null;
  const wPct = (wins / total) * 100;
  return (
    <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--panel-2)', width: '100%', marginTop: '8px' }}>
      <div style={{ width: `${wPct}%`, background: '#00e676', transition: 'width 0.3s' }} />
      <div style={{ width: `${100 - wPct}%`, background: '#ff5252', transition: 'width 0.3s' }} />
    </div>
  );
}

/* ── FILTERS ─────────────────────────────────────────── */
type SortKey = 'date' | 'pnl' | 'coin' | 'size';
type FilterStatus = 'all' | 'closed' | 'open' | 'wins' | 'losses';

/* ── Expanded Trade Detail ───────────────────────────── */
function TradeDetail({ trade }: { trade: Trade }) {
  const pnl = n(trade.pnl_dollar);
  return (
    <div style={{
      background: 'var(--panel)', borderRadius: '12px', padding: '16px', marginTop: '8px',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px',
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
        <span style={{ color: 'var(--muted)' }}>P&L</span>
        <div style={{ fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{trade.pnl_dollar ? fmt$(pnl) : '—'}</div>
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
        <div>{holdTime(trade.entered_at, trade.exited_at)}</div>
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PER_PAGE = 25;

  // Find first trading board
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Get trading settings to find boardId
        const settingsRes = await fetch('/api/trading/settings');
        const settingsJson = await settingsRes.json();
        const boardId = settingsJson?.settings?.boardId || settingsJson?.board_id || 15;

        const [tradesRes, statsRes] = await Promise.all([
          fetch(`/api/trading/trades?boardId=${boardId}&status=all`),
          fetch(`/api/trading/trades/stats?boardId=${boardId}`),
        ]);
        const tradesJson = await tradesRes.json();
        const statsJson = await statsRes.json();
        setTrades(Array.isArray(tradesJson?.trades) ? tradesJson.trades : []);
        setStats(statsJson || null);
      } catch {
        setTrades([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  /* filter + sort + search */
  const filtered = useMemo(() => {
    let list = [...trades];

    // status filter
    if (statusFilter === 'closed') list = list.filter(t => t.column_name === 'Wins' || t.column_name === 'Losses');
    else if (statusFilter === 'open') list = list.filter(t => t.column_name === 'Active');
    else if (statusFilter === 'wins') list = list.filter(t => t.column_name === 'Wins');
    else if (statusFilter === 'losses') list = list.filter(t => t.column_name === 'Losses');

    // search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.coin_pair.toLowerCase().includes(q) ||
        (t.created_by_name || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q) ||
        (t.tbo_signal || '').toLowerCase().includes(q)
      );
    }

    // sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date': cmp = new Date(a.exited_at || a.entered_at || a.created_at).getTime() - new Date(b.exited_at || b.entered_at || b.created_at).getTime(); break;
        case 'pnl': cmp = n(a.pnl_dollar) - n(b.pnl_dollar); break;
        case 'coin': cmp = a.coin_pair.localeCompare(b.coin_pair); break;
        case 'size': cmp = n(a.position_size) - n(b.position_size); break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [trades, statusFilter, search, sortKey, sortAsc]);

  const paged = useMemo(() => filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }, [sortKey, sortAsc]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [search, statusFilter, sortKey, sortAsc]);

  const closedTrades = useMemo(() => trades.filter(t => t.column_name === 'Wins' || t.column_name === 'Losses'), [trades]);

  /* coin breakdown for closed trades */
  const coinBreakdown = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; pnl: number; trades: number }>();
    for (const t of closedTrades) {
      const coin = t.coin_pair.replace(/\/USDT|USDT/i, '');
      const entry = map.get(coin) || { wins: 0, losses: 0, pnl: 0, trades: 0 };
      entry.trades++;
      entry.pnl += n(t.pnl_dollar);
      if (t.column_name === 'Wins') entry.wins++; else entry.losses++;
      map.set(coin, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
  }, [closedTrades]);

  if (loading) {
    return (
      <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ flex: '1 1 140px', height: '90px', borderRadius: '14px', background: 'var(--card)', border: '1px solid var(--border)', animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
        <style jsx>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.15; } }`}</style>
      </div>
    );
  }

  const s = stats || { total_trades: 0, open_trades: 0, wins: 0, losses: 0, win_rate: 0, total_pnl: 0, avg_trade: 0, best_trade: 0, worst_trade: 0 };

  return (
    <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* ── Stats Cards ──────────────────────────────── */}
      <section style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatCard label="Total Closed" value={String(s.total_trades)} sub={`${s.open_trades} open`} />
        <StatCard
          label="Win Rate"
          value={`${s.win_rate.toFixed(1)}%`}
          sub={`${s.wins}W / ${s.losses}L`}
          color={s.win_rate >= 50 ? 'var(--green)' : s.win_rate > 0 ? 'var(--red)' : undefined}
        />
        <StatCard label="Total P&L" value={fmt$(s.total_pnl)} color={s.total_pnl >= 0 ? 'var(--green)' : 'var(--red)'} />
        <StatCard label="Avg Trade" value={fmt$(s.avg_trade)} color={s.avg_trade >= 0 ? 'var(--green)' : 'var(--red)'} />
        <StatCard label="Best / Worst" value={fmt$(s.best_trade)} sub={fmt$(s.worst_trade)} color="var(--green)" />
      </section>

      {/* ── P&L Curve + Win/Loss + Coin Breakdown ──── */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Cumulative P&L</div>
          <CumulativePnlChart trades={trades} />
          <WinLossBar wins={s.wins} losses={s.losses} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
            <span style={{ color: 'var(--green)' }}>● {s.wins} wins</span>
            <span style={{ color: 'var(--red)' }}>● {s.losses} losses</span>
          </div>
        </div>

        {/* Coin Breakdown */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>By Coin</div>
          {coinBreakdown.length === 0 && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No closed trades yet</div>}
          <div style={{ display: 'grid', gap: '8px' }}>
            {coinBreakdown.map(([coin, data]) => (
              <div key={coin} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'var(--panel)', borderRadius: '10px' }}>
                <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>{coinIcon(coin + 'USDT')}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{coin}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{data.trades} trades · {data.wins}W/{data.losses}L</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: data.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmt$(data.pnl)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Search + Filters ─────────────────────────── */}
      <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search trades (coin, trader, notes...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 36px', borderRadius: '10px',
                border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)',
                fontSize: '13px', outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '14px' }}>🔍</span>
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {([['all', 'All'], ['open', 'Open'], ['closed', 'Closed'], ['wins', 'Wins'], ['losses', 'Losses']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                style={{
                  padding: '6px 14px', borderRadius: '999px', border: '1px solid var(--border)',
                  background: statusFilter === key ? 'var(--accent)' : 'transparent',
                  color: statusFilter === key ? '#0d0d1f' : 'var(--text)',
                  fontSize: '12px', cursor: 'pointer', fontWeight: statusFilter === key ? 600 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
            {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Trade Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {([
                  ['coin', 'Coin'],
                  ['', 'Dir'],
                  ['', 'Status'],
                  ['size', 'Size'],
                  ['pnl', 'P&L'],
                  ['', 'Return'],
                  ['date', 'Date'],
                  ['', 'Hold'],
                ] as [SortKey | '', string][]).map(([key, label], i) => (
                  <th
                    key={i}
                    onClick={key ? () => handleSort(key as SortKey) : undefined}
                    style={{
                      padding: '10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left',
                      cursor: key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                    {key && sortKey === key && <span style={{ marginLeft: '4px' }}>{sortAsc ? '↑' : '↓'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>No trades match your filters</td></tr>
              )}
              {paged.map((trade) => {
                const pnl = n(trade.pnl_dollar);
                const pnlPct = n(trade.pnl_percent);
                const isExpanded = expandedId === trade.id;
                const isWin = trade.column_name === 'Wins';
                const isLoss = trade.column_name === 'Losses';
                const isActive = trade.column_name === 'Active';
                const statusLabel = isWin ? 'Win' : isLoss ? 'Loss' : isActive ? 'Open' : trade.column_name;
                const statusColor = isWin ? 'var(--green)' : isLoss ? 'var(--red)' : isActive ? '#7b7dff' : 'var(--muted)';
                const coin = trade.coin_pair.replace(/\/USDT|USDT/i, '');

                return (
                  <tr key={trade.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : trade.id)}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      {/* Row */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 60px 70px 80px 90px 80px 100px 70px',
                        alignItems: 'center',
                        padding: '10px 8px',
                        borderBottom: isExpanded ? 'none' : '1px solid var(--border)',
                        background: isExpanded ? 'rgba(123,125,255,0.04)' : 'transparent',
                        transition: 'background 0.15s',
                      }}>
                        {/* Coin */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>{coinIcon(trade.coin_pair)}</span>
                          <span style={{ fontWeight: 600 }}>{coin}</span>
                        </div>
                        {/* Direction */}
                        <div>
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            background: trade.direction === 'LONG' ? 'rgba(0,230,118,0.12)' : 'rgba(255,82,82,0.12)',
                            color: trade.direction === 'LONG' ? 'var(--green)' : 'var(--red)',
                          }}>
                            {trade.direction || '—'}
                          </span>
                        </div>
                        {/* Status */}
                        <div style={{ fontSize: '12px', color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
                        {/* Size */}
                        <div style={{ fontSize: '12px' }}>{trade.position_size ? fmt$(n(trade.position_size)) : '—'}</div>
                        {/* P&L */}
                        <div style={{ fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {trade.pnl_dollar != null ? fmt$(pnl) : '—'}
                        </div>
                        {/* Return % */}
                        <div style={{ fontSize: '12px', color: pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {trade.pnl_percent != null ? fmtPct(pnlPct) : '—'}
                        </div>
                        {/* Date */}
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {fmtDateTime(trade.exited_at || trade.entered_at || trade.created_at)}
                        </div>
                        {/* Hold */}
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {holdTime(trade.entered_at, trade.exited_at)}
                        </div>
                      </div>
                      {/* Expanded detail */}
                      {isExpanded && <TradeDetail trade={trade} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: page === 0 ? 'var(--muted)' : 'var(--text)', cursor: page === 0 ? 'default' : 'pointer', fontSize: '12px' }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: page >= totalPages - 1 ? 'var(--muted)' : 'var(--text)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: '12px' }}
            >
              Next →
            </button>
          </div>
        )}
      </section>

      {/* Mobile grid fix */}
      <style jsx>{`
        @media (max-width: 768px) {
          section[style*="gridTemplateColumns: '1fr 320px'"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
