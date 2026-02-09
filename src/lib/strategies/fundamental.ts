import { registerStrategy, type TradingStrategy, type CoinSignal, type StrategyConfig } from './index';
import { getCurrentPrice } from './utils';

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

const value: TradingStrategy = {
  name: 'Fundamental Value',
  style: 'fundamental',
  subStyle: 'value',
  description: 'Target large-cap, stable-volume assets for long holds.',
  icon: '🏛️',
  riskLevel: 3,
  defaultConfig: {
    maxPositions: 5,
    positionSizePercent: 15,
    stopLossPercent: 10,
    takeProfitPercent: 25,
    timeframe: '1w'
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const rank = Number(coin?.market_cap_rank);
      const volumeStability = Number(coin?.volume_stability ?? coin?.volume_score ?? 0);
      const volumeChange = Number(coin?.volume_change ?? 0);
      const stableVolume = Number.isFinite(volumeStability)
        ? volumeStability >= 0.7
        : Math.abs(volumeChange) <= 0.1;
      if (Number.isFinite(rank) && rank > 0 && rank <= 25 && stableVolume) {
        signals.push(buildSignal(pair, 'buy', 65, 'Large-cap with stable volume', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 38, 'Waiting for fundamental confirmation', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    const rank = Number(coinData?.market_cap_rank);
    const volumeStability = Number(coinData?.volume_stability ?? coinData?.volume_score ?? 0);
    const volumeChange = Number(coinData?.volume_change ?? 0);
    const stableVolume = Number.isFinite(volumeStability)
      ? volumeStability >= 0.7
      : Math.abs(volumeChange) <= 0.1;
    return Number.isFinite(rank) && rank > 0 && rank <= 25 && stableVolume;
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

const narrative: TradingStrategy = {
  name: 'Fundamental Narrative',
  style: 'fundamental',
  subStyle: 'narrative',
  description: 'Focus on coins aligned with trending categories or narratives.',
  icon: '🧭',
  riskLevel: 6,
  defaultConfig: {
    maxPositions: 6,
    positionSizePercent: 12,
    stopLossPercent: 12,
    takeProfitPercent: 30,
    timeframe: '1d'
  },
  async generateSignals(coins: any[]): Promise<CoinSignal[]> {
    const signals: CoinSignal[] = [];
    for (const coin of coins) {
      const pair = getPair(coin);
      if (!pair) continue;
      const currentPrice = getCurrentPrice(coin);
      if (currentPrice === null) continue;
      const trending = Boolean(coin?.trending) || Number(coin?.narrative_score ?? 0) >= 70;
      if (trending) {
        signals.push(buildSignal(pair, 'buy', 68, 'Narrative trend detected', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'Narrative momentum not detected', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    return Boolean(coinData?.trending) || Number(coinData?.narrative_score ?? 0) >= 70;
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

registerStrategy('fundamental:value', value);
registerStrategy('fundamental:narrative', narrative);

export { value, narrative };
