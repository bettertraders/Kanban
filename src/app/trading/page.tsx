'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';
// TboToggle moved to board page
import { ToastStack, type ToastItem } from '@/components/ToastStack';
import { PieChart } from '@/components/PieChart';
import { StartTradeModal } from '@/components/StartTradeModal';
import PriceTicker from '@/components/PriceTicker';

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

export default function TradingDashboardPage() {
  const [pulse, setPulse] = useState<CoinPulse[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
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
      const [coinsRes, botsRes, portfolioRes, boardsRes] = await Promise.allSettled([
        fetch('/api/v1/prices?top=25'),
        fetch('/api/v1/bots'),
        fetch('/api/v1/portfolio'),
        fetch('/api/v1/boards'),
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

    } catch {
      setPulse([]);
      setBots([]);
      setPortfolio(null);
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
    <>
    <PriceTicker />
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/icons/clawdesk-mark.png" alt="" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>Trading Command Center</h1>
            <div style={{ color: 'var(--muted)', fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              Portfolio &amp; Risk Management
            </div>
          </div>
        </div>
      </header>
      <TradingNav activeTab="dashboard" />

      {/* Portfolio Rebalancer */}
      <section style={{ marginTop: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: '12px' }}>
          Portfolio Rebalancer
        </div>
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Portfolio Value', value: formatCurrency(Number(portfolio?.summary?.total_portfolio_value ?? 0)) },
            { label: 'Realized P&L', value: formatCurrency(Number(portfolio?.summary?.total_realized_pnl ?? 0)) },
            { label: 'Unrealized P&L', value: formatCurrency(Number(portfolio?.summary?.total_unrealized_pnl ?? 0)) },
            { label: 'Win Rate', value: `${Number(portfolio?.summary?.win_rate ?? 0).toFixed(2)}%` },
            { label: 'Active Positions', value: String(portfolio?.summary?.active_positions ?? 0) },
          ].map((stat) => (
            <div key={stat.label} style={{ flex: '1 1 0', minWidth: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px 12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.label}</div>
              <div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 700 }}>{stat.value}</div>
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
        <StartTradeModal
          boardId={boardId}
          existingBotCount={bots.length}
          paperBalance={paperBalance}
          onClose={() => setModalOpen(false)}
          onSuccess={async () => {
            setModalOpen(false);
            pushToast('Trading started! 🚀', 'success');
            await loadDashboard();
          }}
        />
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
    </>
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
