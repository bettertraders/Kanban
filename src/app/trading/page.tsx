'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';
import { ToastStack, type ToastItem } from '@/components/ToastStack';
import PriceTicker from '@/components/PriceTicker';
import Link from 'next/link';

type CoinPulse = {
  pair: string;
  price: number;
  change24h: number;
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
    total_trades?: number;
  };
  byCoin?: Array<{ coin_pair: string; total_pnl: number }>;
};

type Board = {
  id: number;
  board_type: string;
};

type MarketSentiment = {
  value?: number;
  label?: string;
};

type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

const RISK_LEVELS: Record<RiskLevel, { label: string; icon: string; description: string }> = {
  conservative: { label: 'Conservative', icon: '🛡️', description: 'Steady growth. BTC, ETH and top large caps. Best for new traders.' },
  moderate: { label: 'Moderate', icon: '⚖️', description: 'Balanced returns. Top 20 coins, mixed strategies.' },
  aggressive: { label: 'Aggressive', icon: '🔥', description: 'Higher risk for bigger upside. Momentum plays, trending coins.' },
};

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TradingDashboardPage() {
  const [pulse, setPulse] = useState<CoinPulse[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);

  // Setup state (persisted to localStorage)
  const [riskLevel, setRiskLevel] = useState<RiskLevel | null>(null);
  const [tradingAmount, setTradingAmount] = useState<number | null>(null);
  const [tboEnabled, setTboEnabled] = useState(false);
  const [engineOn, setEngineOn] = useState(false);

  // Modal state
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('500');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem('clawdesk-trading-setup') || '{}');
      if (saved.riskLevel) setRiskLevel(saved.riskLevel);
      if (saved.tradingAmount) setTradingAmount(saved.tradingAmount);
      if (saved.tboEnabled !== undefined) setTboEnabled(saved.tboEnabled);
      if (saved.engineOn !== undefined) setEngineOn(saved.engineOn);
    } catch {}
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('clawdesk-trading-setup', JSON.stringify({ riskLevel, tradingAmount, tboEnabled, engineOn }));
  }, [riskLevel, tradingAmount, tboEnabled, engineOn]);

  const pushToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
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
        const j = await coinsRes.value.json();
        setPulse(Array.isArray(j?.coins) ? j.coins : []);
      }
      if (botsRes.status === 'fulfilled' && botsRes.value.ok) {
        const j = await botsRes.value.json();
        setBots(Array.isArray(j?.bots) ? j.bots : []);
      }
      if (portfolioRes.status === 'fulfilled' && portfolioRes.value.ok) {
        const j = await portfolioRes.value.json();
        setPortfolio(j || null);
      }
      if (boardsRes.status === 'fulfilled' && boardsRes.value.ok) {
        const j = await boardsRes.value.json();
        const boards = Array.isArray(j?.boards) ? j.boards : [];
        const tb = boards.find((b: Board) => b.board_type === 'trading');
        if (tb?.id) setBoardId(tb.id);
      }
    } catch {}
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  // Fetch market sentiment
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/market/sentiment');
        if (res.ok) {
          const data = await res.json();
          setSentiment(data);
        }
      } catch {}
    })();
  }, []);

  const paperBalance = Number(portfolio?.summary?.paper_balance ?? 0);
  const dailyPnl = Number(portfolio?.summary?.daily_pnl ?? 0);
  const dailyPnlPct = paperBalance > 0 ? (dailyPnl / (paperBalance - dailyPnl)) * 100 : 0;
  const winRate = Number(portfolio?.summary?.win_rate ?? 0);
  const activePositions = Number(portfolio?.summary?.active_positions ?? 0);
  const totalTrades = Number(portfolio?.summary?.total_trades ?? bots.reduce((sum, b) => sum + (b.total_trades ?? b.performance?.total_trades ?? 0), 0));

  const setupReady = riskLevel !== null && tradingAmount !== null;
  const allConfigured = setupReady && tboEnabled && engineOn;

  const activeBots = bots.filter(b => b.status === 'running');
  const engineStatusText = engineOn
    ? `Active — watching ${activeBots.length > 0 ? activeBots.length : pulse.length > 5 ? 5 : pulse.length} coins, ${activePositions} active trades`
    : 'Paused — all trading stopped';

  const btcCoin = pulse.find(c => c.pair?.includes('BTC'));
  const ethCoin = pulse.find(c => c.pair?.includes('ETH'));

  const handleEngineToggle = useCallback(async () => {
    if (!setupReady) return;
    const next = !engineOn;
    setEngineOn(next);

    if (next && boardId) {
      // Start bots
      try {
        for (const bot of bots) {
          if (bot.status !== 'running') {
            await fetch(`/api/v1/bots/${bot.id}/start`, { method: 'POST' });
          }
        }
        if (bots.length === 0) {
          // Create a default bot
          const riskMap = { conservative: 2, moderate: 5, aggressive: 8 };
          const stratMap = { conservative: 'swing_mean_reversion', moderate: 'swing_momentum', aggressive: 'scalper_momentum' };
          await fetch('/api/v1/bots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${RISK_LEVELS[riskLevel!].label} Bot`,
              strategy: stratMap[riskLevel!],
              risk_level: riskMap[riskLevel!],
              auto_trade: true,
              board_id: boardId,
            }),
          });
        }
        pushToast('Engine started! 🚀', 'success');
        await loadDashboard();
      } catch {
        pushToast('Failed to start engine', 'error');
      }
    } else {
      // Stop bots
      try {
        for (const bot of bots) {
          if (bot.status === 'running') {
            await fetch(`/api/v1/bots/${bot.id}/stop`, { method: 'POST' });
          }
        }
        pushToast('Engine paused', 'warning');
        await loadDashboard();
      } catch {}
    }
  }, [engineOn, setupReady, boardId, bots, riskLevel, pushToast, loadDashboard]);

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
                Configure &amp; Monitor
              </div>
            </div>
          </div>
        </header>
        <TradingNav activeTab="dashboard" />

        {/* Section 1: Your Trading Setup */}
        <section style={{ marginTop: '24px', marginBottom: '24px' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px 24px', display: 'grid', gap: '0' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Your Trading Setup</div>

            {/* Row 1: Risk Level */}
            <SetupRow
              label="Risk Level"
              isSet={riskLevel !== null}
              value={riskLevel ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{RISK_LEVELS[riskLevel].icon}</span>
                  <span style={{ fontWeight: 600 }}>{RISK_LEVELS[riskLevel].label}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '12px' }}>— {RISK_LEVELS[riskLevel].description}</span>
                </span>
              ) : (
                <span style={{ color: '#f5b544' }}>⚠️ Not Set — Choose your risk level</span>
              )}
              onSet={() => setRiskModalOpen(true)}
            />

            <Divider />

            {/* Row 2: Trading Amount */}
            <SetupRow
              label="Trading Amount"
              isSet={tradingAmount !== null}
              value={tradingAmount !== null ? (
                <span>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(tradingAmount)}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '12px', marginLeft: '8px' }}>Paper trading — no real money</span>
                </span>
              ) : (
                <span style={{ color: '#f5b544' }}>⚠️ Not Set — Enter your trading amount</span>
              )}
              onSet={() => { setAmountInput(String(tradingAmount ?? 500)); setAmountModalOpen(true); }}
            />

            <Divider />

            {/* Row 3: Intelligence Layer (TBO PRO) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>Intelligence Layer (TBO PRO)</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>AI signal enhancement from TBO indicators</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: tboEnabled ? '#4ade80' : 'var(--muted)' }}>
                  {tboEnabled ? 'Active' : 'Off'}
                </span>
                <ToggleSwitch on={tboEnabled} onChange={() => setTboEnabled(prev => !prev)} />
              </div>
            </div>
            {!tboEnabled && <SubtlePrompt />}

            <Divider />

            {/* Row 4: Bot Engine */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>Bot Engine</div>
                <div style={{ fontSize: '12px', color: engineOn ? '#4ade80' : 'var(--muted)' }}>
                  {engineStatusText}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ToggleSwitch
                  on={engineOn}
                  onChange={handleEngineToggle}
                  disabled={!setupReady}
                  big
                  glow={engineOn}
                />
              </div>
            </div>
            {!setupReady && (
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', paddingBottom: '4px' }}>
                Set risk level and trading amount to enable the engine
              </div>
            )}

            {/* Success state */}
            {allConfigured && (
              <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', fontSize: '13px', color: '#4ade80' }}>
                ✅ You&apos;re all set!{' '}
                {boardId ? (
                  <Link href={`/trading/${boardId}`} style={{ color: '#4ade80', textDecoration: 'underline' }}>
                    Head to the Board to watch your trades →
                  </Link>
                ) : (
                  'Head to the Board to watch your trades.'
                )}
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Status at a Glance */}
        <section style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: '12px' }}>
            Status at a Glance
          </div>
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px' }}>
            {[
              { label: 'Paper Balance', value: formatCurrency(paperBalance) },
              { label: "Today's P&L", value: `${dailyPnl >= 0 ? '+' : ''}${formatCurrency(dailyPnl)} (${dailyPnlPct >= 0 ? '+' : ''}${dailyPnlPct.toFixed(1)}%)`, color: dailyPnl >= 0 ? '#4ade80' : '#f05b6f' },
              { label: 'Win Rate', value: `${winRate.toFixed(0)}%`, color: winRate >= 50 ? '#4ade80' : winRate > 0 ? '#f05b6f' : undefined },
              { label: 'Active Positions', value: String(activePositions) },
              { label: 'Total Trades', value: String(totalTrades) },
            ].map((stat) => (
              <div key={stat.label} style={{ flex: '1 1 0', minWidth: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px 12px' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.label}</div>
                <div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Market Summary */}
        <section style={{ marginBottom: '24px' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text)' }}>
              Market: {sentiment?.label ?? 'Unknown'} ({sentiment?.value ?? '—'})
              {btcCoin && <> · BTC {formatCurrency(btcCoin.price)} {btcCoin.change24h >= 0 ? '▲' : '▼'}{Math.abs(btcCoin.change24h).toFixed(1)}%</>}
              {ethCoin && <> · ETH {formatCurrency(ethCoin.price)} {ethCoin.change24h >= 0 ? '▲' : '▼'}{Math.abs(ethCoin.change24h).toFixed(1)}%</>}
            </div>
            <Link href="/trading/market" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>
              See full market →
            </Link>
          </div>
        </section>

        {/* Section 4: Advanced (collapsed) */}
        <section style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setAdvancedOpen(prev => !prev)}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: advancedOpen ? '14px 14px 0 0' : '14px',
              padding: '12px 16px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              color: 'var(--text)',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <span>⚙️ Advanced Settings</span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{advancedOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {advancedOpen && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '16px', display: 'grid', gap: '16px' }}>
              <AdvancedRow label="Manual Trade" description="Pick a specific coin and enter a trade manually" />
              <AdvancedRow label="Strategy Override" description="Choose a specific strategy instead of auto" />
              <AdvancedRow label="Stop Loss / Take Profit" description="Customize SL/TP for all new trades" />
              <AdvancedRow label="Position Sizing" description="Set rules for how much to allocate per trade" />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Compounding</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Reinvest profits into new trades</div>
                </div>
                <ToggleSwitch on={true} onChange={() => {}} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Trading Timeframe</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['10 days', '30 days', '60 days', '90 days', 'Unlimited'].map(tf => (
                    <button key={tf} style={{ padding: '6px 14px', borderRadius: '999px', border: '1px solid var(--border)', background: tf === 'Unlimited' ? 'rgba(123,125,255,0.2)' : 'var(--panel-2)', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' }}>
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Your Bots section (compact) */}
        {bots.length > 0 && (
          <section style={{ marginTop: '18px' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 600, marginBottom: '12px' }}>
              Your Bots
            </div>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
              {bots.map((bot) => {
                const statusColor = bot.status === 'running' ? 'var(--green, #4ade80)' : bot.status === 'paused' ? '#f5b544' : 'var(--muted)';
                const returnPct = Number(bot.return_pct ?? bot.performance?.return_pct ?? 0);
                return (
                  <div key={bot.id} style={{ minWidth: '200px', height: '100px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--panel)', padding: '12px', display: 'grid', gap: '4px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{bot.name}</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: returnPct >= 0 ? '#4ade80' : '#f05b6f' }}>
                      {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                    </div>
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

        {/* Risk Level Modal */}
        {riskModalOpen && (
          <div onClick={e => { if (e.target === e.currentTarget) setRiskModalOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,15,0.78)', display: 'grid', placeItems: 'center', zIndex: 90 }}>
            <div style={{ width: 'min(640px, 92vw)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Choose Your Risk Level</div>
                <button onClick={() => setRiskModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {(Object.entries(RISK_LEVELS) as [RiskLevel, typeof RISK_LEVELS[RiskLevel]][]).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => { setRiskLevel(key); setRiskModalOpen(false); pushToast(`Risk set to ${val.label}`, 'success'); }}
                    style={{
                      background: riskLevel === key ? 'rgba(123,125,255,0.15)' : 'var(--panel-2)',
                      border: `2px solid ${riskLevel === key ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '16px',
                      padding: '20px 16px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      color: 'var(--text)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>{val.icon}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>{val.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4' }}>{val.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Amount Modal */}
        {amountModalOpen && (
          <div onClick={e => { if (e.target === e.currentTarget) setAmountModalOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,15,0.78)', display: 'grid', placeItems: 'center', zIndex: 90 }}>
            <div style={{ width: 'min(420px, 92vw)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Set Trading Amount</div>
                <button onClick={() => setAmountModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="number"
                  value={amountInput}
                  onChange={e => setAmountInput(e.target.value)}
                  placeholder="500"
                  style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '12px 14px', borderRadius: '12px', fontSize: '18px', fontWeight: 600, outline: 'none' }}
                  autoFocus
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', padding: '8px 12px', background: 'rgba(123,125,255,0.08)', borderRadius: '8px' }}>
                📝 Paper trading — no real money. This sets the virtual balance for your trading bot.
              </div>
              <button
                onClick={() => {
                  const parsed = Number(amountInput);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setTradingAmount(parsed);
                    setAmountModalOpen(false);
                    pushToast(`Amount set to ${formatCurrency(parsed)}`, 'success');
                  }
                }}
                style={{ width: '100%', background: 'linear-gradient(135deg, var(--accent), #9a9cff)', color: '#0d0d1f', border: 'none', padding: '12px', borderRadius: '999px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        <ToastStack
          toasts={toasts}
          onDismiss={(id) => {
            if (toastTimersRef.current[id]) { clearTimeout(toastTimersRef.current[id]); delete toastTimersRef.current[id]; }
            setToasts(prev => prev.filter(t => t.id !== id));
          }}
        />

        <style jsx global>{`
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(123,125,255,0.25); }
            50% { box-shadow: 0 0 35px rgba(123,125,255,0.5); }
          }
        `}</style>
      </div>
    </>
  );
}

/* ── Subcomponents ── */

function SetupRow({ label, isSet, value, onSet }: { label: string; isSet: boolean; value: React.ReactNode; onSet: () => void }) {
  return (
    <div style={{ padding: '14px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{label}</div>
          <div style={{ fontSize: '13px' }}>{value}</div>
        </div>
        <button
          onClick={onSet}
          style={{
            background: isSet ? 'transparent' : 'linear-gradient(135deg, var(--accent), #9a9cff)',
            color: isSet ? 'var(--accent)' : '#0d0d1f',
            border: isSet ? '1px solid var(--border)' : 'none',
            padding: '6px 14px',
            borderRadius: '999px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '12px',
            whiteSpace: 'nowrap',
          }}
        >
          {isSet ? 'Change' : 'Set'}
        </button>
      </div>
      {!isSet && <SubtlePrompt />}
    </div>
  );
}

function SubtlePrompt() {
  return (
    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', fontStyle: 'italic' }}>
      Set this to start trading ↑
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', background: 'var(--border)' }} />;
}

function ToggleSwitch({ on, onChange, disabled, big, glow }: { on: boolean; onChange: () => void; disabled?: boolean; big?: boolean; glow?: boolean }) {
  const w = big ? 56 : 44;
  const h = big ? 30 : 24;
  const dot = big ? 22 : 16;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      style={{
        width: `${w}px`,
        height: `${h}px`,
        borderRadius: '999px',
        border: `1px solid ${on ? '#4ade80' : 'var(--border)'}`,
        background: on ? '#4ade80' : 'var(--panel-2)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        boxShadow: glow ? '0 0 16px rgba(74,222,128,0.5)' : 'none',
        transition: 'all 0.2s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: `${(h - dot) / 2 - 1}px`,
        left: on ? `${w - dot - 4}px` : '3px',
        width: `${dot}px`,
        height: `${dot}px`,
        borderRadius: '999px',
        background: '#0d0d1f',
        transition: 'left 160ms ease',
      }} />
    </button>
  );
}

function AdvancedRow({ label, description }: { label: string; description: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{description}</div>
      </div>
      <button style={{ padding: '6px 14px', borderRadius: '999px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' }}>
        Configure
      </button>
    </div>
  );
}
