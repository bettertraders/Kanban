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
const STRATEGY_STYLE = 'swing';
const STRATEGY_SUBSTYLE = 'momentum';
const MAX_POSITIONS = 5;
const POSITION_SIZE_PCT = 20; // 20% of balance per trade
const STOP_LOSS_PCT = 5;
const TAKE_PROFIT_PCT = 10;
const PINNED_COINS = [
  // Core holdings
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT',
  // Large caps
  'XRP/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT', 'ATOM/USDT', 'MATIC/USDT',
  // Mid caps with volume
  'NEAR/USDT', 'FTM/USDT', 'INJ/USDT', 'SUI/USDT', 'APT/USDT',
  // Momentum plays
  'RENDER/USDT', 'FET/USDT', 'ARB/USDT', 'OP/USDT', 'TIA/USDT',
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

// ─── Binance OHLCV ──────────────────────────────────────────────────────────

async function fetchOHLCV(exchange, symbol) {
  try {
    const ohlcv = await exchange.fetchOHLCV(symbol, '4h', undefined, 60);
    const closes = ohlcv.map(c => c[4]);
    const volumes = ohlcv.map(c => c[5]);
    const currentPrice = closes[closes.length - 1];

    const macd = calcMACD(closes);
    const atr = calcATR(ohlcv, 14);

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
  if (!ind || ind.rsi == null) return { enter: false };
  
  // ── LONG SIGNALS ──
  // Signal 1: Oversold bounce near SMA20 + MACD confirmation
  const oversoldBounce =
    ind.rsi < 40 &&
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

  if (oversoldBounce || goldenCross || deeplyOversold) {
    return { enter: true, direction: 'LONG', reason: oversoldBounce ? 'oversold_bounce' : goldenCross ? 'golden_cross' : 'deeply_oversold' };
  }
  
  // ── SHORT SIGNALS ──
  // Signal 4: Overbought rejection from SMA20 resistance + MACD bearish
  const overboughtReject =
    ind.rsi > 65 &&
    ind.sma20 &&
    ind.currentPrice < ind.sma20 && // Price rejected below SMA20
    (ind.macdHistogram !== null && ind.macdHistogram < 0);
  
  // Signal 5: Death cross (SMA20 < SMA50) + bearish momentum
  const deathCross =
    ind.sma20 && ind.sma50 && ind.sma20 < ind.sma50 &&
    ind.momentum < -2 &&
    (ind.macdHistogram !== null && ind.macdHistogram < 0);

  if (overboughtReject || deathCross) {
    return { enter: true, direction: 'SHORT', reason: overboughtReject ? 'overbought_reject' : 'death_cross' };
  }

  return { enter: false };
}

function shouldExitTrade(ind, trade) {
  if (!ind) return { exit: false };
  const entryPrice = parseFloat(trade.entry_price);
  if (!entryPrice || entryPrice <= 0) return { exit: false };

  const pnlPct = ((ind.currentPrice - entryPrice) / entryPrice) * 100;
  const direction = (trade.direction || 'long').toLowerCase();
  const effectivePnl = direction === 'short' ? -pnlPct : pnlPct;

  // ATR-based dynamic stops (if ATR available)
  let dynamicSL = STOP_LOSS_PCT;
  let dynamicTP = TAKE_PROFIT_PCT;
  if (ind.atr && entryPrice > 0) {
    const atrPct = (ind.atr / entryPrice) * 100;
    dynamicSL = Math.max(2, Math.min(8, atrPct * 2));   // 2×ATR but clamped 2-8%
    dynamicTP = Math.max(4, Math.min(15, atrPct * 3));   // 3×ATR but clamped 4-15%
  }

  // Take profit
  if (effectivePnl >= dynamicTP) return { exit: true, reason: `Take profit (+${effectivePnl.toFixed(1)}%, target ${dynamicTP.toFixed(1)}%)`, win: true };
  // Stop loss
  if (effectivePnl <= -dynamicSL) return { exit: true, reason: `Stop loss (${effectivePnl.toFixed(1)}%, limit -${dynamicSL.toFixed(1)}%)`, win: false };
  // RSI exit — overbought for longs, oversold for shorts
  if (direction === 'short' && ind.rsi < 30 && effectivePnl > 0) return { exit: true, reason: `RSI oversold short exit (${ind.rsi.toFixed(1)})`, win: true };
  if (direction !== 'short' && ind.rsi > 70 && effectivePnl > 0) return { exit: true, reason: `RSI overbought (${ind.rsi.toFixed(1)})`, win: true };
  // MACD reversal exit
  if (direction !== 'short' && ind.macdHistogram !== null && ind.macdHistogram < -1 && effectivePnl < 0) {
    return { exit: true, reason: `MACD bearish reversal (hist=${ind.macdHistogram.toFixed(2)})`, win: false };
  }
  if (direction === 'short' && ind.macdHistogram !== null && ind.macdHistogram > 1 && effectivePnl < 0) {
    return { exit: true, reason: `MACD bullish reversal (hist=${ind.macdHistogram.toFixed(2)})`, win: false };
  }

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

  const state = loadState();

  // ── Step 3: Fetch indicators for all relevant coins ────────────────────
  const allTrades = [...watchlist, ...analyzing, ...active];
  const symbols = [...new Set(allTrades.map(t => normalizePair(t.coin_pair)))];

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
      await updateTradeAnalysis(trade.id, ind, sym);
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

    const entrySignal = shouldMoveToActive(ind);
    if (entrySignal.enter) {
      const extreme = isExtremeMove(ind);
      if (!canMoveCard(sym + ':active', state) && !extreme) {
        log(`  ⏳ ${sym} — ${entrySignal.direction} signal (${entrySignal.reason}) but cooldown (24h). Skipping.`);
        if (ind) await updateTradeAnalysis(trade.id, ind, sym);
        continue;
      }
      const positionSize = Math.min(balance * (POSITION_SIZE_PCT / 100), balance);
      if (positionSize < 10) {
        log(`  ⚠ Insufficient balance for ${sym}`);
        continue;
      }

      const dir = entrySignal.direction || 'LONG';
      log(`  🎯 ${dir} entry for ${sym} (${entrySignal.reason}) — $${positionSize.toFixed(2)}${extreme ? ' (EXTREME)' : ''} | MACD hist=${ind.macdHistogram?.toFixed(3) ?? 'n/a'} | ATR=${ind.atr?.toFixed(4) ?? 'n/a'}`);
      recordMove(sym + ':active', state);
      try {
        // Update existing card with entry data instead of creating a new trade
        await apiPatch('/api/trading/trades', {
          trade_id: trade.id,
          column_name: 'Active',
          status: 'active',
          entry_price: ind.currentPrice,
          position_size: positionSize,
          direction: dir,
          notes: `Strategy: ${BOT_NAME} | ${dir} ${entrySignal.reason} | MACD=${ind.macdHistogram?.toFixed(3)} ATR=${ind.atr?.toFixed(4)}`,
          bot_id: bot.id,
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
  log(`🎯 Entries: ${entryCount}`);

  // ── Step 6: Process Watchlist — move to Analyzing if setup forming ─────
  // Cooldown: only move cards once per 24h unless extreme move (>5% in 4h)
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
    if (ind) await updateTradeAnalysis(trade.id, ind, sym);
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

const COLUMN_STATUS_MAP = {
  'Watchlist': 'watching',
  'Analyzing': 'analyzing',
  'Active': 'active',
  'Parked': 'parked',
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
