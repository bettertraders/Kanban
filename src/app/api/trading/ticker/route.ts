import { NextResponse } from 'next/server';
import ccxt from 'ccxt';

type TickerCoin = {
  symbol: string;
  price: number;
  change24h: number;
};

const TOP_SYMBOLS = [
  'BTC', 'ETH', 'XRP', 'SOL', 'BNB', 'DOGE', 'ADA', 'AVAX',
  'DOT', 'LINK', 'MATIC', 'SHIB', 'LTC', 'UNI', 'ATOM',
];

let cache: { data: TickerCoin[]; ts: number } | null = null;
const CACHE_MS = 3 * 60 * 1000; // 3 minutes

async function fetchFromBinance(): Promise<TickerCoin[]> {
  const exchange = new ccxt.binance({ enableRateLimit: true });
  const tickers = await exchange.fetchTickers(
    TOP_SYMBOLS.map((s) => `${s}/USDT`)
  );
  return TOP_SYMBOLS.map((sym) => {
    const t = tickers[`${sym}/USDT`];
    return {
      symbol: sym,
      price: t?.last ?? 0,
      change24h: t?.percentage ?? 0,
    };
  }).filter((c) => c.price > 0);
}

async function fetchFromCoinGecko(): Promise<TickerCoin[]> {
  const idMap: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', XRP: 'ripple', SOL: 'solana',
    BNB: 'binancecoin', DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche-2',
    DOT: 'polkadot', LINK: 'chainlink', MATIC: 'matic-network', SHIB: 'shiba-inu',
    LTC: 'litecoin', UNI: 'uniswap', ATOM: 'cosmos',
  };
  const ids = TOP_SYMBOLS.map((s) => idMap[s]).filter(Boolean).join(',');
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { next: { revalidate: 120 } }
  );
  if (!res.ok) throw new Error('CoinGecko failed');
  const json = await res.json();
  const reverseMap = Object.fromEntries(Object.entries(idMap).map(([k, v]) => [v, k]));
  return Object.entries(json).map(([id, d]: [string, any]) => ({
    symbol: reverseMap[id] || id.toUpperCase(),
    price: d.usd ?? 0,
    change24h: d.usd_24h_change ?? 0,
  })).filter((c) => c.price > 0);
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ coins: cache.data, cached: true });
  }

  let coins: TickerCoin[];
  try {
    coins = await fetchFromBinance();
  } catch {
    try {
      coins = await fetchFromCoinGecko();
    } catch {
      if (cache) return NextResponse.json({ coins: cache.data, cached: true, stale: true });
      return NextResponse.json({ coins: [], error: 'All sources failed' }, { status: 502 });
    }
  }

  cache = { data: coins, ts: Date.now() };
  return NextResponse.json({ coins });
}
