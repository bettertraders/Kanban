// Strategy registration files imported at bottom to avoid circular init issues
export type TradingStyle = 'swing' | 'day' | 'scalper' | 'fundamental' | 'longterm';

export interface CoinSignal {
  coin_pair: string;
  action: 'buy' | 'sell' | 'hold' | 'watch';
  confidence: number; // 0-100
  reason: string;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
}

export interface StrategyConfig {
  maxPositions: number;
  positionSizePercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  timeframe: string;
  [key: string]: any; // strategy-specific params
}

export interface TradingStrategy {
  name: string;
  style: TradingStyle;
  subStyle: string;
  description: string;
  icon: string; // emoji
  riskLevel: number; // 1-10
  defaultConfig: StrategyConfig;

  // Given price/volume data, generate signals
  generateSignals(coins: any[]): Promise<CoinSignal[]>;

  // Should we enter this trade?
  shouldEnter(coinData: any, currentPrice: number, config: StrategyConfig): boolean;

  // Should we exit this trade?
  shouldExit(trade: any, currentPrice: number, config: StrategyConfig): { exit: boolean; reason: string };
}

// Registry of all strategies
export const STRATEGIES: Record<string, TradingStrategy> = {};

export function registerStrategy(key: string, strategy: TradingStrategy) {
  STRATEGIES[key] = strategy;
}

// Lazy registration to avoid circular dependency
let _registered = false;
export function ensureStrategiesRegistered() {
  if (_registered) return;
  _registered = true;
  require('./swing');
  require('./day');
  require('./scalper');
  require('./fundamental');
  require('./longterm');
}

// Auto-register on first access
export function getStrategy(style: TradingStyle, subStyle: string): TradingStrategy | null {
  ensureStrategiesRegistered();
  return STRATEGIES[`${style}:${subStyle}`] || null;
}

export function getStrategiesByStyle(style: TradingStyle): TradingStrategy[] {
  ensureStrategiesRegistered();
  return Object.values(STRATEGIES).filter((s) => s.style === style);
}

export function getAllStrategies(): TradingStrategy[] {
  ensureStrategiesRegistered();
  return Object.values(STRATEGIES);
}
