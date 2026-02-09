'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';
import { ToastStack, type ToastItem } from '@/components/ToastStack';
import { PieChart } from '@/components/PieChart';

type CoinPulse = {
  pair: string;
  price: number;
  change24h: number;
  change7d?: number;
};

type Bot = {
  id: number;
  name: string;
  status: string;
  return_pct?: number;
  strategy_style?: string;
  strategy_substyle?: string;
  performance?: {
    total_trades?: number;
    return_pct?: number;
    total_return?: number;
  };
  total_trades?: number;
};

type PortfolioSnapshot = {
  timestamp?: string;
  total_value?: number;
};

type PortfolioStats = {
  summary?: {
    total_portfolio_value?: number;
    total_realized_pnl?: number;
    total_unrealized_pnl?: number;
    daily_pnl?: number;
    weekly_pnl?: number;
    paper_balance?: number;
  };
  snapshots?: PortfolioSnapshot[];
  byCoin?: Array<{ coin_pair: string; total_pnl: number }>;
};

type Board = {
  id: number;
  board_type: string;
};

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

const RISK_OPTIONS = [
  {
    label: 'Conservative',
    level: 2,
    description: 'Steady and safe. Focus on BTC and large caps.',
    allocation: '60% BTC, 30% Large Alts, 10% Mid',
    strategy: 'swing_mean_reversion',
  },
  {
    label: 'Balanced',
    level: 4,
    description: 'Mix of stability and growth.',
    allocation: '45% BTC, 35% Large Alts, 20% Mid',
    strategy: 'swing_momentum',
  },
  {
    label: 'Growth',
    level: 6,
    description: 'Higher returns, more volatility.',
    allocation: '30% BTC, 40% Large Alts, 30% Mid',
    strategy: 'day_momentum',
  },
  {
    label: 'Aggressive',
    level: 8,
    description: 'Max gains, stomach required.',
    allocation: '20% BTC, 40% Large Alts, 40% Mid/Small',
    strategy: 'scalper_momentum',
  },
  {
    label: 'YOLO',
    level: 10,
    description: 'Small caps, memes, full send.',
    allocation: '10% BTC, 30% Large Alts, 60% Small/Meme',
    strategy: 'scalper_grid',
  },
] as const;

const WATCHLIST = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'XRP/USDT',
  'ADA/USDT',
  'AVAX/USDT',
  'LINK/USDT',
  'DOGE/USDT',
  'MATIC/USDT',
  'DOT/USDT',
  'ATOM/USDT',
  'LTC/USDT',
  'NEAR/USDT',
  'OP/USDT',
  'ARB/USDT',
  'INJ/USDT',
  'SUI/USDT',
  'SEI/USDT',
  'APT/USDT',
  'TIA/USDT',
  'RNDR/USDT',
  'PEPE/USDT',
  'SHIB/USDT',
  'BONK/USDT',
];

const STYLE_OPTIONS = ['Swing', 'Day', 'Scalper', 'Fundamental', 'Long-Term'] as const;

const SUBSTYLE_MAP: Record<(typeof STYLE_OPTIONS)[number], string[]> = {
  Swing: ['Momentum', 'Mean Reversion', 'Breakout'],
  Day: ['Momentum', 'VWAP', 'Range Play'],
  Scalper: ['Momentum', 'Grid', 'Liquidity'],
  Fundamental: ['Catalyst', 'Value', 'Rotation'],
  'Long-Term': ['Core', 'Growth', 'Income'],
};

const NEWS_SOURCES = {
  CoinDesk: { label: 'CoinDesk', color: '#f39a26' },
  CoinTelegraph: { label: 'CoinTelegraph', color: '#1b6bff' },
  'Yahoo Finance': { label: 'Yahoo Finance', color: '#8b5cf6' },
} as const;

function formatCurrency(value: number, { compact = false } = {}) {
  if (!Number.isFinite(value)) return '—';
  if (compact) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
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

function formatShortDate(ts?: string) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTimeAgo(ts?: string) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildLinePath(values: number[], width: number, height: number, padding = 20) {
  const safeValues = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const points = safeValues.map((value, index) => {
    const x = padding + (index / (safeValues.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((value - min) / range) * chartHeight;
    return { x, y };
  });

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const area = `${path} L ${padding + chartWidth} ${padding + chartHeight} L ${padding} ${padding + chartHeight} Z`;
  return { path, area, min, max };
}

export default function TradingDashboardPage() {
  const [pulse, setPulse] = useState<CoinPulse[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsError, setNewsError] = useState(false);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [isCompact, setIsCompact] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('500');
  const [selectedRisk, setSelectedRisk] = useState<(typeof RISK_OPTIONS)[number] | null>(RISK_OPTIONS[1]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [botCount, setBotCount] = useState(1);
  const [style, setStyle] = useState<(typeof STYLE_OPTIONS)[number]>('Swing');
  const [substyle, setSubstyle] = useState(SUBSTYLE_MAP.Swing[0]);
  const [includeCoins, setIncludeCoins] = useState<string[]>([]);
  const [excludeCoins, setExcludeCoins] = useState<string[]>([]);
  const [rebalanceOn, setRebalanceOn] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const pushToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    if (toastTimersRef.current[id]) {
      clearTimeout(toastTimersRef.current[id]);
    }
    toastTimersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete toastTimersRef.current[id];
    }, 3000);
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const [coinsRes, botsRes, portfolioRes, boardsRes, newsRes] = await Promise.allSettled([
        fetch('/api/v1/prices?top=25'),
        fetch('/api/v1/bots'),
        fetch('/api/v1/portfolio'),
        fetch('/api/v1/boards'),
        fetch('/api/v1/news'),
      ]);

      if (coinsRes.status === 'fulfilled' && coinsRes.value.ok) {
        const coinsJson = await coinsRes.value.json();
        setPulse(Array.isArray(coinsJson?.coins) ? coinsJson.coins : []);
      } else {
        setPulse([]);
      }

      if (botsRes.status === 'fulfilled' && botsRes.value.ok) {
        const botsJson = await botsRes.value.json();
        setBots(Array.isArray(botsJson?.bots) ? botsJson.bots : []);
      } else {
        setBots([]);
      }

      if (portfolioRes.status === 'fulfilled' && portfolioRes.value.ok) {
        const portfolioJson = await portfolioRes.value.json();
        setPortfolio(portfolioJson || null);
      } else {
        setPortfolio(null);
      }

      if (boardsRes.status === 'fulfilled' && boardsRes.value.ok) {
        const boardsJson = await boardsRes.value.json();
        const boards = Array.isArray(boardsJson?.boards) ? boardsJson.boards : [];
        const tradingBoard = boards.find((b: Board) => b.board_type === 'trading');
        if (tradingBoard?.id) setBoardId(tradingBoard.id);
      }

      if (newsRes.status === 'fulfilled' && newsRes.value.ok) {
        const newsJson = await newsRes.value.json();
        const items = Array.isArray(newsJson?.items) ? newsJson.items : [];
        setNewsItems(items);
        setNewsError(false);
      } else {
        setNewsItems([]);
        setNewsError(true);
      }
    } catch {
      setPulse([]);
      setBots([]);
      setPortfolio(null);
      setNewsItems([]);
      setNewsError(true);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const nextSubstyle = SUBSTYLE_MAP[style][0];
    setSubstyle(nextSubstyle);
  }, [style]);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modalOpen]);

  useEffect(() => {
    const updateLayout = () => setIsCompact(window.innerWidth < 980);
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const paperBalance = Number(portfolio?.summary?.paper_balance ?? 0);

  const snapshots = portfolio?.snapshots ?? [];
  const snapshotValues = useMemo(() => {
    if (snapshots.length) {
      return snapshots
        .map((snap) => Number(snap.total_value ?? 0))
        .filter((value) => Number.isFinite(value));
    }
    return [];
  }, [snapshots]);

  const chartValues = snapshotValues.length ? snapshotValues : [paperBalance || 0, paperBalance || 0];
  const { path: equityPath, area: equityArea, min: equityMin, max: equityMax } = useMemo(
    () => buildLinePath(chartValues, 600, 220, 24),
    [chartValues]
  );

  const firstSnapshot = snapshots[0]?.timestamp;
  const lastSnapshot = snapshots[snapshots.length - 1]?.timestamp;

  const allocationData = useMemo(() => {
    if (!portfolio?.byCoin?.length) return [];
    const colors = ['#7b7dff', '#00e676', '#2196f3', '#ff9800', '#e91e63', '#f5b544', '#44d9e6'];
    return portfolio.byCoin
      .map((coin, index) => ({
        label: coin.coin_pair,
        value: Math.abs(Number(coin.total_pnl ?? 0)),
        color: colors[index % colors.length],
      }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0);
  }, [portfolio]);

  const movers = useMemo(() => {
    return [...pulse]
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
      .slice(0, 10);
  }, [pulse]);

  const parsedAmount = Number(amountInput.replace(/[^0-9.]/g, ''));
  const amountReady = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const selectedSummary = selectedRisk ? `${formatCurrency(parsedAmount, { compact: true })} at ${selectedRisk.label} risk` : 'Select a risk level';

  const handleToggleCoin = (coin: string, type: 'include' | 'exclude') => {
    if (type === 'include') {
      setIncludeCoins(prev => (prev.includes(coin) ? prev.filter(item => item !== coin) : [...prev, coin]));
      setExcludeCoins(prev => prev.filter(item => item !== coin));
      return;
    }
    setExcludeCoins(prev => (prev.includes(coin) ? prev.filter(item => item !== coin) : [...prev, coin]));
    setIncludeCoins(prev => prev.filter(item => item !== coin));
  };

  const handleConfirm = async () => {
    if (!selectedRisk || !amountReady || !boardId || creating) return;
    setCreating(true);
    try {
      const botNumber = bots.length + 1;
      const name = `Penny's ${selectedRisk.label} Bot #${botNumber}`;
      const body = {
        name,
        strategy: selectedRisk.strategy,
        risk_level: selectedRisk.level,
        auto_trade: true,
        board_id: boardId,
      };
      const res = await fetch('/api/v1/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to create bot');
      setModalOpen(false);
      pushToast('Trading started! 🚀', 'success');
      await loadDashboard();
    } catch {
      pushToast('Could not start trading. Try again.', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/icons/clawdesk-mark.png" alt="" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>Trading Command Center</h1>
        </div>
      </header>
      <TradingNav activeTab="dashboard" />

      <section
        style={{
          marginTop: '24px',
          background: 'linear-gradient(180deg, rgba(123,125,255,0.08), rgba(0,0,0,0))',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '28px clamp(18px, 4vw, 40px) 30px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          Portfolio Value
        </div>
        <div style={{ marginTop: '12px', fontSize: 'clamp(40px, 7vw, 56px)', fontWeight: 700 }}>
          {formatCurrency(paperBalance)}
        </div>
        <div style={{ marginTop: '18px' }}>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              ...primaryBtnStyle,
              padding: '16px 34px',
              fontSize: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 14px 30px rgba(123, 125, 255, 0.25)',
            }}
          >
            <span style={{ display: 'inline-flex', width: '18px', height: '18px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3l14 9-14 9 4-9-4-9z" />
              </svg>
            </span>
            Start Trading
          </button>
          <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--muted)' }}>Set your risk. We handle everything else.</div>
        </div>
      </section>

      <section
        style={{
          marginTop: '26px',
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, 1fr)',
          gap: '16px',
        }}
      >
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 600 }}>
            Portfolio Value
          </div>
          <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)' }}>
              <span>{formatCurrency(equityMin)}</span>
              <span>{formatCurrency(equityMax)}</span>
            </div>
            <div style={{ position: 'relative' }}>
              <svg width="100%" height="220" viewBox="0 0 600 220" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="portfolioFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={equityArea} fill="url(#portfolioFill)" />
                <path d={equityPath} stroke="var(--accent)" strokeWidth="2.6" fill="none" />
              </svg>
              {!snapshotValues.length && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '12px',
                    color: 'var(--muted)',
                  }}
                >
                  No history yet
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)' }}>
              <span>{formatShortDate(firstSnapshot)}</span>
              <span>{formatShortDate(lastSnapshot)}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 600 }}>
            Allocation
          </div>
          <div style={{ marginTop: '12px' }}>
            {allocationData.length ? (
              <PieChart data={allocationData} size={220} />
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No positions yet</div>
            )}
          </div>
        </div>
      </section>

      <section style={{ marginTop: '28px' }}>
        <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 600, marginBottom: '10px' }}>
          Your Bots
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '12px' }}>
          {bots.length ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isCompact ? '1.2fr 1fr 1fr' : '1.4fr 1.1fr 1fr 0.9fr 0.8fr',
                  gap: '10px',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--muted)',
                  padding: '4px 8px',
                }}
              >
                <span>Bot</span>
                {!isCompact && <span>Strategy</span>}
                <span>Status</span>
                <span>Return</span>
                {!isCompact && <span>Trades</span>}
              </div>
              {bots.map((bot) => {
                const statusColor = bot.status === 'running' ? 'var(--green)' : bot.status === 'paused' ? '#f5b544' : 'var(--muted)';
                const returnPct = Number(bot.return_pct ?? bot.performance?.return_pct ?? bot.performance?.total_return ?? 0);
                const tradesCount = Number(bot.performance?.total_trades ?? bot.total_trades ?? 0);
                const tradeLabel = Number.isFinite(tradesCount) ? tradesCount : '—';
                const strategyLabel = [bot.strategy_style, bot.strategy_substyle].filter(Boolean).join(' · ');
                return (
                  <div
                    key={bot.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isCompact ? '1.2fr 1fr 1fr' : '1.4fr 1.1fr 1fr 0.9fr 0.8fr',
                      gap: '10px',
                      alignItems: 'center',
                      padding: '10px 8px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'var(--panel-2)',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{bot.name}</div>
                    {!isCompact && <div style={{ color: 'var(--muted)' }}>{strategyLabel || '—'}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: statusColor }} />
                      <span style={{ color: 'var(--muted)' }}>{bot.status}</span>
                    </div>
                    <div style={{ color: returnPct >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {returnPct >= 0 ? '+' : ''}{formatPercent(returnPct)}
                    </div>
                    {!isCompact && <div style={{ color: 'var(--muted)' }}>{tradeLabel}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '12px' }}>
              No bots yet. Hit Start Trading to create one.
            </div>
          )}
        </div>
      </section>

      <section
        style={{
          marginTop: '28px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)' }}>
            Market Movers
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Top 10</span>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isCompact ? '1.2fr 1fr 1fr' : '1.2fr 1fr 1fr 1fr',
              gap: '10px',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--muted)',
              padding: '4px 6px',
            }}
          >
            <span>Pair</span>
            <span>Price</span>
            <span>24h</span>
            {!isCompact && <span>7d</span>}
          </div>
          {movers.map((coin) => {
            const changeColor = Number(coin.change24h) >= 0 ? 'var(--green)' : 'var(--red)';
            const changeArrow = Number(coin.change24h) >= 0 ? '▲' : '▼';
            const raw7d = Number((coin as any).change7d ?? (coin as any).change7d_pct ?? (coin as any).change7dPercent ?? NaN);
            const change7d = Number.isFinite(raw7d) ? raw7d : null;
            const change7dColor = change7d !== null && change7d >= 0 ? 'var(--green)' : 'var(--red)';
            return (
              <div
                key={coin.pair}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isCompact ? '1.2fr 1fr 1fr' : '1.2fr 1fr 1fr 1fr',
                  gap: '10px',
                  alignItems: 'center',
                  padding: '10px 6px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--panel-2)',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontWeight: 600 }}>{coin.pair}</div>
                <div style={{ color: 'var(--muted)' }}>{formatCurrency(Number(coin.price))}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: changeColor, fontWeight: 600 }}>
                  <span style={{ ...pillStyle, padding: '2px 8px', borderColor: changeColor, color: changeColor }}>
                    {changeArrow}
                  </span>
                  {formatPercent(Number(coin.change24h))}
                </div>
                {!isCompact && (
                  <div style={{ color: change7d === null ? 'var(--muted)' : change7dColor, fontWeight: 600 }}>
                    {change7d === null ? '—' : formatPercent(change7d)}
                  </div>
                )}
              </div>
            );
          })}
          {!movers.length && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading prices...</span>}
        </div>
      </section>

      <section style={{ marginTop: '28px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: '10px' }}>
          Market News
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
          {newsError ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Unable to load news</div>
          ) : newsItems.length ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              {newsItems.map((item) => {
                const badge = NEWS_SOURCES[item.source as keyof typeof NEWS_SOURCES];
                return (
                  <div
                    key={`${item.link}-${item.pubDate}`}
                    style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'auto 1fr auto', gap: '10px', alignItems: 'center' }}
                  >
                    <span
                      style={{
                        ...pillStyle,
                        borderColor: badge?.color ?? 'var(--border)',
                        color: badge?.color ?? 'var(--text)',
                        padding: '4px 10px',
                        justifySelf: 'start',
                      }}
                    >
                      {badge?.label ?? item.source}
                    </span>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--text)', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}
                    >
                      {item.title}
                    </a>
                    {!isCompact && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{formatTimeAgo(item.pubDate)}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading news...</div>
          )}
        </div>
      </section>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 7, 18, 0.65)',
            backdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 80,
            padding: '20px',
            animation: 'fadeIn 180ms ease-out',
          }}
        >
          <div
            style={{
              width: 'min(520px, 92vw)',
              background: 'var(--panel)',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              padding: '24px',
              boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
              display: 'grid',
              gap: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>
                  Start Trading
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>Set your plan</div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '18px',
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>How much do you want to trade?</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px', color: 'var(--muted)' }}>$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text)',
                    textAlign: 'center',
                    fontSize: '28px',
                    fontWeight: 700,
                    padding: '6px 12px',
                    width: '180px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {['50', '100', '250', '500', '1000', 'Custom'].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => value === 'Custom' ? setAmountInput('') : setAmountInput(value)}
                    style={{
                      ...pillStyle,
                      borderColor: amountInput === value ? 'var(--accent)' : 'var(--border)',
                      color: amountInput === value ? 'var(--accent)' : 'var(--text)',
                    }}
                  >
                    ${value}
                  </button>
                ))}
              </div>
              <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--muted)' }}>Paper Balance: {formatCurrency(paperBalance)}</div>
            </div>

            <div style={{ display: 'grid', gap: '12px', opacity: amountReady ? 1 : 0.6 }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Choose your risk level</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                {RISK_OPTIONS.map((option) => {
                  const active = selectedRisk?.label === option.label;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      disabled={!amountReady}
                      onClick={() => setSelectedRisk(option)}
                      style={{
                        textAlign: 'left',
                        background: 'var(--panel-2)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: '16px',
                        padding: '12px',
                        color: 'var(--text)',
                        cursor: amountReady ? 'pointer' : 'not-allowed',
                        boxShadow: active ? '0 0 18px rgba(123,125,255,0.35)' : 'none',
                        transform: active ? 'scale(1.02)' : 'scale(1)',
                        transition: 'transform 160ms ease, box-shadow 160ms ease, border 160ms ease',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>{option.label}</div>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--muted)' }}>{option.description}</div>
                      <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted)' }}>{option.allocation}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'grid', gap: '8px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>Confirm</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{selectedSummary}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Penny will select coins, set strategies, and manage your portfolio.
              </div>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!amountReady || !selectedRisk || creating}
                style={{
                  ...primaryBtnStyle,
                  width: '100%',
                  justifyContent: 'center',
                  padding: '14px 18px',
                  opacity: !amountReady || !selectedRisk ? 0.6 : 1,
                  cursor: !amountReady || !selectedRisk ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? 'Launching…' : "Let's Go"}
              </button>
              <button
                type="button"
                onClick={() => setAdvancedOpen(prev => !prev)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Advanced Options →
              </button>
            </div>

            {advancedOpen && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', display: 'grid', gap: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)' }}>
                  Advanced Options
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Number of bots</label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={botCount}
                    onChange={(event) => setBotCount(Number(event.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{botCount} bots</div>
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Trading style</label>
                  <select
                    value={style}
                    onChange={(event) => setStyle(event.target.value as (typeof STYLE_OPTIONS)[number])}
                    style={{
                      background: 'var(--panel-2)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '8px 10px',
                    }}
                  >
                    {STYLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Sub-style</label>
                  <select
                    value={substyle}
                    onChange={(event) => setSubstyle(event.target.value)}
                    style={{
                      background: 'var(--panel-2)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '8px 10px',
                    }}
                  >
                    {SUBSTYLE_MAP[style].map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Include coins</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {WATCHLIST.map((coin) => (
                      <button
                        key={`include-${coin}`}
                        type="button"
                        onClick={() => handleToggleCoin(coin, 'include')}
                        style={{
                          ...pillStyle,
                          borderColor: includeCoins.includes(coin) ? 'var(--accent)' : 'var(--border)',
                          color: includeCoins.includes(coin) ? 'var(--accent)' : 'var(--text)',
                        }}
                      >
                        {coin}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Exclude coins</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {WATCHLIST.map((coin) => (
                      <button
                        key={`exclude-${coin}`}
                        type="button"
                        onClick={() => handleToggleCoin(coin, 'exclude')}
                        style={{
                          ...pillStyle,
                          borderColor: excludeCoins.includes(coin) ? 'var(--red)' : 'var(--border)',
                          color: excludeCoins.includes(coin) ? 'var(--red)' : 'var(--text)',
                        }}
                      >
                        {coin}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>Rebalance</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Auto-adjust allocations</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRebalanceOn(prev => !prev)}
                    style={{
                      width: '48px',
                      height: '26px',
                      borderRadius: '999px',
                      border: `1px solid ${rebalanceOn ? 'var(--accent)' : 'var(--border)'}`,
                      background: rebalanceOn ? 'var(--accent)' : 'var(--panel-2)',
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '3px',
                        left: rebalanceOn ? '26px' : '4px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '999px',
                        background: '#0d0d1f',
                        transition: 'left 160ms ease',
                      }}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => {
          if (toastTimersRef.current[id]) {
            clearTimeout(toastTimersRef.current[id]);
            delete toastTimersRef.current[id];
          }
          setToasts(prev => prev.filter(t => t.id !== id));
        }}
      />
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
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const pillStyle: React.CSSProperties = {
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  padding: '6px 12px',
  borderRadius: '999px',
  fontSize: '11px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
};
