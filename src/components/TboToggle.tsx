'use client';

import { useCallback, useEffect, useState } from 'react';

type TboStatus = {
  enabled: boolean;
  signalsToday: number;
  lastSignal: { time: string; ticker: string; signal: string; interval: string } | null;
  activeTimeframes: string[];
};

export function TboToggle() {
  const [status, setStatus] = useState<TboStatus | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/tbo/status');
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const toggle = async () => {
    if (!status || toggling) return;
    setToggling(true);
    try {
      const res = await fetch('/api/trading/tbo/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus((s) => s ? { ...s, enabled: data.enabled } : s);
      }
    } finally {
      setToggling(false);
    }
  };

  const on = status?.enabled ?? false;

  const timeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <div
      style={{
        background: on
          ? 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)'
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${on ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        transition: 'all 0.3s ease',
        boxShadow: on ? '0 0 24px rgba(34,197,94,0.15)' : 'none',
      }}
    >
      {/* Toggle switch */}
      <button
        onClick={toggle}
        disabled={toggling || !status}
        style={{
          width: 64,
          height: 34,
          borderRadius: 17,
          border: 'none',
          cursor: toggling ? 'wait' : 'pointer',
          background: on ? '#22c55e' : 'rgba(255,255,255,0.12)',
          position: 'relative',
          transition: 'background 0.3s ease',
          flexShrink: 0,
          boxShadow: on ? '0 0 12px rgba(34,197,94,0.4)' : 'none',
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            background: '#fff',
            position: 'absolute',
            top: 4,
            left: on ? 34 : 4,
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>

      {/* Label */}
      <div style={{ minWidth: 100 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: on ? '#22c55e' : '#888', letterSpacing: 1 }}>
          TBO PRO
        </div>
        <div style={{ fontSize: 12, color: on ? 'rgba(34,197,94,0.7)' : '#555', marginTop: 1 }}>
          {on ? 'Signals Active' : 'Signals Paused'}
        </div>
      </div>

      {/* Stats */}
      {status && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e2ff' }}>{status.signalsToday}</div>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Today</div>
          </div>

          {status.lastSignal && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e2ff' }}>
                {status.lastSignal.signal}
              </div>
              <div style={{ fontSize: 10, color: '#888' }}>
                {status.lastSignal.ticker} · {timeAgo(status.lastSignal.time)}
              </div>
            </div>
          )}

          {status.activeTimeframes.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {status.activeTimeframes.map((tf) => (
                <span
                  key={tf}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'rgba(123,125,255,0.15)',
                    color: '#7b7dff',
                    textTransform: 'uppercase',
                  }}
                >
                  {tf}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
