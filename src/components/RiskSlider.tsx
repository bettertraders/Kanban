'use client';

import { getTargetAllocation } from '@/lib/rebalancer';

interface RiskSliderProps {
  value: number;
  onChange: (level: number) => void;
  showAllocation?: boolean;
}

const LABELS: Record<number, string> = {
  1: 'Ultra Safe',
  2: 'Very Conservative',
  3: 'Conservative',
  4: 'Moderate-Safe',
  5: 'Balanced',
  6: 'Growth',
  7: 'Aggressive',
  8: 'Very Aggressive',
  9: 'High Risk',
  10: 'YOLO'
};

export function RiskSlider({ value, onChange, showAllocation = false }: RiskSliderProps) {
  const level = Math.max(1, Math.min(10, Math.round(value)));
  const allocation = getTargetAllocation(level);

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>Level {level} — {LABELS[level]}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Risk</div>
      </div>
      <div style={{ position: 'relative', height: '34px' }}>
        <div
          style={{
            position: 'absolute',
            inset: '14px 4px 0 4px',
            height: '6px',
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #00e676 0%, #ffeb3b 45%, #ff9800 70%, #ff5252 100%)',
            opacity: 0.9
          }}
        />
        <input
          type="range"
          min={1}
          max={10}
          value={level}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{
            width: '100%',
            position: 'relative',
            background: 'transparent',
            accentColor: 'var(--accent)',
            cursor: 'pointer'
          }}
        />
      </div>
      {showAllocation && (
        <div style={{ display: 'grid', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
          <div>Stablecoins {allocation.stablecoins}% · BTC {allocation.bitcoin}%</div>
          <div>Large Alts {allocation.largeCapAlts}% · Mid Alts {allocation.midCapAlts}% · Small Alts {allocation.smallCapAlts}%</div>
        </div>
      )}
    </div>
  );
}
