'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';
// TboToggle moved to board page
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

type PortfolioStats = {
  summary?: {
    total_portfolio_value?: number;
    total_realized_pnl?: number;
    total_unrealized_pnl?: number;
    daily_pnl?: number;
    weekly_pnl?: number;
    paper_balance?: number;
    win_rate?: number;
    active_positions?: number;
  };
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
  const [riskLevel, setRiskLevel] = useState(5);
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

  const btcPulse = useMemo(
    () => pulse.find((coin) => coin.pair.toUpperCase().startsWith('BTC')),
    [pulse]
  );

  const btcChange = Number(btcPulse?.change24h ?? 0);
  const sentiment =
    Math.abs(btcChange) < 0.5
      ? { label: 'Sideways', emoji: '➡️', bg: 'linear-gradient(135deg, rgba(123,125,255,0.2), rgba(123,125,255,0.05))', color: 'var(--text)' }
      : btcChange >= 0.5
        ? { label: 'Bullish', emoji: '🐂', bg: 'linear-gradient(135deg, rgba(74,222,128,0.25), rgba(74,222,128,0.08))', color: 'var(--green)' }
        : { label: 'Bearish', emoji: '🐻', bg: 'linear-gradient(135deg, rgba(240,91,111,0.25), rgba(240,91,111,0.08))', color: 'var(--red)' };

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

      {/* Portfolio Rebalancer */}
      <section style={{ marginTop: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: '12px' }}>
          Portfolio Rebalancer
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          {[
            { label: 'Portfolio Value', value: formatCurrency(Number(portfolio?.summary?.total_portfolio_value ?? 0)) },
            { label: 'Realized P&L', value: formatCurrency(Number(portfolio?.summary?.total_realized_pnl ?? 0)) },
            { label: 'Unrealized P&L', value: formatCurrency(Number(portfolio?.summary?.total_unrealized_pnl ?? 0)) },
            { label: 'Win Rate', value: `${Number(portfolio?.summary?.win_rate ?? 0).toFixed(2)}%` },
            { label: 'Active Positions', value: String(portfolio?.summary?.active_positions ?? 0) },
          ].map((stat) => (
            <div key={stat.label} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{stat.label}</div>
              <div style={{ marginTop: '10px', fontSize: '20px', fontWeight: 700 }}>{stat.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: '12px' }}>
              Allocation Breakdown
            </div>
            {allocationData.length > 0 ? (
              <PieChart data={allocationData} size={200} centerLabel={`${allocationData.length} assets`} />
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No allocation data yet. Start trading to see your breakdown.</div>
            )}
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', display: 'grid', gap: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)' }}>
              Rebalancer Controls
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Risk Level</label>
              <input type="range" min={1} max={10} value={riskLevel} onChange={(e) => setRiskLevel(Number(e.target.value))} style={{ width: '100%' }} />
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Target risk: {riskLevel}/10</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>Auto-Rebalance</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Auto-adjust allocations</div>
              </div>
              <button
                type="button"
                onClick={() => setRebalanceOn(prev => !prev)}
                style={{ width: '48px', height: '26px', borderRadius: '999px', border: `1px solid ${rebalanceOn ? 'var(--accent)' : 'var(--border)'}`, background: rebalanceOn ? 'var(--accent)' : 'var(--panel-2)', position: 'relative', cursor: 'pointer' }}
              >
                <span style={{ position: 'absolute', top: '3px', left: rebalanceOn ? '26px' : '4px', width: '18px', height: '18px', borderRadius: '999px', background: '#0d0d1f', transition: 'left 160ms ease' }} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button style={primaryBtnStyle}>Run Rebalance</button>
              <button style={secondaryBtnStyle}>Adjust Targets</button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Automation hooks coming soon. Connect a bot to apply live allocations.
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: '18px' }}>
        <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 600, marginBottom: '12px' }}>
          Your Bots
        </div>
        {bots.length ? (
          <div className="bot-row" style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {bots.map((bot) => {
              const statusColor = bot.status === 'running' ? 'var(--green)' : bot.status === 'paused' ? '#f5b544' : 'var(--muted)';
              const returnPct = Number(bot.return_pct ?? bot.performance?.return_pct ?? bot.performance?.total_return ?? 0);
              const strategyLabel = [bot.strategy_style, bot.strategy_substyle].filter(Boolean).join(' · ');
              const performanceBg = returnPct > 1
                ? 'linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.02))'
                : returnPct < -1
                  ? 'linear-gradient(135deg, rgba(240,91,111,0.08), rgba(240,91,111,0.02))'
                  : 'linear-gradient(135deg, rgba(123,125,255,0.08), rgba(123,125,255,0.02))';
              return (
                <div
                  key={bot.id}
                  className="fade-in"
                  style={{
                    minWidth: '200px',
                    height: '120px',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    background: performanceBg,
                    padding: '12px',
                    display: 'grid',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{bot.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{strategyLabel || '—'}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: returnPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {returnPct >= 0 ? '+' : ''}{formatPercent(returnPct)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: statusColor }} />
                    {bot.status}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              border: '1px dashed var(--border)',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              background: 'var(--panel)',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No bots yet. Start a Trade to spin up your first one.</div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{ ...primaryBtnStyle, padding: '10px 18px', animation: 'pulse-glow 3s ease-in-out infinite' }}
            >
              Start a Trade
            </button>
          </div>
        )}
      </section>

      <div style={sectionDividerStyle} />

      {/* Market Section — Sentiment at top, News below on left */}
      <section style={{ marginTop: '18px' }}>
        <div
          style={{
            background: sentiment.bg,
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)' }}>
            Market Sentiment
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: sentiment.color }}>
            {sentiment.emoji} {sentiment.label}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: '10px' }}>
              Market News
            </div>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
              {newsError ? (
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Unable to load news</div>
              ) : newsItems.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {newsItems.slice(0, 5).map((item, index) => {
                    const badge = NEWS_SOURCES[item.source as keyof typeof NEWS_SOURCES];
                    return (
                      <div
                        key={`${item.link}-${item.pubDate}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'auto 1fr auto',
                          gap: '10px',
                          alignItems: 'center',
                          paddingLeft: index === 0 ? '10px' : '0',
                          borderLeft: index === 0 ? '2px solid #f3c226' : '2px solid transparent',
                        }}
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
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{formatTimeAgo(item.pubDate)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading news...</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <style jsx global>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(123,125,255,0.25); }
          50% { box-shadow: 0 0 35px rgba(123,125,255,0.5); }
        }
        @keyframes live-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in {
          animation: fade-in 240ms ease-out;
        }
      `}</style>

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
                  Start a Trade
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

const sectionDividerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, transparent, rgba(243,194,38,0.3), rgba(123,125,255,0.3), transparent)',
  height: '1px',
  margin: '20px 0',
};
