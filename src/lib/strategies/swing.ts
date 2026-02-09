import { registerStrategy, type TradingStrategy, type CoinSignal, type StrategyConfig } from './index';
import { getCurrentPrice, getPriceSeries, getVolumeSeries, isVolumeSpike, rsi, sma } from './utils';

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
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const prices = getPriceSeries(coin);
      const smaValue = sma(prices, this.defaultConfig.smaPeriod);
      const { current, average } = getVolumeStats(coin);
      const volumeSpike = isVolumeSpike(current, average, 1.5);
      if (currentPrice > smaValue && volumeSpike) {
        signals.push(buildSignal(pair, 'buy', 72, 'Price above SMA with volume spike', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 45, 'Waiting for SMA breakout + volume spike', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, config: StrategyConfig): boolean {
    const prices = getPriceSeries(coinData);
    const smaValue = sma(prices, config.smaPeriod ?? 20);
    const { current, average } = getVolumeStats(coinData);
    return currentPrice > smaValue && isVolumeSpike(current, average, 1.5);
  },
  shouldExit(trade: any, currentPrice: number, config: StrategyConfig) {
    const smaValue = sma(getPriceSeries(trade), config.smaPeriod ?? 20);
    if (currentPrice < smaValue) {
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
      const rsiValue = rsi(getPriceSeries(coin), 14);
      if (rsiValue < 30) {
        signals.push(buildSignal(pair, 'buy', 70, 'RSI oversold (<30)', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'Waiting for RSI oversold signal', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    const rsiValue = rsi(getPriceSeries(coinData), 14);
    return rsiValue < 30;
  },
  shouldExit(trade: any, _currentPrice: number, _config: StrategyConfig) {
    const rsiValue = rsi(getPriceSeries(trade), 14);
    if (rsiValue > 70) {
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
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const high24h = Number(coin?.high24h ?? coin?.high_24h ?? currentPrice);
      const { current, average } = getVolumeStats(coin);
      const volumeSpike = isVolumeSpike(current, average, 1.5);
      if (currentPrice > high24h * 0.98 && volumeSpike) {
        signals.push(buildSignal(pair, 'buy', 75, 'Breakout near 24h high with volume spike', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 42, 'Waiting for breakout confirmation', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, currentPrice: number, _config: StrategyConfig): boolean {
    const high24h = Number(coinData?.high24h ?? coinData?.high_24h ?? currentPrice);
    const { current, average } = getVolumeStats(coinData);
    return currentPrice > high24h * 0.98 && isVolumeSpike(current, average, 1.5);
  },
  shouldExit(trade: any, currentPrice: number, _config: StrategyConfig) {
    const entry = Number(trade?.entry_price ?? currentPrice);
    const series = getPriceSeries(trade);
    const peak = Math.max(entry, currentPrice, series.length ? Math.max(...series) : entry);
    if (currentPrice <= peak * 0.96) {
      return { exit: true, reason: 'Trailing stop hit (4% drop from peak)' };
    }
    return { exit: false, reason: '' };
  }
};

registerStrategy('swing:momentum', momentum);
registerStrategy('swing:mean-reversion', meanReversion);
registerStrategy('swing:breakout', breakout);

export { momentum, meanReversion, breakout };
