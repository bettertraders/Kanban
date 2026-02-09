import { registerStrategy, type TradingStrategy, type CoinSignal, type StrategyConfig } from './index';
import { getCurrentPrice, getPriceSeries, getVolumeSeries, sma, recentHigh, getRsi, volumeIncreasing } from './utils';

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
  name: 'Swing Momentum',
  style: 'swing',
  subStyle: 'momentum',
  description: 'Buy when price is above the 20-period SMA with rising volume.',
  icon: '🚀',
  riskLevel: 5,
  defaultConfig: {
    maxPositions: 3,
    positionSizePercent: 20,
    stopLossPercent: 5,
    takeProfitPercent: 15,
    timeframe: '1d',
    smaPeriod: 20
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const prices = getPriceSeries(coin);
      const volumes = getVolumeSeries(coin);
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;

      const smaValue = sma(prices, this.defaultConfig.smaPeriod);
      const volumeUp = volumeIncreasing(volumes, 3);
      if (smaValue !== null && currentPrice > smaValue && volumeUp) {
        signals.push(buildSignal(pair, 'buy', 72, 'Price above SMA with rising volume', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 45, 'Waiting for momentum confirmation', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    const volumes = getVolumeSeries(coinData);
    const smaValue = sma(prices, config.smaPeriod ?? 20);
    return smaValue !== null && currentPrice > smaValue && volumeIncreasing(volumes, 3);
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
    const smaValue = sma(getPriceSeries(trade), config.smaPeriod ?? 20);
    if (smaValue !== null && currentPrice < smaValue) {
      return { exit: true, reason: 'Price dropped below SMA' };
    }
    return { exit: false, reason: '' };
  }
};

const meanReversion: TradingStrategy = {
  name: 'Swing Mean Reversion',
  style: 'swing',
  subStyle: 'mean-reversion',
  description: 'Buy oversold coins when RSI is below 30 and sell when RSI recovers.',
  icon: '🌀',
  riskLevel: 4,
  defaultConfig: {
    maxPositions: 3,
    positionSizePercent: 20,
    stopLossPercent: 8,
    takeProfitPercent: 12,
    timeframe: '1d'
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const rsi = getRsi(coin);
      if (rsi !== null && rsi < 30) {
        signals.push(buildSignal(pair, 'buy', 70, 'RSI oversold (<30)', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'Waiting for RSI oversold signal', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    const rsi = getRsi(coinData);
    return rsi !== null && rsi < 30;
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
      return { exit: true, reason: 'RSI overbought (>70)' };
    }
    return { exit: false, reason: '' };
  }
};

const breakout: TradingStrategy = {
  name: 'Swing Breakout',
  style: 'swing',
  subStyle: 'breakout',
  description: 'Buy when price breaks above recent highs with a volume surge.',
  icon: '📈',
  riskLevel: 6,
  defaultConfig: {
    maxPositions: 3,
    positionSizePercent: 20,
    stopLossPercent: 4,
    takeProfitPercent: 20,
    timeframe: '1d',
    breakoutLookback: 20
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const prices = getPriceSeries(coin);
      const volumes = getVolumeSeries(coin);
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const lookback = this.defaultConfig.breakoutLookback ?? 20;
      const priorHigh = recentHigh(prices.slice(0, -1), lookback);
      const volumeUp = volumeIncreasing(volumes, 3);
      if (priorHigh !== null && currentPrice > priorHigh && volumeUp) {
        signals.push(buildSignal(pair, 'buy', 75, 'Breakout above recent high with volume surge', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 42, 'Waiting for breakout confirmation', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    const volumes = getVolumeSeries(coinData);
    const lookback = config.breakoutLookback ?? 20;
    const priorHigh = recentHigh(prices.slice(0, -1), lookback);
    return priorHigh !== null && currentPrice > priorHigh && volumeIncreasing(volumes, 3);
  },
  shouldExit(trade: any, currentPrice: number, config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice <= entry * (1 - config.stopLossPercent / 100)) {
        return { exit: true, reason: 'Trailing stop hit' };
      }
      if (currentPrice >= entry * (1 + config.takeProfitPercent / 100)) {
        return { exit: true, reason: 'Take profit reached' };
      }
    }
    return { exit: false, reason: '' };
  }
};

registerStrategy('swing:momentum', momentum);
registerStrategy('swing:mean-reversion', meanReversion);
registerStrategy('swing:breakout', breakout);

export { momentum, meanReversion, breakout };
