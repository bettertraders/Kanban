'use client';

import { useEffect, useRef, useMemo } from 'react';

type Props = {
  pair: string;
  boardId: number;
  indicators?: string[];
};

const CHART_BG = '#0d0d1f';

const INDICATOR_MAP: Record<string, string> = {
  RSI: 'RSI@tv-basicstudies',
  MACD: 'MACD@tv-basicstudies',
  BB: 'BB@tv-basicstudies',
  EMA20: 'MAExp@tv-basicstudies',
  EMA50: 'MAExp@tv-basicstudies',
  EMA200: 'MAExp@tv-basicstudies',
  Volume: 'Volume@tv-basicstudies',
  StochRSI: 'StochasticRSI@tv-basicstudies',
};

function normalizeSymbol(pair: string) {
  return pair.replace(/[/-]/g, '').toUpperCase();
}

export default function TradingChartInner({ pair, indicators = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const symbol = useMemo(() => `BINANCE:${normalizeSymbol(pair)}`, [pair]);
  const studies = useMemo(
    () => [...new Set(indicators.map((name) => INDICATOR_MAP[name]).filter(Boolean))],
    [indicators]
  );

  // Unique key to force re-render when symbol or indicators change
  const widgetKey = useMemo(() => `${symbol}__${studies.join(',')}`, [symbol, studies]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (!(window as any).TradingView || !containerRef.current) return;
      new (window as any).TradingView.widget({
        container_id: container.id,
        autosize: true,
        symbol,
        interval: '60',
        timezone: 'America/New_York',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: CHART_BG,
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        studies: studies,
        backgroundColor: CHART_BG,
        gridColor: 'rgba(255,255,255,0.04)',
        allow_symbol_change: true,
        withdateranges: true,
      });
    };
    document.head.appendChild(script);

    return () => {
      try { document.head.removeChild(script); } catch {}
    };
  }, [widgetKey, symbol, studies]);

  const containerId = `tv_chart_${widgetKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return (
    <div style={{ width: '100%', height: '440px', display: 'flex', flexDirection: 'column' }}>
      <div
        id={containerId}
        ref={containerRef}
        style={{ flex: 1, background: CHART_BG, borderRadius: '12px', overflow: 'hidden' }}
      />
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px', textAlign: 'right' }}>
        Powered by TradingView
      </div>
    </div>
  );
}
