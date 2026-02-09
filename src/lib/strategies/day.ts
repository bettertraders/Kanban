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
      const change24h = Number(coin?.change24h ?? 0);
      const prices = getPriceSeries(coin);
      const { current, average } = getVolumeStats(coin);
      const volumeSpike = isVolumeSpike(current, average, 1.5);
      const intradayMove = change24h >= 5 || priceMomentum(prices, 5) >= 5;
      if (intradayMove && volumeSpike) {
        signals.push(buildSignal(pair, 'buy', 68, '5%+ move with volume', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 45, 'Waiting for intraday momentum', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, _config: StrategyConfig): boolean {
    const change24h = Number(coinData?.change24h ?? 0);
    const prices = getPriceSeries(coinData);
    const { current, average } = getVolumeStats(coinData);
    const volumeSpike = isVolumeSpike(current, average, 1.5);
    const intradayMove = change24h >= 5 || priceMomentum(prices, 5) >= 5;
    return intradayMove && volumeSpike;
  },
  shouldExit(trade: any, currentPrice: number, _config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice <= entry * 0.98) {
        return { exit: true, reason: 'Stop loss hit (-2%)' };
      }
      if (currentPrice >= entry * 1.03) {
        return { exit: true, reason: 'Take profit reached (+3%)' };
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
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const low24h = Number(coin?.low24h ?? coin?.low_24h ?? currentPrice);
      const high24h = Number(coin?.high24h ?? coin?.high_24h ?? currentPrice);
      if (currentPrice <= low24h * 1.02) {
        signals.push(buildSignal(pair, 'buy', 60, 'Near 24h low (within 2%)', this.defaultConfig, currentPrice));
      } else if (currentPrice >= high24h * 0.98) {
        signals.push(buildSignal(pair, 'sell', 60, 'Near 24h high (within 2%)', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'Mid-range consolidation', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, _config: StrategyConfig): boolean {
    const low24h = Number(coinData?.low24h ?? coinData?.low_24h ?? currentPrice);
    return currentPrice <= low24h * 1.02;
  },
  shouldExit(trade: any, currentPrice: number, _config: StrategyConfig) {
    const high24h = Number(trade?.high24h ?? trade?.high_24h ?? currentPrice);
    if (currentPrice >= high24h * 0.98) {
      return { exit: true, reason: 'Near 24h high (within 2%)' };
    }
    return { exit: false, reason: '' };
  }
};

registerStrategy('day:momentum', momentum);
registerStrategy('day:range', range);

export { momentum, range };
