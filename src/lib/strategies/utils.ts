export function getPriceSeries(coin: any): number[] {
  if (Array.isArray(coin?.prices)) return coin.prices.filter((v: any) => Number.isFinite(Number(v))).map(Number);
  if (Array.isArray(coin?.price_history)) return coin.price_history.filter((v: any) => Number.isFinite(Number(v))).map(Number);
  if (Array.isArray(coin?.history)) return coin.history.filter((v: any) => Number.isFinite(Number(v))).map(Number);
  return [];
}

export function getVolumeSeries(coin: any): number[] {
  if (Array.isArray(coin?.volumes)) return coin.volumes.filter((v: any) => Number.isFinite(Number(v))).map(Number);
  if (Array.isArray(coin?.volume_history)) return coin.volume_history.filter((v: any) => Number.isFinite(Number(v))).map(Number);
  return [];
}

export function getCurrentPrice(coin: any): number | null {
  const direct = coin?.current_price ?? coin?.price ?? coin?.last_price;
  if (Number.isFinite(Number(direct))) return Number(direct);
  const series = getPriceSeries(coin);
  if (series.length > 0) return series[series.length - 1];
  return null;
}

export function sma(values: number[], period: number): number {
  if (!values.length) return 0;
  const size = Math.max(1, Math.min(period, values.length));
  const slice = values.slice(-size);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

export function recentHigh(values: number[], period: number): number | null {
  if (!values.length) return null;
  const slice = values.slice(-period);
  return slice.length ? Math.max(...slice) : null;
}

// RSI calculation (simplified)
export function rsi(prices: number[], period: number): number {
  if (!prices.length || prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  const start = prices.length - period - 1;
  for (let i = start + 1; i < prices.length; i += 1) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function volumeIncreasing(volumes: number[], period: number): boolean {
  if (volumes.length < period + 1) return false;
  const recent = volumes.slice(-period);
  const prior = volumes.slice(-(period + 1), -1);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / period;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / period;
  return recentAvg > priorAvg;
}

export function getRsi(coin: any): number | null {
  const value = coin?.rsi ?? coin?.rsi_value;
  if (Number.isFinite(Number(value))) return Number(value);
  const prices = getPriceSeries(coin);
  if (!prices.length) return null;
  return rsi(prices, 14);
}

// Volatility (standard deviation of returns)
export function volatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    if (!Number.isFinite(prev) || prev === 0) continue;
    returns.push((prices[i] - prev) / prev);
  }
  if (!returns.length) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

// Price momentum (% change over N periods)
export function momentum(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0;
  const start = prices[prices.length - period - 1];
  const end = prices[prices.length - 1];
  if (!Number.isFinite(start) || start === 0) return 0;
  return ((end - start) / start) * 100;
}

// Is price above/below SMA
export function priceVsSma(currentPrice: number, prices: number[], period: number): 'above' | 'below' | 'at' {
  const smaValue = sma(prices, period);
  if (!Number.isFinite(smaValue) || smaValue === 0) return 'at';
  const diff = currentPrice - smaValue;
  const epsilon = Math.max(0.0001, Math.abs(smaValue) * 0.0005);
  if (Math.abs(diff) <= epsilon) return 'at';
  return diff > 0 ? 'above' : 'below';
}

// Volume spike detection
export function isVolumeSpike(currentVolume: number, avgVolume: number, threshold: number): boolean {
  if (!Number.isFinite(currentVolume) || !Number.isFinite(avgVolume) || avgVolume <= 0) return false;
  return currentVolume >= avgVolume * threshold;
}
