'use client';

import { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, CandlestickSeries, HistogramSeries, type CandlestickData, type HistogramData, type UTCTimestamp } from 'lightweight-charts';

const CHART_BG = '#0d0d1f';

type Trade = {
  id: number;
  coin_pair: string;
  entered_at?: string | null;
  exited_at?: string | null;
  direction?: string | null;
};

type Props = {
  pair: string;
  boardId: number;
};

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

function toUnixSeconds(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export default function TradingChartInner({ pair, boardId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleRef = useRef<any>(null);
  const volumeRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: CHART_BG },
        textColor: '#eef0ff',
        fontSize: 12,
        fontFamily: 'var(--font-ui, Inter, sans-serif)'
      },
      grid: {
        vertLines: { color: 'rgba(123,125,255,0.1)' },
        horzLines: { color: 'rgba(123,125,255,0.1)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      height: containerRef.current.clientHeight || 300,
      width: containerRef.current.clientWidth,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#4ade80',
      downColor: '#f05b6f',
      borderVisible: false,
      wickUpColor: '#4ade80',
      wickDownColor: '#f05b6f',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: '',
      priceFormat: { type: 'volume' },
      color: 'rgba(123,125,255,0.35)',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/v1/prices/${pair}?history=1h&limit=48`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        const candles: CandlestickData[] = (data.ohlcv || []).map((row: any) => ({
          time: Math.floor(Number(row.time) / 1000) as UTCTimestamp,
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
        }));

        const volumes: HistogramData[] = (data.ohlcv || []).map((row: any) => ({
          time: Math.floor(Number(row.time) / 1000) as UTCTimestamp,
          value: Number(row.volume),
          color: Number(row.close) >= Number(row.open) ? 'rgba(74,222,128,0.35)' : 'rgba(240,91,111,0.35)',
        }));

        candleRef.current?.setData(candles);
        volumeRef.current?.setData(volumes);
        chartRef.current?.timeScale().fitContent();
      } catch {
        // ignore
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [pair]);

  useEffect(() => {
    let isMounted = true;

    const loadMarkers = async () => {
      try {
        const res = await fetch(`/api/v1/boards/${boardId}/trades`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        const trades: Trade[] = data.trades || [];
        const normalized = normalizePair(pair);

        const markers = trades
          .filter((trade) => normalizePair(trade.coin_pair) === normalized)
          .flatMap((trade) => {
            const entries = [] as Array<any>;
            const enteredAt = toUnixSeconds(trade.entered_at);
            const exitedAt = toUnixSeconds(trade.exited_at);
            if (enteredAt) {
              entries.push({
                time: enteredAt,
                position: 'belowBar',
                color: '#4ade80',
                shape: 'arrowUp',
                text: 'Entered',
              });
            }
            if (exitedAt) {
              entries.push({
                time: exitedAt,
                position: 'aboveBar',
                color: '#f05b6f',
                shape: 'arrowDown',
                text: 'Exited',
              });
            }
            return entries;
          });

        candleRef.current?.setMarkers(markers);
      } catch {
        // ignore
      }
    };

    loadMarkers();
    return () => {
      isMounted = false;
    };
  }, [boardId, pair]);

  return <div ref={containerRef} className="tv-chart-container" style={{ width: '100%', height: '300px' }} />;
}
