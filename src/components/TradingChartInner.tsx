'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
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

export default function TradingChartInner({ pair, boardId, indicators = [], tboSignals }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackRef = useRef(false);

  const symbol = useMemo(() => normalizeSymbol(pair), [pair]);
  const showEMA = indicators.includes('EMA20') || indicators.includes('EMA50') || !!tboSignals;
  const showVolume = indicators.includes('Volume');

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

      // Sort by time
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
        const ema20Data: LineData[] = candleData.map((c, i) => ({ time: c.time, value: ema20[i] }));
        ema20SeriesRef.current.setData(ema20Data as any);
      }
      if (ema50SeriesRef.current) {
        const ema50 = calcEMA(closes, 50);
        const ema50Data: LineData[] = candleData.map((c, i) => ({ time: c.time, value: ema50[i] }));
        ema50SeriesRef.current.setData(ema50Data as any);
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

      // Chart markers from API (past trades)
      try {
        const mRes = await fetch(`/api/trading/chart-markers?symbol=${symbol}&boardId=${boardId}`);
        if (mRes.ok) {
          const mData = await mRes.json();
          for (const m of mData.markers || []) {
            const ts = Math.floor(new Date(m.time).getTime() / 1000);
            // Snap to nearest candle time
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

      // Sort markers by time (required by lightweight-charts)
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      if (!markersPluginRef.current) {
        markersPluginRef.current = createSeriesMarkers(candleSeries, markers);
      } else {
        markersPluginRef.current.setMarkers(markers);
      }

      // TBO Price lines — clear old ones by recreating (lightweight-charts doesn't have removeAllPriceLines easily)
      // We'll use a simple approach: price lines persist until chart is recreated
      if (tboSignals) {
        if (tboSignals.tp) {
          candleSeries.createPriceLine({ price: tboSignals.tp, color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TP' });
        }
        if (tboSignals.sl) {
          candleSeries.createPriceLine({ price: tboSignals.sl, color: '#f05b6f', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SL' });
        }
        if (tboSignals.support) {
          candleSeries.createPriceLine({ price: tboSignals.support, color: '#60a5fa', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Support' });
        }
        if (tboSignals.resistance) {
          candleSeries.createPriceLine({ price: tboSignals.resistance, color: '#f59e0b', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Resistance' });
        }
      }

      chart.timeScale().fitContent();
    } catch (err) {
      console.error('Chart data error:', err);
      fallbackRef.current = true;
    }
  }, [symbol, boardId, tboSignals, showEMA, showVolume]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean up previous
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      markersPluginRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 440,
      layout: { background: { type: ColorType.Solid, color: CHART_BG }, textColor: '#888' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(123,125,255,0.5)' }, horzLine: { color: 'rgba(123,125,255,0.5)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#4ade80',
      downColor: '#f05b6f',
      borderUpColor: '#4ade80',
      borderDownColor: '#f05b6f',
      wickUpColor: '#4ade80',
      wickDownColor: '#f05b6f',
    });
    candleSeriesRef.current = candleSeries;

    // EMA series
    if (showEMA) {
      ema20SeriesRef.current = chart.addSeries(LineSeries, { color: 'rgba(123,125,255,0.8)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      ema50SeriesRef.current = chart.addSeries(LineSeries, { color: 'rgba(255,165,0,0.8)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    } else {
      ema20SeriesRef.current = null;
      ema50SeriesRef.current = null;
    }

    // Volume
    if (showVolume) {
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    } else {
      volumeSeriesRef.current = null;
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(container);

    // Fetch data
    fetchAndRender();

    // Auto-refresh every 60s
    intervalRef.current = setInterval(fetchAndRender, 60000);

    return () => {
      ro.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [symbol, showEMA, showVolume, tboSignals?.signal, tboSignals?.tp, tboSignals?.sl]);

  if (fallbackRef.current) {
    return (
      <div style={{ width: '100%', height: '440px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, background: CHART_BG, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Chart data unavailable
        </div>
        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px', textAlign: 'right' }}>Powered by TradingView</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '440px', display: 'flex', flexDirection: 'column' }}>
      <div ref={containerRef} style={{ flex: 1, background: CHART_BG, borderRadius: '12px', overflow: 'hidden' }} />
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px', textAlign: 'right' }}>Powered by TradingView</div>
    </div>
  );
}
