import { getBatchPrices } from './price-service';

// Top coins to scan — curated list of liquid, tradeable pairs
export const DEFAULT_WATCHLIST = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
  'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT',
  'MATIC/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'FIL/USDT',
  'NEAR/USDT', 'APT/USDT', 'ARB/USDT', 'OP/USDT', 'SUI/USDT',
  'PEPE/USDT', 'WIF/USDT', 'FET/USDT', 'RENDER/USDT', 'INJ/USDT'
];

// Categorize coins for rebalancer
export const COIN_CATEGORIES = {
  stablecoins: ['USDT', 'USDC'],
  bitcoin: ['BTC/USDT'],
  largeCapAlts: ['ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'],
  midCapAlts: ['ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT'],
  smallCapAlts: ['NEAR/USDT', 'APT/USDT', 'ARB/USDT', 'OP/USDT', 'SUI/USDT', 'PEPE/USDT', 'WIF/USDT', 'FET/USDT', 'RENDER/USDT', 'INJ/USDT']
};

export interface CoinData {
  pair: string;
  price: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  category: 'stablecoins' | 'bitcoin' | 'largeCapAlts' | 'midCapAlts' | 'smallCapAlts';
}

function normalizePair(pair: string): string {
  return pair.replace(/-/g, '/').toUpperCase();
}

function findCategory(pair: string): CoinData['category'] {
  const normalized = normalizePair(pair);
  if (COIN_CATEGORIES.bitcoin.includes(normalized)) return 'bitcoin';
  if (COIN_CATEGORIES.largeCapAlts.includes(normalized)) return 'largeCapAlts';
  if (COIN_CATEGORIES.midCapAlts.includes(normalized)) return 'midCapAlts';
  if (COIN_CATEGORIES.smallCapAlts.includes(normalized)) return 'smallCapAlts';
  return 'stablecoins';
}

// Scan all coins and return enriched data
export async function scanCoins(watchlist?: string[]): Promise<CoinData[]> {
  const list = (watchlist && watchlist.length ? watchlist : DEFAULT_WATCHLIST).map(normalizePair);
  const prices = await getBatchPrices(list);

  const data: CoinData[] = [];
  for (const pair of list) {
    const snapshot = prices[pair];
    if (!snapshot) continue;
    data.push({
      pair,
      price: Number(snapshot.price ?? 0),
      volume24h: Number(snapshot.volume24h ?? 0),
      change24h: Number(snapshot.change24h ?? 0),
      high24h: Number(snapshot.high24h ?? snapshot.price ?? 0),
      low24h: Number(snapshot.low24h ?? snapshot.price ?? 0),
      category: findCategory(pair)
    });
  }

  return data.sort((a, b) => b.volume24h - a.volume24h);
}

// Get coins filtered by category (for rebalancer)
export async function getCoinsByCategory(category: string): Promise<CoinData[]> {
  const list = (COIN_CATEGORIES as Record<string, string[]>)[category] ?? [];
  if (!list.length) return [];
  return scanCoins(list);
}

// Rank coins by opportunity (for strategy use)
export async function rankCoinsByOpportunity(coins: CoinData[]): Promise<CoinData[]> {
  return [...coins].sort((a, b) => (b.volume24h * Math.abs(b.change24h)) - (a.volume24h * Math.abs(a.change24h)));
}
