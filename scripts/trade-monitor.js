#!/usr/bin/env node
/**
 * 👁️ Trade Monitor - Detects trade changes every 2 minutes
 * Compares database state with Kraken to detect mismatches
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://clawdesk.ai';
const BOARD_ID = 15;
const ALERT_FILE = path.join(__dirname, '.trade-monitor-alert.json');

function log(msg) {
  console.log(`[${new Date().toISOString()}] [TradeMonitor] ${msg}`);
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

async function apiGet(endpoint) {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!resp.ok) throw new Error(`GET ${endpoint} → ${resp.status}`);
  return resp.json();
}

async function checkTrades() {
  try {
    // Get current trade state
    const dbTrades = await apiGet(`/api/v1/trades?boardId=${BOARD_ID}`);
    const krakenBalance = await apiGet('/api/trading/portfolio?boardId=15');
    
    const activeInDb = dbTrades.trades.filter(t => t.column_name === 'Active');
    const activeCoinsInDb = new Set(activeInDb.map(t => t.coin_pair));
    
    // Check for phantom trades (Active in DB but no Kraken position)
    const phantomTrades = activeInDb.filter(t => {
      const base = t.coin_pair.replace('/USD', '');
      const krakenAmount = krakenBalance.summary?.[`${base}_balance`] || 0;
      return krakenAmount === 0 && !t.kraken_id;
    });
    
    // Check for missing trades (on Kraken but not in DB)
    // This would require fetching Kraken positions directly
    
    if (phantomTrades.length > 0) {
      const alert = {
        timestamp: new Date().toISOString(),
        type: 'PHANTOM_TRADES',
        severity: 'warning',
        trades: phantomTrades.map(t => ({
          id: t.id,
          coin: t.coin_pair,
          entry: t.entry_price,
        })),
        message: `${phantomTrades.length} phantom trades detected (Active in DB but no Kraken position)`,
      };
      fs.writeFileSync(ALERT_FILE, JSON.stringify(alert, null, 2));
      log(`⚠️ ${phantomTrades.length} phantom trades detected`);
    } else {
      // Clear alert if all clear
      if (fs.existsSync(ALERT_FILE)) {
        fs.unlinkSync(ALERT_FILE);
        log('✅ All trades verified');
      }
    }
    
    log(`Checked ${dbTrades.trades.length} trades, ${activeInDb.length} active`);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
}

checkTrades();
