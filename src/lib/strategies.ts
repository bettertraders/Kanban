/**
 * TBO Trading Engine — Strategy Registry
 * 
 * Each strategy defines its signals, indicators, risk levels, and market conditions.
 * Strategies dynamically activate/deactivate based on market state.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Strategy {
  defaultConfig?: Record<string, unknown>;
  shouldExit?: (trade: any, currentPrice: number, config: any) => { exit: boolean; reason?: string };
  generateSignals?: (coins: any[]) => Promise<any[]> | any[];
  shouldEnter?: (coin: any, currentPrice: number, config: any) => boolean;
  id: string;
  name: string;
  direction: 'long' | 'short' | 'both';
  type: 'swing' | 'day' | 'scalp' | 'investment';
  description: string;
  indicators: string[];
  riskLevels: ('safe' | 'balanced' | 'bold')[];
  markets: string[];  // Which markets this strategy works on
  // Dynamic state — computed per run
  active?: boolean;
  tradeCount?: number;
  avgHoldTime?: string;
  conditions?: string;  // Why it's active or inactive
}

export const STRATEGY_CATALOG: Strategy[] = [
  {
    id: 'oversold_bounce',
    name: 'Oversold Bounce',
    direction: 'long',
    type: 'swing',
    description: 'Buy when RSI shows oversold near SMA20 support with MACD confirmation',
    indicators: ['RSI', 'SMA20', 'MACD'],
    riskLevels: ['safe', 'balanced', 'bold'],
    markets: ['crypto', 'stocks', 'forex'],
  },
  {
    id: 'golden_cross',
    name: 'Golden Cross',
    direction: 'long',
    type: 'swing',
    description: 'Enter when SMA20 crosses above SMA50 with positive momentum',
    indicators: ['SMA20', 'SMA50', 'MACD', 'Momentum'],
    riskLevels: ['safe', 'balanced', 'bold'],
    markets: ['crypto', 'stocks', 'forex'],
  },
  {
    id: 'deeply_oversold',
    name: 'Deep Value',
    direction: 'long',
    type: 'swing',
    description: 'Aggressive buy at extreme oversold levels (RSI < 30) with MACD turning',
    indicators: ['RSI', 'MACD'],
    riskLevels: ['balanced', 'bold'],
    markets: ['crypto', 'stocks'],
  },
  {
    id: 'momentum_catch',
    name: 'Momentum Catch',
    direction: 'long',
    type: 'day',
    description: 'Jump on strong pumps — 4%+ move in 4h with high volume confirmation',
    indicators: ['4h Momentum', 'Volume Ratio', 'RSI'],
    riskLevels: ['bold'],
    markets: ['crypto'],
  },
  {
    id: 'overbought_reject',
    name: 'Overbought Rejection',
    direction: 'short',
    type: 'swing',
    description: 'Short when price rejects below SMA20 resistance with bearish MACD',
    indicators: ['RSI', 'SMA20', 'MACD'],
    riskLevels: ['balanced', 'bold'],
    markets: ['crypto', 'stocks', 'forex'],
  },
  {
    id: 'death_cross',
    name: 'Death Cross Short',
    direction: 'short',
    type: 'swing',
    description: 'Short on SMA20/50 bearish crossover with negative momentum',
    indicators: ['SMA20', 'SMA50', 'MACD', 'Momentum'],
    riskLevels: ['balanced', 'bold'],
    markets: ['crypto', 'stocks', 'forex'],
  },
  {
    id: 'bearish_breakdown',
    name: 'Bearish Breakdown',
    direction: 'short',
    type: 'day',
    description: 'Short fast drops — 3%+ dump in 4h with volume spike',
    indicators: ['4h Momentum', 'Volume Ratio', 'RSI'],
    riskLevels: ['bold'],
    markets: ['crypto'],
  },
  {
    id: 'buy_hold_core',
    name: 'Buy & Hold Core',
    direction: 'long',
    type: 'investment',
    description: 'Long-term BTC/ETH allocation — rebalance monthly, no active trading',
    indicators: ['Market Cap', 'Dominance'],
    riskLevels: ['safe', 'balanced'],
    markets: ['crypto'],
  },
];

/**
 * Get a single strategy by id
 */
export function getStrategy(id: string, _substyle?: string): Strategy | undefined {
  return STRATEGY_CATALOG.find(s => s.id === id) || STRATEGY_CATALOG.find(s => s.name.toLowerCase().includes(id.toLowerCase()));
}

/**
 * Get all strategies
 */
export function getAllStrategies(): Strategy[] {
  return STRATEGY_CATALOG;
}

// Market condition types
export type MarketRegime = 'bullish' | 'bearish' | 'ranging' | 'volatile';

/**
 * Determine which strategies should be active based on current market conditions
 */
export function getActiveStrategies(
  riskLevel: 'safe' | 'balanced' | 'bold',
  market: MarketRegime,
  fearGreedIndex: number,
): Strategy[] {
  return STRATEGY_CATALOG.map(s => {
    // Check if strategy is available for this risk level
    if (!s.riskLevels.includes(riskLevel)) {
      return { ...s, active: false, conditions: `Requires ${s.riskLevels.join(' or ')} risk level` };
    }

    // Market-condition-based activation
    let active = false;
    let conditions = '';

    switch (s.id) {
      case 'oversold_bounce':
        active = fearGreedIndex < 40 || market === 'bearish' || market === 'ranging';
        conditions = active ? 'Fear in market — bounces likely' : 'Market too bullish for oversold plays';
        break;
      case 'golden_cross':
        active = market === 'bullish' || market === 'ranging';
        conditions = active ? 'Trend turning positive' : 'Bearish trend — no golden crosses forming';
        break;
      case 'deeply_oversold':
        active = fearGreedIndex < 25;
        conditions = active ? `Extreme fear (${fearGreedIndex}) — deep value entries` : 'Not enough fear for deep value';
        break;
      case 'momentum_catch':
        active = market === 'volatile' || market === 'bullish';
        conditions = active ? 'Volatile conditions — momentum plays available' : 'Low volatility — no momentum to catch';
        break;
      case 'overbought_reject':
        active = fearGreedIndex > 50 || market === 'bearish';
        conditions = active ? 'Overbought conditions detected' : 'Market not overbought';
        break;
      case 'death_cross':
        active = market === 'bearish';
        conditions = active ? 'Bearish trend confirmed — death crosses forming' : 'No bearish crossovers';
        break;
      case 'bearish_breakdown':
        active = market === 'bearish' || market === 'volatile';
        conditions = active ? 'Breakdowns in progress — short opportunities' : 'Market stable — no breakdowns';
        break;
      case 'buy_hold_core':
        active = riskLevel === 'safe' || riskLevel === 'balanced';
        conditions = active ? 'Core allocation active' : 'Bold mode — fully active trading';
        break;
      default:
        active = true;
        conditions = 'Active';
    }

    return { ...s, active, conditions };
  });
}

/**
 * Get allocation percentages based on risk level
 */
export function getAllocation(riskLevel: 'safe' | 'balanced' | 'bold') {
  const allocations = {
    safe:     { investment: 60, activeTrading: 20, cash: 20 },
    balanced: { investment: 30, activeTrading: 50, cash: 20 },
    bold:     { investment: 10, activeTrading: 70, cash: 20 },
  };
  return allocations[riskLevel] || allocations.balanced;
}

/**
 * Available markets/exchanges
 */
export const MARKETS = [
  { id: 'crypto', name: 'Crypto', exchange: 'Binance', icon: '🪙', available: true },
  { id: 'polymarket', name: 'Polymarket', exchange: 'Polymarket', icon: '🔮', available: true },
  { id: 'stocks', name: 'Stocks', exchange: 'TBD', icon: '📈', available: false },
  { id: 'forex', name: 'Forex', exchange: 'TBD', icon: '💱', available: false },
];
