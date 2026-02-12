#!/usr/bin/env node
/**
 * 🎯 Owen Sentinel v2 — Simulated Exchange
 * 
 * Long-running process (launchd). Checks every 10 seconds.
 * Two jobs:
 *   1. Active trades → check TP/SL/trailing stops → execute exits
 *   2. Analyzing trades → check entry conditions → promote to Active
 * 
 * Zero AI cost. Pure Node.js + Binance price API + ClawDesk API.
 * Replaces the old 60-second cron sentinel.
 * 
 * Usage: node scripts/owen-sentinel-v2.js
 */

const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 10_000; // 10 seconds
const API_BASE = 'https://clawdesk.ai';
const BOARD_ID = 15;
const BINANCE_TICKER_URL = 'https://api.binance.com/api/v3/ticker/price';
const STATE_FILE = path.join(__dirname, '.sentinel-v2-state.json');
const ALERT_FILE = path.join(__dirname, '.position-sentinel-alert.json');
const SCANNER_FILE = path.join(__dirname, '.owen-scanner-results.json');
const ENGINE_STATE_FILE = path.join(__dirname, '.trading-engine-state.json');

const STOP_LOSS_PCT = 5;
const TAKE_PROFIT_PCT = 10;
const MAX_POSITIONS = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] [Sentinel] ${msg}`);
}

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  return null;
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function loadApiKey() {
  try {
    const envFile = fs.readFileSync(path.join(process.env.HOME, '.env.openclaw'), 'utf8');
    const match = envFile.match(/^KANBAN_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {}
  return null;
}

const API_KEY = loadApiKey();
if (!API_KEY) { console.error('No KANBAN_API_KEY found'); process.exit(1); }

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function apiFetch(endpoint) {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'X-API-Key': API_KEY },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`API ${endpoint} → ${resp.status}`);
  return resp.json();
}

async function apiPost(endpoint, body) {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`POST ${endpoint} → ${resp.status}`);
  return resp.json();
}

async function apiPatch(endpoint, body) {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`PATCH ${endpoint} → ${resp.status}`);
  return resp.json();
}

// ─── Binance All Prices (single request) ─────────────────────────────────────

async function fetchAllPrices() {
  const resp = await fetch(BINANCE_TICKER_URL, { signal: AbortSignal.timeout(5000) });
  if (!resp.ok) throw new Error(`Binance ticker → ${resp.status}`);
  const data = await resp.json();
  const prices = {};
  for (const t of data) {
    // Convert BTCUSDT → BTC/USDT
    const sym = t.symbol;
    // Only care about USDT pairs
    if (sym.endsWith('USDT')) {
      const base = sym.slice(0, -4);
      prices[`${base}/USDT`] = parseFloat(t.price);
    }
  }
  return prices;
}

// ─── Fetch Trades from Board ─────────────────────────────────────────────────

async function fetchTrades() {
  const data = await apiFetch(`/api/trading/trades?boardId=${BOARD_ID}`);
  return data.trades || [];
}

// ─── P&L Calculation ─────────────────────────────────────────────────────────

function calcPnl(entryPrice, currentPrice, direction) {
  const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  return direction === 'short' ? -pnlPct : pnlPct;
}

// ─── Exit Logic (mirrors trading-engine.js) ──────────────────────────────────

function checkExit(trade, currentPrice) {
  const entryPrice = parseFloat(trade.entry_price);
  if (!entryPrice || entryPrice <= 0 || !currentPrice) return null;

  const direction = (trade.direction || 'LONG').toLowerCase();
  const effectivePnl = calcPnl(entryPrice, currentPrice, direction);
  const positionSize = parseFloat(trade.position_size || 0);
  const pnlDollar = (effectivePnl / 100) * positionSize;

  // Parse metadata for trailing stops
  const meta = typeof trade.metadata === 'string' 
    ? JSON.parse(trade.metadata || '{}') 
    : (trade.metadata || {});

  // ATR-based dynamic stop (use stored ATR or default 3%)
  const storedAtr = meta.atr || (entryPrice * 0.03);
  const atrPct = (storedAtr / entryPrice) * 100;
  const dynamicSL = Math.max(2, Math.min(8, atrPct * 2));

  // ATR profit multiple
  const atrProfitMultiple = (effectivePnl / 100 * entryPrice) / storedAtr;

  // ── TRAILING STOP ──
  let trailingStopPrice = meta.trailingStopPrice || null;
  let trailingStopStage = meta.trailingStopStage || 0;
  let trailingUpdated = false;

  let newStage = trailingStopStage;
  if (atrProfitMultiple >= 3) newStage = 3;
  else if (atrProfitMultiple >= 2) newStage = 2;
  else if (atrProfitMultiple >= 1.5) newStage = 1;

  if (newStage > trailingStopStage || (newStage >= 1 && trailingStopPrice === null)) {
    trailingStopStage = newStage;
    trailingUpdated = true;
  }

  if (trailingStopStage >= 1) {
    let newStop;
    if (trailingStopStage >= 3) {
      newStop = direction === 'short'
        ? currentPrice + storedAtr * 0.75
        : currentPrice - storedAtr * 0.75;
    } else if (trailingStopStage >= 2) {
      newStop = direction === 'short'
        ? currentPrice + storedAtr
        : currentPrice - storedAtr;
    } else {
      newStop = entryPrice; // breakeven
    }

    if (trailingStopPrice === null) {
      trailingStopPrice = newStop;
      trailingUpdated = true;
    } else if (direction === 'short') {
      if (newStop < trailingStopPrice) { trailingStopPrice = newStop; trailingUpdated = true; }
    } else {
      if (newStop > trailingStopPrice) { trailingStopPrice = newStop; trailingUpdated = true; }
    }

    const trailingHit = direction === 'short'
      ? currentPrice >= trailingStopPrice
      : currentPrice <= trailingStopPrice;

    if (trailingHit) {
      return {
        exit: true,
        reason: `Trailing stop hit (stage ${trailingStopStage}, stop=$${trailingStopPrice.toFixed(2)}, PnL=${effectivePnl.toFixed(1)}%)`,
        win: effectivePnl > 0,
        pnlPercent: effectivePnl,
        pnlDollar,
        metadataUpdates: { trailingStopPrice, trailingStopStage },
      };
    }
  }

  // ── HARD STOP LOSS ──
  if (effectivePnl <= -dynamicSL) {
    return {
      exit: true,
      reason: `Stop loss hit (${effectivePnl.toFixed(1)}%, limit -${dynamicSL.toFixed(1)}%)`,
      win: false,
      pnlPercent: effectivePnl,
      pnlDollar,
      metadataUpdates: trailingUpdated ? { trailingStopPrice, trailingStopStage } : null,
    };
  }

  // ── TAKE PROFIT ──
  if (effectivePnl >= TAKE_PROFIT_PCT) {
    return {
      exit: true,
      reason: `Take profit hit (+${effectivePnl.toFixed(1)}%)`,
      win: true,
      pnlPercent: effectivePnl,
      pnlDollar,
      metadataUpdates: trailingUpdated ? { trailingStopPrice, trailingStopStage } : null,
    };
  }

  // ── PARTIAL PROFIT (2× ATR) ──
  if (!meta.partialExitTaken && atrProfitMultiple >= 2) {
    const currentSize = parseFloat(trade.position_size || 0);
    if (currentSize > 0) {
      return {
        exit: false,
        partial: true,
        newPositionSize: currentSize * 0.5,
        pnlPercent: effectivePnl,
        reason: `Partial profit at +${effectivePnl.toFixed(1)}% (2× ATR)`,
        metadataUpdates: {
          partialExitTaken: true,
          partialExitPrice: currentPrice,
          partialExitPnl: effectivePnl.toFixed(2),
          ...(trailingUpdated ? { trailingStopPrice, trailingStopStage } : {}),
        },
      };
    }
  }

  // Update trailing stop metadata if changed (no exit)
  if (trailingUpdated) {
    return {
      exit: false,
      metadataUpdates: { trailingStopPrice, trailingStopStage },
    };
  }

  return null;
}

// ─── Entry Logic for Analyzing Coins ─────────────────────────────────────────
// Simplified: if Owen scanner gave it a score and it's in Analyzing, check if
// the price is favorable relative to what was set as entry conditions.

function checkEntry(trade, currentPrice) {
  if (!currentPrice) return null;

  const meta = typeof trade.metadata === 'string'
    ? JSON.parse(trade.metadata || '{}')
    : (trade.metadata || {});

  // Need a target entry price or strategy stored in metadata
  const targetEntry = meta.targetEntryPrice || parseFloat(trade.entry_price);
  const direction = (meta.direction || trade.direction || 'LONG').toUpperCase();
  const strategy = meta.entry_reason || meta.strategy || '';

  if (!targetEntry || targetEntry <= 0) return null;

  // For LONG: price must be at or below target (buy the dip)
  // For SHORT: price must be at or above target (sell the rip)
  let triggered = false;
  if (direction === 'LONG' && currentPrice <= targetEntry) {
    triggered = true;
  } else if (direction === 'SHORT' && currentPrice >= targetEntry) {
    triggered = true;
  }

  // Also trigger if price moved >1% in our favor past the target
  // (in case we set the target and price already blew past it)
  if (!triggered) {
    const diff = direction === 'LONG'
      ? (targetEntry - currentPrice) / targetEntry * 100
      : (currentPrice - targetEntry) / targetEntry * 100;
    // If price is within 0.5% of target, also trigger (close enough)
    if (diff > -0.5 && diff < 2) triggered = true;
  }

  if (triggered) {
    return {
      enter: true,
      direction,
      entryPrice: currentPrice,
      strategy,
      reason: `Entry triggered at $${currentPrice.toFixed(currentPrice > 100 ? 2 : 6)} (target: $${targetEntry.toFixed(targetEntry > 100 ? 2 : 6)})`,
    };
  }

  return null;
}

// ─── Execute Exit ────────────────────────────────────────────────────────────

async function executeExit(trade, result, currentPrice) {
  const sym = trade.coin_pair || 'UNKNOWN';
  const posSize = parseFloat(trade.position_size || 0);
  
  try {
    // Call exit endpoint
    await apiPost('/api/trading/trade/exit', { trade_id: trade.id });
  } catch (err) {
    // If exit endpoint fails, do it manually via PATCH
    log(`  ⚠ Exit endpoint failed (${err.message}), using PATCH fallback`);
  }

  // Move to Closed
  const targetCol = 'Closed';
  try {
    await apiPatch('/api/trading/trades', {
      trade_id: trade.id,
      column_name: targetCol,
      exit_price: currentPrice,
      pnl_percent: result.pnlPercent,
      pnl_dollar: result.pnlDollar,
      current_price: currentPrice,
      notes: `${trade.notes || ''}\n🎯 Sentinel exit: ${result.reason}`.trim(),
    });
  } catch (err) {
    log(`  ⚠ Failed to move trade ${trade.id} to ${targetCol}: ${err.message}`);
  }

  // Update metadata if needed
  if (result.metadataUpdates) {
    try {
      const existing = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
      await apiPatch('/api/trading/trades', {
        trade_id: trade.id,
        metadata: JSON.stringify({ ...existing, ...result.metadataUpdates, exitedBySentinel: true }),
      });
    } catch {}
  }

  log(`🚪 EXIT ${sym} ${trade.direction} → ${targetCol} | PnL: ${result.pnlPercent >= 0 ? '+' : ''}${result.pnlPercent.toFixed(2)}% ($${result.pnlDollar.toFixed(2)}) | ${result.reason}`);

  // Re-queue coin to Analyzing so engine can evaluate re-entry
  try {
    await apiPost('/api/trading/trades', {
      board_id: BOARD_ID,
      coin_pair: sym,
      column_name: 'Analyzing',
      status: 'analyzing',
      notes: `♻️ Re-queued after ${result.pnlPercent >= 0 ? 'win' : 'loss'} (${result.reason}). Watching for new entry.`,
    });
    log(`  ♻️ ${sym} re-queued to Analyzing`);
  } catch (err) {
    log(`  ⚠ Failed to re-queue ${sym}: ${err.message}`);
  }
}

// ─── Execute Partial Exit ────────────────────────────────────────────────────

async function executePartial(trade, result) {
  const sym = trade.coin_pair || 'UNKNOWN';
  try {
    const existing = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
    await apiPatch('/api/trading/trades', {
      trade_id: trade.id,
      position_size: result.newPositionSize,
      metadata: JSON.stringify({ ...existing, ...result.metadataUpdates }),
    });
    log(`💰 PARTIAL ${sym} — took 50% profit at +${result.pnlPercent.toFixed(1)}%, size now $${result.newPositionSize.toFixed(2)}`);
  } catch (err) {
    log(`⚠ Partial exit failed for ${sym}: ${err.message}`);
  }
}

// ─── Execute Entry ───────────────────────────────────────────────────────────

async function executeEntry(trade, result, activeCount) {
  if (activeCount >= MAX_POSITIONS) return; // At capacity

  const sym = trade.coin_pair || 'UNKNOWN';
  try {
    // Calculate SL/TP (default 3% ATR if no stored value)
    const existing = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
    const atrVal = existing.atr || (result.entryPrice * 0.03);
    const atrPct = (atrVal / result.entryPrice) * 100;
    const slPct = Math.max(2, Math.min(8, atrPct * 2));
    const tpPct = Math.max(5, Math.min(15, atrPct * 3));
    const slPrice = result.direction === 'SHORT'
      ? result.entryPrice * (1 + slPct / 100)
      : result.entryPrice * (1 - slPct / 100);
    const tpPrice = result.direction === 'SHORT'
      ? result.entryPrice * (1 - tpPct / 100)
      : result.entryPrice * (1 + tpPct / 100);

    await apiPatch('/api/trading/trades', {
      trade_id: trade.id,
      column_name: 'Active',
      direction: result.direction,
      entry_price: result.entryPrice,
      current_price: result.entryPrice,
      stop_loss: slPrice,
      take_profit: tpPrice,
      status: 'active',
      notes: `${trade.notes || ''}\n🎯 Sentinel entry: ${result.reason} | SL: $${slPrice.toFixed(2)} | TP: $${tpPrice.toFixed(2)}`.trim(),
      metadata: JSON.stringify({
        ...existing,
        direction: result.direction,
        entry_reason: result.strategy || result.reason,
        atr: atrVal,
        slPercent: slPct,
        tpPercent: tpPct,
        enteredBySentinel: true,
        entryTime: new Date().toISOString(),
        fees: { entryFee: parseFloat(trade.position_size || 0) * 0.001 },
      }),
    });
    log(`🚀 ENTRY ${sym} ${result.direction} @ $${result.entryPrice.toFixed(result.entryPrice > 100 ? 2 : 6)} | ${result.reason}`);
  } catch (err) {
    log(`⚠ Entry failed for ${sym}: ${err.message}`);
  }
}

// ─── Update Trailing Stop Metadata ───────────────────────────────────────────

async function updateMetadata(trade, updates) {
  try {
    const existing = typeof trade.metadata === 'string' ? JSON.parse(trade.metadata || '{}') : (trade.metadata || {});
    await apiPatch('/api/trading/trades', {
      trade_id: trade.id,
      metadata: JSON.stringify({ ...existing, ...updates }),
    });
  } catch {}
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

let cycleCount = 0;
let lastTradesFetch = 0;
let cachedTrades = [];
const TRADES_CACHE_MS = 30_000; // Refresh trades list every 30s (not every 10s)

async function cycle() {
  cycleCount++;
  const isVerboseCycle = cycleCount % 6 === 1; // Log status every 60 seconds

  try {
    // Fetch all prices in one request
    const prices = await fetchAllPrices();
    
    // Fetch trades (cached for 30s to reduce API load)
    const now = Date.now();
    if (now - lastTradesFetch > TRADES_CACHE_MS) {
      cachedTrades = await fetchTrades();
      lastTradesFetch = now;
    }

    const active = cachedTrades.filter(t => t.column_name === 'Active');
    const analyzing = cachedTrades.filter(t => t.column_name === 'Analyzing');
    const closed = cachedTrades.filter(t => t.column_name === 'Closed' || t.column_name === 'Parked');

    // ── Re-queue closed coins that have no Analyzing card (every 60s) ──
    if (isVerboseCycle) {
      const analyzingPairs = new Set(analyzing.map(t => t.coin_pair));
      const activePairs = new Set(active.map(t => t.coin_pair));
      for (const trade of closed) {
        const sym = trade.coin_pair;
        if (!sym || sym === 'UNKNOWN') continue;
        if (analyzingPairs.has(sym) || activePairs.has(sym)) continue;
        // Coin is closed with no active/analyzing card — re-queue it
        try {
          await apiPost('/api/trading/trades', {
            board_id: BOARD_ID,
            coin_pair: sym,
            column_name: 'Analyzing',
            status: 'analyzing',
            notes: `♻️ Re-queued after manual close. Watching for new entry.`,
          });
          analyzingPairs.add(sym); // Prevent duplicates in same cycle
          log(`  ♻️ ${sym} re-queued to Analyzing (was ${trade.column_name})`);
          lastTradesFetch = 0; // Force cache refresh
        } catch {}
      }
    }
    
    let exits = 0, entries = 0, partials = 0;

    // ── Check Active Trades (TP/SL/Trailing) ──
    for (const trade of active) {
      const sym = trade.coin_pair;
      if (!sym || sym === 'UNKNOWN') continue;
      
      // Normalize symbol for Binance lookup
      const binanceSym = sym.replace('/', '');
      const lookupKey = sym.includes('/') ? sym : `${sym}/USDT`;
      const currentPrice = prices[lookupKey];
      if (!currentPrice) continue;

      // Update current_price on the trade (every 30s, not every 10s)
      if (cycleCount % 3 === 0) {
        try {
          await apiPatch('/api/trading/trades', {
            trade_id: trade.id,
            current_price: currentPrice,
          });
        } catch {}
      }

      const result = checkExit(trade, currentPrice);
      if (!result) continue;

      if (result.exit) {
        await executeExit(trade, result, currentPrice);
        // Force refresh trades cache
        lastTradesFetch = 0;
        exits++;
      } else if (result.partial) {
        await executePartial(trade, result);
        partials++;
      } else if (result.metadataUpdates) {
        await updateMetadata(trade, result.metadataUpdates);
      }
    }

    // ── Check Analyzing Trades (Entry Triggers) ──
    const activeCount = active.length - exits; // Account for exits this cycle
    for (const trade of analyzing) {
      if (activeCount + entries >= MAX_POSITIONS) break; // At capacity

      const sym = trade.coin_pair;
      if (!sym || sym === 'UNKNOWN') continue;

      const lookupKey = sym.includes('/') ? sym : `${sym}/USDT`;
      const currentPrice = prices[lookupKey];
      if (!currentPrice) continue;

      const result = checkEntry(trade, currentPrice);
      if (result && result.enter) {
        await executeEntry(trade, result, activeCount + entries);
        // Force refresh trades cache
        lastTradesFetch = 0;
        entries++;
      }
    }

    // Log status periodically
    if (isVerboseCycle || exits > 0 || entries > 0 || partials > 0) {
      const activeSyms = active.map(t => {
        const sym = (t.coin_pair || '?').replace('/USDT', '');
        const dir = (t.direction || 'L')[0];
        const price = prices[t.coin_pair];
        const entry = parseFloat(t.entry_price);
        if (price && entry) {
          const pnl = calcPnl(entry, price, (t.direction || 'LONG').toLowerCase());
          return `${sym}(${dir}${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%)`;
        }
        return `${sym}(${dir})`;
      }).join(' ');

      log(`📊 Cycle #${cycleCount} | Active: ${active.length} [${activeSyms}] | Analyzing: ${analyzing.length} | Exits: ${exits} | Entries: ${entries} | Partials: ${partials}`);
    }

    // Write alerts if any exits happened
    if (exits > 0 || entries > 0) {
      atomicWrite(ALERT_FILE, {
        timestamp: Date.now(),
        source: 'sentinel-v2',
        exits,
        entries,
        partials,
      });
    }

  } catch (err) {
    // Don't crash — log and continue
    if (isVerboseCycle) {
      log(`⚠ Error: ${err.message}`);
    }
  }
}

// ─── Startup ─────────────────────────────────────────────────────────────────

log('🚀 Owen Sentinel v2 starting — 10-second execution loop');
log(`   Board: ${BOARD_ID} | Max positions: ${MAX_POSITIONS} | TP: ${TAKE_PROFIT_PCT}% | SL: ${STOP_LOSS_PCT}%`);

// Run immediately, then every 10 seconds
async function safeCycle() {
  try {
    await cycle();
  } catch (err) {
    log(`⚠ Unhandled error in cycle: ${err.message}`);
  }
}

safeCycle();
setInterval(safeCycle, CHECK_INTERVAL_MS);

// Keep process alive
process.stdin.resume();

// Graceful shutdown
process.on('SIGTERM', () => { log('Shutting down...'); process.exit(0); });
process.on('SIGINT', () => { log('Shutting down...'); process.exit(0); });
