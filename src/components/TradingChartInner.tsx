'use client';

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  CandlestickData,
  LineData,
  HistogramData,
  ColorType,
  LineStyle,
  CrosshairMode,
  Time,
} from 'lightweight-charts';

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

function calcEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/* ── TradingView Embed (default — full indicators) ── */
function TVEmbedChart({ pair, indicators = [] }: { pair: string; indicators: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const symbol = useMemo(() => `BINANCE:${normalizeSymbol(pair)}`, [pair]);
  const studies = useMemo(
    () => [...new Set(indicators.map((name) => INDICATOR_MAP[name]).filter(Boolean))],
    [indicators]
  );
  const widgetKey = useMemo(() => `${symbol}__${studies.join(',')}`, [symbol, studies]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
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
        studies,
        backgroundColor: CHART_BG,
        gridColor: 'rgba(255,255,255,0.04)',
        allow_symbol_change: true,
        withdateranges: true,
      });
    };
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, [widgetKey, symbol, studies]);

  const containerId = `tv_chart_${widgetKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
  return (
    <div
      id={containerId}
      ref={containerRef}
      style={{ flex: 1, background: CHART_BG, borderRadius: '12px', overflow: 'hidden' }}
    />
  );
}

/* ── TBO Chart (lightweight-charts — custom markers + signals) ── */
function TBOChart({ pair, boardId, tboSignals }: { pair: string; boardId: number; tboSignals: TboSignals }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState(false);

  const symbol = useMemo(() => normalizeSymbol(pair), [pair]);

  const fetchAndRender = useCallback(async () => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;

    try {
      const res = await fetch(`/api/trading/ohlcv?symbol=${symbol}&timeframe=1h&limit=200`);
      if (!res.ok) throw new Error('OHLCV fetch failed');
      const data = await res.json();
      const candles: any[] = data.candles || [];
      if (!candles.length) throw new Error('No candles');

      const candleData: CandlestickData[] = candles.map((c: any) => ({
        time: (typeof c.time === 'number' ? Math.floor(c.time / 1000) : Math.floor(new Date(c.time || c[0]).getTime() / 1000)) as any,
        open: Number(c.open ?? c[1]),
        high: Number(c.high ?? c[2]),
        low: Number(c.low ?? c[3]),
        close: Number(c.close ?? c[4]),
      }));
      candleData.sort((a: any, b: any) => (a.time as number) - (b.time as number));
      candleSeries.setData(candleData as any);

      // Volume
      if (volumeSeriesRef.current) {
        const volData: HistogramData[] = candles.map((c: any, i: number) => ({
          time: candleData[i].time,
          value: Number(c.volume ?? c[5] ?? 0),
          color: candleData[i].close >= candleData[i].open ? 'rgba(74,222,128,0.3)' : 'rgba(240,91,111,0.3)',
        }));
        volData.sort((a: any, b: any) => (a.time as number) - (b.time as number));
        volumeSeriesRef.current.setData(volData as any);
      }

      // EMAs
      const closes = candleData.map((c) => c.close);
      if (ema20SeriesRef.current) {
        const ema20 = calcEMA(closes, 20);
        ema20SeriesRef.current.setData(candleData.map((c, i) => ({ time: c.time, value: ema20[i] })) as any);
      }
      if (ema50SeriesRef.current) {
        const ema50 = calcEMA(closes, 50);
        ema50SeriesRef.current.setData(candleData.map((c, i) => ({ time: c.time, value: ema50[i] })) as any);
      }

      // Markers
      const markers: any[] = [];
      const lastCandle = candleData[candleData.length - 1];

      // TBO signal marker
      if (tboSignals && lastCandle) {
        if (tboSignals.signal === 'open_long') {
          markers.push({ time: lastCandle.time, position: 'belowBar', color: '#4ade80', shape: 'arrowUp', text: 'BUY' });
        } else if (tboSignals.signal === 'open_short' || tboSignals.signal === 'close_long') {
          markers.push({ time: lastCandle.time, position: 'aboveBar', color: '#f05b6f', shape: 'arrowDown', text: 'SELL' });
        }
      }

      // Past trade markers
      try {
        const mRes = await fetch(`/api/trading/chart-markers?symbol=${symbol}&boardId=${boardId}`);
        if (mRes.ok) {
          const mData = await mRes.json();
          for (const m of mData.markers || []) {
            const ts = Math.floor(new Date(m.time).getTime() / 1000);
            const nearest = candleData.reduce((prev, curr) =>
              Math.abs((curr.time as number) - ts) < Math.abs((prev.time as number) - ts) ? curr : prev
            );
            const pnlText = m.pnl != null ? ` $${m.pnl > 0 ? '+' : ''}${m.pnl.toFixed(2)}` : '';
            markers.push({
              time: nearest.time,
              position: m.type === 'buy' ? 'belowBar' : 'aboveBar',
              color: m.type === 'buy' ? '#4ade80' : '#f05b6f',
              shape: m.type === 'buy' ? 'arrowUp' : 'arrowDown',
              text: `${m.type === 'buy' ? 'BUY' : 'SELL'}${pnlText}`,
            });
          }
        }
      } catch {}

      markers.sort((a: any, b: any) => (a.time as number) - (b.time as number));
      if (!markersPluginRef.current) {
        markersPluginRef.current = createSeriesMarkers(candleSeries, markers);
      } else {
        markersPluginRef.current.setMarkers(markers);
      }

      // TBO price lines
      if (tboSignals) {
        if (tboSignals.tp) candleSeries.createPriceLine({ price: tboSignals.tp, color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TP' });
        if (tboSignals.sl) candleSeries.createPriceLine({ price: tboSignals.sl, color: '#f05b6f', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SL' });
        if (tboSignals.support) candleSeries.createPriceLine({ price: tboSignals.support, color: '#60a5fa', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Support' });
        if (tboSignals.resistance) candleSeries.createPriceLine({ price: tboSignals.resistance, color: '#f59e0b', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Resistance' });
      }

      chart.timeScale().fitContent();
      setError(false);
    } catch (err) {
      console.error('TBO Chart data error:', err);
      setError(true);
    }
  }, [symbol, boardId, tboSignals]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; markersPluginRef.current = null; }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 440,
      layout: { background: { type: ColorType.Solid, color: CHART_BG }, textColor: '#888' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(123,125,255,0.5)' }, horzLine: { color: 'rgba(123,125,255,0.5)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#4ade80', downColor: '#f05b6f',
      borderUpColor: '#4ade80', borderDownColor: '#f05b6f',
      wickUpColor: '#4ade80', wickDownColor: '#f05b6f',
    });

    ema20SeriesRef.current = chart.addSeries(LineSeries, { color: 'rgba(123,125,255,0.8)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ema50SeriesRef.current = chart.addSeries(LineSeries, { color: 'rgba(255,165,0,0.8)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(container);

    fetchAndRender();
    intervalRef.current = setInterval(fetchAndRender, 60000);

    return () => {
      ro.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [symbol, tboSignals?.signal, tboSignals?.tp, tboSignals?.sl]);

  if (error) {
    return (
      <div style={{ flex: 1, background: CHART_BG, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
        TBO chart data unavailable — try the Standard view
      </div>
    );
  }

  return <div ref={containerRef} style={{ flex: 1, background: CHART_BG, borderRadius: '12px', overflow: 'hidden' }} />;
}

/* ── Main Component with View Toggle ── */
export default function TradingChartInner({ pair, boardId, indicators = [], tboSignals }: Props) {
  const [view, setView] = useState<'standard' | 'tbo'>(() => {
    try { return (localStorage.getItem('clawdesk-chart-view') as any) || 'standard'; } catch { return 'standard'; }
  });

  const toggleView = (v: 'standard' | 'tbo') => {
    setView(v);
    try { localStorage.setItem('clawdesk-chart-view', v); } catch {}
  };

  return (
    <div style={{ width: '100%', height: '480px', display: 'flex', flexDirection: 'column' }}>
      {/* View toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <button
          onClick={() => toggleView('standard')}
          style={{
            padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${view === 'standard' ? '#7b7dff' : 'var(--border)'}`,
            background: view === 'standard' ? 'rgba(123,125,255,0.16)' : 'transparent',
            color: view === 'standard' ? '#7b7dff' : '#888',
          }}
        >
          📊 Standard
        </button>
        <button
          onClick={() => toggleView('tbo')}
          style={{
            padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${view === 'tbo' ? '#7b7dff' : 'var(--border)'}`,
            background: view === 'tbo' ? 'rgba(123,125,255,0.16)' : 'transparent',
            color: view === 'tbo' ? '#7b7dff' : '#888',
          }}
        >
          🎯 TBO Signals
        </button>
        <span style={{ fontSize: '10px', color: '#555', marginLeft: '4px' }}>
          {view === 'standard' ? 'Full indicators via TradingView' : 'Buy/sell markers, TP/SL, support/resistance'}
        </span>
      </div>

      {/* Chart */}
      {view === 'standard' ? (
        <TVEmbedChart pair={pair} indicators={indicators} />
      ) : (
        <TBOChart pair={pair} boardId={boardId} tboSignals={tboSignals ?? null} />
      )}

      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px', textAlign: 'right' }}>
        Powered by TradingView
      </div>
    </div>
  );
}
