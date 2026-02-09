import { registerStrategy, type TradingStrategy, type CoinSignal, type StrategyConfig } from './index';
import { getCurrentPrice, getPriceSeries } from './utils';

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

const grid: TradingStrategy = {
  name: 'Scalper Grid',
  style: 'scalper',
  subStyle: 'grid',
  description: 'Place virtual buy/sell levels and profit from oscillation.',
  icon: '🧱',
  riskLevel: 3,
  defaultConfig: {
    maxPositions: 12,
    positionSizePercent: 5,
    stopLossPercent: 0.8,
    takeProfitPercent: 1,
    timeframe: '5m',
    gridSpacingPercent: 0.7
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const prices = getPriceSeries(coin);
      if (prices.length < 3) continue;
      const last = prices[prices.length - 2];
      const change = (currentPrice - last) / last;
      if (Math.abs(change) >= (this.defaultConfig.gridSpacingPercent ?? 0.7) / 100) {
        const action: CoinSignal['action'] = change < 0 ? 'buy' : 'sell';
        const reason = change < 0 ? 'Price dipped to next grid level' : 'Price reached upper grid level';
        signals.push(buildSignal(pair, action, 55, reason, this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'hold', 40, 'Price within grid band', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    if (prices.length < 2) return false;
    const last = prices[prices.length - 2];
    const change = Math.abs((currentPrice - last) / last);
    return change >= (config.gridSpacingPercent ?? 0.7) / 100;
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

const momentum: TradingStrategy = {
  name: 'Scalper Momentum',
  style: 'scalper',
  subStyle: 'momentum',
  description: 'Ultra-quick entries on micro-trends with tight risk controls.',
  icon: '🏎️',
  riskLevel: 7,
  defaultConfig: {
    maxPositions: 10,
    positionSizePercent: 6,
    stopLossPercent: 1,
    takeProfitPercent: 1.5,
    timeframe: '1m'
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const prices = getPriceSeries(coin);
      if (prices.length < 3) continue;
      const fast = prices[prices.length - 1];
      const slow = prices[prices.length - 3];
      const change = (fast - slow) / slow;
      if (change > 0.002) {
        signals.push(buildSignal(pair, 'buy', 62, 'Micro-trend accelerating upward', this.defaultConfig, currentPrice));
      } else if (change < -0.002) {
        signals.push(buildSignal(pair, 'sell', 60, 'Micro-trend reversing', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'No clear micro-trend', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    if (prices.length < 3) return false;
    const fast = prices[prices.length - 1];
    const slow = prices[prices.length - 3];
    return (fast - slow) / slow > 0.002;
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

registerStrategy('scalper:grid', grid);
registerStrategy('scalper:momentum', momentum);

export { grid, momentum };
