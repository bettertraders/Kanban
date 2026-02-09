'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PieChart } from '@/components/PieChart';
import { RiskSlider } from '@/components/RiskSlider';
import { getTargetAllocation } from '@/lib/rebalancer';

type Bot = {
  id: number;
  name: string;
  board_id: number;
  strategy_style: string;
  strategy_substyle: string;
  status: string;
  auto_trade?: boolean;
  rebalancer_enabled?: boolean;
  rebalancer_config?: any;
  performance?: any;
};

type Board = {
  id: number;
  name: string;
  board_type?: string;
};

const STYLE_MAP: Record<string, { icon: string; substyles: Record<string, string> }> = {
  'Swing Trading': {
    icon: '🏄',
    substyles: {
      Momentum: 'Ride stronger trends using volume + breakout confirmation.',
      'Mean Reversion': 'Fade exhausted moves back toward the mean.',
      Breakout: 'Trade volatility expansions after tight ranges.'
    }
  },
  'Day Trading': {
    icon: '⚡️',
    substyles: {
      Momentum: 'Trade intraday trend bursts with tight risk.',
      Range: 'Buy support, sell resistance inside ranges.'
    }
  },
  Scalper: {
    icon: '🧵',
    substyles: {
      Grid: 'Layer micro orders around a tight midline.',
      Momentum: 'Hit quick bursts, exit fast.'
    }
  },
  Fundamental: {
    icon: '📚',
    substyles: {
      Value: 'Buy discounted narratives with risk buffers.',
      Narrative: 'Trade stories before they hit the crowd.'
    }
  },
  'Long-Term Investor': {
    icon: '🛰️',
    substyles: {
      DCA: 'Accumulate steadily with strict allocation rules.',
      'Dip Buyer': 'Deploy cash on drawdown signals.'
    }
  }
};

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  running: { label: 'Running', color: 'var(--green)', bg: 'rgba(0,230,118,0.15)' },
  stopped: { label: 'Stopped', color: '#9ca3af', bg: 'rgba(148,163,184,0.14)' },
  paused: { label: 'Paused', color: '#f5b544', bg: 'rgba(245,181,68,0.18)' }
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

function Donut({ value }: { value: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, value));
  const dash = (pct / 100) * circumference;
  return (
    <svg width="42" height="42" viewBox="0 0 42 42">
      <circle cx="21" cy="21" r={radius} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle
        cx="21"
        cy="21"
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={-circumference * 0.25}
        strokeLinecap="round"
      />
      <text x="21" y="24" textAnchor="middle" fill="var(--text)" fontSize="10" fontWeight={600}>
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}

export default function BotsPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [botName, setBotName] = useState('');
  const [style, setStyle] = useState('Swing Trading');
  const [substyle, setSubstyle] = useState('Momentum');
  const [startBalance, setStartBalance] = useState(100);
  const [riskLevel, setRiskLevel] = useState(5);
  const [autoTrade, setAutoTrade] = useState(false);
  const [rebalancer, setRebalancer] = useState(false);
  const [boardId, setBoardId] = useState<number | ''>('');

  const tradingBoards = useMemo(
    () => boards.filter((board) => board.board_type === 'trading'),
    [boards]
  );

  const stats = useMemo(() => {
    const totalBots = bots.length;
    const runningBots = bots.filter((bot) => bot.status === 'running').length;
    const totalPnl = bots.reduce((sum, bot) => sum + toNumber(bot.performance?.total_pnl ?? bot.performance?.total_return ?? 0), 0);
    const best = bots.reduce((top, bot) => {
      const pnl = toNumber(bot.performance?.total_pnl ?? bot.performance?.total_return ?? 0);
      if (!top || pnl > top.pnl) return { name: bot.name, pnl };
      return top;
    }, null as null | { name: string; pnl: number });
    return { totalBots, runningBots, totalPnl, best };
  }, [bots]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [botsRes, boardsRes] = await Promise.all([
          fetch('/api/v1/bots'),
          fetch('/api/v1/boards')
        ]);
        const botsJson = await botsRes.json();
        const boardsJson = await boardsRes.json();
        setBots(Array.isArray(botsJson?.bots) ? botsJson.bots : []);
        setBoards(Array.isArray(boardsJson?.boards) ? boardsJson.boards : []);
      } catch {
        setBots([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const nextSubstyle = Object.keys(STYLE_MAP[style]?.substyles ?? {})[0];
    if (nextSubstyle) setSubstyle(nextSubstyle);
  }, [style]);

  useEffect(() => {
    if (boardId === '' && tradingBoards.length) {
      setBoardId(tradingBoards[0].id);
    }
  }, [boardId, tradingBoards]);

  const handleStatus = async (botId: number, action: 'start' | 'stop' | 'pause') => {
    await fetch(`/api/v1/bots/${botId}/${action}`, { method: 'POST' });
    const res = await fetch('/api/v1/bots');
    const json = await res.json();
    setBots(Array.isArray(json?.bots) ? json.bots : []);
  };

  const handleCreate = async () => {
    if (!botName.trim() || !boardId) return;
    setCreating(true);
    try {
      const strategyConfig = {
        riskLevel,
        startingBalance: startBalance
      };
      const rebalancerConfig = {
        riskLevel,
        rebalanceThreshold: 5
      };
      const res = await fetch('/api/v1/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: botName.trim(),
          board_id: boardId,
          strategy_style: style,
          strategy_substyle: substyle,
          strategy_config: strategyConfig,
          auto_trade: autoTrade,
          rebalancer_enabled: autoTrade ? rebalancer : false,
          rebalancer_config: autoTrade && rebalancer ? rebalancerConfig : {}
        })
      });
      if (res.ok) {
        const botsRes = await fetch('/api/v1/bots');
        const botsJson = await botsRes.json();
        setBots(Array.isArray(botsJson?.bots) ? botsJson.bots : []);
        setModalOpen(false);
        setBotName('');
        setAutoTrade(false);
        setRebalancer(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const allocation = getTargetAllocation(riskLevel);

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>Trading Bots</h1>
          <div style={{ color: 'var(--muted)', fontSize: '13px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            Strategy Runner Console
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          style={{ background: 'linear-gradient(135deg, var(--accent), #9a9cff)', color: '#0d0d1f', border: 'none', padding: '10px 18px', borderRadius: '999px', fontWeight: 600, cursor: 'pointer' }}
        >
          + Create Bot
        </button>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.totalBots}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Total Bots</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--green)' }}>{stats.runningBots}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Running</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: stats.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {formatCurrency(stats.totalPnl)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Total P&amp;L</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{stats.best?.name || '—'}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Best Performer</div>
        </div>
      </section>

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading bots...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {bots.map((bot) => {
            const status = STATUS_STYLES[bot.status] || STATUS_STYLES.stopped;
            const winRate = toNumber(bot.performance?.win_rate ?? 0);
            const balance = toNumber(bot.performance?.balance ?? bot.performance?.current_balance ?? 0);
            const pnl = toNumber(bot.performance?.total_pnl ?? bot.performance?.total_return ?? 0);
            const activeTrades = toNumber(bot.performance?.active_trades ?? 0);
            const icon = STYLE_MAP[bot.strategy_style]?.icon ?? '🤖';
            const risk = Number(bot.rebalancer_config?.riskLevel ?? bot.strategy_config?.riskLevel ?? 5);
            const target = getTargetAllocation(risk);
            const pieData = [
              { label: 'Stablecoins', value: target.stablecoins, color: '#7b7dff' },
              { label: 'BTC', value: target.bitcoin, color: '#00e676' },
              { label: 'Large Alts', value: target.largeCapAlts, color: '#2196f3' },
              { label: 'Mid Alts', value: target.midCapAlts, color: '#ff9800' },
              { label: 'Small Alts', value: target.smallCapAlts, color: '#e91e63' }
            ];

            return (
              <div key={bot.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '16px', display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 600 }}>{bot.name}</div>
                  <span style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '999px', color: status.color, background: status.bg, border: `1px solid ${status.color}33`, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                    {bot.status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontSize: '20px' }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{bot.strategy_style} — {bot.strategy_substyle}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{bot.auto_trade ? 'Auto-trade enabled' : 'Manual approvals'}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Balance</div>
                    <div style={{ fontSize: '15px', fontWeight: 600 }}>{formatCurrency(balance)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>P&amp;L</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {formatCurrency(pnl)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Donut value={winRate} />
                  <div style={{ display: 'grid', gap: '4px', fontSize: '11px', color: 'var(--muted)' }}>
                    <div>Win Rate</div>
                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>{winRate.toFixed(0)}%</div>
                    <div>{activeTrades} active trades</div>
                  </div>
                </div>
                {bot.rebalancer_enabled && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>Target Allocation</div>
                    <PieChart data={pieData} size={140} centerLabel={`L${risk}`} />
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    onClick={() => handleStatus(bot.id, bot.status === 'running' ? 'stop' : 'start')}
                    style={{ background: bot.status === 'running' ? 'transparent' : 'var(--accent)', color: bot.status === 'running' ? 'var(--text)' : '#0d0d1f', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    {bot.status === 'running' ? 'Stop' : 'Start'}
                  </button>
                  <button
                    onClick={() => handleStatus(bot.id, 'pause')}
                    style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Pause
                  </button>
                  <Link href={`/bots/${bot.id}`} style={{ marginLeft: 'auto', color: 'var(--accent)', textDecoration: 'none', fontSize: '12px', fontWeight: 600 }}>
                    View Details →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,15,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: 'min(720px, 92vw)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '22px', display: 'grid', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>Create Bot</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Configure a new strategy runner.</div>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Bot name</label>
                <input
                  value={botName}
                  onChange={(event) => setBotName(event.target.value)}
                  placeholder="Momentum Runner"
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Board</label>
                <select
                  value={boardId}
                  onChange={(event) => setBoardId(Number(event.target.value))}
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
                >
                  {tradingBoards.length === 0 && <option value="">No trading boards</option>}
                  {tradingBoards.map((board) => (
                    <option key={board.id} value={board.id}>{board.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Strategy style</label>
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
                >
                  {Object.keys(STYLE_MAP).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Sub-style</label>
                <select
                  value={substyle}
                  onChange={(event) => setSubstyle(event.target.value)}
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
                >
                  {Object.keys(STYLE_MAP[style]?.substyles ?? {}).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ background: 'rgba(123,125,255,0.08)', border: '1px solid rgba(123,125,255,0.3)', borderRadius: '12px', padding: '12px', fontSize: '12px', color: 'var(--text)' }}>
              {STYLE_MAP[style]?.substyles?.[substyle] || 'Select a style to see the strategy description.'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Starting balance</label>
                <input
                  type="number"
                  min={0}
                  value={startBalance}
                  onChange={(event) => setStartBalance(Number(event.target.value))}
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Risk level</label>
                <RiskSlider value={riskLevel} onChange={setRiskLevel} showAllocation />
              </div>
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <input type="checkbox" checked={autoTrade} onChange={(event) => setAutoTrade(event.target.checked)} />
                Enable Auto-Trade
              </label>
              {autoTrade && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                  <input type="checkbox" checked={rebalancer} onChange={(event) => setRebalancer(event.target.checked)} />
                  Enable Portfolio Rebalancer
                </label>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Allocation: Stable {allocation.stablecoins}% · BTC {allocation.bitcoin}% · Alts {allocation.largeCapAlts + allocation.midCapAlts + allocation.smallCapAlts}%
              </div>
              <button
                disabled={creating}
                onClick={handleCreate}
                style={{ background: 'linear-gradient(135deg, var(--accent), #9a9cff)', color: '#0d0d1f', border: 'none', padding: '10px 18px', borderRadius: '999px', fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.7 : 1 }}
              >
                {creating ? 'Creating...' : 'Create Bot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
