import { registerStrategy, type TradingStrategy, type CoinSignal, type StrategyConfig } from './index';
import { getCurrentPrice, getPriceSeries, getVolumeSeries, recentHigh, getRsi, volumeIncreasing } from './utils';

function getPair(coin: any): string | null {
  const pair = coin?.coin_pair ?? coin?.pair ?? coin?.symbol ?? null;
  return typeof pair === 'string' && pair.length > 0 ? pair : null;
}

function buildSignal(pair: string, action: CoinSignal['action'], confidence: number, reason: string, config: StrategyConfig, price: number): CoinSignal {
  return {
    coin_pair: pair,
    action,
    confidence,
    reason,
    entry_price: action === 'buy' ? price : undefined,
    stop_loss: action === 'buy' ? price * (1 - config.stopLossPercent / 100) : undefined,
    take_profit: action === 'buy' ? price * (1 + config.takeProfitPercent / 100) : undefined
  };
}

const momentum: TradingStrategy = {
  name: 'Day Momentum',
  style: 'day',
  subStyle: 'momentum',
  description: 'Follow intraday trends with quick entries on volume spikes.',
  icon: '⚡',
  riskLevel: 6,
  defaultConfig: {
    maxPositions: 5,
    positionSizePercent: 10,
    stopLossPercent: 2,
    takeProfitPercent: 5,
    timeframe: '15m'
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const prices = getPriceSeries(coin);
      const volumes = getVolumeSeries(coin);
      const recent = recentHigh(prices.slice(0, -1), 10);
      const volumeUp = volumeIncreasing(volumes, 2);
      if (recent !== null && currentPrice > recent && volumeUp) {
        signals.push(buildSignal(pair, 'buy', 68, 'Intraday breakout with volume spike', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 45, 'Waiting for intraday momentum', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, _config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    const volumes = getVolumeSeries(coinData);
    const recent = recentHigh(prices.slice(0, -1), 10);
    return recent !== null && currentPrice > recent && volumeIncreasing(volumes, 2);
  },
  shouldExit(trade: any, currentPrice: number, config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice <= entry * (1 - config.stopLossPercent / 100)) {
        return { exit: true, reason: 'Stop loss hit' };
      }
      if (currentPrice >= entry * (1 + config.takeProfitPercent / 100)) {
        return { exit: true, reason: 'Take profit reached' };
      }
    }
    return { exit: false, reason: '' };
  }
};

const range: TradingStrategy = {
  name: 'Day Range',
  style: 'day',
  subStyle: 'range',
  description: 'Buy at daily support and sell near daily resistance.',
  icon: '📊',
  riskLevel: 4,
  defaultConfig: {
    maxPositions: 4,
    positionSizePercent: 12,
    stopLossPercent: 3,
    takeProfitPercent: 4,
    timeframe: '1h'
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const prices = getPriceSeries(coin);
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null || prices.length < 5) continue;
      const low = Math.min(...prices.slice(-10));
      const high = Math.max(...prices.slice(-10));
      const range = high - low;
      if (range <= 0) continue;
      const position = (currentPrice - low) / range;
      if (position <= 0.2) {
        signals.push(buildSignal(pair, 'buy', 60, 'Near short-term support', this.defaultConfig, currentPrice));
      } else if (position >= 0.8) {
        signals.push(buildSignal(pair, 'sell', 60, 'Near short-term resistance', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'Mid-range consolidation', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, _config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    if (prices.length < 5) return false;
    const low = Math.min(...prices.slice(-10));
    const high = Math.max(...prices.slice(-10));
    const range = high - low;
    if (range <= 0) return false;
    const position = (currentPrice - low) / range;
    return position <= 0.2;
  },
  shouldExit(trade: any, currentPrice: number, config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice <= entry * (1 - config.stopLossPercent / 100)) {
        return { exit: true, reason: 'Stop loss hit' };
      }
      if (currentPrice >= entry * (1 + config.takeProfitPercent / 100)) {
        return { exit: true, reason: 'Take profit reached' };
      }
    }
    const rsi = getRsi(trade);
    if (rsi !== null && rsi > 70) {
      return { exit: true, reason: 'RSI overbought' };
    }
    return { exit: false, reason: '' };
  }
};

registerStrategy('day:momentum', momentum);
registerStrategy('day:range', range);

export { momentum, range };
