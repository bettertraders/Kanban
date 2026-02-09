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
