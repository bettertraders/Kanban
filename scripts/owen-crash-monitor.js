#!/usr/bin/env node
/**
 * 📡 Owen's Market Pulse Monitor
 * Runs every 60s via crontab. Detects extreme moves in BOTH directions.
 * Crashes = protect capital. Breakouts = catch opportunity.
 * Silent when no alerts (cron-friendly).
 *
 * Usage: node scripts/owen-crash-monitor.js
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const PRICES_FILE = path.join(__dirname, '.crash-monitor-prices.json');
const ALERT_FILE = path.join(__dirname, '.crash-alert.json');
const SCANNER_FILE = path.join(__dirname, '.owen-scanner-results.json');
const CORE_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  return null;
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getWatchlistSymbols() {
  const symbols = new Set(CORE_SYMBOLS);
  const scanner = loadJSON(SCANNER_FILE);
  if (scanner?.watchlist) {
    for (const c of scanner.watchlist) {
      if (c.symbol) symbols.add(c.symbol);
    }
  }
  return [...symbols];
}

function findPriceAt(entries, agoMs) {
  const targetTs = Date.now() - agoMs;
  let best = null;
  for (const e of entries) {
    if (e.ts <= targetTs) {
      if (!best || e.ts > best.ts) best = e;
    }
  }
  return best;
}

function classifyMove(sym, change5m, change15m) {
  const isBTC = sym === 'BTC/USDT';

  // ── DOWNWARD (crashes) ──
  if (isBTC && change5m !== null && change5m <= -5) {
    return { level: 'flash_crash', direction: 'down' };
  }
  if ((change15m !== null && change15m <= -5) || (isBTC && change15m !== null && change15m <= -3)) {
    return { level: 'crash', direction: 'down' };
  }
  if (isBTC && change5m !== null && change5m <= -3) {
    return { level: 'crash', direction: 'down' };
  }
  if ((change5m !== null && change5m <= -3) || (isBTC && change5m !== null && change5m <= -2)) {
    return { level: 'alert', direction: 'down' };
  }

  // ── UPWARD (breakouts) ──
  if (isBTC && change5m !== null && change5m >= 5) {
    return { level: 'mega_breakout', direction: 'up' };
  }
  if ((change15m !== null && change15m >= 5) || (isBTC && change15m !== null && change15m >= 3)) {
    return { level: 'breakout', direction: 'up' };
  }
  if (isBTC && change5m !== null && change5m >= 3) {
    return { level: 'breakout', direction: 'up' };
  }
  if ((change5m !== null && change5m >= 3) || (isBTC && change5m !== null && change5m >= 2)) {
    return { level: 'alert', direction: 'up' };
  }

  return null;
}

// Severity ranking for picking the worst/best alert
const SEVERITY = { alert: 0, crash: 1, breakout: 1, flash_crash: 2, mega_breakout: 2 };

async function main() {
  const symbols = getWatchlistSymbols();
  const exchange = new ccxt.binance({ enableRateLimit: false, timeout: 5000 });

  let tickers;
  try {
    tickers = await exchange.fetchTickers(symbols);
  } catch {
    return; // Binance down — skip silently
  }

  const now = Date.now();
  const store = loadJSON(PRICES_FILE) || { prices: {} };

  for (const sym of symbols) {
    const last = tickers[sym]?.last;
    if (!last) continue;
    if (!store.prices[sym]) store.prices[sym] = [];
    store.prices[sym].push({ price: last, ts: now });
    store.prices[sym] = store.prices[sym].filter(e => now - e.ts <= MAX_AGE_MS);
  }
  saveJSON(PRICES_FILE, store);

  // Analyze moves in both directions
  const alerts = [];

  for (const sym of symbols) {
    const entries = store.prices[sym];
    if (!entries || entries.length < 2) continue;

    const currentPrice = entries[entries.length - 1].price;
    const entry5m = findPriceAt(entries, 5 * 60 * 1000);
    const entry15m = findPriceAt(entries, 15 * 60 * 1000);

    const change5m = entry5m ? ((currentPrice - entry5m.price) / entry5m.price) * 100 : null;
    const change15m = entry15m ? ((currentPrice - entry15m.price) / entry15m.price) * 100 : null;

    const classification = classifyMove(sym, change5m, change15m);
    if (classification) {
      alerts.push({
        symbol: sym,
        change5m: change5m !== null ? Math.round(change5m * 100) / 100 : null,
        change15m: change15m !== null ? Math.round(change15m * 100) / 100 : null,
        currentPrice,
        ...classification,
      });
    }
  }

  if (alerts.length === 0) return; // Silent

  // Separate by direction — could have both crash and breakout simultaneously
  const downAlerts = alerts.filter(a => a.direction === 'down');
  const upAlerts = alerts.filter(a => a.direction === 'up');

  // Pick highest severity across all alerts
  let maxSeverity = 0;
  let maxLevel = 'alert';
  let maxDirection = 'down';
  for (const a of alerts) {
    const s = SEVERITY[a.level] || 0;
    if (s > maxSeverity) {
      maxSeverity = s;
      maxLevel = a.level;
      maxDirection = a.direction;
    }
  }

  // Build message
  const msgParts = alerts.map(a => {
    const changeStr = a.change15m !== null && Math.abs(a.change15m) > Math.abs(a.change5m || 0)
      ? `${a.change15m > 0 ? '+' : ''}${a.change15m}% in 15m`
      : `${a.change5m > 0 ? '+' : ''}${a.change5m}% in 5m`;
    return `${a.symbol.replace('/USDT', '')} ${changeStr}`;
  });
  const message = msgParts.join('. ') + '.';

  // Yellow alerts (either direction) — log only
  if (maxSeverity === 0) {
    const dirEmoji = maxDirection === 'up' ? '🟡📈' : '⚠️📉';
    console.log(`[MarketPulse] ${dirEmoji} ALERT: ${message}`);
    return;
  }

  // Significant event — write alert file
  const actionableAlerts = alerts.filter(a => SEVERITY[a.level] >= 1);
  const alertData = {
    level: maxLevel,
    direction: maxDirection,
    timestamp: now,
    coins: actionableAlerts.map(a => ({
      symbol: a.symbol,
      change5m: a.change5m,
      change15m: a.change15m,
      currentPrice: a.currentPrice,
    })),
    message,
  };

  saveJSON(ALERT_FILE, alertData);

  const emojiMap = {
    crash: '🔴📉',
    flash_crash: '🔴🔴🔴📉',
    breakout: '🟢📈',
    mega_breakout: '🟢🟢🟢📈',
  };
  console.log(`[MarketPulse] ${emojiMap[maxLevel] || '⚠️'} ${maxLevel.toUpperCase()}: ${message}`);
}

main().catch(() => {
  // Never crash — cron must stay clean
});
