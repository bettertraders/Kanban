/**
 * Trading Engine — Independent technical analysis using CCXT OHLCV data.
 * RSI, SMA crossover, volume, momentum. No TBO dependency.
 */

import { getOHLCV, getCurrentPrice } from './price-service';

export interface IndicatorData {
  rsi14: number;
  sma20: number;
  sma50: number;
  smaCrossover: 'bullish' | 'bearish' | 'neutral';
  volumeAboveAvg: boolean;
  volumeRatio: number;
  momentum10: number;
  momentum20: number;
  currentPrice: number;
  priceVsSma20: 'above' | 'below';
  priceVsSma50: 'above' | 'below';
}

export interface AnalysisResult {
  symbol: string;
  timeframe: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number; // 0-100
  indicators: IndicatorData;
  reasons: string[];
}

function calcSMA(values: number[], period: number): number {
  if (values.length < period) return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  const start = closes.length - period - 1;
  for (let i = start + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcMomentum(closes: number[], period: number): number {
  if (closes.length < period + 1) return 0;
  const start = closes[closes.length - period - 1];
  const end = closes[closes.length - 1];
  if (!start || start === 0) return 0;
  return ((end - start) / start) * 100;
}

export async function analyzeSignal(
  symbol: string,
  timeframe: string = '4h',
  tboSignal?: string | null
): Promise<AnalysisResult> {
  const normalized = symbol.replace(/-/g, '/').toUpperCase();
  const candles = await getOHLCV(normalized, timeframe, 100);
  const snapshot = await getCurrentPrice(normalized);

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const currentPrice = snapshot.price;

  // Indicators
  const rsi14 = calcRSI(closes, 14);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);

  // SMA crossover: recent sma20 vs sma50
  const prevCloses = closes.slice(0, -1);
  const prevSma20 = calcSMA(prevCloses, 20);
  const prevSma50 = calcSMA(prevCloses, 50);
  let smaCrossover: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (prevSma20 <= prevSma50 && sma20 > sma50) smaCrossover = 'bullish';
  else if (prevSma20 >= prevSma50 && sma20 < sma50) smaCrossover = 'bearish';
  else if (sma20 > sma50) smaCrossover = 'bullish';
  else if (sma20 < sma50) smaCrossover = 'bearish';

  // Volume
  const avgVolume = volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const recentVolume = volumes.length ? volumes[volumes.length - 1] : 0;
  const volumeAboveAvg = avgVolume > 0 && recentVolume > avgVolume;
  const volumeRatio = avgVolume > 0 ? recentVolume / avgVolume : 1;

  // Momentum
  const momentum10 = calcMomentum(closes, 10);
  const momentum20 = calcMomentum(closes, 20);

  const priceVsSma20: 'above' | 'below' = currentPrice >= sma20 ? 'above' : 'below';
  const priceVsSma50: 'above' | 'below' = currentPrice >= sma50 ? 'above' : 'below';

  const indicators: IndicatorData = {
    rsi14, sma20, sma50, smaCrossover,
    volumeAboveAvg, volumeRatio,
    momentum10, momentum20,
    currentPrice, priceVsSma20, priceVsSma50,
  };

  // Scoring
  let buyScore = 0;
  let sellScore = 0;
  const reasons: string[] = [];

  // RSI
  if (rsi14 < 30) { buyScore += 25; reasons.push(`RSI oversold (${rsi14.toFixed(1)})`); }
  else if (rsi14 < 40) { buyScore += 10; reasons.push(`RSI low (${rsi14.toFixed(1)})`); }
  else if (rsi14 > 70) { sellScore += 25; reasons.push(`RSI overbought (${rsi14.toFixed(1)})`); }
  else if (rsi14 > 60) { sellScore += 10; reasons.push(`RSI elevated (${rsi14.toFixed(1)})`); }

  // SMA crossover
  if (smaCrossover === 'bullish') { buyScore += 20; reasons.push('SMA 20/50 bullish crossover'); }
  else if (smaCrossover === 'bearish') { sellScore += 20; reasons.push('SMA 20/50 bearish crossover'); }

  // Price vs SMAs
  if (priceVsSma20 === 'above' && priceVsSma50 === 'above') { buyScore += 10; reasons.push('Price above both SMAs'); }
  else if (priceVsSma20 === 'below' && priceVsSma50 === 'below') { sellScore += 10; reasons.push('Price below both SMAs'); }

  // Volume confirmation
  if (volumeAboveAvg && volumeRatio > 1.5) {
    if (buyScore > sellScore) { buyScore += 15; reasons.push(`Volume spike (${volumeRatio.toFixed(1)}x avg)`); }
    else if (sellScore > buyScore) { sellScore += 15; reasons.push(`Volume spike confirms sell (${volumeRatio.toFixed(1)}x avg)`); }
  }

  // Momentum
  if (momentum10 > 5) { buyScore += 10; reasons.push(`Strong momentum +${momentum10.toFixed(1)}%`); }
  else if (momentum10 < -5) { sellScore += 10; reasons.push(`Negative momentum ${momentum10.toFixed(1)}%`); }

  // TBO boost (additive, not required)
  if (tboSignal) {
    if (tboSignal.toLowerCase() === 'buy') { buyScore += 15; reasons.push('TBO buy signal active'); }
    else if (tboSignal.toLowerCase() === 'sell') { sellScore += 15; reasons.push('TBO sell signal active'); }
  }

  // Determine action
  let action: 'buy' | 'sell' | 'hold' = 'hold';
  let confidence = 50;

  if (buyScore >= 30 && buyScore > sellScore) {
    action = 'buy';
    confidence = Math.min(95, 50 + buyScore);
  } else if (sellScore >= 30 && sellScore > buyScore) {
    action = 'sell';
    confidence = Math.min(95, 50 + sellScore);
  } else {
    confidence = Math.max(10, 50 - Math.abs(buyScore - sellScore));
  }

  return { symbol: normalized, timeframe, action, confidence, indicators, reasons };
}

export async function scanWatchlist(
  symbols: string[],
  timeframe: string = '4h'
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  for (const symbol of symbols) {
    try {
      const result = await analyzeSignal(symbol, timeframe);
      results.push(result);
    } catch (error) {
      console.warn(`Scan failed for ${symbol}:`, error);
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}
