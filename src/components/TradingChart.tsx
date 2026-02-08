'use client';

import dynamic from 'next/dynamic';

type Props = {
  pair: string;
  boardId: number;
};

const TradingChartInner = dynamic(() => import('./TradingChartInner'), { ssr: false });

export default function TradingChart(props: Props) {
  return <TradingChartInner {...props} />;
}
