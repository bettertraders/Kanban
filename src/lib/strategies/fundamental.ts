import { registerStrategy, type TradingStrategy, type CoinSignal, type StrategyConfig } from './index';
import { getCurrentPrice, getPriceSeries, momentum } from './utils';

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

const NARRATIVE_COINS = new Set([
  'FET/USDT',
  'RENDER/USDT',
  'INJ/USDT',
  'TAO/USDT',
  'AKT/USDT',
  'RNDR/USDT'
]);

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
      const volume = Number(coin?.volume24h ?? coin?.volume ?? 0);
      const change24h = Number(coin?.change24h ?? 0);
      const avgVolume = Number(coin?.avg_volume_global ?? 0);
      const highVolume = avgVolume > 0 ? volume >= avgVolume : volume >= 50_000_000;
      if (highVolume && change24h < 0) {
        signals.push(buildSignal(pair, 'buy', 65, 'High volume with negative 24h change', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 38, 'Waiting for high-volume dip', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    const volume = Number(coinData?.volume24h ?? coinData?.volume ?? 0);
    const change24h = Number(coinData?.change24h ?? 0);
    const avgVolume = Number(coinData?.avg_volume_global ?? 0);
    const highVolume = avgVolume > 0 ? volume >= avgVolume : volume >= 50_000_000;
    return highVolume && change24h < 0;
  },
  shouldExit(trade: any, currentPrice: number, _config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice >= entry * 1.1) {
        return { exit: true, reason: 'Recovered 10%+' };
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
      const normalized = pair.toUpperCase();
      const prices = getPriceSeries(coin);
      const trending = NARRATIVE_COINS.has(normalized) && (Number(coin?.change24h ?? 0) > 2 || momentum(prices, 10) > 2);
      if (trending) {
        signals.push(buildSignal(pair, 'buy', 68, 'Narrative momentum detected', this.defaultConfig, currentPrice));
      } else {
        signals.push(buildSignal(pair, 'watch', 40, 'Narrative momentum not detected', this.defaultConfig, currentPrice));
      }
    }
    return signals;
  },
  shouldEnter(coinData: any, _currentPrice: number, _config: StrategyConfig): boolean {
    const pair = String(coinData?.coin_pair ?? coinData?.pair ?? '').toUpperCase();
    const prices = getPriceSeries(coinData);
    return NARRATIVE_COINS.has(pair) && (Number(coinData?.change24h ?? 0) > 2 || momentum(prices, 10) > 2);
  },
  shouldExit(trade: any, currentPrice: number, _config: StrategyConfig) {
    const entry = Number(trade?.entry_price);
    if (Number.isFinite(entry)) {
      if (currentPrice >= entry * 1.15) {
        return { exit: true, reason: 'Narrative momentum target hit' };
      }
    }
    return { exit: false, reason: '' };
  }
};

registerStrategy('fundamental:value', value);
registerStrategy('fundamental:narrative', narrative);

export { value, narrative };
