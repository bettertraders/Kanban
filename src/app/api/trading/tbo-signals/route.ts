import { NextRequest, NextResponse } from 'next/server';

const MOCK_DATA: Record<string, any> = {
  BTCUSDT: {
    symbol: 'BTCUSDT',
    signal: 'none',
    strength: 70,
    trend: { fast: 'bearish', mid: 'bearish', slow: 'bearish' },
    tp: 60119,
    sl: 66726,
    support: 65408,
    resistance: 68410,
    squeeze: false,
    volumeSpike: false,
    indicators: { ema20: 66119, ema40: 66800, sma50: 67038, sma150: 64200, rsi14: 43.75 },
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    signal: 'none',
    strength: 50,
    trend: { fast: 'bearish', mid: 'bearish', slow: 'bullish' },
    tp: 2780,
    sl: 2420,
    support: 2480,
    resistance: 2720,
    squeeze: false,
    volumeSpike: false,
    indicators: { ema20: 2580, ema40: 2610, sma50: 2640, sma150: 2500, rsi14: 38.2 },
  },
  SOLUSDT: {
    symbol: 'SOLUSDT',
    signal: 'open_long',
    strength: 82,
    trend: { fast: 'bullish', mid: 'bullish', slow: 'bearish' },
    tp: 128,
    sl: 98,
    support: 102,
    resistance: 122,
    squeeze: true,
    volumeSpike: false,
    indicators: { ema20: 108, ema40: 105, sma50: 103, sma150: 96, rsi14: 61.4 },
  },
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase() || '';
  const data = MOCK_DATA[symbol];
  if (data) return NextResponse.json(data);
  return NextResponse.json({
    symbol,
    signal: 'none',
    strength: 0,
    trend: null,
    tp: null,
    sl: null,
    support: null,
    resistance: null,
    squeeze: null,
    volumeSpike: null,
    indicators: null,
  });
}
