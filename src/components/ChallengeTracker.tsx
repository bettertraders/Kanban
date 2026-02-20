'use client';

import { useEffect, useState } from 'react';

interface Snapshot {
  date: string;
  day: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  realizedPnl: number;
  balance: number;
  deviation: number;
  status: string;
}

interface TrackerData {
  backtestWinRate: number;
  backtestPnl: number;
  startingBalance: number;
  cycleTarget: number;
  cycleRegime: string;
  cycleNumber: number;
  cycleGain: number;
  cycleActive: boolean;
  snapshots: Snapshot[];
  alerts: Array<{ timestamp: string; type: string; message: string }>;
  current: {
    winRate: number;
    backtestTarget: number;
    deviation: number;
    health: string;
    totalTrades: number;
    daysElapsed: number;
    daysRemaining: number;
  };
}

function healthColor(health: string): string {
  switch (health) {
    case 'on_track': return '#4ade80';
    case 'warning': return '#f5b544';
    case 'critical': return '#f05b6f';
    default: return 'var(--muted)';
  }
}

function healthLabel(health: string): string {
  switch (health) {
    case 'on_track': return '✅ On Track';
    case 'warning': return '⚠️ Drifting';
    case 'critical': return '🚨 Off Track';
    default: return '📊 Collecting Data';
  }
}

export function ChallengeTracker({ boardId, liveWinRate, liveTrades, liveBalance, realizedPnl }: {
  boardId: number;
  liveWinRate: number;
  liveTrades: number;
  liveBalance: number | null;
  realizedPnl: number;
}) {
  const [tracker, setTracker] = useState<TrackerData | null>(null);
  const [expanded, setExpanded] = useState(false);

  const backtestTarget = 82.1;
  const startBalance = tracker?.startingBalance ?? liveBalance ?? 100;
  const cycleTarget = tracker?.cycleTarget ?? 8.0;
  const cycleRegime = tracker?.cycleRegime ?? 'NONE';
  const cycleNumber = tracker?.cycleNumber ?? 0;
  const cycleActive = tracker?.cycleActive ?? false;

  useEffect(() => {
    fetch(`/api/trading/challenge-tracker?boardId=${boardId}`)
      .then(r => r.json())
      .then(data => setTracker(data))
      .catch(() => {});
  }, [boardId]);

  const deviation = liveWinRate - backtestTarget;
  const effectiveBalance = liveBalance ?? startBalance;
  const pnlPct = ((effectiveBalance - startBalance) / startBalance) * 100;
  const cycleTargetLabel = cycleTarget.toFixed(1).replace(/\.0$/, '');
  const targetForScale = cycleTarget > 0 ? cycleTarget : 1;
  const pnlProgressPct = cycleTarget > 0 ? (pnlPct / targetForScale) * 100 : 0;

  let health = 'insufficient_data';
  if (liveTrades >= 5) {
    if (Math.abs(deviation) <= 10) health = 'on_track';
    else if (Math.abs(deviation) <= 20) health = 'warning';
    else health = 'critical';
  }

  return (
    <div style={{
      background: 'var(--panel)',
      border: `1px solid ${health === 'critical' ? 'rgba(240,91,111,0.4)' : health === 'warning' ? 'rgba(245,181,68,0.3)' : 'var(--border)'}`,
      borderRadius: '16px',
      padding: '14px 16px',
      marginBottom: '16px',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px' }}>🏆</span>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>365-Day Challenge</span>
          {health !== 'insufficient_data' && (
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: `${healthColor(health)}22`,
              color: healthColor(health),
              fontWeight: 600,
            }}>
              {healthLabel(health)}
            </span>
          )}
        </div>
        <span style={{
          fontSize: '10px',
          color: 'var(--muted)',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }}>▼</span>
      </button>

      {/* Always-visible summary bar */}
      <div style={{ display: 'flex', gap: '20px', marginTop: '10px', fontSize: '12px' }}>
        {/* Win Rate comparison */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted)' }}>Win Rate</span>
            <span style={{ fontWeight: 600, color: healthColor(health) }}>
              {liveWinRate.toFixed(1)}% <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/ {backtestTarget}%</span>
            </span>
          </div>
          <div style={{ position: 'relative', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
            {/* Backtest target marker */}
            <div style={{
              position: 'absolute',
              left: `${Math.min(backtestTarget, 100)}%`,
              top: '-2px',
              width: '2px',
              height: '10px',
              background: 'var(--muted)',
              borderRadius: '1px',
              zIndex: 2,
            }} />
            {/* Live win rate bar */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${Math.min(Math.max(liveWinRate, 0), 100)}%`,
              borderRadius: '3px',
              background: healthColor(health),
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '10px', color: 'var(--muted)' }}>
            <span>{liveTrades} trades</span>
            <span style={{ color: deviation >= 0 ? '#4ade80' : '#f05b6f' }}>
              {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)}% vs backtest
            </span>
          </div>
        </div>

        {/* P&L comparison */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted)' }}>P&L</span>
            <span style={{ fontWeight: 600, color: pnlPct >= 0 ? '#4ade80' : '#f05b6f' }}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/ {cycleTargetLabel}%</span>
            </span>
          </div>
          <div style={{ position: 'relative', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
            <div style={{
              position: 'absolute',
              left: '100%',
              top: '-2px',
              width: '2px',
              height: '10px',
              background: 'var(--muted)',
              borderRadius: '1px',
              zIndex: 2,
            }} />
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${Math.min(Math.max(pnlProgressPct, 0), 100)}%`,
              borderRadius: '3px',
              background: pnlPct >= 0 ? '#4ade80' : '#f05b6f',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '10px', color: 'var(--muted)' }}>
            <span>${effectiveBalance.toFixed(0)} / ${startBalance.toFixed(0)}</span>
            <span>Target: {cycleTargetLabel}%</span>
          </div>
          <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--muted)' }}>
            Cycle {cycleNumber} · {cycleRegime} · Target {cycleTargetLabel}%{cycleActive ? '' : ' (inactive)'}
          </div>
        </div>
      </div>

      {/* Expanded: daily snapshots + alerts */}
      {expanded && tracker && (
        <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          {/* Daily snapshots */}
          {tracker.snapshots.length > 0 ? (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Daily Progress
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                {tracker.snapshots.map(snap => (
                  <div key={snap.date} style={{
                    padding: '6px 8px',
                    borderRadius: '8px',
                    background: 'rgba(20,20,40,0.6)',
                    border: `1px solid ${snap.status === 'on_track' ? 'rgba(74,222,128,0.2)' : snap.status === 'warning' ? 'rgba(245,181,68,0.2)' : snap.status === 'critical' ? 'rgba(240,91,111,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    fontSize: '10px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>Day {snap.day}</div>
                    <div style={{ color: healthColor(snap.status), fontWeight: 600 }}>{snap.winRate.toFixed(0)}%</div>
                    <div style={{ color: 'var(--muted)' }}>{snap.trades} trades</div>
                    <div style={{ color: snap.realizedPnl >= 0 ? '#4ade80' : '#f05b6f', fontSize: '9px' }}>
                      {snap.realizedPnl >= 0 ? '+' : ''}${snap.realizedPnl.toFixed(2)}
                    </div>
                  </div>
                ))}
                {/* Empty days remaining */}
                {Array.from({ length: Math.max(0, 10 - tracker.snapshots.length) }).map((_, i) => (
                  <div key={`empty-${i}`} style={{
                    padding: '6px 8px',
                    borderRadius: '8px',
                    background: 'rgba(20,20,40,0.3)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '10px',
                    textAlign: 'center',
                    opacity: 0.4,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>Day {tracker.snapshots.length + i + 1}</div>
                    <div style={{ color: 'var(--muted)' }}>—</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
              Daily snapshots will appear here as the challenge progresses.
            </div>
          )}

          {/* Alerts */}
          {tracker.alerts.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Alerts
              </div>
              {tracker.alerts.slice(-5).reverse().map((alert, i) => (
                <div key={i} style={{
                  fontSize: '11px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: alert.type === 'critical' ? 'rgba(240,91,111,0.1)' : 'rgba(245,181,68,0.1)',
                  border: `1px solid ${alert.type === 'critical' ? 'rgba(240,91,111,0.2)' : 'rgba(245,181,68,0.2)'}`,
                  marginBottom: '4px',
                  color: 'var(--text)',
                }}>
                  {alert.message}
                </div>
              ))}
            </div>
          )}

          {/* Backtest comparison note */}
          <div style={{
            marginTop: '10px',
            padding: '8px 10px',
            borderRadius: '8px',
            background: 'rgba(123,125,255,0.08)',
            fontSize: '10px',
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--text)' }}>Dynamic target:</strong> P&amp;L compares against the
            current harvest cycle target from the compounding engine (regime-based). Win rate still
            references the 82.1% backtest baseline. Deviation &gt;10% triggers a warning,
            &gt;20% triggers investigation. Min 5 closed trades needed for meaningful comparison.
          </div>
        </div>
      )}
    </div>
  );
}
