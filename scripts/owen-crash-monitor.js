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
const STATE_FILE = path.join(__dirname, '.crash-monitor-state.json');
const MACRO_FILE = path.join(__dirname, '.owen-macro-pulse.json');
const TRIGGER_FILE = path.join(__dirname, '.owen-scanner-trigger.json');
const CORE_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const ALL_CLEAR_MS = 15 * 60 * 1000;

const SEVERITY_ORDER = { alert: 1, crash: 2, flash_crash: 3, rally: 1, breakout: 2, mega_breakout: 3 };

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  return null;
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

function loadMacroThresholdMultiplier() {
  const macro = loadJSON(MACRO_FILE);
  if (macro?.fearGreed !== undefined && macro.fearGreed < 15) {
    return 0.8; // Tighten DOWN thresholds by 20%
  }
  return 1.0;
}

function classifyMove(sym, change5m, change15m, thresholdMult) {
  const isBTC = sym === 'BTC/USDT';
  const m = thresholdMult; // multiplier for down thresholds

  // ── DOWNWARD (crashes) ──
  if (isBTC && change5m !== null && change5m <= -5 * m) {
    return { level: 'flash_crash', direction: 'down' };
  }
  if ((change15m !== null && change15m <= -5 * m) || (isBTC && change15m !== null && change15m <= -3 * m)) {
    return { level: 'crash', direction: 'down' };
  }
  if (isBTC && change5m !== null && change5m <= -3 * m) {
    return { level: 'crash', direction: 'down' };
  }
  if ((change5m !== null && change5m <= -3 * m) || (isBTC && change5m !== null && change5m <= -2 * m)) {
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

function shouldFireAlert(sym, level, dedupState) {
  const now = Date.now();
  const key = sym;
  const lastAlerts = dedupState.lastAlerts || {};
  const coinAlerts = lastAlerts[key] || {};
  const lastTs = coinAlerts[level] || 0;
  const lastSeverity = coinAlerts._lastSeverity || 0;
  const currentSeverity = SEVERITY_ORDER[level] || 0;

  // Escalation override: if severity increased, fire immediately
  if (currentSeverity > lastSeverity) return true;

  // Same-level cooldown: don't repeat within 30 minutes
  if (now - lastTs < ALERT_COOLDOWN_MS) return false;

  return true;
}

function recordAlert(sym, level, dedupState) {
  const now = Date.now();
  if (!dedupState.lastAlerts) dedupState.lastAlerts = {};
  if (!dedupState.lastAlerts[sym]) dedupState.lastAlerts[sym] = {};
  dedupState.lastAlerts[sym][level] = now;
  dedupState.lastAlerts[sym]._lastSeverity = SEVERITY_ORDER[level] || 0;
  dedupState.lastAlerts[sym]._lastAlertTime = now;
}

function checkAllClear(dedupState) {
  const now = Date.now();
  const allClears = [];
  const lastAlerts = dedupState.lastAlerts || {};

  for (const [sym, data] of Object.entries(lastAlerts)) {
    if (data._cleared) continue;
    const lastAlertTime = data._lastAlertTime || 0;
    if (lastAlertTime > 0 && now - lastAlertTime >= ALL_CLEAR_MS) {
      allClears.push(sym);
      data._cleared = true;
    }
  }
  return allClears;
}

async function main() {
  const symbols = getWatchlistSymbols();
  const exchange = new ccxt.binance({ enableRateLimit: false, timeout: 5000 });
  const thresholdMult = loadMacroThresholdMultiplier();

  let tickers;
  try {
    tickers = await exchange.fetchTickers(symbols);
  } catch {
    return; // Binance down — skip silently
  }

  const now = Date.now();
  const store = loadJSON(PRICES_FILE) || { prices: {} };
  const dedupState = loadJSON(STATE_FILE) || { lastAlerts: {} };

  for (const sym of symbols) {
    const last = tickers[sym]?.last;
    if (!last) continue;
    if (!store.prices[sym]) store.prices[sym] = [];
    store.prices[sym].push({ price: last, ts: now });
    store.prices[sym] = store.prices[sym].filter(e => now - e.ts <= MAX_AGE_MS);
  }
  atomicWrite(PRICES_FILE, store);

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

    const classification = classifyMove(sym, change5m, change15m, thresholdMult);
    if (classification) {
      // Alert deduplication
      if (!shouldFireAlert(sym, classification.level, dedupState)) continue;

      // Reset cleared state since we have a new alert
      if (dedupState.lastAlerts[sym]) dedupState.lastAlerts[sym]._cleared = false;

      recordAlert(sym, classification.level, dedupState);

      alerts.push({
        symbol: sym,
        change5m: change5m !== null ? Math.round(change5m * 100) / 100 : null,
        change15m: change15m !== null ? Math.round(change15m * 100) / 100 : null,
        currentPrice,
        ...classification,
      });
    }
  }

  // Check for all-clear signals
  const allClears = checkAllClear(dedupState);
  if (allClears.length > 0 && alerts.length === 0) {
    const allClearData = {
      level: 'all_clear',
      direction: 'neutral',
      timestamp: now,
      coins: allClears.map(sym => ({ symbol: sym })),
      message: `All clear: ${allClears.map(s => s.replace('/USDT', '')).join(', ')} normalized.`,
    };
    atomicWrite(ALERT_FILE, allClearData);
    console.log(`[MarketPulse] ✅ ALL CLEAR: ${allClearData.message}`);
  }

  // Save dedup state
  atomicWrite(STATE_FILE, dedupState);

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

  atomicWrite(ALERT_FILE, alertData);

  // Cross-module: trigger scanner rescan on crash/breakout
  atomicWrite(TRIGGER_FILE, { trigger: 'crash_alert', timestamp: Date.now() });

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
