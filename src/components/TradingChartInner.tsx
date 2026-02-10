'use client';

import { useMemo } from 'react';

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
  EMA20: 'EMA@tv-basicstudies',
  EMA50: 'EMA@tv-basicstudies',
  EMA200: 'EMA@tv-basicstudies',
  Volume: 'Volume@tv-basicstudies',
  StochRSI: 'StochasticRSI@tv-basicstudies',
};

function normalizeSymbol(pair: string) {
  return pair.replace(/[/-]/g, '').toUpperCase();
}

export default function TradingChartInner({ pair, indicators = [] }: Props) {
  const symbol = useMemo(() => normalizeSymbol(pair), [pair]);
  const studies = useMemo(
    () => indicators.map((name) => INDICATOR_MAP[name]).filter(Boolean),
    [indicators]
  );

  const src = useMemo(() => {
    const studiesParam = encodeURIComponent(JSON.stringify(studies));
    return `https://s.tradingview.com/widgetembed/?frameElementId=tv_chart&symbol=BINANCE:${symbol}&interval=60&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0d0d1f&studies=${studiesParam}&theme=dark&style=1&timezone=America%2FNew_York&withdateranges=1&showpopupbutton=0&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=clawdesk.ai`;
  }, [symbol, studies]);

  return (
    <div style={{ width: '100%', height: '875px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, background: CHART_BG, borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
        <iframe
          title="TradingView Chart"
          src={src}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', background: CHART_BG }}
          loading="lazy"
          allow="clipboard-write; fullscreen"
        />
      </div>
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px', textAlign: 'right' }}>
        Powered by TradingView
      </div>
    </div>
  );
}
