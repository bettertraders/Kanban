'use client';

import { useEffect, useState } from 'react';

interface Change {
  field: string;
  from: string | number;
  to: string | number;
}

interface Adjustment {
  id: string;
  timestamp: string;
  agent: string;
  type: string;
  severity: string;
  strategy: string;
  changes: Change[];
  reason: string;
  marketContext?: {
    regime?: string;
    fearGreed?: number;
    btcPrice?: number;
    trigger?: string;
    dominantDirection?: string;
    directionRatio?: number;
  };
  backtestData?: {
    coinsAnalyzed?: number;
    simulations?: number;
  };
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function typeIcon(type: string): string {
  switch (type) {
    case 'param_tune': return '🔧';
    case 'direction_flip': return '🔄';
    case 'regime_shift': return '🌡️';
    case 'coin_add': return '➕';
    case 'coin_remove': return '➖';
    case 'sl_change': return '🛡️';
    case 'tp_change': return '🎯';
    case 'scan_complete': return '✅';
    default: return '📊';
  }
}

function severityColor(severity: string): string {
  return severity === 'major' ? '#f05b6f' : '#8aa5ff';
}

function severityLabel(severity: string): string {
  return severity === 'major' ? 'MAJOR' : 'MINOR';
}

export function AdjustmentsPanel({ boardId }: { boardId: number }) {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/trading/adjustments?limit=20`)
      .then(r => r.json())
      .then(data => {
        setAdjustments(data.adjustments || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Refresh every 5 min
    const interval = setInterval(() => {
      fetch(`/api/trading/adjustments?limit=20`)
        .then(r => r.json())
        .then(data => setAdjustments(data.adjustments || []))
        .catch(() => {});
    }, 300000);

    return () => clearInterval(interval);
  }, [boardId]);

  if (loading) return null;

  // Filter out "scan_complete" (no changes) entries — only show actual adjustments
  const realAdjustments = adjustments.filter(a => a.type !== 'scan_complete');
  const hasChanges = realAdjustments.length > 0;
  const latest = adjustments[0];

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
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
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🧪</span>
          <span>Strategy Adjustments</span>
          {hasChanges && (
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '999px',
              background: 'rgba(240, 91, 111, 0.2)',
              color: '#f05b6f',
              fontWeight: 600,
            }}>
              {realAdjustments.length} CHANGE{realAdjustments.length > 1 ? 'S' : ''}
            </span>
          )}
          {!hasChanges && latest && (
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--muted)',
              fontWeight: 600,
            }}>
              NO CHANGES
            </span>
          )}
          {latest && (
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 400 }}>
              Last scan: {timeAgo(latest.timestamp)}
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

      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {realAdjustments.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '12px' }}>
              No strategy changes yet. Penny and Owen review every hour — changes will appear here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {realAdjustments.map((adj) => (
                <div
                  key={adj.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: 'rgba(20, 20, 40, 0.6)',
                    border: `1px solid ${adj.type !== 'scan_complete' ? 'rgba(240, 91, 111, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderLeft: `3px solid ${adj.type !== 'scan_complete' ? severityColor(adj.severity) : '#4ade80'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>{typeIcon(adj.type)}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{adj.strategy === 'unknown' ? 'Strategy Review' : adj.strategy}</span>
                      {adj.type !== 'scan_complete' && (
                        <span style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '999px',
                          background: `${severityColor(adj.severity)}22`,
                          color: severityColor(adj.severity),
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                        }}>
                          {severityLabel(adj.severity)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{adj.agent}</span>
                      <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{timeAgo(adj.timestamp)}</span>
                    </div>
                  </div>

                  {/* Changes */}
                  {adj.changes && adj.changes.length > 0 && adj.type !== 'scan_complete' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                      {adj.changes.map((c, i) => (
                        <span key={i} style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          background: 'rgba(123, 125, 255, 0.15)',
                          color: 'var(--text)',
                        }}>
                          {c.field}: <span style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{c.from}</span> → <span style={{ fontWeight: 600 }}>{c.to}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Reason */}
                  <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>
                    {adj.reason}
                  </div>

                  {/* Market context */}
                  {adj.marketContext && (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px', fontSize: '10px', color: 'var(--muted)' }}>
                      {adj.marketContext.regime && <span>Regime: <strong style={{ color: 'var(--text)' }}>{adj.marketContext.regime}</strong></span>}
                      {adj.marketContext.fearGreed != null && <span>F&G: <strong style={{ color: 'var(--text)' }}>{adj.marketContext.fearGreed}</strong></span>}
                      {adj.marketContext.dominantDirection && (
                        <span>Direction: <strong style={{ color: adj.marketContext.dominantDirection === 'SHORT' ? '#f05b6f' : '#4ade80' }}>
                          {adj.marketContext.dominantDirection} ({adj.marketContext.directionRatio}%)
                        </strong></span>
                      )}
                      {adj.backtestData?.simulations && <span>{adj.backtestData.simulations.toLocaleString()} sims</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
