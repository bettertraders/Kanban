'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PieChart } from '@/components/PieChart';
import { RiskSlider } from '@/components/RiskSlider';
import { getTargetAllocation, calculateDrift } from '@/lib/rebalancer';

type Bot = {
  id: number;
  name: string;
  board_id: number;
  status: string;
  strategy_style: string;
  strategy_substyle: string;
  strategy_config?: any;
  auto_trade?: boolean;
  rebalancer_enabled?: boolean;
  rebalancer_config?: any;
  performance?: any;
};

type Execution = {
  id: number;
  action: string;
  executed_at: string;
  details?: any;
};

type Trade = {
  id: number;
  bot_id?: number;
  coin_pair: string;
  direction?: string;
  entry_price?: number | string | null;
  exit_price?: number | string | null;
  current_price?: number | string | null;
  position_size?: number | string | null;
  pnl_dollar?: number | string | null;
  pnl_percent?: number | string | null;
  status?: string | null;
  column_name?: string | null;
  entered_at?: string | null;
  exited_at?: string | null;
  notes?: string | null;
};

type PortfolioSnapshot = {
  allocations: any;
  total_value: number;
  snapshot_at: string;
  pie?: Array<{ label: string; value: number }>;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return `$${value.toFixed(decimals)}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  running: { color: 'var(--green)', bg: 'rgba(0,230,118,0.18)' },
  stopped: { color: '#9ca3af', bg: 'rgba(148,163,184,0.18)' },
  paused: { color: '#f5b544', bg: 'rgba(245,181,68,0.2)' }
};

const ALLOC_COLORS: Record<string, string> = {
  stablecoins: '#7b7dff',
  bitcoin: '#00e676',
  largeCapAlts: '#2196f3',
  midCapAlts: '#ff9800',
  smallCapAlts: '#e91e63'
};

export default function BotDetailPage() {
  const params = useParams();
  const botId = params.id as string;

  const [bot, setBot] = useState<Bot | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [riskLevel, setRiskLevel] = useState(5);
  const [strategyConfig, setStrategyConfig] = useState({
    maxPositions: 6,
    positionSizePercent: 10,
    stopLossPercent: 4,
    takeProfitPercent: 8
  });

  useEffect(() => {
    if (!botId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const botRes = await fetch(`/api/v1/bots/${botId}`);
        const botJson = await botRes.json();
        if (cancelled) return;
        setBot(botJson?.bot ?? null);
        setExecutions(Array.isArray(botJson?.executions) ? botJson.executions : []);
        setPortfolio(botJson?.currentPortfolio ?? null);
        const strategy = botJson?.bot?.strategy_config ?? {};
        setStrategyConfig({
          maxPositions: toNumber(strategy.maxPositions ?? 6),
          positionSizePercent: toNumber(strategy.positionSizePercent ?? 10),
          stopLossPercent: toNumber(strategy.stopLossPercent ?? 4),
          takeProfitPercent: toNumber(strategy.takeProfitPercent ?? 8)
        });
        const risk = Number(botJson?.bot?.rebalancer_config?.riskLevel ?? botJson?.bot?.strategy_config?.riskLevel ?? 5);
        setRiskLevel(Number.isFinite(risk) ? risk : 5);

        if (botJson?.bot?.board_id) {
          const tradesRes = await fetch(`/api/v1/trades?boardId=${botJson.bot.board_id}`);
          const tradesJson = await tradesRes.json();
          if (!cancelled) setTrades(Array.isArray(tradesJson?.trades) ? tradesJson.trades : []);
        }
        const portfolioRes = await fetch(`/api/v1/bots/${botId}/portfolio`);
        const portfolioJson = await portfolioRes.json();
        if (!cancelled) {
          setPortfolio(portfolioJson?.current ?? null);
          setHistory(Array.isArray(portfolioJson?.history) ? portfolioJson.history : []);
        }
      } catch {
        if (!cancelled) setBot(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [botId]);

  useEffect(() => {
    if (!botId) return;
    const source = new EventSource(`/api/v1/bots/${botId}/stream`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.executions) {
          setExecutions((prev) => [...payload.executions, ...prev].slice(0, 50));
        }
      } catch {
        // ignore parsing errors
      }
    };
    return () => {
      source.close();
    };
  }, [botId]);

  const activeTrades = useMemo(
    () => trades.filter((trade) => Number(trade.bot_id) === Number(bot?.id) && (trade.status === 'active' || trade.column_name === 'Active')),
    [trades, bot]
  );
  const tradeHistory = useMemo(
    () => trades
      .filter((trade) => Number(trade.bot_id) === Number(bot?.id))
      .sort((a, b) => new Date(b.exited_at || b.entered_at || '').getTime() - new Date(a.exited_at || a.entered_at || '').getTime())
      .slice(0, 50),
    [trades, bot]
  );

  const stats = useMemo(() => {
    const pnlValues = tradeHistory.map((trade) => toNumber(trade.pnl_dollar ?? 0));
    const totalTrades = tradeHistory.length;
    const wins = pnlValues.filter((value) => value > 0).length;
    const losses = pnlValues.filter((value) => value < 0).length;
    const avgPnl = pnlValues.length ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
    const best = pnlValues.length ? Math.max(...pnlValues) : 0;
    const worst = pnlValues.length ? Math.min(...pnlValues) : 0;
    const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;
    return {
      totalTrades,
      winRate,
      avgPnl,
      best,
      worst,
      sharpe: toNumber(bot?.performance?.sharpe_ratio ?? 0)
    };
  }, [tradeHistory, bot]);

  const balance = toNumber(bot?.performance?.balance ?? bot?.performance?.current_balance ?? 0);
  const pnl = toNumber(bot?.performance?.total_pnl ?? bot?.performance?.total_return ?? 0);
  const statusStyle = STATUS_COLORS[bot?.status || 'stopped'] || STATUS_COLORS.stopped;

  const allocationData = useMemo(() => {
    if (portfolio?.pie?.length) {
      return portfolio.pie.map((item) => ({
        label: item.label,
        value: item.value,
        color: ALLOC_COLORS[String(item.label).toLowerCase() as keyof typeof ALLOC_COLORS] || '#7b7dff'
      }));
    }
    const target = getTargetAllocation(riskLevel);
    return [
      { label: 'stablecoins', value: target.stablecoins, color: ALLOC_COLORS.stablecoins },
      { label: 'bitcoin', value: target.bitcoin, color: ALLOC_COLORS.bitcoin },
      { label: 'largeCapAlts', value: target.largeCapAlts, color: ALLOC_COLORS.largeCapAlts },
      { label: 'midCapAlts', value: target.midCapAlts, color: ALLOC_COLORS.midCapAlts },
      { label: 'smallCapAlts', value: target.smallCapAlts, color: ALLOC_COLORS.smallCapAlts }
    ];
  }, [portfolio, riskLevel]);

  const targetAllocation = getTargetAllocation(riskLevel);
  const drift = useMemo(() => {
    if (!portfolio?.allocations) return null;
    if (typeof portfolio.allocations !== 'object' || Array.isArray(portfolio.allocations)) return null;
    return calculateDrift(portfolio.allocations, targetAllocation);
  }, [portfolio, targetAllocation]);

  const equitySeries = useMemo(() => {
    const points = history
      .slice()
      .reverse()
      .map((snap) => ({ date: snap.snapshot_at, value: toNumber(snap.total_value, 0) }))
      .filter((point) => Number.isFinite(point.value));
    return points.length ? points : [{ date: new Date().toISOString(), value: balance }];
  }, [history, balance]);

  const equityChart = useMemo(() => {
    const w = 520;
    const h = 200;
    const pad = 24;
    const chartW = w - pad * 2;
    const chartH = h - pad * 2;
    const values = equitySeries.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const toPoint = (value: number, index: number) => {
      const x = pad + (index / (values.length - 1 || 1)) * chartW;
      const y = pad + chartH - ((value - min) / range) * chartH;
      return `${x},${y}`;
    };
    return { w, h, points: equitySeries.map((p, i) => toPoint(p.value, i)).join(' ') };
  }, [equitySeries]);

  const handleStatus = async (action: 'start' | 'stop' | 'pause') => {
    if (!bot) return;
    await fetch(`/api/v1/bots/${bot.id}/${action}`, { method: 'POST' });
    const res = await fetch(`/api/v1/bots/${bot.id}`);
    const json = await res.json();
    setBot(json?.bot ?? bot);
  };

  const handleSaveConfig = async () => {
    if (!bot) return;
    setSavingConfig(true);
    try {
      await fetch(`/api/v1/bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_config: strategyConfig })
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRiskApply = async () => {
    if (!bot) return;
    await fetch(`/api/v1/bots/${bot.id}/rebalancer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ riskLevel })
    });
  };

  const handleRebalanceNow = async () => {
    if (!bot) return;
    await fetch(`/api/v1/bots/${bot.id}/execute`, { method: 'POST' });
  };

  if (loading && !bot) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <div style={{ color: 'var(--muted)' }}>Loading bot...</div>
      </div>
    );
  }

  if (!bot) return null;

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link href="/bots" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '20px' }}>←</Link>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>{bot.name}</h1>
            <button style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: '999px', fontSize: '11px' }}>
              Edit
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '999px', color: statusStyle.color, background: statusStyle.bg, border: `1px solid ${statusStyle.color}33`, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
              {bot.status}
            </span>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {bot.strategy_style} — {bot.strategy_substyle}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>
            Balance {formatCurrency(balance)} · P&amp;L <span style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(pnl)}</span>
          </div>
          <button onClick={() => handleStatus(bot.status === 'running' ? 'stop' : 'start')} style={{ background: bot.status === 'running' ? 'transparent' : 'var(--accent)', color: bot.status === 'running' ? 'var(--text)' : '#0d0d1f', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px' }}>
            {bot.status === 'running' ? 'Stop' : 'Start'}
          </button>
          <button onClick={() => handleStatus('pause')} style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px' }}>
            Pause
          </button>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          ['Total Trades', stats.totalTrades],
          ['Win Rate', `${stats.winRate.toFixed(0)}%`],
          ['Avg P&L', formatCurrency(stats.avgPnl)],
          ['Best Trade', formatCurrency(stats.best)],
          ['Worst Trade', formatCurrency(stats.worst)],
          ['Sharpe', stats.sharpe.toFixed(2)]
        ].map(([label, value]) => (
          <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</div>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: '20px' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>Equity Curve</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{history.length} snapshots</div>
            </div>
            <svg width="100%" viewBox={`0 0 ${equityChart.w} ${equityChart.h}`}>
              <polyline points={equityChart.points} fill="none" stroke="var(--accent)" strokeWidth="2" />
              <line x1="0" y1={equityChart.h - 1} x2={equityChart.w} y2={equityChart.h - 1} stroke="var(--border)" strokeWidth="1" />
            </svg>
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
            <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '12px' }}>Active Trades</div>
            {activeTrades.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '12px' }}>No active positions.</div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {activeTrades.map((trade) => (
                  <div key={trade.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{trade.coin_pair}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Entry {formatCurrency(toNumber(trade.entry_price))}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        {formatCurrency(toNumber(trade.current_price ?? trade.entry_price))}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatPercent(toNumber(trade.pnl_percent))}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>Recent Activity</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Live via SSE</div>
            </div>
            <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'grid', gap: '10px' }}>
              {executions.map((exec) => (
                <div key={exec.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{exec.action}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{new Date(exec.executed_at).toLocaleString()}</div>
                  </div>
                  {exec.details?.pnl && (
                    <div style={{ fontSize: '12px', color: exec.details.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {formatCurrency(toNumber(exec.details.pnl))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>Portfolio Allocation</div>
              {bot.rebalancer_enabled && (
                <button onClick={handleRebalanceNow} style={{ background: 'var(--accent)', color: '#0d0d1f', border: 'none', padding: '6px 12px', borderRadius: '999px', fontSize: '11px', cursor: 'pointer' }}>
                  Rebalance Now
                </button>
              )}
            </div>
            <div style={{ marginTop: '12px' }}>
              <PieChart data={allocationData} size={200} centerLabel={formatCurrency(toNumber(portfolio?.total_value ?? balance))} />
            </div>
            {drift && (
              <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--muted)' }}>
                Drift: {Object.entries(drift).map(([key, value]) => `${key} ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`).join(' · ')}
              </div>
            )}
            <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
              {Object.entries(targetAllocation).map(([key, value]) => (
                <div key={key} style={{ display: 'grid', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                    <span>{key}</span>
                    <span>{value}%</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${value}%`, height: '100%', background: ALLOC_COLORS[key] || 'var(--accent)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
            <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '12px' }}>Strategy Config</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {[
                ['Max positions', 'maxPositions'],
                ['Position size %', 'positionSizePercent'],
                ['Stop loss %', 'stopLossPercent'],
                ['Take profit %', 'takeProfitPercent']
              ].map(([label, key]) => (
                <label key={key} style={{ display: 'grid', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                  {label}
                  <input
                    type="number"
                    value={(strategyConfig as any)[key]}
                    onChange={(event) => setStrategyConfig((prev) => ({ ...prev, [key]: Number(event.target.value) }))}
                    style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: '10px' }}
                  />
                </label>
              ))}
              <button onClick={handleSaveConfig} style={{ background: 'var(--accent)', color: '#0d0d1f', border: 'none', padding: '8px 14px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer', opacity: savingConfig ? 0.7 : 1 }}>
                {savingConfig ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
            <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '12px' }}>Risk Slider</div>
            <RiskSlider value={riskLevel} onChange={setRiskLevel} showAllocation />
            <button onClick={handleRiskApply} style={{ marginTop: '12px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer' }}>
              Apply
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: '24px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
        <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '12px' }}>Trade History</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                {['Date', 'Pair', 'Direction', 'Entry', 'Exit', 'P&L', 'Hold Time', 'Strategy Signal'].map((label) => (
                  <th key={label} style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tradeHistory.map((trade) => (
                <tr key={trade.id} style={{ borderBottom: '1px solid rgba(42,42,74,0.4)' }}>
                  <td style={{ padding: '8px 6px' }}>{trade.exited_at ? new Date(trade.exited_at).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{trade.coin_pair}</td>
                  <td style={{ padding: '8px 6px' }}>{trade.direction || 'long'}</td>
                  <td style={{ padding: '8px 6px' }}>{formatCurrency(toNumber(trade.entry_price))}</td>
                  <td style={{ padding: '8px 6px' }}>{formatCurrency(toNumber(trade.exit_price))}</td>
                  <td style={{ padding: '8px 6px', color: toNumber(trade.pnl_dollar) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {formatCurrency(toNumber(trade.pnl_dollar))}
                  </td>
                  <td style={{ padding: '8px 6px' }}>{trade.entered_at && trade.exited_at ? `${Math.max(1, Math.round((new Date(trade.exited_at).getTime() - new Date(trade.entered_at).getTime()) / 3600000))}h` : '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{trade.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
