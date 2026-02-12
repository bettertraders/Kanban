#!/usr/bin/env node
/**
 * Paper Trading Engine
 * Runs every 30 minutes. Scans watchlist, calculates indicators,
 * moves cards, enters/exits trades, updates bots + journal + leaderboard.
 *
 * Fully API-driven — no direct DB access needed.
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = 'https://clawdesk.ai';
const BOARD_ID = 15; // Paper Trading board (Michael's)
const BOT_NAME = 'Penny Paper Trader';
const ENGINE_VERSION = '3.4';
const isPennyReview = process.argv.includes('--penny-review');
const CORE_COINS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']; // Always re-queue after close

// Human-readable strategy descriptions for UI
const STRATEGY_DESCRIPTIONS = {
  oversold_bounce: (sym, ind) => `${sym} oversold bounce — RSI ${ind?.rsi?.toFixed(1) || '?'} near SMA20 support${ind?.volume_ratio > 1.2 ? `, volume ${ind.volume_ratio.toFixed(1)}x average` : ''}. Expecting mean reversion bounce.`,
  golden_cross: (sym) => `${sym} golden cross — SMA20 crossed above SMA50, signaling bullish trend shift. Momentum building.`,
  deeply_oversold: (sym, ind) => `${sym} deeply oversold — RSI ${ind?.rsi?.toFixed(1) || '?'} below 20. Extreme fear = opportunity. Positioning for sharp relief rally.`,
  momentum_catch: (sym, ind) => `${sym} momentum breakout — strong volume surge ${ind?.volume_ratio ? ind.volume_ratio.toFixed(1) + 'x' : ''} with price acceleration. Riding the wave.`,
  overbought_reject: (sym, ind) => `${sym} overbought rejection — RSI ${ind?.rsi?.toFixed(1) || '?'} above Bollinger upper band. Overextended, shorting for mean reversion.`,
  death_cross: (sym) => `${sym} death cross — SMA20 crossed below SMA50, bearish trend confirmed. Shorting the breakdown.`,
  bearish_breakdown: (sym) => `${sym} bearish breakdown — price broke below key support with volume. Riding the drop.`,
  buy_hold_core: (sym) => `${sym} core position — long-term accumulation at attractive price levels.`,
  bollinger_bounce: (sym) => `${sym} Bollinger bounce — price touched lower band and reversing. Statistical mean reversion play.`,
  range_breakout: (sym) => `${sym} range breakout — price breaking out of consolidation range with volume confirmation.`,
  vwap_reversion: (sym) => `${sym} VWAP reversion — price deviated significantly from VWAP, expecting snap back.`,
  trend_surfer: (sym, ind) => `${sym} trend surf — ADX ${ind?.adx?.toFixed(1) || '?'} confirms strong trend. Riding with the flow.`,
  correlation_hedge: (sym) => `${sym} correlation hedge — portfolio protection during adverse market conditions.`,
  qfl_bounce: (sym) => `${sym} QFL bounce — price hit a base level (quick fingers Luc strategy). Historical support held.`,
  trend_reversal_flip: (sym) => `${sym} trend reversal flip — indicators show momentum shifting. Flipping direction to catch the reversal.`,
};
const STRATEGY_STYLE = 'swing';
const STRATEGY_SUBSTYLE = 'momentum';
const MAX_POSITIONS = 5;
const POSITION_SIZE_PCT = 20; // 20% of balance per trade
const STOP_LOSS_PCT = 5;
const TAKE_PROFIT_PCT = 10;
let PINNED_COINS = [
  // Core holdings
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT',
  // Large caps
  'XRP/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT', 'ATOM/USDT', 'MATIC/USDT',
  // Mid caps with volume
  'NEAR/USDT', 'FTM/USDT', 'INJ/USDT', 'SUI/USDT', 'APT/USDT',
  // Momentum plays
  'RENDER/USDT', 'FET/USDT', 'ARB/USDT', 'OP/USDT', 'TIA/USDT',
  // Popular movers — catch pumps
  'UNI/USDT', 'DOGE/USDT', 'SHIB/USDT', 'LTC/USDT',
  // Hedges — inverse correlation to crypto
  'PAXG/USDT',   // Tokenized gold — pumps when crypto dumps
];

// Load API key
function loadApiKey() {
  const envPath = path.join(process.env.HOME || '', '.env.openclaw');
  if (!fs.existsSync(envPath)) throw new Error('~/.env.openclaw not found');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^KANBAN_API_KEY=(.+)$/m);
  if (!match) throw new Error('KANBAN_API_KEY not found in ~/.env.openclaw');
  return match[1].trim();
}

const API_KEY = loadApiKey();

// ─── API Circuit Breaker ─────────────────────────────────────────────────────

const circuitBreaker = {
  failures: [],
  isOpen: false,
  openedAt: null,
  THRESHOLD: 3,
  WINDOW_MS: 60000,
  COOLDOWN_MS: 5 * 60 * 1000,
  record(err) {
    this.failures.push(Date.now());
    this.failures = this.failures.filter(t => Date.now() - t < this.WINDOW_MS);
    if (this.failures.length >= this.THRESHOLD) {
      this.isOpen = true;
      this.openedAt = Date.now();
      log('🔴 CIRCUIT BREAKER OPEN — pausing new operations for 5 minutes');
    }
  },
  check() {
    if (!this.isOpen) return true;
    if (Date.now() - this.openedAt > this.COOLDOWN_MS) {
      this.isOpen = false;
      this.failures = [];
      log('🟢 Circuit breaker reset — resuming operations');
      return true;
    }
    return false;
  }
};

// ─── Data Staleness Detection ────────────────────────────────────────────────

function isDataFresh(owenData, maxAgeMs = 5 * 60 * 1000) {
  if (!owenData?.timestamp) return false;
  return (Date.now() - owenData.timestamp) < maxAgeMs;
}

function checkDataFreshness() {
  const scannerPath = path.join(__dirname, '.owen-scanner-results.json');
  const crashPath = path.join(__dirname, '.crash-alert.json');
  const macroPath = path.join(__dirname, '.owen-macro-pulse.json');
  const sentinelPath = path.join(__dirname, '.position-sentinel-alert.json');

  function getFreshness(filePath, maxAgeMs = 5 * 60 * 1000) {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const age = data.timestamp ? Date.now() - data.timestamp : Infinity;
        return { fresh: age < maxAgeMs, ageMinutes: Math.round(age / 60000 * 10) / 10 };
      }
    } catch {}
    return { fresh: false, ageMinutes: null };
  }

  return {
    scanner: getFreshness(scannerPath, 60 * 60 * 1000),       // 60 min for scanner
    crashAlert: getFreshness(crashPath, 5 * 60 * 1000),       // 5 min for crash
    macroPulse: getFreshness(macroPath, 30 * 60 * 1000),      // 30 min for macro
    positionSentinel: getFreshness(sentinelPath, 5 * 60 * 1000), // 5 min for sentinel
  };
}

// ─── Regime Transition Detection ─────────────────────────────────────────────

function detectRegimeTransition(indicators) {
  const state = loadState();
  const btcInd = indicators['BTC/USDT'];
  if (!btcInd?.adx?.adx) return null;

  const currentADX = btcInd.adx.adx;
  const lastADX = state.lastADX;
  let result = null;

  if (lastADX != null) {
    if (lastADX < 20 && currentADX > 25) {
      log('📊 REGIME SHIFT: Range → Trend');
      result = { transition: true, from: 'range', to: 'trend' };
    } else if (lastADX > 30 && currentADX < 20) {
      log('📊 REGIME SHIFT: Trend → Range');
      result = { transition: true, from: 'trend', to: 'range' };
    }
  }

  state.lastADX = currentADX;
  saveState(state);
  return result;
}

function loadOwenWatchlist() {
  const resultsPath = path.join(__dirname, '.owen-scanner-results.json');
  try {
    if (fs.existsSync(resultsPath)) {
      const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      if (data.timestamp && Date.now() - data.timestamp < 12 * 60 * 60 * 1000) {
        log(`🦉 Owen watchlist loaded: ${data.watchlist.length} coins (scanned ${data.totalScanned} pairs)`);
        return data.watchlist.map(c => c.symbol);
      } else {
        log(`🦉 Owen watchlist stale (>12h old), using default`);
      }
    }
  } catch (e) { log(`🦉 Owen watchlist not found, using default`); }
  return null;
}

const owenCoins = loadOwenWatchlist();
if (owenCoins) PINNED_COINS = owenCoins;

// ─── API helpers ─────────────────────────────────────────────────────────────

async function api(method, endpoint, body) {
  const url = `${API_BASE}${endpoint}`;
  const opts = {
    method,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`API ${method} ${endpoint} → ${res.status}: ${text.slice(0, 200)}`);
      circuitBreaker.record(err);
      throw err;
    }
    return res.json();
  } catch (err) {
    if (!err.message?.startsWith('API ')) circuitBreaker.record(err);
    throw err;
  }
}

const apiGet = (ep) => api('GET', ep);
const apiPost = (ep, body) => api('POST', ep, body);
const apiPatch = (ep, body) => api('PATCH', ep, body);

// ─── Technical Indicators ────────────────────────────────────────────────────

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcVolumeRatio(volumes) {
  if (volumes.length < 2) return 1;
  const recent = volumes[volumes.length - 1];
  const avg = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
  return avg > 0 ? recent / avg : 1;
}

function calcMomentum(closes, period = 10) {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  return past > 0 ? ((current - past) / past) * 100 : 0;
}

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcMACD(closes) {
  if (closes.length < 35) return { macd: null, signal: null, histogram: null };
  // MACD line = EMA12 - EMA26
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12 === null || ema26 === null) return { macd: null, signal: null, histogram: null };
  const macdLine = ema12 - ema26;
  
  // Build MACD series for signal line
  const macdSeries = [];
  const k12 = 2 / 13, k26 = 2 / 27;
  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  for (let i = 12; i < closes.length; i++) {
    e12 = closes[i] * k12 + e12 * (1 - k12);
    if (i >= 26) {
      e26 = closes[i] * k26 + e26 * (1 - k26);
      macdSeries.push(e12 - e26);
    }
  }
  
  // Signal = EMA9 of MACD series
  const signal = macdSeries.length >= 9 ? calcEMA(macdSeries, 9) : null;
  const histogram = signal !== null ? macdLine - signal : null;
  
  return { macd: macdLine, signal, histogram };
}

function calcATR(ohlcv, period = 14) {
  if (ohlcv.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const high = ohlcv[i][2], low = ohlcv[i][3], prevClose = ohlcv[i - 1][4];
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

function calcBollingerBands(closes, period = 20, stdDevMultiplier = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: sma + stdDevMultiplier * stdDev,
    middle: sma,
    lower: sma - stdDevMultiplier * stdDev,
    bandwidth: (stdDevMultiplier * 2 * stdDev) / sma * 100,
    percentB: (closes[closes.length - 1] - (sma - stdDevMultiplier * stdDev)) / (stdDevMultiplier * 2 * stdDev),
  };
}

function calcADX(ohlcv, period = 14) {
  if (ohlcv.length < period * 2 + 1) return null;

  // Calculate True Range, +DM, -DM for each bar
  const trs = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const high = ohlcv[i][2], low = ohlcv[i][3], prevClose = ohlcv[i - 1][4];
    const prevHigh = ohlcv[i - 1][2], prevLow = ohlcv[i - 1][3];
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  if (trs.length < period * 2) return null;

  // Initial smoothed values (first `period` bars summed)
  let smoothedTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  // Wilder smoothing for subsequent bars
  const dxValues = [];
  for (let i = period; i < trs.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trs[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i];

    const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push({ dx, plusDI, minusDI });
  }

  if (dxValues.length < period) return null;

  // ADX = smoothed average of DX values
  let adx = dxValues.slice(0, period).reduce((sum, d) => sum + d.dx, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i].dx) / period;
  }

  const last = dxValues[dxValues.length - 1];
  return { adx, plusDI: last.plusDI, minusDI: last.minusDI };
}

function calcVWAP(ohlcv) {
  // Use last 24 candles (approx 4 days at 4h timeframe)
  const slice = ohlcv.slice(-24);
  if (slice.length < 2) return null;
  let cumTPV = 0, cumVol = 0;
  for (const candle of slice) {
    const tp = (candle[2] + candle[3] + candle[4]) / 3; // (H+L+C)/3
    const vol = candle[5];
    cumTPV += tp * vol;
    cumVol += vol;
  }
  return cumVol > 0 ? cumTPV / cumVol : null;
}

// ─── Funding Rate (On-Chain Data) ────────────────────────────────────────────

async function fetchFundingRate(exchange, symbol) {
  try {
    const pair = symbol.replace('/', '');
    const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${pair}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return parseFloat(data[0].fundingRate);
    }
  } catch {}
  return null;
}

// ─── Multi-Timeframe Confluence Scoring ──────────────────────────────────────

function calcMultiTimeframeScore(ind) {
  let bullSignals = 0;
  let bearSignals = 0;

  if (ind.rsi < 40) bullSignals++;
  if (ind.rsi > 60) bearSignals++;
  if (ind.sma20 && ind.sma50 && ind.sma20 > ind.sma50) bullSignals++;
  if (ind.sma20 && ind.sma50 && ind.sma20 < ind.sma50) bearSignals++;
  if (ind.macdHistogram > 0) bullSignals++;
  if (ind.macdHistogram < 0) bearSignals++;
  if (ind.momentum > 0) bullSignals++;
  if (ind.momentum < 0) bearSignals++;
  if (ind.adx && ind.adx.adx > 25) {
    if (ind.adx.plusDI > ind.adx.minusDI) bullSignals++;
    else bearSignals++;
  }
  if (ind.bollingerBands) {
    if (ind.bollingerBands.percentB < 0.2) bullSignals++;
    if (ind.bollingerBands.percentB > 0.8) bearSignals++;
  }

  const total = bullSignals + bearSignals;
  if (total === 0) return { score: 50, direction: 'neutral', confluence: 0 };

  const bullPct = bullSignals / total * 100;
  const direction = bullSignals > bearSignals ? 'bullish' : bearSignals > bullSignals ? 'bearish' : 'neutral';
  const confluence = Math.abs(bullSignals - bearSignals);

  return { score: Math.round(bullPct), direction, confluence, bullSignals, bearSignals };
}

// ─── Execution Quality Monitoring ────────────────────────────────────────────

function calcExecutionQuality(trade, currentPrice) {
  const meta = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
  if (!meta.execution?.signalPrice) return null;

  const slippage = ((parseFloat(trade.entry_price) - meta.execution.signalPrice) / meta.execution.signalPrice) * 100;
  const direction = (trade.direction || 'LONG').toUpperCase();
  const effectiveSlippage = direction === 'SHORT' ? -slippage : slippage;

  return {
    signalPrice: meta.execution.signalPrice,
    entryPrice: parseFloat(trade.entry_price),
    slippagePct: Math.round(effectiveSlippage * 100) / 100,
    quality: effectiveSlippage < 0.1 ? 'excellent' : effectiveSlippage < 0.5 ? 'good' : effectiveSlippage < 1 ? 'fair' : 'poor'
  };
}

// ─── Adaptive Cycle Frequency ────────────────────────────────────────────────

function suggestCycleFrequency(indicators) {
  const btc = indicators['BTC/USDT'];
  if (!btc) return { suggestedMinutes: 120, reason: 'Default — no BTC data' };

  const atrPct = btc.atr ? (btc.atr / btc.currentPrice) * 100 : 2;
  const volatility = Math.abs(btc.momentum4h || 0);

  if (volatility > 5 || atrPct > 5) {
    return { suggestedMinutes: 30, reason: `High volatility (ATR ${atrPct.toFixed(1)}%, 4h move ${volatility.toFixed(1)}%) — review more frequently` };
  }
  if (volatility > 3 || atrPct > 3.5) {
    return { suggestedMinutes: 60, reason: `Elevated volatility — hourly reviews recommended` };
  }
  if (volatility < 1 && atrPct < 2) {
    return { suggestedMinutes: 240, reason: `Low volatility (ATR ${atrPct.toFixed(1)}%) — less frequent reviews save cost` };
  }
  return { suggestedMinutes: 120, reason: `Normal volatility — standard 2h cycle` };
}

// ─── Portfolio Exposure ──────────────────────────────────────────────────────

function calcPortfolioExposure(activeTrades) {
  const exposure = { long: 0, short: 0, groups: {} };

  for (const t of activeTrades) {
    const dir = (t.direction || 'LONG').toUpperCase();
    const size = parseFloat(t.position_size || 0);
    const group = getCorrelationGroup(normalizePair(t.coin_pair));

    if (dir === 'LONG') exposure.long += size;
    else exposure.short += size;

    if (!exposure.groups[group]) exposure.groups[group] = { long: 0, short: 0, coins: [] };
    exposure.groups[group][dir.toLowerCase()] += size;
    exposure.groups[group].coins.push(normalizePair(t.coin_pair));
  }

  exposure.netExposure = exposure.long - exposure.short;
  exposure.grossExposure = exposure.long + exposure.short;
  exposure.longPct = exposure.grossExposure > 0 ? (exposure.long / exposure.grossExposure * 100) : 0;
  exposure.isBalanced = Math.abs(exposure.longPct - 50) < 20;

  return exposure;
}

// ─── News-Aware Risk Adjustment ──────────────────────────────────────────────

function calcNewsRiskAdjustment(macroPulse) {
  if (!macroPulse?.newsFlags?.length) return { adjustment: 'none', reason: 'No significant news' };

  const highRiskKeywords = ['hack', 'SEC', 'ban', 'crash', 'sanctions', 'lawsuit'];
  const medRiskKeywords = ['regulation', 'Fed', 'rate', 'inflation', 'recession'];
  const positiveKeywords = ['ETF', 'rally', 'adoption'];

  let riskLevel = 'none';
  let reasons = [];

  for (const flag of macroPulse.newsFlags) {
    const kw = flag.keyword?.toLowerCase() || '';
    if (highRiskKeywords.some(k => kw.includes(k))) {
      riskLevel = 'high';
      reasons.push(`${flag.source}: ${flag.title}`);
    } else if (medRiskKeywords.some(k => kw.includes(k))) {
      if (riskLevel !== 'high') riskLevel = 'medium';
      reasons.push(`${flag.source}: ${flag.title}`);
    } else if (positiveKeywords.some(k => kw.includes(k))) {
      reasons.push(`[POSITIVE] ${flag.source}: ${flag.title}`);
    }
  }

  let recommendation = 'Normal trading';
  if (riskLevel === 'high') recommendation = 'Reduce position sizes, tighten stops, consider exiting speculative trades';
  else if (riskLevel === 'medium') recommendation = 'Caution — monitor closely, avoid new entries until clarity';

  return { adjustment: riskLevel, recommendation, headlines: reasons };
}

// ─── Binance OHLCV ──────────────────────────────────────────────────────────

async function fetchOHLCV(exchange, symbol) {
  try {
    const ohlcv = await exchange.fetchOHLCV(symbol, '4h', undefined, 60);
    const closes = ohlcv.map(c => c[4]);
    const volumes = ohlcv.map(c => c[5]);
    const currentPrice = closes[closes.length - 1];

    const macd = calcMACD(closes);
    const atr = calcATR(ohlcv, 14);
    const fundingRate = await fetchFundingRate(exchange, symbol);

    const partialInd = {
      rsi: calcRSI(closes, 14),
      sma20: calcSMA(closes, 20),
      sma50: calcSMA(closes, 50),
      macdHistogram: macd.histogram,
      momentum: calcMomentum(closes, 10),
      adx: calcADX(ohlcv),
      bollingerBands: calcBollingerBands(closes),
    };
    const multiTimeframe = calcMultiTimeframeScore(partialInd);

    return {
      symbol,
      currentPrice,
      closes,
      volumes,
      ohlcv,
      rsi: calcRSI(closes, 14),
      sma20: calcSMA(closes, 20),
      sma50: calcSMA(closes, 50),
      volumeRatio: calcVolumeRatio(volumes),
      momentum: calcMomentum(closes, 10),
      momentum4h: closes.length >= 2 ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0,
      macd: macd.macd,
      macdSignal: macd.signal,
      macdHistogram: macd.histogram,
      atr,
      bollingerBands: calcBollingerBands(closes),
      adx: calcADX(ohlcv),
      vwap: calcVWAP(ohlcv),
      fundingRate,
      multiTimeframe,
    };
  } catch (err) {
    log(`  ⚠ Failed to fetch OHLCV for ${symbol}: ${err.message}`);
    return null;
  }
}

// ─── Cooldown Logic ──────────────────────────────────────────────────────────

const COOLDOWN_FILE = path.join(__dirname, '.trading-engine-state.json');
let MOVE_COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours (default, overridden by risk level)
const EXTREME_MOVE_PCT = 5; // 5% move in 4h overrides cooldown

// ─── Risk Level Config ───────────────────────────────────────────────────────
// Fetched from trading settings API; affects cooldowns, signal thresholds, shorting
let RISK_LEVEL = 'bold'; // default fallback — overridden by settings

const RISK_PROFILES = {
  safe: {
    cooldownMs: 24 * 60 * 60 * 1000,  // 24h cooldown
    allowShorts: false,
    shortRsiThreshold: 999,  // effectively disabled
    longRsiThreshold: 35,
    shortMomentumThreshold: -3,
    entrySignals: 3,  // need 3 signals to analyze
  },
  balanced: {
    cooldownMs: 8 * 60 * 60 * 1000,  // 8h cooldown
    allowShorts: true,
    shortRsiThreshold: 65,
    longRsiThreshold: 40,
    shortMomentumThreshold: -2,
    entrySignals: 3,  // raised from 2 — no more neutral coin spam
  },
  bold: {
    cooldownMs: 4 * 60 * 60 * 1000,  // 4h cooldown
    allowShorts: true,
    shortRsiThreshold: 55,  // short earlier
    longRsiThreshold: 45,   // enter longs more aggressively too
    shortMomentumThreshold: -1,
    entrySignals: 3,  // raised from 2 — coins must have real signals, not just exist
  },
};

function getRiskProfile() {
  return RISK_PROFILES[RISK_LEVEL] || RISK_PROFILES.balanced;
}

function loadState() {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) return JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
  } catch {}
  return { lastMoves: {} };
}

function saveState(state) {
  try { fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(state, null, 2)); } catch {}
}

function canMoveCard(symbol, state) {
  const lastMove = state.lastMoves[symbol];
  if (!lastMove) return true;
  return Date.now() - lastMove > MOVE_COOLDOWN_MS;
}

function isExtremeMove(ind) {
  if (!ind) return false;
  // Check if the last 4h candle moved more than 5%
  return Math.abs(ind.momentum4h || 0) > EXTREME_MOVE_PCT;
}

function recordMove(symbol, state) {
  state.lastMoves[symbol] = Date.now();
}

// ─── Signal Logic ────────────────────────────────────────────────────────────

function shouldMoveToAnalyzing(ind) {
  if (!ind || ind.rsi == null) return false;
  const rp = getRiskProfile();
  // Any coin worth analyzing if it has enough signals (threshold varies by risk):
  let signals = 0;
  if (ind.rsi < rp.longRsiThreshold || ind.rsi > rp.shortRsiThreshold) signals += 2; // Strong RSI = double weight
  else if (ind.rsi < 38 || ind.rsi > 62) signals += 1; // Moderate RSI — must be clearly directional, not neutral
  if (ind.sma20 && Math.abs(ind.currentPrice - ind.sma20) / ind.sma20 < 0.03) signals += 1; // Near SMA20
  if (ind.volumeRatio > 1.0) signals += 1; // Above-average volume
  if (ind.momentum && Math.abs(ind.momentum) > 2) signals += 1; // Momentum building
  // Bold: big 4h move = instant analyze
  if (RISK_LEVEL === 'bold' && Math.abs(ind.momentum4h || 0) > 3) signals += 2;

  // ADX-aware filtering: boost/suppress strategies based on market regime
  const adx = ind.adx;
  if (adx) {
    if (adx.adx > 25) {
      // Trending market — boost trend signals
      if (ind.sma20 && ind.sma50 && ind.sma20 !== ind.sma50) signals += 1; // SMA crossover more relevant
      if (Math.abs(ind.momentum) > 1) signals += 1; // Momentum matters more
    } else if (adx.adx < 20) {
      // Ranging market — boost range/reversion signals
      if (ind.bollingerBands && (ind.bollingerBands.percentB < 0.1 || ind.bollingerBands.percentB > 0.9)) signals += 1;
      if (ind.vwap && Math.abs(ind.currentPrice - ind.vwap) / ind.vwap > 0.015) signals += 1;
    }
  }

  return signals >= rp.entrySignals;
}

function shouldMoveToActive(ind, _btcMomentum = null) {
  if (!ind || ind.rsi == null) return { enter: false };
  
  const rp = getRiskProfile();

  // ── LONG SIGNALS ──
  // Signal 1: Oversold bounce near SMA20 + MACD confirmation
  const oversoldBounce =
    ind.rsi < rp.longRsiThreshold &&
    ind.sma20 &&
    Math.abs(ind.currentPrice - ind.sma20) / ind.sma20 < 0.05 &&
    (ind.macdHistogram === null || ind.macdHistogram > -0.5); // MACD not deeply negative
  
  // Signal 2: Golden cross + MACD bullish
  const goldenCross =
    ind.sma20 && ind.sma50 && ind.sma20 > ind.sma50 && 
    ind.momentum > 0 &&
    (ind.macdHistogram === null || ind.macdHistogram > 0);
  
  // Signal 3: Deeply oversold (RSI < 30) — enter regardless but MACD must be turning
  const deeplyOversold = ind.rsi < 30 && 
    (ind.macdHistogram === null || ind.macdHistogram > -1);

  // Signal 6 (Bold only): Momentum catch — big pump in progress, ride the wave
  const momentumCatch = RISK_LEVEL === 'bold' &&
    (ind.momentum4h || 0) > 4 && // 4%+ move in last 4h candle
    ind.volumeRatio > 1.5 &&     // High volume confirms it
    ind.rsi < 75;                 // Not totally overbought yet

  // ── NEW v3 LONG SIGNALS ──

  // Bollinger Bounce Long: price at/below lower band + RSI < 40 + ranging (ADX < 25)
  const bb = ind.bollingerBands;
  const adx = ind.adx;
  const bollingerBounceLong = bb && adx &&
    ind.currentPrice <= bb.lower * 1.005 &&
    ind.rsi < 40 &&
    adx.adx < 25;

  // Range Breakout Long: price breaks above upper BB + volume + ADX rising above 20
  const rangeBreakoutLong = (RISK_LEVEL === 'balanced' || RISK_LEVEL === 'bold') &&
    bb && adx &&
    ind.currentPrice > bb.upper &&
    ind.volumeRatio > 1.5 &&
    adx.adx >= 20 &&
    bb.bandwidth < 8; // was squeezed recently (< 5% ideal, allow 8% for buffer)

  // VWAP Reversion Long: price > 2% below VWAP + RSI < 45
  const vwapReversionLong = ind.vwap &&
    ind.currentPrice < ind.vwap * 0.98 &&
    ind.rsi < 45;

  // Trend Surfer Long: ADX > 25 + plusDI > minusDI + pullback to SMA20 + RSI 40-60
  const trendSurferLong = (RISK_LEVEL === 'balanced' || RISK_LEVEL === 'bold') &&
    adx && ind.sma20 &&
    adx.adx > 25 &&
    adx.plusDI > adx.minusDI &&
    Math.abs(ind.currentPrice - ind.sma20) / ind.sma20 < 0.015 &&
    ind.rsi >= 40 && ind.rsi <= 60;

  // Correlation Hedge: BTC momentum < -3% + PAXG RSI < 60 (PAXG only)
  const correlationHedge = ind.symbol === 'PAXG/USDT' &&
    _btcMomentum !== null && _btcMomentum < -3 &&
    ind.rsi < 60;

  // QFL — Quick Fingers Luc: Buy flash crash bounces at support
  const qflBounce = (RISK_LEVEL === 'balanced' || RISK_LEVEL === 'bold') &&
    (ind.momentum4h || 0) < -3 &&           // Big recent drop (3%+)
    ind.rsi < 35 &&                          // Oversold from the drop
    ind.bollingerBands &&
    ind.bollingerBands.percentB < 0.05 &&    // At or below lower Bollinger Band
    ind.volumeRatio > 1.5 &&                 // High volume on the drop (capitulation)
    ind.macdHistogram !== null && 
    ind.macdHistogram > (ind.macd || 0) * -0.5;  // MACD not accelerating down (starting to flatten)

  if (oversoldBounce || goldenCross || deeplyOversold || momentumCatch ||
      bollingerBounceLong || rangeBreakoutLong || vwapReversionLong || trendSurferLong || correlationHedge || qflBounce) {
    const reason = qflBounce ? 'qfl_bounce' : momentumCatch ? 'momentum_catch' :
      correlationHedge ? 'correlation_hedge' :
      bollingerBounceLong ? 'bollinger_bounce' :
      rangeBreakoutLong ? 'range_breakout' :
      vwapReversionLong ? 'vwap_reversion' :
      trendSurferLong ? 'trend_surfer' :
      oversoldBounce ? 'oversold_bounce' : goldenCross ? 'golden_cross' : 'deeply_oversold';
    return { enter: true, direction: 'LONG', reason };
  }
  
  // ── SHORT SIGNALS (disabled in Safe mode) ──
  if (!rp.allowShorts) {
    return { enter: false };
  }

  // Signal 4: Overbought rejection from SMA20 resistance + MACD bearish
  const overboughtReject =
    ind.rsi > rp.shortRsiThreshold &&
    ind.sma20 &&
    ind.currentPrice < ind.sma20 && // Price rejected below SMA20
    (ind.macdHistogram !== null && ind.macdHistogram < 0);
  
  // Signal 5: Death cross (SMA20 < SMA50) + bearish momentum
  const deathCross =
    ind.sma20 && ind.sma50 && ind.sma20 < ind.sma50 &&
    ind.momentum < rp.shortMomentumThreshold &&
    (ind.macdHistogram !== null && ind.macdHistogram < 0);

  // Signal 7 (Bold only): Bearish breakdown — price dumping with volume
  const bearishBreakdown = RISK_LEVEL === 'bold' &&
    (ind.momentum4h || 0) < -3 && // 3%+ dump in last 4h
    ind.volumeRatio > 1.3 &&
    ind.rsi > 25;                  // Not already oversold

  // ── NEW v3 SHORT SIGNALS ──

  // Bollinger Bounce Short: price at/above upper band + RSI > 60 + ranging
  const bollingerBounceShort = bb && adx &&
    ind.currentPrice >= bb.upper * 0.995 &&
    ind.rsi > 60 &&
    adx.adx < 25;

  // Range Breakout Short: price breaks below lower BB + volume + ADX rising
  const rangeBreakoutShort = (RISK_LEVEL === 'balanced' || RISK_LEVEL === 'bold') &&
    bb && adx &&
    ind.currentPrice < bb.lower &&
    ind.volumeRatio > 1.5 &&
    adx.adx >= 20 &&
    bb.bandwidth < 8;

  // VWAP Reversion Short: price > 2% above VWAP + RSI > 55
  const vwapReversionShort = ind.vwap &&
    ind.currentPrice > ind.vwap * 1.02 &&
    ind.rsi > 55;

  // Trend Surfer Short: ADX > 25 + minusDI > plusDI + bounce to SMA20 + RSI 40-60
  const trendSurferShort = (RISK_LEVEL === 'balanced' || RISK_LEVEL === 'bold') &&
    adx && ind.sma20 &&
    adx.adx > 25 &&
    adx.minusDI > adx.plusDI &&
    Math.abs(ind.currentPrice - ind.sma20) / ind.sma20 < 0.015 &&
    ind.rsi >= 40 && ind.rsi <= 60;

  if (overboughtReject || deathCross || bearishBreakdown ||
      bollingerBounceShort || rangeBreakoutShort || vwapReversionShort || trendSurferShort) {
    const reason = bearishBreakdown ? 'bearish_breakdown' :
      bollingerBounceShort ? 'bollinger_bounce' :
      rangeBreakoutShort ? 'range_breakout' :
      vwapReversionShort ? 'vwap_reversion' :
      trendSurferShort ? 'trend_surfer' :
      overboughtReject ? 'overbought_reject' : 'death_cross';
    return { enter: true, direction: 'SHORT', reason };
  }

  return { enter: false };
}

function shouldExitTrade(ind, trade) {
  if (!ind) return { exit: false, updates: null };
  const entryPrice = parseFloat(trade.entry_price);
  if (!entryPrice || entryPrice <= 0) return { exit: false, updates: null };

  const pnlPct = ((ind.currentPrice - entryPrice) / entryPrice) * 100;
  const direction = (trade.direction || 'long').toLowerCase();
  const effectivePnl = direction === 'short' ? -pnlPct : pnlPct;

  // ATR-based dynamic stops (if ATR available)
  let dynamicSL = STOP_LOSS_PCT;
  if (ind.atr && entryPrice > 0) {
    const atrPct = (ind.atr / entryPrice) * 100;
    dynamicSL = Math.max(2, Math.min(8, atrPct * 2));   // 2×ATR but clamped 2-8%
  }

  const atrValue = ind.atr || (entryPrice * 0.03); // fallback 3% of entry
  const atrProfitMultiple = (effectivePnl / 100 * entryPrice) / atrValue;

  // Parse existing metadata
  const meta = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
  let updates = null; // metadata updates to PATCH

  // ── PARTIAL PROFIT TAKING ──
  if (!meta.partialExitTaken && atrProfitMultiple >= 2) {
    const currentSize = parseFloat(trade.position_size || 0);
    if (currentSize > 0) {
      updates = {
        partialExitTaken: true,
        partialExitPrice: ind.currentPrice,
        partialExitPnl: effectivePnl.toFixed(2),
      };
      log(`  💰 Partial exit: took 50% profit at +${effectivePnl.toFixed(1)}% on ${ind.symbol || trade.coin_pair}`);
      return { exit: false, updates, partialExit: true, newPositionSize: currentSize * 0.5 };
    }
  }

  // ── TRAILING STOP LOGIC ──
  let trailingStopPrice = meta.trailingStopPrice || null;
  let trailingStopStage = meta.trailingStopStage || 0;
  let trailingUpdated = false;

  // Determine current stage based on profit
  let newStage = trailingStopStage;
  if (atrProfitMultiple >= 3) newStage = 3;
  else if (atrProfitMultiple >= 2) newStage = 2;
  else if (atrProfitMultiple >= 1.5) newStage = 1;

  if (newStage > trailingStopStage || (newStage >= 1 && trailingStopPrice === null)) {
    trailingStopStage = newStage;
    trailingUpdated = true;
  }

  // Calculate trailing stop price based on stage
  if (trailingStopStage >= 1) {
    let newStop;
    if (trailingStopStage >= 3) {
      // Stage 3: trail 0.75× ATR behind
      newStop = direction === 'short'
        ? ind.currentPrice + atrValue * 0.75
        : ind.currentPrice - atrValue * 0.75;
    } else if (trailingStopStage >= 2) {
      // Stage 2: trail 1× ATR behind
      newStop = direction === 'short'
        ? ind.currentPrice + atrValue
        : ind.currentPrice - atrValue;
    } else {
      // Stage 1: breakeven
      newStop = entryPrice;
    }

    // Only move stop in favorable direction (never backwards)
    if (trailingStopPrice === null) {
      trailingStopPrice = newStop;
      trailingUpdated = true;
    } else if (direction === 'short') {
      if (newStop < trailingStopPrice) { trailingStopPrice = newStop; trailingUpdated = true; }
    } else {
      if (newStop > trailingStopPrice) { trailingStopPrice = newStop; trailingUpdated = true; }
    }

    // Check if trailing stop hit
    const trailingHit = direction === 'short'
      ? ind.currentPrice >= trailingStopPrice
      : ind.currentPrice <= trailingStopPrice;

    if (trailingHit) {
      return {
        exit: true,
        reason: `Trailing stop hit (stage ${trailingStopStage}, stop=${trailingStopPrice.toFixed(2)}, PnL=${effectivePnl.toFixed(1)}%)`,
        win: effectivePnl > 0,
        updates: { trailingStopPrice, trailingStopStage },
      };
    }
  }

  // Save trailing stop updates
  if (trailingUpdated) {
    updates = { ...(updates || {}), trailingStopPrice, trailingStopStage };
  }

  // ── HARD STOP LOSS (safety net) — with flip detection ──
  if (effectivePnl <= -dynamicSL) {
    const result = { exit: true, reason: `Stop loss (${effectivePnl.toFixed(1)}%, limit -${dynamicSL.toFixed(1)}%)`, win: false, updates };
    
    // Long-to-Short flip
    const shouldFlip = 
      getRiskProfile().allowShorts &&
      direction !== 'short' &&
      ind.adx && ind.adx.adx > 25 &&
      ind.adx.minusDI > ind.adx.plusDI &&
      ind.macdHistogram !== null && 
      ind.macdHistogram < 0 &&
      ind.rsi > 35;
    
    // Short-to-Long flip
    const shouldFlipLong =
      direction === 'short' &&
      effectivePnl <= -dynamicSL &&
      ind.adx && ind.adx.adx > 25 &&
      ind.adx.plusDI > ind.adx.minusDI &&
      ind.macdHistogram !== null &&
      ind.macdHistogram > 0 &&
      ind.rsi < 65;
    
    if (shouldFlip) {
      result.flip = true;
      result.flipDirection = 'SHORT';
      result.flipReason = 'trend_reversal_flip';
    } else if (shouldFlipLong) {
      result.flip = true;
      result.flipDirection = 'LONG';
      result.flipReason = 'trend_reversal_flip';
    }
    
    return result;
  }

  // RSI exit — overbought for longs, oversold for shorts
  if (direction === 'short' && ind.rsi < 30 && effectivePnl > 0) return { exit: true, reason: `RSI oversold short exit (${ind.rsi.toFixed(1)})`, win: true, updates };
  if (direction !== 'short' && ind.rsi > 70 && effectivePnl > 0) return { exit: true, reason: `RSI overbought (${ind.rsi.toFixed(1)})`, win: true, updates };
  // MACD reversal exit
  if (direction !== 'short' && ind.macdHistogram !== null && ind.macdHistogram < -1 && effectivePnl < 0) {
    return { exit: true, reason: `MACD bearish reversal (hist=${ind.macdHistogram.toFixed(2)})`, win: false, updates };
  }
  if (direction === 'short' && ind.macdHistogram !== null && ind.macdHistogram > 1 && effectivePnl < 0) {
    return { exit: true, reason: `MACD bullish reversal (hist=${ind.macdHistogram.toFixed(2)})`, win: false, updates };
  }

  return { exit: false, updates };
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

// ─── Crash Alert ─────────────────────────────────────────────────────────────

function loadCrashAlert() {
  const alertPath = path.join(__dirname, '.crash-alert.json');
  try {
    if (fs.existsSync(alertPath)) {
      const data = JSON.parse(fs.readFileSync(alertPath, 'utf8'));
      // Only consider alerts less than 5 minutes old
      if (data.timestamp && Date.now() - data.timestamp < 5 * 60 * 1000) {
        return data;
      }
    }
  } catch {}
  return null;
}

// ─── Available Strategies ────────────────────────────────────────────────────

function getAvailableStrategies() {
  const rp = getRiskProfile();
  return [
    { id: 'oversold_bounce', name: 'Oversold Bounce', active: true, direction: 'long', conditions: 'RSI < longThreshold, near SMA20, MACD not deeply negative' },
    { id: 'golden_cross', name: 'Golden Cross', active: true, direction: 'long', conditions: 'SMA20 > SMA50, positive momentum, MACD bullish' },
    { id: 'deeply_oversold', name: 'Deeply Oversold', active: true, direction: 'long', conditions: 'RSI < 30, MACD turning' },
    { id: 'momentum_catch', name: 'Momentum Catch', active: RISK_LEVEL === 'bold', direction: 'long', conditions: 'Bold only: 4%+ 4h move, 1.5x volume, RSI < 75' },
    { id: 'bollinger_bounce', name: 'Bollinger Bounce', active: true, direction: 'both', conditions: 'Price at band extreme, ADX < 25 (ranging)' },
    { id: 'range_breakout', name: 'Range Breakout', active: rp.allowShorts || RISK_LEVEL !== 'safe', direction: 'both', conditions: 'Price breaks BB, volume 1.5x+, ADX >= 20, squeezed bandwidth' },
    { id: 'vwap_reversion', name: 'VWAP Reversion', active: true, direction: 'both', conditions: 'Price > 2% from VWAP with RSI confirmation' },
    { id: 'trend_surfer', name: 'Trend Surfer', active: rp.allowShorts || RISK_LEVEL !== 'safe', direction: 'both', conditions: 'ADX > 25, DI confirms, pullback to SMA20, RSI 40-60' },
    { id: 'correlation_hedge', name: 'Correlation Hedge', active: true, direction: 'long', conditions: 'PAXG only: BTC momentum < -3%, PAXG RSI < 60' },
    { id: 'overbought_reject', name: 'Overbought Reject', active: rp.allowShorts, direction: 'short', conditions: 'RSI > threshold, price below SMA20, MACD bearish' },
    { id: 'death_cross', name: 'Death Cross', active: rp.allowShorts, direction: 'short', conditions: 'SMA20 < SMA50, bearish momentum, MACD bearish' },
    { id: 'bearish_breakdown', name: 'Bearish Breakdown', active: RISK_LEVEL === 'bold', direction: 'short', conditions: 'Bold only: 3%+ dump, volume, RSI > 25' },
    { id: 'qfl_bounce', name: 'Quick Fingers (QFL)', active: rp.allowShorts || RISK_LEVEL !== 'safe', direction: 'long', conditions: 'Balanced/Bold: flash crash bounce at support, high volume capitulation' },
    { id: 'trend_reversal_flip', name: 'Trend Flip', active: rp.allowShorts, direction: 'both', conditions: 'Balanced/Bold: flip direction on stop loss in strong opposing trend' },
  ];
}

// ─── Penny Review Mode ───────────────────────────────────────────────────────

async function pennyReviewMode(exchange) {
  // Load Owen's scanner results
  const scannerPath = path.join(__dirname, '.owen-scanner-results.json');
  let owenData = null;
  try {
    if (fs.existsSync(scannerPath)) {
      owenData = JSON.parse(fs.readFileSync(scannerPath, 'utf8'));
    }
  } catch {}

  const watchlistCoins = owenData?.watchlist || [];

  // Load active trades from API
  const { trades } = await apiGet(`/api/trading/trades?boardId=${BOARD_ID}`);
  const activeTrades = trades.filter(t => (t.column_name || '') === 'Active');

  // Get portfolio
  let portfolio = { balance: 0, startingBalance: 1000, activeTrades: activeTrades.length, totalPnl: 0 };
  try {
    const { account } = await apiGet(`/api/trading/account?boardId=${BOARD_ID}`);
    const bal = parseFloat(account?.current_balance || 0);
    portfolio.balance = bal;
    try {
      const pRes = await apiGet(`/api/v1/portfolio?boardId=${BOARD_ID}`);
      portfolio.startingBalance = parseFloat(pRes?.account?.summary?.paper_balance || 1000);
    } catch {}
    portfolio.totalPnl = portfolio.balance - portfolio.startingBalance;
  } catch {}

  // Fetch indicators for all watchlist + active symbols
  const allSymbols = new Set();
  for (const c of watchlistCoins) allSymbols.add(c.symbol);
  for (const t of activeTrades) allSymbols.add(normalizePair(t.coin_pair));
  allSymbols.add('BTC/USDT'); // always need BTC

  const indicators = {};
  for (const sym of allSymbols) {
    const ind = await fetchOHLCV(exchange, sym);
    if (ind) indicators[sym] = ind;
    await sleep(200);
  }

  // Market regime from BTC
  const btcInd = indicators['BTC/USDT'];
  let marketRegime = 'ranging';
  let fearGreedIndex = 50;
  if (btcInd) {
    if (btcInd.sma20 && btcInd.sma50) {
      if (btcInd.sma20 > btcInd.sma50 && btcInd.momentum > 2) marketRegime = 'bullish';
      else if (btcInd.sma20 < btcInd.sma50 && btcInd.momentum < -2) marketRegime = 'bearish';
    }
    if (btcInd.rsi != null) {
      fearGreedIndex = Math.round(Math.max(0, Math.min(100, (btcInd.rsi - 20) * 1.25)));
    }
  }

  // Build active trades output
  const activeOutput = activeTrades.map(t => {
    const sym = normalizePair(t.coin_pair);
    const ind = indicators[sym];
    const entryPrice = parseFloat(t.entry_price || 0);
    const currentPrice = ind?.currentPrice || 0;
    const direction = (t.direction || 'LONG').toUpperCase();
    const pnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 * (direction === 'SHORT' ? -1 : 1) : 0;
    const posSize = parseFloat(t.position_size || 0);
    const pnlDollar = (pnlPct / 100) * posSize;
    const meta = typeof t.metadata === 'string' ? JSON.parse(t.metadata || '{}') : (t.metadata || {});

    return {
      id: t.id,
      symbol: sym,
      direction,
      entryPrice,
      currentPrice,
      pnlPercent: Math.round(pnlPct * 100) / 100,
      pnlDollar: Math.round(pnlDollar * 100) / 100,
      positionSize: posSize,
      strategy: meta.strategy || meta.entry_reason || 'unknown',
      indicators: ind ? {
        rsi: ind.rsi ? Math.round(ind.rsi * 10) / 10 : null,
        sma20: ind.sma20 ? Math.round(ind.sma20 * 100) / 100 : null,
        macd: ind.macd ? Math.round(ind.macd * 1000) / 1000 : null,
        adx: ind.adx?.adx ? Math.round(ind.adx.adx * 10) / 10 : null,
        bollingerPercentB: ind.bollingerBands?.percentB ? Math.round(ind.bollingerBands.percentB * 100) / 100 : null,
        vwap: ind.vwap ? Math.round(ind.vwap * 100) / 100 : null,
      } : {},
      trailingStop: meta.trailingStopPrice || null,
      partialExitTaken: !!meta.partialExitTaken,
      executionQuality: calcExecutionQuality(t, ind?.currentPrice || 0),
      fundingRate: ind?.fundingRate || null,
      multiTimeframe: ind?.multiTimeframe || null,
      dcaOpportunity: (
        pnlPct > 3 &&
        ind?.sma20 && 
        Math.abs((ind?.currentPrice || 0) - ind.sma20) / ind.sma20 < 0.02 &&
        ind?.rsi > 35 && ind?.rsi < 55
      ) ? { 
        canDCA: true, 
        reason: `Up ${pnlPct.toFixed(1)}%, pulling back to SMA20 — good add point` 
      } : { canDCA: false },
    };
  });

  // Build watchlist output
  const watchlistOutput = watchlistCoins.map(c => {
    const ind = indicators[c.symbol];
    return {
      symbol: c.symbol,
      currentPrice: ind?.currentPrice || 0,
      owenScore: c.score || 0,
      owenReason: c.reason || '',
      fundingRate: ind?.fundingRate || null,
      multiTimeframe: ind?.multiTimeframe || null,
      indicators: ind ? {
        rsi: ind.rsi ? Math.round(ind.rsi * 10) / 10 : null,
        sma20: ind.sma20 ? Math.round(ind.sma20 * 100) / 100 : null,
        sma50: ind.sma50 ? Math.round(ind.sma50 * 100) / 100 : null,
        macd: ind.macd ? Math.round(ind.macd * 1000) / 1000 : null,
        macdHistogram: ind.macdHistogram ? Math.round(ind.macdHistogram * 1000) / 1000 : null,
        adx: ind.adx?.adx ? Math.round(ind.adx.adx * 10) / 10 : null,
        plusDI: ind.adx?.plusDI ? Math.round(ind.adx.plusDI * 10) / 10 : null,
        minusDI: ind.adx?.minusDI ? Math.round(ind.adx.minusDI * 10) / 10 : null,
        bollingerUpper: ind.bollingerBands?.upper ? Math.round(ind.bollingerBands.upper * 100) / 100 : null,
        bollingerLower: ind.bollingerBands?.lower ? Math.round(ind.bollingerBands.lower * 100) / 100 : null,
        bollingerPercentB: ind.bollingerBands?.percentB ? Math.round(ind.bollingerBands.percentB * 100) / 100 : null,
        vwap: ind.vwap ? Math.round(ind.vwap * 100) / 100 : null,
        atrPercent: ind.atr && ind.currentPrice ? Math.round((ind.atr / ind.currentPrice) * 10000) / 100 : null,
        volumeRatio: ind.volumeRatio ? Math.round(ind.volumeRatio * 100) / 100 : null,
        momentum: ind.momentum ? Math.round(ind.momentum * 100) / 100 : null,
        momentum4h: ind.momentum4h ? Math.round(ind.momentum4h * 100) / 100 : null,
      } : {},
    };
  });

  // Load position sentinel alerts (< 5 min old)
  let positionAlerts = null;
  try {
    const sentinelPath = path.join(__dirname, '.position-sentinel-alert.json');
    if (fs.existsSync(sentinelPath)) {
      const sentinelData = JSON.parse(fs.readFileSync(sentinelPath, 'utf8'));
      if (sentinelData.timestamp && Date.now() - sentinelData.timestamp < 5 * 60 * 1000) {
        positionAlerts = sentinelData;
      }
    }
  } catch {}

  // Load macro pulse (< 30 min old)
  let macroPulse = null;
  try {
    const macroPath = path.join(__dirname, '.owen-macro-pulse.json');
    if (fs.existsSync(macroPath)) {
      const macroData = JSON.parse(fs.readFileSync(macroPath, 'utf8'));
      if (macroData.timestamp && Date.now() - macroData.timestamp < 30 * 60 * 1000) {
        macroPulse = macroData;
      }
    }
  } catch {}

  // Load news alerts (< 15 min old)
  let newsAlerts = null;
  try {
    const newsPath = path.join(__dirname, '.owen-news.json');
    if (fs.existsSync(newsPath)) {
      const newsData = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
      if (newsData.timestamp && Date.now() - newsData.timestamp < 15 * 60 * 1000) {
        newsAlerts = newsData;
      }
    }
  } catch {}

  // Load health monitor (< 10 min old)
  let owenHealth = null;
  try {
    const healthPath = path.join(__dirname, '.owen-health.json');
    if (fs.existsSync(healthPath)) {
      const healthData = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
      if (healthData.timestamp && Date.now() - healthData.timestamp < 10 * 60 * 1000) {
        owenHealth = healthData;
      }
    }
  } catch {}

  const output = {
    timestamp: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    marketRegime,
    fearGreedIndex,
    crashAlert: loadCrashAlert(),
    positionAlerts,
    macroPulse,
    newsAlerts,
    owenHealth,
    portfolio,
    activeTrades: activeOutput,
    watchlist: watchlistOutput,
    availableStrategies: getAvailableStrategies(),
    suggestedCycle: suggestCycleFrequency(indicators),
    portfolioExposure: calcPortfolioExposure(activeTrades),
    newsRiskAdjustment: calcNewsRiskAdjustment(macroPulse),
    dataFreshness: checkDataFreshness(),
    regimeTransition: detectRegimeTransition(indicators),
  };

  // Add fee impact to active trades
  for (const t of output.activeTrades) {
    const posSize = t.positionSize || 0;
    const pnlDollar = t.pnlDollar || 0;
    t.feeImpact = {
      estimatedRoundTripFee: Math.round(posSize * 0.002 * 100) / 100,
      feeAdjustedPnl: Math.round((pnlDollar - posSize * 0.002) * 100) / 100,
      breakEvenPct: 0.2,
    };
  }

  // Output JSON to stdout for Penny to consume
  console.log(JSON.stringify(output, null, 2));
}

// ─── Dynamic Position Sizing ─────────────────────────────────────────────────

function calculatePositionSize(ind, balance, reason) {
  const baseSize = balance * 0.20; // 20% default
  
  let confidenceMultiplier = 1.0;
  
  // High confidence signals get bigger positions (up to 25%)
  if (ind.rsi < 25 || ind.rsi > 75) confidenceMultiplier += 0.15;          // Extreme RSI
  if (ind.volumeRatio > 2.0) confidenceMultiplier += 0.10;                  // Very high volume
  if (ind.adx && ind.adx.adx > 35) confidenceMultiplier += 0.10;           // Very strong trend
  if (ind.bollingerBands && 
      (ind.bollingerBands.percentB < 0.02 || ind.bollingerBands.percentB > 0.98)) 
    confidenceMultiplier += 0.10;                                            // At band extremes
  
  // Low confidence signals get smaller positions (down to 10%)
  if (reason === 'momentum_catch' || reason === 'bearish_breakdown') 
    confidenceMultiplier -= 0.25;  // Day trades are riskier
  if (ind.volumeRatio < 0.8) confidenceMultiplier -= 0.15;                  // Low volume = less conviction
  
  // Clamp multiplier between 0.5x and 1.25x (10% to 25% of balance)
  confidenceMultiplier = Math.max(0.5, Math.min(1.25, confidenceMultiplier));
  
  let finalSize = Math.min(baseSize * confidenceMultiplier, balance * 0.25); // Never more than 25%

  // Consecutive loss cooldown — reduce by 50%
  const state = loadState();
  if (state.lossCooldownTradesRemaining > 0) {
    finalSize *= 0.5;
    log(`  📉 Loss cooldown active (${state.lossCooldownTradesRemaining} trades remaining) — position halved`);
  }

  return finalSize;
}

// ─── Portfolio Hedge Logic ───────────────────────────────────────────────────

function shouldHedge(activeTrades, indicators, balance) {
  // Count directional exposure
  const longs = activeTrades.filter(t => (t.direction || 'LONG').toUpperCase() === 'LONG');
  const shorts = activeTrades.filter(t => (t.direction || 'LONG').toUpperCase() === 'SHORT');
  
  // If 3+ longs and market turning bearish, suggest hedge
  const btcInd = indicators['BTC/USDT'];
  if (longs.length >= 3 && shorts.length === 0 && btcInd) {
    const bearishSignals = 
      (btcInd.macdHistogram !== null && btcInd.macdHistogram < -0.5 ? 1 : 0) +
      (btcInd.momentum < -2 ? 1 : 0) +
      (btcInd.adx && btcInd.adx.minusDI > btcInd.adx.plusDI ? 1 : 0);
    
    if (bearishSignals >= 2) {
      return { hedge: true, reason: `Portfolio exposed: ${longs.length} longs, 0 shorts, BTC bearish (${bearishSignals}/3 signals)`, coin: 'PAXG/USDT' };
    }
  }
  return { hedge: false };
}

// ─── Correlation Guard ───────────────────────────────────────────────────────

const CORRELATION_GROUPS = {
  'layer1': ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'DOT/USDT', 'ATOM/USDT', 'SUI/USDT', 'APT/USDT', 'NEAR/USDT'],
  'defi': ['UNI/USDT', 'CRV/USDT', 'LQTY/USDT', 'STG/USDT'],
  'meme': ['DOGE/USDT', 'SHIB/USDT', 'WIF/USDT'],
  'ai': ['FET/USDT', 'RENDER/USDT', 'TAO/USDT'],
  'hedge': ['PAXG/USDT'],
};

function getCorrelationGroup(symbol) {
  for (const [group, coins] of Object.entries(CORRELATION_GROUPS)) {
    if (coins.includes(symbol)) return group;
  }
  return 'other';
}

function isCorrelationSafe(symbol, direction, activeTrades) {
  const group = getCorrelationGroup(symbol);
  if (group === 'other' || group === 'hedge') return true;
  
  const sameGroupSameDirection = activeTrades.filter(t => {
    const tGroup = getCorrelationGroup(normalizePair(t.coin_pair));
    const tDir = (t.direction || 'LONG').toUpperCase();
    return tGroup === group && tDir === direction;
  });
  
  return sameGroupSameDirection.length < 2; // Max 2 per group per direction
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  // Penny Review mode — output JSON analysis, no card movements
  if (isPennyReview) {
    const exchange = new ccxt.binance({ enableRateLimit: true });
    // Still need risk level for strategy listing
    try {
      const portfolioRes = await apiGet(`/api/v1/portfolio?boardId=${BOARD_ID}`);
      if (portfolioRes?.trading_settings?.risk_level) {
        RISK_LEVEL = portfolioRes.trading_settings.risk_level.toLowerCase();
      }
    } catch {}
    await pennyReviewMode(exchange);
    return;
  }

  log('🚀 TBO Trading Engine v3.4 — Monitor Mode');

  // ── Step -1: Fetch risk level from trading settings ────────────────────
  // Try DB direct read (API requires user auth, engine uses API key)
  try {
    const settingsRes = await apiGet(`/api/v1/boards/${BOARD_ID}`);
    // Parse risk from board metadata, or check trading_settings table via portfolio endpoint
    const portfolioRes = await apiGet(`/api/v1/portfolio?boardId=${BOARD_ID}`);
    if (portfolioRes?.trading_settings?.risk_level) {
      RISK_LEVEL = portfolioRes.trading_settings.risk_level.toLowerCase();
      // Write risk level for Owen to read
      try { fs.writeFileSync(path.join(__dirname, '.owen-risk-level.json'), JSON.stringify({ risk_level: RISK_LEVEL, updatedAt: Date.now() })); } catch {}
    }
  } catch (e) {
    log(`⚠ Could not fetch risk level, using default: ${RISK_LEVEL}`);
  }
  // ── Monthly Drawdown Breaker ────────────────────────────────────────────
  const drawdownState = loadState();
  
  // Check/restore drawdown breaker
  if (drawdownState.drawdownBreaker?.triggeredAt) {
    const elapsed = Date.now() - drawdownState.drawdownBreaker.triggeredAt;
    if (elapsed > 48 * 60 * 60 * 1000) {
      RISK_LEVEL = drawdownState.drawdownBreaker.originalRisk || RISK_LEVEL;
      log(`🟢 Drawdown breaker expired — restoring risk level to ${RISK_LEVEL.toUpperCase()}`);
      delete drawdownState.drawdownBreaker;
      saveState(drawdownState);
    } else {
      RISK_LEVEL = 'safe';
      const hoursLeft = Math.round((48 * 60 * 60 * 1000 - elapsed) / 3600000);
      log(`🚨 Drawdown breaker active — Safe mode for ${hoursLeft}h more`);
    }
  }

  const rp = getRiskProfile();
  MOVE_COOLDOWN_MS = rp.cooldownMs;
  log(`⚡ Risk Level: ${RISK_LEVEL.toUpperCase()} | Cooldown: ${MOVE_COOLDOWN_MS / 3600000}h | Shorts: ${rp.allowShorts ? 'ON' : 'OFF'}`);

  // ── Data Staleness Warning ─────────────────────────────────────────────
  const freshness = checkDataFreshness();
  if (!freshness.scanner.fresh && freshness.scanner.ageMinutes !== null) {
    log(`⚠️ Owen scanner data is ${freshness.scanner.ageMinutes} minutes old — consider rerunning scanner`);
  }

  const exchange = new ccxt.binance({ enableRateLimit: true });

  // ── Step 0: Ensure bot exists ──────────────────────────────────────────
  let bot = await ensureBot();
  log(`🤖 Bot: ${bot.name} (ID: ${bot.id}, status: ${bot.status})`);

  // ── Step 1: Load board trades ──────────────────────────────────────────
  const { trades } = await apiGet(`/api/trading/trades?boardId=${BOARD_ID}`);
  log(`📋 Board ${BOARD_ID}: ${trades.length} trades total`);

  const byColumn = {};
  for (const t of trades) {
    const col = t.column_name || 'Watchlist';
    (byColumn[col] = byColumn[col] || []).push(t);
  }

  const watchlist = byColumn['Watchlist'] || [];
  const analyzing = byColumn['Analyzing'] || [];
  const active = byColumn['Active'] || [];
  const parked = byColumn['Parked'] || [];
  log(`   Watchlist: ${watchlist.length} | Analyzing: ${analyzing.length} | Active: ${active.length} | Parked: ${parked.length}`);

  // ── Step 2: Get account balance ────────────────────────────────────────
  const { account } = await apiGet(`/api/trading/account?boardId=${BOARD_ID}`);
  const balance = parseFloat(account?.current_balance || 0);
  log(`💰 Balance: $${balance.toFixed(2)}`);

  // ── Monthly Drawdown Check ─────────────────────────────────────────────
  const ddState = loadState();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  if (ddState.monthStartDate !== currentMonth) {
    ddState.monthStartDate = currentMonth;
    ddState.monthStartBalance = balance;
    saveState(ddState);
    log(`📅 New month tracked — start balance: $${balance.toFixed(2)}`);
  } else if (ddState.monthStartBalance && !ddState.drawdownBreaker) {
    const drawdownPct = ((ddState.monthStartBalance - balance) / ddState.monthStartBalance) * 100;
    if (drawdownPct > 12) {
      log(`🚨 MONTHLY DRAWDOWN BREAKER: -${drawdownPct.toFixed(1)}% this month — switching to Safe mode for 48h`);
      ddState.drawdownBreaker = { triggeredAt: Date.now(), originalRisk: RISK_LEVEL };
      RISK_LEVEL = 'safe';
      saveState(ddState);
    }
  }

  const state = loadState();

  // ── Step 3: Fetch indicators for all relevant coins ────────────────────
  const allTrades = [...watchlist, ...analyzing, ...active, ...parked];
  const symbols = [...new Set(allTrades.map(t => normalizePair(t.coin_pair)))];
  const indicators = {};

  try {
  // Ensure pinned coins always have a Watchlist card (unless already on board)
  const allSymbolsOnBoard = new Set(allTrades.map(t => normalizePair(t.coin_pair)));
  for (const pin of PINNED_COINS) {
    if (!allSymbolsOnBoard.has(pin)) {
      log(`  📌 Creating watchlist card for ${pin}`);
      try {
        const created = await apiPost('/api/trading/trades', {
          board_id: BOARD_ID,
          coin_pair: pin,
          direction: 'LONG',
          column_name: 'Watchlist',
          status: 'watching',
          notes: `Pinned coin — auto-added to watchlist`,
        });
        if (created?.trade) {
          watchlist.push(created.trade);
          allTrades.push(created.trade);
        }
      } catch (err) {
        log(`  ⚠ Failed to create watchlist card for ${pin}: ${err.message}`);
      }
    }
    if (!symbols.includes(pin)) symbols.push(pin);
  }

  log(`📊 Fetching indicators for ${symbols.length} symbols...`);
  for (const sym of symbols) {
    const ind = await fetchOHLCV(exchange, sym);
    if (ind) indicators[sym] = ind;
    // Rate limit courtesy
    await sleep(200);
  }
  } catch (err) {
    log(`❌ Step 3 failed (fetch indicators): ${err.message} — continuing with partial data`);
  }

  // ── Step 4: Process Active trades — check exits ────────────────────────
  let exitCount = 0;
  try {
  for (const trade of active) {
    const sym = normalizePair(trade.coin_pair);
    const ind = indicators[sym];
    const decision = shouldExitTrade(ind, trade);

    if (decision.exit) {
      log(`  🚪 Exiting ${sym}: ${decision.reason}`);
      try {
        await apiPost('/api/trading/trade/exit', { trade_id: trade.id });
        const targetCol = 'Closed';
        await moveCard(trade.id, targetCol);
        await journalLog(trade.id, 'exit', `Exit: ${decision.reason}. Price: ${ind?.currentPrice}`);

        // ── Consecutive Loss Tracking ──
        const exitState = loadState();
        if (decision.win) {
          exitState.consecutiveLosses = 0;
        } else {
          exitState.consecutiveLosses = (exitState.consecutiveLosses || 0) + 1;
          if (exitState.consecutiveLosses >= 5 && !exitState.lossCooldownTradesRemaining) {
            log('⚠️ LOSS STREAK: 5 consecutive losses — reducing position sizes by 50% for next 10 trades');
            exitState.lossCooldownTradesRemaining = 10;
          }
        }
        if (exitState.lossCooldownTradesRemaining > 0) {
          exitState.lossCooldownTradesRemaining--;
        }
        saveState(exitState);
        exitCount++;

        // Re-queue coins to Analyzing for potential re-entry
        // Core coins: immediately. Others: sentinel handles after 24h cooldown.
        if (!decision.flip && CORE_COINS.includes(sym)) {
          try {
            await apiPost('/api/trading/trades', {
              board_id: BOARD_ID,
              coin_pair: sym,
              column_name: 'Analyzing',
              status: 'analyzing',
              priority: 'high',
              notes: `♻️ Core coin re-queued after ${decision.win ? 'win' : 'loss'} (${decision.reason}). Watching for new entry.`,
            });
            log(`  ♻️ ${sym} re-queued to Analyzing (core coin)`);
          } catch (err) {
            log(`  ⚠ Re-queue failed for ${sym}: ${err.message}`);
          }
        }

        // Handle flip — exit first, then enter opposite direction
        if (decision.flip && decision.flipDirection && (active.length - exitCount) < MAX_POSITIONS) {
          const flipDir = decision.flipDirection;
          const origDir = (trade.direction || 'LONG').toUpperCase();
          log(`  🔄 Flipped ${sym} ${origDir} → ${flipDir} (${decision.flipReason})`);
          try {
            const flipSize = calculatePositionSize(ind, balance, decision.flipReason);
            const flipTrade = await apiPost('/api/trading/trades', {
              board_id: BOARD_ID,
              coin_pair: sym,
              direction: flipDir,
              column_name: 'Active',
              status: 'active',
              entry_price: ind.currentPrice,
              position_size: flipSize,
              bot_id: bot.id,
              notes: `🔄 Flip from ${origDir} → ${flipDir} (${decision.flipReason}) | Entry: ${ind.currentPrice}`,
              metadata: JSON.stringify({
                entry_reason: decision.flipReason,
                direction: flipDir,
                strategy: decision.flipReason,
                flippedFrom: trade.id,
                fees: { entryFee: flipSize * 0.001 },
                execution: {
                  signalPrice: ind.currentPrice,
                  signalTime: new Date().toISOString(),
                },
              }),
            });
            await journalLog(flipTrade?.trade?.id || trade.id, 'entry', `Flip ${origDir} → ${flipDir}: ${sym} @ ${ind.currentPrice} ($${flipSize.toFixed(2)})`);
          } catch (err) {
            log(`  ⚠ Flip entry failed for ${sym}: ${err.message}`);
          }
        }
      } catch (err) {
        log(`  ⚠ Exit failed for ${sym}: ${err.message}`);
      }
    } else {
      // Handle partial exit
      if (decision.partialExit && decision.newPositionSize) {
        try {
          const existingMeta = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
          await apiPatch('/api/trading/trades', {
            trade_id: trade.id,
            position_size: decision.newPositionSize,
            metadata: JSON.stringify({ ...existingMeta, ...decision.updates }),
          });
          await journalLog(trade.id, 'partial_exit', `Partial exit: 50% taken at $${ind?.currentPrice}`);
        } catch (err) {
          log(`  ⚠ Partial exit PATCH failed for ${sym}: ${err.message}`);
        }
      } else if (decision.updates) {
        // Update trailing stop metadata
        try {
          const existingMeta = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
          await apiPatch('/api/trading/trades', {
            trade_id: trade.id,
            metadata: JSON.stringify({ ...existingMeta, ...decision.updates }),
          });
        } catch {}
      }
      if (ind) await updateTradeAnalysis(trade.id, ind, sym);
    }
  }
  log(`🚪 Exits: ${exitCount}`);
  } catch (err) {
    log(`❌ Step 4 failed (exit processing): ${err.message} — continuing`);
  }

  // ── Portfolio Hedge Check ──────────────────────────────────────────────
  const remainingActive = active.filter(t => !t._exited); // approximate — use count
  const hedgeResult = shouldHedge(active, indicators, balance);
  if (hedgeResult.hedge) {
    log(`  🛡️ HEDGE SUGGESTION: ${hedgeResult.reason} → Consider ${hedgeResult.coin}`);
    // Save to bot metadata for Penny's review (don't auto-execute)
    try {
      await apiPatch(`/api/v1/bots/${bot.id}`, {
        metadata: {
          hedge_suggestion: hedgeResult,
          hedge_suggested_at: new Date().toISOString(),
        },
      });
    } catch {}
  }

  // ── Crash Alert Check ──────────────────────────────────────────────────
  const crashAlert = loadCrashAlert();
  if (crashAlert) {
    const dirEmoji = crashAlert.direction === 'up' ? '🟢📈' : '🔴📉';
    log(`🚨🚨🚨 MARKET ALERT ${dirEmoji} (${crashAlert.level.toUpperCase()}): ${crashAlert.message}`);
    for (const coin of (crashAlert.coins || [])) {
      log(`   ${coin.symbol}: 5m=${coin.change5m ?? coin.drop5m}%, 15m=${coin.change15m ?? coin.drop15m}%, price=${coin.currentPrice}`);
    }
  }

  // ── Step 5: Process Analyzing trades — check entry signals ─────────────
  // SKIPPED in monitor mode — Penny (Opus) now handles Analyzing → Active
  let entryCount = 0;
  try {
  const currentActive = active.length - exitCount;

  if (true) { // Step 5 re-enabled — engine enters trades autonomously
  for (const trade of analyzing) {
    if (currentActive + entryCount >= MAX_POSITIONS) break;

    const sym = normalizePair(trade.coin_pair);
    const ind = indicators[sym];

    const btcMom = indicators['BTC/USDT']?.momentum ?? null;
    const entrySignal = shouldMoveToActive(ind, btcMom);
    if (entrySignal.enter) {
      const extreme = isExtremeMove(ind);
      if (!canMoveCard(sym + ':active', state) && !extreme) {
        log(`  ⏳ ${sym} — ${entrySignal.direction} signal (${entrySignal.reason}) but cooldown (24h). Skipping.`);
        if (ind) await updateTradeAnalysis(trade.id, ind, sym);
        continue;
      }
      // Correlation guard
      if (!isCorrelationSafe(sym, dir, active)) {
        const group = getCorrelationGroup(sym);
        log(`  ⚠️ Correlation guard: already 2 ${group} ${dir.toLowerCase()}s, skipping ${sym}`);
        if (ind) await updateTradeAnalysis(trade.id, ind, sym);
        continue;
      }

      const positionSize = Math.min(calculatePositionSize(ind, balance, entrySignal.reason), balance);
      if (positionSize < 10) {
        log(`  ⚠ Insufficient balance for ${sym}`);
        continue;
      }

      const dir = entrySignal.direction || 'LONG';
      log(`  🎯 ${dir} entry for ${sym} (${entrySignal.reason}) — $${positionSize.toFixed(2)}${extreme ? ' (EXTREME)' : ''} | MACD hist=${ind.macdHistogram?.toFixed(3) ?? 'n/a'} | ATR=${ind.atr?.toFixed(4) ?? 'n/a'}`);
      recordMove(sym + ':active', state);
      try {
        // Update existing card with entry data + strategy metadata
        const existingMetadata = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
        // Calculate SL/TP based on ATR
        const atrVal = ind.atr || (ind.currentPrice * 0.03);
        const atrPct = (atrVal / ind.currentPrice) * 100;
        const dynamicSLPct = Math.max(2, Math.min(8, atrPct * 2));
        const dynamicTPPct = Math.max(5, Math.min(15, atrPct * 3));
        const slPrice = dir === 'SHORT'
          ? ind.currentPrice * (1 + dynamicSLPct / 100)
          : ind.currentPrice * (1 - dynamicSLPct / 100);
        const tpPrice = dir === 'SHORT'
          ? ind.currentPrice * (1 - dynamicTPPct / 100)
          : ind.currentPrice * (1 + dynamicTPPct / 100);

        await apiPatch('/api/trading/trades', {
          trade_id: trade.id,
          column_name: 'Active',
          status: 'active',
          entry_price: ind.currentPrice,
          position_size: positionSize,
          direction: dir,
          stop_loss: slPrice,
          take_profit: tpPrice,
          notes: `Strategy: ${BOT_NAME} | ${dir} ${entrySignal.reason} | SL: $${slPrice.toFixed(2)} (${dynamicSLPct.toFixed(1)}%) | TP: $${tpPrice.toFixed(2)} (${dynamicTPPct.toFixed(1)}%)`,
          bot_id: bot.id,
          metadata: JSON.stringify({
            ...existingMetadata,
            entry_reason: entrySignal.reason,
            direction: dir,
            strategy: entrySignal.reason,
            description: STRATEGY_DESCRIPTIONS[entrySignal.reason]?.(sym, ind) || `${sym} ${dir} — ${entrySignal.reason}`,
            atr: atrVal,
            slPercent: dynamicSLPct,
            tpPercent: dynamicTPPct,
            rsiAtEntry: ind.rsi,
            adxAtEntry: ind.adx,
            volumeRatioAtEntry: ind.volumeRatio,
            fees: { entryFee: positionSize * 0.001 },
            execution: {
              signalPrice: ind.currentPrice,
              signalTime: new Date().toISOString(),
            },
            trailingStopStage: 0,
            trailingStopPrice: null,
          }),
        });
        // Deduct from paper balance
        await apiPost('/api/trading/trade/deduct', {
          boardId: BOARD_ID,
          amount: positionSize,
        }).catch(() => {
          // Fallback: deduct via enter endpoint if deduct doesn't exist
          log(`  ⚠ Paper balance deduct endpoint not available — manual tracking`);
        });
        await journalLog(trade.id, 'entry', `${dir} Entry: ${sym} @ ${ind.currentPrice} (${entrySignal.reason}). RSI=${ind.rsi?.toFixed(1)}, SMA20=${ind.sma20?.toFixed(2)}, MACD=${ind.macdHistogram?.toFixed(3)}, ATR=${ind.atr?.toFixed(4)}, Vol=${ind.volumeRatio?.toFixed(2)}x`);
        entryCount++;
      } catch (err) {
        log(`  ⚠ Entry failed for ${sym}: ${err.message}`);
      }
    } else if (ind) {
      await updateTradeAnalysis(trade.id, ind, sym);
    }
  }
  } // end disabled Step 5
  log(`🎯 Entries: ${entryCount}`);
  } catch (err) {
    log(`❌ Step 5 failed (entry processing): ${err.message} — continuing`);
  }

  // ── Step 6: Process Watchlist — move to Analyzing if setup forming ─────
  // SKIPPED in monitor mode — Penny (Opus) now handles Watchlist → Analyzing
  let analyzeCount = 0;
  try {
  if (true) { // Step 6 re-enabled — engine moves watchlist to analyzing autonomously
  for (const trade of watchlist) {
    const sym = normalizePair(trade.coin_pair);
    const ind = indicators[sym];

    if (shouldMoveToAnalyzing(ind)) {
      const extreme = isExtremeMove(ind);
      if (canMoveCard(sym, state) || extreme) {
        log(`  🔍 Moving ${sym} → Analyzing${extreme ? ' (EXTREME MOVE)' : ''}`);
        try {
          await moveCard(trade.id, 'Analyzing');
          recordMove(sym, state);
          analyzeCount++;
        } catch (err) {
          log(`  ⚠ Move failed for ${sym}: ${err.message}`);
        }
      } else {
        log(`  ⏳ ${sym} — signal active but cooldown (24h). Skipping move.`);
      }
    }
    // Always update analysis on watchlist cards
    if (ind) await updateTradeAnalysis(trade.id, ind, sym);
  }
  } // end disabled Step 6
  saveState(state);
  log(`🔍 Moved to Analyzing: ${analyzeCount}`);
  } catch (err) {
    log(`❌ Step 6 failed (watchlist processing): ${err.message} — continuing`);
  }

  // ── Step 7: Update bot stats + market metadata ─────────────────────────
  try {
    await updateBotStats(bot.id, exitCount, entryCount, indicators);
  } catch (err) {
    log(`❌ Step 7 failed (bot stats): ${err.message} — continuing`);
  }

  // ── Step 8: Update live balance ───────────────────────────────────────
  try {
    await updateLiveBalance(active, exchange);
  } catch (err) {
    log(`❌ Step 8 failed (live balance): ${err.message} — continuing`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  log(`✅ Pipeline complete. Exits: ${exitCount}, Entries: ${entryCount}, New Analysis: ${analyzeCount}`);
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function normalizePair(pair) {
  if (!pair) return '';
  const p = pair.replace(/-/g, '/').toUpperCase();
  return p.includes('/') ? p : `${p}/USDT`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const COLUMN_STATUS_MAP = {
  'Watchlist': 'watching',
  'Analyzing': 'analyzing',
  'Active': 'active',
  'Parked': 'parked',
  'Closed': 'closed',
  'Wins': 'closed',
  'Losses': 'closed',
};

async function moveCard(tradeId, columnName) {
  const status = COLUMN_STATUS_MAP[columnName] || 'watching';
  await apiPatch('/api/trading/trades', { trade_id: tradeId, column_name: columnName, status });
}

async function ensureBot() {
  // Check if our bot already exists
  const { bots } = await apiGet(`/api/v1/bots?boardId=${BOARD_ID}`);
  const existing = bots?.find(b => b.name === BOT_NAME);
  if (existing) return existing;

  // Create it
  log(`🤖 Creating bot "${BOT_NAME}"...`);
  const { bot } = await apiPost('/api/v1/bots', {
    name: BOT_NAME,
    board_id: BOARD_ID,
    strategy_style: STRATEGY_STYLE,
    strategy_substyle: STRATEGY_SUBSTYLE,
    auto_trade: true,
    strategy_config: {
      maxPositions: MAX_POSITIONS,
      positionSizePercent: POSITION_SIZE_PCT,
      stopLossPercent: STOP_LOSS_PCT,
      takeProfitPercent: TAKE_PROFIT_PCT,
      timeframe: '4h',
      watchlist: PINNED_COINS,
    },
  });
  return bot;
}

function generateReason(ind, ticker) {
  const price = ind.currentPrice;
  const fmt = (v) => v > 1000 ? `$${v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : v > 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`;

  // Build headline — what's the story?
  let headline = '';
  if (ind.rsi < 30) headline = `🔥 ${ticker} oversold at RSI ${ind.rsi.toFixed(0)} — prime buy zone`;
  else if (ind.rsi < 35) headline = `👀 ${ticker} nearing oversold (RSI ${ind.rsi.toFixed(0)}) — watching closely`;
  else if (ind.rsi > 70) headline = `⚠️ ${ticker} overbought at RSI ${ind.rsi.toFixed(0)} — looking to take profit`;
  else if (ind.rsi > 60) headline = `📈 ${ticker} building momentum (RSI ${ind.rsi.toFixed(0)})`;
  else headline = `${ticker} ranging — no clear signal yet (RSI ${ind.rsi.toFixed(0)})`;

  // Key observations
  const obs = [];

  // SMA structure
  if (ind.sma20 && ind.sma50) {
    if (ind.sma20 > ind.sma50) {
      obs.push('Trend bullish (SMA20 > SMA50)');
    } else {
      const gap = ((ind.sma50 - ind.sma20) / ind.sma50 * 100);
      if (gap < 1.5) obs.push(`SMA crossover forming — gap only ${gap.toFixed(1)}%`);
      else obs.push(`Trend bearish — SMA20 still ${gap.toFixed(1)}% below SMA50`);
    }
  }

  // Price vs SMA20 — the bounce zone
  if (ind.sma20) {
    const dist = ((price - ind.sma20) / ind.sma20 * 100);
    if (Math.abs(dist) < 1) obs.push(`Sitting right on SMA20 (${fmt(ind.sma20)}) — key decision point`);
    else if (Math.abs(dist) < 3) obs.push(`Near SMA20 bounce zone (${dist > 0 ? 'above' : 'below'} by ${Math.abs(dist).toFixed(1)}%)`);
    else if (dist < -5) obs.push(`Extended ${Math.abs(dist).toFixed(1)}% below SMA20 — stretched, mean reversion play`);
  }

  // Volume context
  if (ind.volumeRatio > 2.0) obs.push('Volume surging (2x+ avg) — big move brewing');
  else if (ind.volumeRatio > 1.3) obs.push('Above-average volume — conviction behind the move');
  else if (ind.volumeRatio < 0.5) obs.push('Volume dried up — wait for participation');

  // Momentum
  if (ind.momentum > 3) obs.push(`Strong momentum (+${ind.momentum.toFixed(1)}%)`);
  else if (ind.momentum < -3) obs.push(`Selling pressure (${ind.momentum.toFixed(1)}%)`);

  // Action — what am I watching for?
  let action = '';
  if (ind.rsi < 35 && ind.sma20 && Math.abs(price - ind.sma20) / ind.sma20 < 0.03) {
    action = `🎯 Entry zone! Watching for bounce confirmation near ${fmt(ind.sma20)}`;
  } else if (ind.rsi < 40) {
    const target = ind.sma20 ? fmt(ind.sma20 * 0.98) : fmt(price * 0.97);
    action = `Ideal entry: ${target} on RSI dip below 35 with volume`;
  } else if (ind.rsi > 65) {
    action = `Watching for exit signals above RSI 70`;
  } else {
    action = `Patience — need RSI below 35 or SMA crossover to act`;
  }

  return `${headline}\n${obs.join(' · ')}\n${action}`;
}

async function updateTradeAnalysis(tradeId, ind, ticker) {
  ticker = ticker || '???';
  const reason = generateReason(ind, ticker);
  const analysis = reason;

  // Calculate confidence score based on signal strength
  let confidence = 50;
  if (ind.rsi < 35 || ind.rsi > 65) confidence += 15;
  if (ind.sma20 && ind.sma50 && ind.sma20 > ind.sma50) confidence += 15;
  if (ind.volumeRatio > 1.2) confidence += 10;
  if (ind.sma20 && Math.abs(ind.currentPrice - ind.sma20) / ind.sma20 < 0.02) confidence += 10;
  confidence = Math.min(100, Math.max(0, confidence));

  try {
    await apiPatch('/api/trading/trades', {
      trade_id: tradeId,
      current_price: ind.currentPrice,
      rsi_value: ind.rsi ? parseFloat(ind.rsi.toFixed(1)) : null,
      confidence_score: confidence,
      volume_assessment: ind.volumeRatio > 1.2 ? 'high' : ind.volumeRatio > 0.8 ? 'normal' : 'low',
      tbo_signal: null,
    });
  } catch {}

  try {
    await apiPatch('/api/trading/trades', { trade_id: tradeId, notes: analysis });
  } catch {
    // Non-critical
  }
}

async function journalLog(tradeId, entryType, content) {
  try {
    await apiPost('/api/v1/trading/journal', {
      trade_id: tradeId,
      entry_type: entryType,
      content: content,
    });
    log(`  📓 Journal [${entryType}]: ${content}`);
  } catch (err) {
    log(`  📓 Journal [${entryType}]: ${content} (save failed: ${err.message})`);
  }
}

async function updateLiveBalance(activeTrades, exchange) {
  try {
    // Fetch current prices for all active positions and compute live balance
    const { account } = await apiGet(`/api/v1/portfolio?boardId=${BOARD_ID}`);
    const startingBalance = parseFloat(account?.summary?.paper_balance || 1000);
    
    // Get live prices for active trades
    let unrealizedPnl = 0;
    for (const trade of activeTrades) {
      const entryPrice = parseFloat(trade.entry_price || 0);
      const posSize = parseFloat(trade.position_size || 0);
      if (!entryPrice || !posSize) continue;
      
      const sym = normalizePair(trade.coin_pair || trade.title);
      try {
        const ticker = await exchange.fetchTicker(sym);
        const currentPrice = ticker?.last || 0;
        if (currentPrice > 0) {
          const direction = (trade.direction || 'LONG').toUpperCase();
          const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
          const effectivePnl = direction === 'SHORT' ? -pnlPct : pnlPct;
          unrealizedPnl += (effectivePnl / 100) * posSize;
        }
      } catch {}
    }
    
    // Update portfolio summary with live balance
    const liveBalance = startingBalance + unrealizedPnl;
    log(`💰 Live balance: $${liveBalance.toFixed(2)} (unrealized: ${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)})`);
  } catch (err) {
    log(`  ⚠ Live balance update failed: ${err.message}`);
  }
}

async function updateBotStats(botId, exits, entries, indicators) {
  // Determine market regime from BTC indicators
  let marketRegime = 'ranging';
  let fearGreedIndex = 50;
  const btcInd = indicators?.['BTC/USDT'];
  if (btcInd) {
    if (btcInd.sma20 && btcInd.sma50) {
      if (btcInd.sma20 > btcInd.sma50 && btcInd.momentum > 2) marketRegime = 'bullish';
      else if (btcInd.sma20 < btcInd.sma50 && btcInd.momentum < -2) marketRegime = 'bearish';
    }
    if (btcInd.rsi != null) {
      // Rough fear/greed from RSI: RSI 30=extreme fear, RSI 50=neutral, RSI 70=extreme greed
      fearGreedIndex = Math.round(Math.max(0, Math.min(100, (btcInd.rsi - 20) * 1.25)));
    }
  }
  
  try {
    await apiPatch(`/api/v1/bots/${botId}`, {
      name: BOT_NAME,
      status: 'running',
      performance: {
        last_run: new Date().toISOString(),
        last_exits: exits,
        last_entries: entries,
      },
      metadata: {
        market_regime: marketRegime,
        fear_greed_index: fearGreedIndex,
        risk_level: RISK_LEVEL,
        engine_version: ENGINE_VERSION,
      },
    });
    log(`📈 Bot stats updated (market: ${marketRegime}, fear/greed: ${fearGreedIndex})`);
  } catch (err) {
    log(`  ⚠ Bot stats update failed: ${err.message}`);
  }

  // Update leaderboard with trade stats from closed trades
  try {
    const { trades } = await apiGet(`/api/trading/trades?boardId=${BOARD_ID}&status=closed`);
    const botTrades = trades.filter(t => t.bot_id == botId);
    const wins = botTrades.filter(t => (t.column_name === 'Wins' || t.column_name === 'Closed') && parseFloat(t.pnl_dollar || 0) > 0);
    const totalTrades = botTrades.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    const totalReturn = botTrades.reduce((sum, t) => sum + parseFloat(t.pnl_percent || 0), 0);

    if (totalTrades > 0) {
      await apiPost('/api/v1/leaderboard', {
        bot_id: botId,
        period: 'all-time',
        total_return: totalReturn,
        win_rate: winRate,
        total_trades: totalTrades,
      });
      log(`🏆 Leaderboard updated: ${totalTrades} trades, ${winRate.toFixed(1)}% win rate, ${totalReturn.toFixed(2)}% return`);
    }
  } catch (err) {
    log(`  ⚠ Leaderboard update failed: ${err.message}`);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch(err => {
  log(`❌ Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
