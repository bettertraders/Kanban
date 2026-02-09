'use client';

import dynamic from 'next/dynamic';

type Props = {
  pair: string;
  boardId: number;
  indicators?: string[];
};

const TradingChartInner = dynamic(() => import('./TradingChartInner'), { ssr: false });

export default function TradingChart({ indicators = [], ...props }: Props) {
  return <TradingChartInner {...props} indicators={indicators} />;
}
