import { COIN_CATEGORIES } from '../coin-scanner';

export interface RebalancerConfig {
  enabled: boolean;
  riskLevel: number; // 1-10
  rebalanceThreshold: number; // % drift before rebalancing, default 5
  rebalanceInterval: string; // "1h", "4h", "1d"
  watchlistSize: number; // how many coins to track, default 10
}

// Maps risk level (1-10) to target allocation percentages
export const RISK_ALLOCATIONS: Record<number, { stablecoins: number; bitcoin: number; largeCapAlts: number; midCapAlts: number; smallCapAlts: number }> = {
  1: { stablecoins: 80, bitcoin: 15, largeCapAlts: 5, midCapAlts: 0, smallCapAlts: 0 },
  2: { stablecoins: 60, bitcoin: 25, largeCapAlts: 10, midCapAlts: 5, smallCapAlts: 0 },
  3: { stablecoins: 40, bitcoin: 30, largeCapAlts: 20, midCapAlts: 10, smallCapAlts: 0 },
  4: { stablecoins: 25, bitcoin: 30, largeCapAlts: 25, midCapAlts: 15, smallCapAlts: 5 },
  5: { stablecoins: 15, bitcoin: 25, largeCapAlts: 25, midCapAlts: 20, smallCapAlts: 15 },
  6: { stablecoins: 10, bitcoin: 20, largeCapAlts: 25, midCapAlts: 25, smallCapAlts: 20 },
  7: { stablecoins: 5, bitcoin: 15, largeCapAlts: 25, midCapAlts: 30, smallCapAlts: 25 },
  8: { stablecoins: 5, bitcoin: 10, largeCapAlts: 20, midCapAlts: 30, smallCapAlts: 35 },
  9: { stablecoins: 0, bitcoin: 10, largeCapAlts: 15, midCapAlts: 30, smallCapAlts: 45 },
  10: { stablecoins: 0, bitcoin: 5, largeCapAlts: 10, midCapAlts: 25, smallCapAlts: 60 }
};

export function getTargetAllocation(riskLevel: number) {
  return RISK_ALLOCATIONS[Math.max(1, Math.min(10, riskLevel))];
}

export function calculateDrift(current: Record<string, number>, target: Record<string, number>): Record<string, number> {
  const drift: Record<string, number> = {};
  for (const [category, targetValue] of Object.entries(target)) {
    const currentValue = Number(current?.[category] ?? 0);
    drift[category] = currentValue - targetValue;
  }
  return drift;
}

export function needsRebalance(drift: Record<string, number>, threshold: number): boolean {
  const limit = Math.abs(threshold);
  return Object.values(drift).some((value) => Math.abs(value) >= limit);
}

export function calculateRebalanceTrades(
  current: Record<string, { coin: string; value: number; category: string }[]>,
  target: Record<string, number>,
  totalValue: number
): { sell: { coin: string; amount: number }[]; buy: { coin: string; amount: number }[] } {
  const sell: { coin: string; amount: number }[] = [];
  const buy: { coin: string; amount: number }[] = [];

  const currentTotals: Record<string, number> = {};
  for (const [category, holdings] of Object.entries(current)) {
    currentTotals[category] = holdings.reduce((sum, h) => sum + Number(h.value || 0), 0);
  }

  for (const [category, targetPercent] of Object.entries(target)) {
    const currentValue = Number(currentTotals[category] ?? 0);
    const targetValue = totalValue * (targetPercent / 100);
    const diff = currentValue - targetValue;

    if (diff > 0.01) {
      const holdings = current[category] ?? [];
      const totalCategoryValue = holdings.reduce((sum, h) => sum + Number(h.value || 0), 0);
      for (const holding of holdings) {
        const value = Number(holding.value || 0);
        if (totalCategoryValue <= 0 || value <= 0) continue;
        const portion = (value / totalCategoryValue) * diff;
        if (portion > 0.01) {
          sell.push({ coin: holding.coin, amount: portion });
        }
      }
    }

    if (diff < -0.01) {
      const holdings = current[category] ?? [];
      const primaryCoin = holdings[0]?.coin || `${category}_BASKET`;
      buy.push({ coin: primaryCoin, amount: Math.abs(diff) });
    }
  }

  return { sell, buy };
}

function normalizePair(pair: string): string {
  return pair.replace(/-/g, '/').toUpperCase();
}

function findCategory(pair: string): keyof typeof RISK_ALLOCATIONS[1] {
  const normalized = normalizePair(pair);
  if (normalized === 'CASH') return 'stablecoins';
  if (COIN_CATEGORIES.bitcoin.includes(normalized)) return 'bitcoin';
  if (COIN_CATEGORIES.largeCapAlts.includes(normalized)) return 'largeCapAlts';
  if (COIN_CATEGORIES.midCapAlts.includes(normalized)) return 'midCapAlts';
  if (COIN_CATEGORIES.smallCapAlts.includes(normalized)) return 'smallCapAlts';
  return 'stablecoins';
}

function toNumber(value: unknown, fallback: number = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computePositionValue(trade: any, price: number): number {
  const entryPrice = toNumber(trade?.entry_price, price || 0);
  const positionSize = toNumber(trade?.position_size, 0);
  const direction = String(trade?.direction || 'long').toLowerCase();
  if (positionSize <= 0) return 0;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return positionSize;
  const change = (price - entryPrice) / entryPrice;
  return positionSize + positionSize * (direction === 'short' ? -change : change);
}

export function calculateCurrentAllocation(
  trades: any[],
  prices: Map<string, number>
): Record<string, number> {
  const allocations: Record<string, number> = {
    stablecoins: 0,
    bitcoin: 0,
    largeCapAlts: 0,
    midCapAlts: 0,
    smallCapAlts: 0
  };

  let totalValue = 0;
  for (const trade of trades) {
    const pair = normalizePair(trade?.coin_pair || trade?.pair || trade?.coin || 'CASH');
    const price = prices.get(pair) ?? toNumber(trade?.current_price, 0);
    const value = pair === 'CASH' ? toNumber(trade?.position_size, 0) : computePositionValue(trade, price);
    if (!Number.isFinite(value) || value <= 0) continue;
    const category = findCategory(pair);
    allocations[category] += value;
    totalValue += value;
  }

  if (totalValue <= 0) return allocations;

  const percentages: Record<string, number> = {};
  for (const [category, value] of Object.entries(allocations)) {
    percentages[category] = (value / totalValue) * 100;
  }
  return percentages;
}

export function generateRebalanceTrades(
  current: Record<string, number>,
  target: Record<string, number>,
  totalValue: number,
  availableCoins: any[]
): { sells: { pair: string; amount: number }[]; buys: { pair: string; amount: number }[] } {
  const sells: { pair: string; amount: number }[] = [];
  const buys: { pair: string; amount: number }[] = [];

  const candidates = Array.isArray(availableCoins) ? availableCoins : [];

  for (const [category, targetPercent] of Object.entries(target)) {
    const currentPercent = toNumber(current?.[category], 0);
    const diff = currentPercent - targetPercent;
    const dollarDiff = (diff / 100) * totalValue;

    if (dollarDiff > 1 && category !== 'stablecoins') {
      const holdings = candidates.filter((coin) => coin?.category === category && coin?.isHolding);
      const totalCategoryValue = holdings.reduce((sum, h) => sum + toNumber(h.value, 0), 0);
      for (const holding of holdings) {
        if (totalCategoryValue <= 0) break;
        const portion = (toNumber(holding.value, 0) / totalCategoryValue) * dollarDiff;
        if (portion > 1) {
          sells.push({ pair: normalizePair(holding.pair || holding.coin || holding.coin_pair), amount: portion });
        }
      }
    }

    if (dollarDiff < -1) {
      const options = candidates.filter((coin) => coin?.category === category);
      const best = options.sort((a, b) => toNumber(b.volume24h, 0) - toNumber(a.volume24h, 0))[0];
      const pair = best?.pair || best?.coin || best?.coin_pair || `${category}_BASKET`;
      buys.push({ pair: normalizePair(pair), amount: Math.abs(dollarDiff) });
    }
  }

  return { sells, buys };
}
