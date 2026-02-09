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

export function sma(values: number[], period: number): number | null {
  if (!values.length || values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

export function recentHigh(values: number[], period: number): number | null {
  if (!values.length) return null;
  const slice = values.slice(-period);
  return slice.length ? Math.max(...slice) : null;
}

export function getRsi(coin: any): number | null {
  const value = coin?.rsi ?? coin?.rsi_value;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function volumeIncreasing(volumes: number[], period: number): boolean {
  if (volumes.length < period + 1) return false;
  const recent = volumes.slice(-period);
  const prior = volumes.slice(-(period + 1), -1);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / period;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / period;
  return recentAvg > priorAvg;
}
