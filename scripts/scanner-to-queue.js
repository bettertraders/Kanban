#!/usr/bin/env node
/**
 * 🎯 Scanner → Queue Bridge
 * Reads Owen's scanner results and pushes Kraken-available coins to the board queue.
 * Run after owen-scanner.js
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://clawdesk.ai';
const BOARD_ID = 15;
const SCANNER_FILE = path.join(__dirname, '.owen-scanner-results.json');

// Kraken symbols that are always available
const KRAKEN_WHITELIST = new Set([
  'BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'LINK', 'UNI', 'AAVE', 'SNX', 'COMP',
  'YFI', 'CRV', 'SUSHI', 'MKR', 'LTC', 'BCH', 'XLM', 'XMR', 'ZEC', 'ETC',
  'BAT', 'GRT', 'ENJ', 'MANA', 'SAND', 'CHZ', 'LRC', 'OMG', 'REP', 'WAVES',
  'KSM', 'ATOM', 'XTZ', 'ALGO', 'FLOW', 'NEAR', 'AVAX', 'MATIC', 'FTM'
]);

function log(msg) {
  console.log(`[${new Date().toISOString()}] [Scanner→Queue] ${msg}`);
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
if (!API_KEY) {
  console.error('No KANBAN_API_KEY found');
  process.exit(1);
}

async function apiPost(endpoint, body) {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`POST ${endpoint} → ${resp.status}`);
  return resp.json();
}

async function apiGet(endpoint) {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!resp.ok) throw new Error(`GET ${endpoint} → ${resp.status}`);
  return resp.json();
}

async function main() {
  // Load scanner results
  if (!fs.existsSync(SCANNER_FILE)) {
    log('⚠️ No scanner results found');
    return;
  }

  const scanner = JSON.parse(fs.readFileSync(SCANNER_FILE, 'utf8'));
  const watchlist = scanner.watchlist || [];

  // Filter to Kraken-available coins
  const krakenCoins = watchlist.filter(w => {
    const base = w.symbol.replace('/USDT', '');
    return KRAKEN_WHITELIST.has(base);
  });

  log(`Found ${krakenCoins.length} Kraken coins from ${watchlist.length} scanner results`);

  // Get current queue
  const current = await apiGet(`/api/v1/trades?boardId=${BOARD_ID}`);
  const queuedSymbols = new Set(
    current.trades
      .filter(t => t.column_name === 'Queued')
      .map(t => t.coin_pair?.replace('/USD', '/USDT'))
  );

  // Push new coins to queue
  let added = 0;
  for (const coin of krakenCoins) {
    if (queuedSymbols.has(coin.symbol)) {
      log(`⏭️ ${coin.symbol} already in queue`);
      continue;
    }

    try {
      await apiPost('/api/trading/trades', {
        board_id: BOARD_ID,
        coin_pair: coin.symbol.replace('/USDT', '/USD'),
        column_name: 'Queued',
        entry_price: null,
        current_price: null,
        confidence_score: coin.score,
        volume_assessment: `$${(coin.volume24h / 1e6).toFixed(1)}M`,
        status: 'watching',
        notes: `Scanner: ${coin.reason}`,
        metadata: {
          scanner_score: coin.score,
          scanner_rsi: coin.rsi,
          scanner_atr: coin.atrPct,
          scanner_momentum: coin.momentum,
          scanner_volume: coin.volume24h,
          added_by_scanner_bridge: true,
          added_at: new Date().toISOString(),
        },
      });
      log(`✅ Added ${coin.symbol} (score: ${coin.score})`);
      added++;
    } catch (err) {
      log(`❌ Failed to add ${coin.symbol}: ${err.message}`);
    }
  }

  log(`Done. Added ${added} new coins to queue.`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
