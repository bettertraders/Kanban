'use client';

import { useCallback, useEffect, useState } from 'react';

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

type RiskOption = (typeof RISK_OPTIONS)[number];

interface StartTradeModalProps {
  boardId: number | null;
  existingBotCount?: number;
  paperBalance?: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function StartTradeModal({ boardId, existingBotCount = 0, paperBalance = 0, onClose, onSuccess }: StartTradeModalProps) {
  const [amountInput, setAmountInput] = useState('500');
  const [selectedRisk, setSelectedRisk] = useState<RiskOption | null>(RISK_OPTIONS[1]);
  const [creating, setCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [strategyOverride, setStrategyOverride] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const parsedAmount = Number(amountInput.replace(/[^0-9.]/g, ''));
  const amountReady = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const selectedSummary = selectedRisk
    ? `$${parsedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} at ${selectedRisk.label} risk`
    : 'Select a risk level';

  const handleConfirm = useCallback(async () => {
    if (!selectedRisk || !amountReady || !boardId || creating) return;
    setCreating(true);
    try {
      const botNumber = existingBotCount + 1;
      const name = `Penny's ${selectedRisk.label} Bot #${botNumber}`;
      const body: Record<string, unknown> = {
        name,
        strategy: strategyOverride || selectedRisk.strategy,
        risk_level: selectedRisk.level,
        auto_trade: true,
        board_id: boardId,
      };
      if (stopLoss) body.stop_loss_pct = Number(stopLoss);
      if (takeProfit) body.take_profit_pct = Number(takeProfit);
      const res = await fetch('/api/v1/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to create bot');
      const data = await res.json();
      const botId = data?.bot?.id;
      if (botId) {
        await fetch(`/api/v1/bots/${botId}/start`, { method: 'POST' }).catch(() => {});
      }
      onSuccess();
    } catch {
      // error handled by caller
    } finally {
      setCreating(false);
    }
  }, [selectedRisk, amountReady, boardId, creating, existingBotCount, onSuccess]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
            onClick={onClose}
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
                  background: 'var(--panel-2)',
                  color: amountInput === value ? 'var(--accent)' : 'var(--text)',
                  border: `1px solid ${amountInput === value ? 'var(--accent)' : 'var(--border)'}`,
                  padding: '6px 12px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                ${value}
              </button>
            ))}
          </div>
          {paperBalance > 0 && (
            <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--muted)' }}>
              Paper Balance: ${paperBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          )}
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
              background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
              color: '#0d0d1f',
              border: 'none',
              padding: '14px 18px',
              borderRadius: '999px',
              fontWeight: 600,
              cursor: !amountReady || !selectedRisk ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !amountReady || !selectedRisk ? 0.6 : 1,
            }}
          >
            {creating ? 'Launching…' : "Let's Go"}
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '8px 0 0',
              textAlign: 'center',
              width: '100%',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            {showAdvanced ? 'Hide Advanced' : 'Advanced'}
          </button>
          {showAdvanced && (
            <div style={{
              marginTop: '8px',
              padding: '14px',
              background: 'var(--panel-2)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              display: 'grid',
              gap: '10px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600 }}>Advanced Settings</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'grid', gap: '4px' }}>
                  Strategy Override
                  <select
                    value={strategyOverride}
                    onChange={(e) => setStrategyOverride(e.target.value)}
                    style={{
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <option value="">Auto (based on risk level)</option>
                    <option value="swing_mean_reversion">Swing — Mean Reversion</option>
                    <option value="swing_momentum">Swing — Momentum</option>
                    <option value="swing_breakout">Swing — Breakout</option>
                    <option value="day_momentum">Day — Momentum</option>
                    <option value="day_mean_reversion">Day — Mean Reversion</option>
                    <option value="scalper_momentum">Scalper — Momentum</option>
                    <option value="scalper_grid">Scalper — Grid</option>
                  </select>
                </label>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'grid', gap: '4px' }}>
                  Stop Loss %
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="e.g. 5"
                    style={{
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '12px',
                      width: '100%',
                    }}
                  />
                </label>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'grid', gap: '4px' }}>
                  Take Profit %
                  <input
                    type="number"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="e.g. 15"
                    style={{
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '12px',
                      width: '100%',
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
