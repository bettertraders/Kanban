#!/usr/bin/env node
/**
 * 🎯 Owen's Position Sentinel
 * Runs every 60s via crontab. Watches ACTIVE positions with tight thresholds.
 * Tighter than general market pulse — these are coins we're HOLDING.
 * Silent when no alerts (cron-friendly).
 *
 * Usage: node scripts/owen-position-sentinel.js
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const PRICES_FILE = path.join(__dirname, '.position-sentinel-prices.json');
const ALERT_FILE = path.join(__dirname, '.position-sentinel-alert.json');
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const CRASH_PRICES_FILE = path.join(__dirname, '.crash-monitor-prices.json');

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  return null;
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadApiKey() {
  try {
    const envFile = fs.readFileSync(path.join(process.env.HOME, '.env.openclaw'), 'utf8');
    const match = envFile.match(/^KANBAN_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {}
  return null;
}

async function fetchActiveTrades(apiKey) {
  const url = 'https://clawdesk.ai/api/trading/trades?boardId=15';
  const resp = await fetch(url, { headers: { 'X-API-Key': apiKey }, signal: AbortSignal.timeout(5000) });
  if (!resp.ok) return [];
  const data = await resp.json();
  const trades = data.trades || [];
  return trades.filter(t => t.column_name === 'Active');
}

function findPriceAt(entries, agoMs) {
  const targetTs = Date.now() - agoMs;
  let best = null;
  for (const e of entries) {
    if (e.ts <= targetTs && (!best || e.ts > best.ts)) best = e;
  }
  return best;
}

function normalizePair(pair) {
  if (!pair) return '';
  pair = pair.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Try common quote currencies
  for (const quote of ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH']) {
    if (pair.endsWith(quote) && pair.length > quote.length) {
      return pair.slice(0, -quote.length) + '/' + quote;
    }
  }
  return pair + '/USDT';
}

async function main() {
  const apiKey = loadApiKey();
  if (!apiKey) return;

  let activeTrades;
  try {
    activeTrades = await fetchActiveTrades(apiKey);
  } catch {
    return; // API down — skip silently
  }

  if (activeTrades.length === 0) return;

  const exchange = new ccxt.binance({ enableRateLimit: false, timeout: 5000 });
  const now = Date.now();
  const store = loadJSON(PRICES_FILE) || { prices: {} };
  const alerts = [];

  // Collect symbols
  const symbolMap = {}; // symbol -> trade info
  for (const t of activeTrades) {
    const sym = normalizePair(t.coin_pair);
    if (!sym) continue;
    symbolMap[sym] = {
      direction: (t.direction || 'LONG').toUpperCase(),
      entryPrice: parseFloat(t.entry_price || 0),
      positionSize: parseFloat(t.position_size || 0),
    };
  }

  const symbols = Object.keys(symbolMap);
  if (symbols.length === 0) return;

  // Fetch all tickers at once
  let tickers;
  try {
    tickers = await exchange.fetchTickers(symbols);
  } catch {
    return; // Binance down — skip silently
  }

  for (const sym of symbols) {
    const ticker = tickers[sym];
    if (!ticker?.last) continue;

    const currentPrice = ticker.last;
    const trade = symbolMap[sym];

    // Update price history
    if (!store.prices[sym]) store.prices[sym] = [];
    store.prices[sym].push({ price: currentPrice, ts: now });
    store.prices[sym] = store.prices[sym].filter(e => now - e.ts <= MAX_AGE_MS);

    // Check 5m price change
    const entry5m = findPriceAt(store.prices[sym], 5 * 60 * 1000);
    if (!entry5m) continue;

    const change5m = ((currentPrice - entry5m.price) / entry5m.price) * 100;

    // Direction-aware thresholds
    const isLong = trade.direction === 'LONG';
    const adverseChange = isLong ? change5m : -change5m; // negative = bad for us

    // Position P&L
    const pnlPercent = trade.entryPrice > 0
      ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * (isLong ? 1 : -1)
      : 0;

    const coin = sym.replace('/USDT', '');

    // Check danger (3%)
    if (adverseChange <= -3) {
      const dirWord = isLong ? 'dropping' : 'pumping against short';
      alerts.push({
        symbol: sym,
        direction: trade.direction,
        level: 'danger',
        change5m: Math.round(change5m * 100) / 100,
        currentPrice,
        entryPrice: trade.entryPrice,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        message: `${coin} ${dirWord} — ${Math.abs(change5m).toFixed(1)}% in 5min, total P&L now ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`,
      });
    }
    // Check alert (1.5%)
    else if (adverseChange <= -1.5) {
      const dirWord = isLong ? 'dropping' : 'pumping against short';
      alerts.push({
        symbol: sym,
        direction: trade.direction,
        level: 'alert',
        change5m: Math.round(change5m * 100) / 100,
        currentPrice,
        entryPrice: trade.entryPrice,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        message: `${coin} ${dirWord} — ${Math.abs(change5m).toFixed(1)}% in 5min, total P&L now ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`,
      });
    }

    // Volume spike detection
    try {
      const volume24h = ticker.quoteVolume || 0;
      // Compare against crash monitor price history for recent volume baseline
      const crashStore = loadJSON(CRASH_PRICES_FILE);
      if (crashStore?.prices?.[sym] && crashStore.prices[sym].length > 5) {
        // Use ticker baseVolume as current signal, compare to 24h average per-minute
        const avgVolumePerMin = volume24h / 1440; // 24h spread across minutes
        const recentVolume = ticker.baseVolume || 0;
        // If last price is available in multiple entries within 5 min, estimate recent activity
        const recentEntries = store.prices[sym].filter(e => now - e.ts <= 5 * 60 * 1000);
        if (recentEntries.length > 2) {
          // Price volatility as volume proxy when direct per-candle volume unavailable
          const priceRange = Math.max(...recentEntries.map(e => e.price)) - Math.min(...recentEntries.map(e => e.price));
          const rangePercent = (priceRange / currentPrice) * 100;
          // High volatility + high volume = something's happening
          if (rangePercent > 1.5 && volume24h > 0) {
            // Check if 24h volume is abnormally high (use ticker info)
            // fetchTicker gives us percentage — if available
            if (ticker.percentage && Math.abs(ticker.percentage) > 5) {
              alerts.push({
                symbol: sym,
                direction: trade.direction,
                level: 'volume_spike',
                change5m: Math.round(change5m * 100) / 100,
                currentPrice,
                entryPrice: trade.entryPrice,
                pnlPercent: Math.round(pnlPercent * 100) / 100,
                message: `${coin} volume spike detected — high volatility (${rangePercent.toFixed(1)}% range in 5min) on active position`,
              });
            }
          }
        }
      }
    } catch {}
  }

  // Save updated prices
  saveJSON(PRICES_FILE, store);

  if (alerts.length === 0) return; // Silent

  // Write alert file
  const alertData = {
    timestamp: now,
    alerts,
  };
  saveJSON(ALERT_FILE, alertData);

  // Log to stdout
  for (const a of alerts) {
    const emoji = a.level === 'danger' ? '🔴' : a.level === 'volume_spike' ? '📊' : '⚠️';
    console.log(`[PositionSentinel] ${emoji} ${a.level.toUpperCase()}: ${a.message}`);
  }
}

main().catch(() => {
  // Never crash — cron must stay clean
});
