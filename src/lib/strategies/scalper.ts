import { registerStrategy, type TradingStrategy, type CoinSignal, type StrategyConfig } from './index';
import { getCurrentPrice, getPriceSeries, getVolumeSeries, isVolumeSpike, momentum as priceMomentum } from './utils';

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

function getVolumeStats(coin: any) {
  const volumes = getVolumeSeries(coin);
  if (volumes.length) {
    const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return { current: volumes[volumes.length - 1], average: avg };
  }
  const fallback = Number(coin?.volume24h ?? coin?.volume ?? 0);
  return { current: fallback, average: fallback / 24 || fallback };
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
      if (prices.length < 2) continue;
      const last = prices[prices.length - 2];
      if (!Number.isFinite(last) || last <= 0) continue;
      const drop = (last - currentPrice) / last;
      const levels = [0.01, 0.02, 0.03];
      for (const level of levels) {
        if (drop >= level) {
          signals.push(buildSignal(pair, 'buy', 58, `Grid buy at -${level * 100}%`, this.defaultConfig, currentPrice));
        }
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, _config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    if (prices.length < 2) return false;
    const last = prices[prices.length - 2];
    if (!Number.isFinite(last) || last <= 0) return false;
    const drop = (last - currentPrice) / last;
    return drop >= 0.01;
  },
  shouldExit(trade: any, currentPrice: number, _config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice >= entry * 1.005) {
        return { exit: true, reason: 'Grid profit hit (+0.5%)' };
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
      const { current, average } = getVolumeStats(coin);
      const volumeSpike = isVolumeSpike(current, average, 1.5);
      const move = priceMomentum(prices, 5);
      if (move >= 1 && volumeSpike) {
        signals.push(buildSignal(pair, 'buy', 62, '1%+ move in 5m with volume', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'No clear micro-trend', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    const { current, average } = getVolumeStats(coinData);
    return priceMomentum(prices, 5) >= 1 && isVolumeSpike(current, average, 1.5);
  },
  shouldExit(trade: any, currentPrice: number, _config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice <= entry * 0.99) {
        return { exit: true, reason: 'Stop loss hit (-1%)' };
      }
      if (currentPrice >= entry * 1.015) {
        return { exit: true, reason: 'Take profit reached (+1.5%)' };
      }
    }
    return { exit: false, reason: '' };
  }
};

registerStrategy('scalper:grid', grid);
registerStrategy('scalper:momentum', momentum);

export { grid, momentum };
