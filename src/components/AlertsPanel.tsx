'use client';

import { useEffect, useMemo, useState } from 'react';

interface Trade {
  id: number;
  coin_pair: string;
  stop_loss?: number | string | null;
}

interface AlertItem {
  id: number;
  board_id: number;
  trade_id: number | null;
  alert_type: string;
  condition_value?: number | string | null;
  condition_operator?: string | null;
  message?: string | null;
  triggered?: boolean;
  triggered_at?: string | null;
  created_at?: string | null;
  coin_pair?: string | null;
}

const typeOptions = [
  { value: 'price_above', label: 'Price above' },
  { value: 'price_below', label: 'Price below' },
  { value: 'pnl_target', label: 'PnL target %' },
  { value: 'stop_loss_hit', label: 'Stop loss hit' },
  { value: 'confidence_change', label: 'Confidence change' },
];

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

function formatCondition(alert: AlertItem, tradePair: string | null) {
  const value = alert.condition_value !== null && alert.condition_value !== undefined ? Number(alert.condition_value) : null;
  const operator = alert.condition_operator || (alert.alert_type === 'price_below' ? '<' : '>');

  switch (alert.alert_type) {
    case 'price_above':
      return `Price > ${value ?? '—'}`;
    case 'price_below':
      return `Price < ${value ?? '—'}`;
    case 'pnl_target':
      return `PnL ${operator} ${value ?? '—'}%`;
    case 'stop_loss_hit':
      return tradePair ? `Stop loss on ${tradePair}` : 'Stop loss hit';
    case 'confidence_change':
      return `Confidence ${operator} ${value ?? '—'}`;
    default:
      return alert.alert_type;
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'price_above':
      return '📈';
    case 'price_below':
      return '📉';
    case 'pnl_target':
      return '🎯';
    case 'stop_loss_hit':
      return '🛑';
    case 'confidence_change':
      return '🧠';
    default:
      return '🔔';
  }
}

export function AlertsPanel({
  boardId,
  trades,
  open,
  onClose,
  onCountChange,
}: {
  boardId: number;
  trades: Trade[];
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<string>('');
  const [alertType, setAlertType] = useState('price_above');
  const [conditionValue, setConditionValue] = useState('');
  const [conditionOperator, setConditionOperator] = useState('>');
  const [message, setMessage] = useState('');

  const tradeMap = useMemo(() => {
    const map = new Map<number, Trade>();
    trades.forEach((trade) => map.set(trade.id, trade));
    return map;
  }, [trades]);

  const untriggeredCount = useMemo(() => alerts.filter((a) => !a.triggered).length, [alerts]);

  useEffect(() => {
    onCountChange?.(untriggeredCount);
  }, [onCountChange, untriggeredCount]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/v1/alerts?boardId=${boardId}`);
        if (res.ok) {
          const data = await res.json();
          if (mounted) setAlerts(data.alerts || []);
        }
      } catch {
        // silent
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [boardId, open]);

  useEffect(() => {
    if (alertType === 'price_below') setConditionOperator('<');
    if (alertType === 'price_above' || alertType === 'pnl_target' || alertType === 'confidence_change') setConditionOperator('>');
  }, [alertType]);

  const requiresValue = alertType !== 'stop_loss_hit';

  const handleCreate = async () => {
    if (creating) return;
    if (requiresValue && !conditionValue.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/v1/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          trade_id: selectedTradeId ? parseInt(selectedTradeId, 10) : null,
          alert_type: alertType,
          condition_value: requiresValue ? parseFloat(conditionValue) : null,
          condition_operator: conditionOperator,
          message: message.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts((prev) => [data.alert, ...prev]);
        setConditionValue('');
        setMessage('');
      }
    } catch {
      // silent
    }
    setCreating(false);
  };

  const handleDelete = async (alertId: number) => {
    try {
      const res = await fetch(`/api/v1/alerts/${alertId}`, { method: 'DELETE' });
      if (res.ok) {
        setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      }
    } catch {
      // silent
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 85,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: open ? 'rgba(5, 5, 15, 0.7)' : 'transparent',
          transition: 'background 0.25s ease',
        }}
      />
      <aside
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: 'min(420px, 92vw)',
          background: 'var(--panel)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 12px' }}>
          <div>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--muted)' }}>Alerts</div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>Trade Alerts</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '0 18px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Add Alert</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            <select
              value={selectedTradeId}
              onChange={(event) => setSelectedTradeId(event.target.value)}
              style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
            >
              <option value="">Board-level (no trade)</option>
              {trades.map((trade) => (
                <option key={trade.id} value={trade.id}>{normalizePair(trade.coin_pair)}</option>
              ))}
            </select>
            <select
              value={alertType}
              onChange={(event) => setAlertType(event.target.value)}
              style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
            >
              {typeOptions.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            {requiresValue && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={conditionOperator}
                  onChange={(event) => setConditionOperator(event.target.value)}
                  style={{ width: '80px', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px', borderRadius: '10px', fontSize: '13px' }}
                >
                  <option value=">">&gt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<">&lt;</option>
                  <option value="<=">&lt;=</option>
                </select>
                <input
                  value={conditionValue}
                  onChange={(event) => setConditionValue(event.target.value)}
                  placeholder="Value"
                  style={{ flex: 1, background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
                />
              </div>
            )}
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Optional note"
              style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', fontSize: '13px' }}
            />
            <button
              type="button"
              onClick={handleCreate}
              style={{
                background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
                color: '#0d0d1f',
                border: 'none',
                padding: '10px 16px',
                borderRadius: '999px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px',
                opacity: creating ? 0.6 : 1,
              }}
              disabled={creating}
            >
              Add Alert
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: '10px' }}>Active Alerts</div>
          {loading ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No alerts set yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {alerts.map((alert) => {
                const trade = alert.trade_id ? tradeMap.get(alert.trade_id) : null;
                const pair = alert.coin_pair || (trade ? trade.coin_pair : null);
                const pairLabel = pair ? normalizePair(pair) : 'Board';
                return (
                  <div
                    key={alert.id}
                    style={{
                      background: alert.triggered ? 'rgba(240, 91, 111, 0.12)' : 'var(--panel-2)',
                      border: `1px solid ${alert.triggered ? 'rgba(240, 91, 111, 0.5)' : 'var(--border)'}`,
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'grid',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{typeIcon(alert.alert_type)}</span>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{pairLabel}</span>
                      </div>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                        aria-label="Delete alert"
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text)' }}>{formatCondition(alert, pairLabel)}</div>
                    {alert.message && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{alert.message}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)' }}>
                      <span>{alert.triggered ? 'Triggered' : 'Watching'}</span>
                      <span>{alert.triggered_at ? new Date(alert.triggered_at).toLocaleString() : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
