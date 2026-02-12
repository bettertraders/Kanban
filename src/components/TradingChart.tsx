'use client';

import dynamic from 'next/dynamic';

type TboSignals = {
  signal: string;
  strength: number;
  tp: number;
  sl: number;
  support: number;
  resistance: number;
  indicators?: { ema20: number; ema40: number; sma50: number; sma150: number; rsi14: number };
} | null;

type Props = {
  pair: string;
  boardId: number;
  indicators?: string[];
  tboSignals?: TboSignals;
};

const TradingChartInner = dynamic(() => import('./TradingChartInner'), { ssr: false });

export default function TradingChart({ indicators = [], ...props }: Props) {
  return <TradingChartInner {...props} indicators={indicators} />;
}
