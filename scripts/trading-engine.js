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
const BOARD_ID = 15;
const BOT_NAME = 'Penny Paper Trader';
const STRATEGY_STYLE = 'swing';
const STRATEGY_SUBSTYLE = 'momentum';
const MAX_POSITIONS = 5;
const POSITION_SIZE_PCT = 20; // 20% of balance per trade
const STOP_LOSS_PCT = 5;
const TAKE_PROFIT_PCT = 10;
const PINNED_COINS = ['BTC/USDT', 'ETH/USDT'];

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

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${method} ${endpoint} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
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

// ─── Binance OHLCV ──────────────────────────────────────────────────────────

async function fetchOHLCV(exchange, symbol) {
  try {
    const ohlcv = await exchange.fetchOHLCV(symbol, '4h', undefined, 60);
    const closes = ohlcv.map(c => c[4]);
    const volumes = ohlcv.map(c => c[5]);
    const currentPrice = closes[closes.length - 1];

    return {
      symbol,
      currentPrice,
      closes,
      volumes,
      rsi: calcRSI(closes, 14),
      sma20: calcSMA(closes, 20),
      sma50: calcSMA(closes, 50),
      volumeRatio: calcVolumeRatio(volumes),
      momentum: calcMomentum(closes, 10),
      momentum4h: closes.length >= 2 ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0,
    };
  } catch (err) {
    log(`  ⚠ Failed to fetch OHLCV for ${symbol}: ${err.message}`);
    return null;
  }
}

// ─── Cooldown Logic ──────────────────────────────────────────────────────────

const COOLDOWN_FILE = path.join(__dirname, '.trading-engine-state.json');
const MOVE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXTREME_MOVE_PCT = 5; // 5% move in 4h overrides cooldown

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
  // Any coin worth analyzing if it has 2+ of these signals:
  let signals = 0;
  if (ind.rsi < 35 || ind.rsi > 65) signals += 2; // Strong RSI = double weight
  else if (ind.rsi < 45 || ind.rsi > 55) signals += 1; // Mild RSI still counts
  if (ind.sma20 && Math.abs(ind.currentPrice - ind.sma20) / ind.sma20 < 0.03) signals += 1; // Near SMA20
  if (ind.volumeRatio > 1.0) signals += 1; // Above-average volume
  if (ind.momentum && Math.abs(ind.momentum) > 2) signals += 1; // Momentum building
  return signals >= 2;
}

function shouldMoveToActive(ind) {
  if (!ind || ind.rsi == null) return false;
  // Signal 1: Oversold bounce near SMA20 with volume
  const oversoldBounce =
    ind.rsi < 35 &&
    ind.sma20 &&
    Math.abs(ind.currentPrice - ind.sma20) / ind.sma20 < 0.02 &&
    ind.volumeRatio > 1.2;
  // Signal 2: Golden cross (SMA20 > SMA50)
  const goldenCross =
    ind.sma20 && ind.sma50 && ind.sma20 > ind.sma50 && ind.momentum > 0;
  return oversoldBounce || goldenCross;
}

function shouldExitTrade(ind, trade) {
  if (!ind) return { exit: false };
  const entryPrice = parseFloat(trade.entry_price);
  if (!entryPrice || entryPrice <= 0) return { exit: false };

  const pnlPct = ((ind.currentPrice - entryPrice) / entryPrice) * 100;
  const direction = (trade.direction || 'long').toLowerCase();
  const effectivePnl = direction === 'short' ? -pnlPct : pnlPct;

  // Take profit
  if (effectivePnl >= TAKE_PROFIT_PCT) return { exit: true, reason: `Take profit (+${effectivePnl.toFixed(1)}%)`, win: true };
  // Stop loss
  if (effectivePnl <= -STOP_LOSS_PCT) return { exit: true, reason: `Stop loss (${effectivePnl.toFixed(1)}%)`, win: false };
  // RSI overbought exit
  if (ind.rsi > 70 && effectivePnl > 0) return { exit: true, reason: `RSI overbought (${ind.rsi.toFixed(1)})`, win: true };

  return { exit: false };
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  log('🚀 Paper Trading Engine v1.0');

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
  log(`   Watchlist: ${watchlist.length} | Analyzing: ${analyzing.length} | Active: ${active.length}`);

  // ── Step 2: Get account balance ────────────────────────────────────────
  const { account } = await apiGet(`/api/trading/account?boardId=${BOARD_ID}`);
  const balance = parseFloat(account?.current_balance || 0);
  log(`💰 Balance: $${balance.toFixed(2)}`);

  // ── Step 3: Fetch indicators for all relevant coins ────────────────────
  const allTrades = [...watchlist, ...analyzing, ...active];
  const symbols = [...new Set(allTrades.map(t => normalizePair(t.coin_pair)))];

  // Ensure pinned coins are represented
  for (const pin of PINNED_COINS) {
    if (!symbols.includes(pin)) symbols.push(pin);
  }

  log(`📊 Fetching indicators for ${symbols.length} symbols...`);
  const indicators = {};
  for (const sym of symbols) {
    const ind = await fetchOHLCV(exchange, sym);
    if (ind) indicators[sym] = ind;
    // Rate limit courtesy
    await sleep(200);
  }

  // ── Step 4: Process Active trades — check exits ────────────────────────
  let exitCount = 0;
  for (const trade of active) {
    const sym = normalizePair(trade.coin_pair);
    const ind = indicators[sym];
    const decision = shouldExitTrade(ind, trade);

    if (decision.exit) {
      log(`  🚪 Exiting ${sym}: ${decision.reason}`);
      try {
        await apiPost('/api/trading/trade/exit', { trade_id: trade.id });
        const targetCol = decision.win ? 'Wins' : 'Losses';
        await moveCard(trade.id, targetCol);
        await journalLog(trade.id, 'exit', `Exit: ${decision.reason}. Price: ${ind?.currentPrice}`);
        exitCount++;
      } catch (err) {
        log(`  ⚠ Exit failed for ${sym}: ${err.message}`);
      }
    } else if (ind) {
      // Update current price on card description
      await updateTradeAnalysis(trade.id, ind);
    }
  }
  log(`🚪 Exits: ${exitCount}`);

  // ── Step 5: Process Analyzing trades — check entry signals ─────────────
  let entryCount = 0;
  const currentActive = active.length - exitCount;

  for (const trade of analyzing) {
    if (currentActive + entryCount >= MAX_POSITIONS) break;

    const sym = normalizePair(trade.coin_pair);
    const ind = indicators[sym];

    if (shouldMoveToActive(ind)) {
      const extreme = isExtremeMove(ind);
      if (!canMoveCard(sym + ':active', state) && !extreme) {
        log(`  ⏳ ${sym} — entry signal but cooldown (24h). Skipping.`);
        if (ind) await updateTradeAnalysis(trade.id, ind);
        continue;
      }
      const positionSize = Math.min(balance * (POSITION_SIZE_PCT / 100), balance);
      if (positionSize < 10) {
        log(`  ⚠ Insufficient balance for ${sym}`);
        continue;
      }

      log(`  🎯 Entry signal for ${sym} — entering trade ($${positionSize.toFixed(2)})${extreme ? ' (EXTREME MOVE)' : ''}`);
      recordMove(sym + ':active', state);
      try {
        await apiPost('/api/trading/trade/enter', {
          boardId: BOARD_ID,
          symbol: sym,
          side: 'long',
          amount: positionSize,
          strategy: BOT_NAME,
          bot_id: bot.id,
        });
        await moveCard(trade.id, 'Active');
        await journalLog(trade.id, 'entry', `Entry: ${sym} @ ${ind.currentPrice}. RSI=${ind.rsi?.toFixed(1)}, SMA20=${ind.sma20?.toFixed(2)}, Vol=${ind.volumeRatio?.toFixed(2)}x`);
        entryCount++;
      } catch (err) {
        log(`  ⚠ Entry failed for ${sym}: ${err.message}`);
      }
    } else if (ind) {
      await updateTradeAnalysis(trade.id, ind);
    }
  }
  log(`🎯 Entries: ${entryCount}`);

  // ── Step 6: Process Watchlist — move to Analyzing if setup forming ─────
  // Cooldown: only move cards once per 24h unless extreme move (>5% in 4h)
  const state = loadState();
  let analyzeCount = 0;
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
    if (ind) await updateTradeAnalysis(trade.id, ind);
  }
  saveState(state);
  log(`🔍 Moved to Analyzing: ${analyzeCount}`);

  // ── Step 7: Update bot stats ───────────────────────────────────────────
  await updateBotStats(bot.id, exitCount, entryCount);

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

async function moveCard(tradeId, columnName) {
  await apiPatch('/api/trading/trades', { trade_id: tradeId, column_name: columnName });
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

function generateReason(ind) {
  const reasons = [];
  const price = ind.currentPrice;
  
  // RSI analysis
  if (ind.rsi < 30) reasons.push('RSI oversold — strong buy zone');
  else if (ind.rsi < 40) reasons.push('RSI approaching oversold — watching for bounce');
  else if (ind.rsi > 70) reasons.push('RSI overbought — may pull back');
  else if (ind.rsi > 60) reasons.push('RSI elevated — momentum building');
  else reasons.push('RSI neutral');

  // SMA relationship
  if (ind.sma20 && ind.sma50) {
    if (ind.sma20 > ind.sma50) reasons.push('SMA20 above SMA50 (bullish trend)');
    else {
      const gap = ((ind.sma50 - ind.sma20) / ind.sma50 * 100).toFixed(1);
      if (gap < 2) reasons.push(`SMA20 closing in on SMA50 — crossover forming (${gap}% gap)`);
      else reasons.push('SMA20 below SMA50 (bearish macro)');
    }
  }

  // Price vs SMA20
  if (ind.sma20) {
    const dist = ((price - ind.sma20) / ind.sma20 * 100);
    if (Math.abs(dist) < 2) reasons.push('Price near SMA20 — bounce zone');
    else if (dist > 0) reasons.push(`Price ${dist.toFixed(1)}% above SMA20`);
    else reasons.push(`Price ${Math.abs(dist).toFixed(1)}% below SMA20`);
  }

  // Volume
  if (ind.volumeRatio > 1.5) reasons.push('High volume — strong interest');
  else if (ind.volumeRatio > 1.0) reasons.push('Volume above average');
  else if (ind.volumeRatio < 0.5) reasons.push('Low volume — thin market');

  // Entry target
  if (ind.sma20 && ind.rsi > 40) {
    const target = ind.sma20 * 0.98;
    reasons.push(`Entry target: ~$${target.toFixed(target > 100 ? 0 : 2)}`);
  }

  return reasons.slice(0, 3).join('. ') + '.';
}

async function updateTradeAnalysis(tradeId, ind) {
  const reason = generateReason(ind);
  const analysis = `${reason}\n\n📊 RSI: ${ind.rsi?.toFixed(1)} | SMA20: $${ind.sma20?.toFixed(2)} | SMA50: $${ind.sma50?.toFixed(2)} | Vol: ${ind.volumeRatio?.toFixed(1)}x | Mom: ${ind.momentum?.toFixed(1)}%`;

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

async function updateBotStats(botId, exits, entries) {
  try {
    // Update bot performance via PATCH
    await apiPatch(`/api/v1/bots/${botId}`, {
      status: 'running',
      performance: {
        last_run: new Date().toISOString(),
        last_exits: exits,
        last_entries: entries,
      },
    });
    log(`📈 Bot stats updated`);
  } catch (err) {
    log(`  ⚠ Bot stats update failed: ${err.message}`);
  }

  // Update leaderboard with trade stats from closed trades
  try {
    const { trades } = await apiGet(`/api/trading/trades?boardId=${BOARD_ID}&status=closed`);
    const botTrades = trades.filter(t => t.bot_id == botId);
    const wins = botTrades.filter(t => t.column_name === 'Wins');
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
