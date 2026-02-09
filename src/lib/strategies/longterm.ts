import { registerStrategy, type TradingStrategy, type CoinSignal, type StrategyConfig } from './index';
import { getCurrentPrice, getPriceSeries, recentHigh } from './utils';

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

const dca: TradingStrategy = {
  name: 'Long-Term DCA',
  style: 'longterm',
  subStyle: 'dca',
  description: 'Dollar cost average at fixed intervals regardless of price.',
  icon: '🗓️',
  riskLevel: 2,
  defaultConfig: {
    maxPositions: 8,
    positionSizePercent: 8,
    stopLossPercent: 15,
    takeProfitPercent: 40,
    timeframe: '1w',
    dcaIntervalDays: 7
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      signals.push(buildSignal(pair, 'buy', 55, 'DCA interval signal', this.defaultConfig, currentPrice));
    }
    return signals;
  },
  shouldEnter(_coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    return true;
  },
  shouldExit(trade: any, currentPrice: number, config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice <= entry * (1 - config.stopLossPercent / 100)) {
        return { exit: true, reason: 'Stop loss hit' };
      }
      if (currentPrice >= entry * (1 + config.takeProfitPercent / 100)) {
        return { exit: true, reason: 'Target reached' };
      }
    }
    return { exit: false, reason: '' };
  }
};

const dipBuyer: TradingStrategy = {
  name: 'Long-Term Dip Buyer',
  style: 'longterm',
  subStyle: 'dip-buyer',
  description: 'Buy only on significant dips from recent highs.',
  icon: '🌊',
  riskLevel: 4,
  defaultConfig: {
    maxPositions: 6,
    positionSizePercent: 12,
    stopLossPercent: 12,
    takeProfitPercent: 30,
    timeframe: '1d',
    dipThresholdPercent: 10,
    lookback: 30
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const prices = getPriceSeries(coin);
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const lookback = this.defaultConfig.lookback ?? 30;
      const high = recentHigh(prices, lookback);
      const threshold = this.defaultConfig.dipThresholdPercent ?? 10;
      if (high !== null && currentPrice <= high * (1 - threshold / 100)) {
        signals.push(buildSignal(pair, 'buy', 66, 'Significant dip from recent high', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'Waiting for dip threshold', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    const high = recentHigh(prices, config.lookback ?? 30);
    const threshold = config.dipThresholdPercent ?? 10;
    return high !== null && currentPrice <= high * (1 - threshold / 100);
  },
  shouldExit(trade: any, currentPrice: number, config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice <= entry * (1 - config.stopLossPercent / 100)) {
        return { exit: true, reason: 'Stop loss hit' };
      }
      if (currentPrice >= entry * (1 + config.takeProfitPercent / 100)) {
        return { exit: true, reason: 'Target reached' };
      }
    }
    return { exit: false, reason: '' };
  }
};

registerStrategy('longterm:dca', dca);
registerStrategy('longterm:dip-buyer', dipBuyer);

export { dca, dipBuyer };
