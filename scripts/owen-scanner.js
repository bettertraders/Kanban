#!/usr/bin/env node
/**
 * 🦉 Owen's Smart Scanner
 * Scans ALL USDT pairs on Binance, ranks by opportunity, outputs top 25.
 * Standalone — no API key needed (public endpoints only).
 *
 * Usage: node scripts/owen-scanner.js
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const MIN_VOLUME_USD = 1_000_000;
const OHLCV_TIMEFRAME = '4h';
const OHLCV_LIMIT = 60;
const RATE_LIMIT_MS = 100;
const STABLECOINS = ['USDC', 'BUSD', 'DAI', 'TUSD', 'FDUSD', 'USDP', 'USDD', 'PYUSD', 'EURI', 'AEUR', 'EUR'];
const CORE_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
const HEDGE_SYMBOL = 'PAXG/USDT';
const OUTPUT_PATH = path.join(__dirname, '.owen-scanner-results.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (msg) => console.log(`[Owen] ${msg}`);

// ─── Indicators ──────────────────────────────────────────────────────────────

function calcATR(candles) {
  if (candles.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i][2], low = candles[i][3], prevClose = candles[i - 1][4];
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += tr;
  }
  return sum / (candles.length - 1);
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcSMA(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreVolume(vol) {
  if (vol >= 100_000_000) return 25;
  if (vol >= 50_000_000) return 20;
  if (vol >= 20_000_000) return 15;
  if (vol >= 5_000_000) return 10;
  return 5;
}

function scoreVolatility(atrPct) {
  if (atrPct >= 3 && atrPct <= 8) return 25;
  if (atrPct > 1 && atrPct < 3) return 15;
  if (atrPct > 8) return 10;
  return 5;
}

function scoreTechnical(rsi, close, sma20, volumeRatio, sma7, sma20prev, sma7prev) {
  let s = 0;
  if (rsi < 35 || rsi > 65) s += 10;
  if (sma20 && Math.abs(close - sma20) / sma20 <= 0.03) s += 5;
  // SMA crossover forming: SMA7 crossing above SMA20
  if (sma7 && sma20 && sma7prev && sma20prev) {
    if (sma7prev <= sma20prev && sma7 > sma20) s += 5;
    if (sma7prev >= sma20prev && sma7 < sma20) s += 5;
  }
  if (volumeRatio > 1.3) s += 5;
  return Math.min(s, 25);
}

function scoreMomentum(closes) {
  let s = 0;
  if (closes.length >= 11) {
    const mom10 = (closes[closes.length - 1] - closes[closes.length - 11]) / closes[closes.length - 11] * 100;
    if (Math.abs(mom10) > 5) s += 15;
    else if (Math.abs(mom10) > 3) s += 10;
  }
  if (closes.length >= 2) {
    const mom1 = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2] * 100;
    if (Math.abs(mom1) > 3) s += 10;
  }
  return Math.min(s, 25);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const exchange = new ccxt.binance({ enableRateLimit: false });

  log('Fetching all markets...');
  await exchange.loadMarkets();

  // Get all USDT spot pairs
  const allUSDT = Object.values(exchange.markets).filter(m =>
    m.quote === 'USDT' && m.spot && m.active
  );
  const totalScanned = allUSDT.length;
  log(`Found ${totalScanned} USDT pairs`);

  // Filter stablecoins
  const noStables = allUSDT.filter(m => !STABLECOINS.includes(m.base));

  // Fetch tickers for volume filter
  log('Fetching tickers...');
  const tickers = await exchange.fetchTickers(noStables.map(m => m.symbol));

  // Filter by volume
  const viable = noStables.filter(m => {
    const t = tickers[m.symbol];
    return t && t.quoteVolume && t.quoteVolume >= MIN_VOLUME_USD;
  });
  log(`${viable.length} pairs above $1M volume (filtered ${noStables.length - viable.length})`);

  // Ensure core + hedge are included
  const symbolSet = new Set(viable.map(m => m.symbol));
  const ensureSymbols = [...CORE_SYMBOLS, HEDGE_SYMBOL];
  for (const sym of ensureSymbols) {
    if (!symbolSet.has(sym) && exchange.markets[sym]) {
      viable.push(exchange.markets[sym]);
      symbolSet.add(sym);
    }
  }

  // Fetch OHLCV and score each
  const results = [];
  log(`Scanning ${viable.length} coins (this takes ~${Math.round(viable.length * RATE_LIMIT_MS / 1000)}s)...`);

  for (let i = 0; i < viable.length; i++) {
    const market = viable[i];
    const sym = market.symbol;
    try {
      const candles = await exchange.fetchOHLCV(sym, OHLCV_TIMEFRAME, undefined, OHLCV_LIMIT);
      if (!candles || candles.length < 20) { await sleep(RATE_LIMIT_MS); continue; }

      const closes = candles.map(c => c[4]);
      const volumes = candles.map(c => c[5]);
      const lastClose = closes[closes.length - 1];
      const ticker = tickers[sym] || {};
      const vol24h = ticker.quoteVolume || 0;

      const atr = calcATR(candles);
      const atrPct = lastClose > 0 ? (atr / lastClose) * 100 : 0;
      const rsi = calcRSI(closes);
      const sma20 = calcSMA(closes, 20);
      const sma7 = calcSMA(closes, 7);
      const sma20prev = closes.length >= 21 ? calcSMA(closes.slice(0, -1), 20) : null;
      const sma7prev = closes.length >= 8 ? calcSMA(closes.slice(0, -1), 7) : null;

      // Volume ratio: last candle vol / avg vol
      const avgVol = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
      const volumeRatio = avgVol > 0 ? volumes[volumes.length - 1] / avgVol : 1;

      const mom10 = closes.length >= 11
        ? (closes[closes.length - 1] - closes[closes.length - 11]) / closes[closes.length - 11] * 100
        : 0;

      const vScore = scoreVolume(vol24h);
      const volScore = scoreVolatility(atrPct);
      const tScore = scoreTechnical(rsi, lastClose, sma20, volumeRatio, sma7, sma20prev, sma7prev);
      const mScore = scoreMomentum(closes);
      const score = vScore + volScore + tScore + mScore;

      results.push({
        symbol: sym,
        score,
        volume24h: Math.round(vol24h),
        atrPct: Math.round(atrPct * 100) / 100,
        rsi: Math.round(rsi * 10) / 10,
        momentum: Math.round(mom10 * 100) / 100,
        reason: '',
        _isCore: CORE_SYMBOLS.includes(sym),
        _isHedge: sym === HEDGE_SYMBOL,
      });

      if ((i + 1) % 25 === 0) log(`  ${i + 1}/${viable.length} scanned...`);
    } catch (e) {
      // Skip failed symbols silently
    }
    await sleep(RATE_LIMIT_MS);
  }

  log(`Scored ${results.length} coins`);

  // Generate reasons
  for (const r of results) {
    const parts = [];
    if (r._isCore) parts.push('Core holding');
    if (r._isHedge) parts.push('Gold hedge');
    if (r.volume24h >= 100_000_000) parts.push('mega volume');
    else if (r.volume24h >= 20_000_000) parts.push('strong volume');
    if (r.atrPct >= 3 && r.atrPct <= 8) parts.push('ideal volatility');
    else if (r.atrPct > 8) parts.push('high volatility');
    if (r.rsi < 35) parts.push('oversold');
    else if (r.rsi > 65) parts.push('overbought momentum');
    if (Math.abs(r.momentum) > 5) parts.push(`${r.momentum > 0 ? '+' : ''}${r.momentum}% move`);
    r.reason = parts.join(', ') || 'Solid technicals';
  }

  // Build watchlist: core first, then top 21, hedge last
  const core = results.filter(r => r._isCore).sort((a, b) => b.score - a.score);
  const hedge = results.find(r => r._isHedge);
  const rest = results
    .filter(r => !r._isCore && !r._isHedge)
    .sort((a, b) => b.score - a.score)
    .slice(0, 21);

  const watchlist = [...core, ...rest];
  if (hedge) watchlist.push(hedge);

  // Clean internal fields
  for (const item of watchlist) {
    delete item._isCore;
    delete item._isHedge;
  }

  const output = {
    timestamp: Date.now(),
    totalScanned,
    filteredByVolume: viable.length,
    watchlist,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  log(`✅ Saved ${watchlist.length} coins to ${OUTPUT_PATH}`);

  // Print summary
  console.log('\n🦉 Owen\'s Top 25 Watchlist:');
  console.log('─'.repeat(80));
  watchlist.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${c.symbol.padEnd(14)} Score: ${String(c.score).padStart(3)}  Vol: $${(c.volume24h / 1e6).toFixed(1)}M  ATR: ${c.atrPct}%  RSI: ${c.rsi}  ${c.reason}`);
  });
}

main().catch(e => { console.error('[Owen] Fatal:', e.message); process.exit(1); });
