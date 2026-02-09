'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';
import { ToastStack, type ToastItem } from '@/components/ToastStack';

type CoinPulse = {
  pair: string;
  price: number;
  change24h: number;
  volume24h?: number;
};

type Bot = {
  id: number;
  name: string;
  status: string;
  return_pct?: number;
};

type Execution = {
  id: number;
  action: string;
  executed_at: string;
  bot_name?: string;
  board_name?: string;
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
};

type Board = {
  id: number;
  board_type: string;
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

function buildSparkPath(values: number[], width: number, height: number) {
  if (values.length < 2) {
    return `M 0 ${height / 2} L ${width} ${height / 2}`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function seededValues(seed: string, count = 12) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000;
  }
  const values = [] as number[];
  let current = (hash % 50) + 50;
  for (let i = 0; i < count; i += 1) {
    const delta = ((hash + i * 13) % 20) - 10;
    current = Math.max(10, Math.min(100, current + delta));
    values.push(current);
  }
  return values;
}

export default function TradingDashboardPage() {
  const [pulse, setPulse] = useState<CoinPulse[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);

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
      const [coinsRes, botsRes, portfolioRes, execRes, boardsRes] = await Promise.all([
        fetch('/api/v1/prices?top=5'),
        fetch('/api/v1/bots'),
        fetch('/api/v1/portfolio'),
        fetch('/api/v1/bots/executions?limit=8'),
        fetch('/api/v1/boards'),
      ]);

      const coinsJson = await coinsRes.json();
      setPulse(Array.isArray(coinsJson?.coins) ? coinsJson.coins : []);

      const botsJson = await botsRes.json();
      setBots(Array.isArray(botsJson?.bots) ? botsJson.bots : []);

      const portfolioJson = await portfolioRes.json();
      setPortfolio(portfolioJson || null);

      const execJson = await execRes.json();
      setExecutions(Array.isArray(execJson?.executions) ? execJson.executions : []);

      const boardsJson = await boardsRes.json();
      const boards = Array.isArray(boardsJson?.boards) ? boardsJson.boards : [];
      const tradingBoard = boards.find((b: Board) => b.board_type === 'trading');
      if (tradingBoard?.id) setBoardId(tradingBoard.id);
    } catch {
      setPulse([]);
      setBots([]);
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

  const portfolioValue = Number(portfolio?.summary?.total_portfolio_value ?? 0);
  const realized = Number(portfolio?.summary?.total_realized_pnl ?? 0);
  const unrealized = Number(portfolio?.summary?.total_unrealized_pnl ?? 0);
  const totalPnl = realized + unrealized;
  const dailyPnl = Number(portfolio?.summary?.daily_pnl ?? 0);
  const weeklyPnl = Number(portfolio?.summary?.weekly_pnl ?? 0);
  const paperBalance = Number(portfolio?.summary?.paper_balance ?? 10000);

  const equityValues = useMemo(() => {
    if (portfolio?.snapshots?.length) {
      return portfolio.snapshots
        .map((snap) => Number(snap.total_value ?? 0))
        .filter((value) => Number.isFinite(value) && value > 0);
    }
    return [];
  }, [portfolio]);

  const heroValues = equityValues.length >= 6 ? equityValues : Array.from({ length: 12 }, (_, i) => 50 + i * 2);
  const heroPath = buildSparkPath(heroValues, 600, 80);
  const heroArea = `${heroPath} L 600 80 L 0 80 Z`;

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
          padding: '26px clamp(18px, 4vw, 40px) 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          Portfolio Value
        </div>
        <div style={{ marginTop: '10px', fontSize: 'clamp(36px, 6vw, 48px)', fontWeight: 700 }}>
          {formatCurrency(portfolioValue || paperBalance)}
        </div>
        <div style={{ marginTop: '16px' }}>
          <svg width="100%" height="80" viewBox="0 0 600 80" preserveAspectRatio="none">
            <defs>
              <linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={heroArea} fill="url(#equityFill)" />
            <path d={heroPath} stroke="var(--accent)" strokeWidth="2.2" fill="none" />
          </svg>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
          {[
            { label: 'Today', value: dailyPnl },
            { label: 'This Week', value: weeklyPnl },
            { label: 'All Time', value: totalPnl },
          ].map((chip) => {
            const tone = chip.value >= 0 ? 'var(--green)' : 'var(--red)';
            return (
              <span
                key={chip.label}
                style={{
                  padding: '6px 12px',
                  borderRadius: '999px',
                  background: 'var(--panel)',
                  border: `1px solid ${tone}`,
                  color: tone,
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {chip.label}: {chip.value >= 0 ? '+' : ''}{formatCurrency(Math.abs(chip.value))}
              </span>
            );
          })}
        </div>
      </section>

      {bots.length > 0 && (
        <section style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: '10px' }}>
            Active Bots
          </div>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '6px' }}>
            {bots.map((bot) => {
              const statusColor = bot.status === 'running' ? 'var(--green)' : bot.status === 'paused' ? '#f5b544' : 'var(--muted)';
              return (
                <div
                  key={bot.id}
                  style={{
                    minWidth: '160px',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    padding: '12px',
                    display: 'grid',
                    gap: '8px',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{bot.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{formatPercent(Number(bot.return_pct ?? 0))}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: statusColor }} />
                    {bot.status}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ marginTop: '28px', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
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
            Market Pulse
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Top 5</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {pulse.map((coin) => {
            const sparkValues = seededValues(coin.pair);
            const sparkPath = buildSparkPath(sparkValues, 120, 28);
            return (
              <div
                key={coin.pair}
                style={{
                  borderRadius: '14px',
                  padding: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--panel-2)',
                  display: 'grid',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>{coin.pair}</span>
                  <span style={{ fontSize: '12px', color: Number(coin.change24h) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {formatPercent(Number(coin.change24h))}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{formatCurrency(Number(coin.price))}</div>
                <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none">
                  <path d={sparkPath} stroke="var(--accent)" strokeWidth="1.8" fill="none" />
                </svg>
              </div>
            );
          })}
          {!pulse.length && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading prices...</span>}
        </div>
      </section>

      <section style={{ marginTop: '28px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: '10px' }}>
          Recent Bot Activity
        </div>
        <div style={{ display: 'grid', gap: '10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px' }}>
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
};

