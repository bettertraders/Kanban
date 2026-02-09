'use client';

import { useMemo } from 'react';

type PieDatum = { label: string; value: number; color: string };

interface PieChartProps {
  data: PieDatum[];
  size?: number;
  centerLabel?: string;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

export function PieChart({ data, size = 180, centerLabel }: PieChartProps) {
  const prepared = useMemo(() => {
    const total = data.reduce((sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0), 0);
    return {
      total,
      segments: data.map((item) => ({
        ...item,
        value: Number.isFinite(item.value) ? item.value : 0,
        percent: total > 0 ? (item.value / total) * 100 : 0
      }))
    };
  }, [data]);

  const radius = size / 2 - 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="18"
          opacity={0.4}
        />
        {prepared.segments.map((seg, index) => {
          const dash = (seg.value / (prepared.total || 1)) * circumference;
          const circle = (
            <circle
              key={`${seg.label}-${index}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }}
            />
          );
          offset += dash;
          return circle;
        })}
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          fill="var(--text)"
          fontSize="16"
          fontWeight={600}
        >
          {centerLabel || (prepared.total > 0 ? formatPercent(prepared.segments[0]?.percent || 0) : '0%')}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 16}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="10"
        >
          allocation
        </text>
      </svg>
      <div style={{ width: '100%', display: 'grid', gap: '6px' }}>
        {prepared.segments.map((seg, index) => (
          <div key={`${seg.label}-legend-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: seg.color }} />
            <span style={{ color: 'var(--muted)' }}>{seg.label}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{formatPercent(seg.percent)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
