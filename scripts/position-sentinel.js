#!/usr/bin/env node
/**
 * 🛡️ Position Sentinel - Monitors active positions every minute
 * Checks stop losses and profit targets
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://clawdesk.ai';
const BOARD_ID = 15;
const ALERT_FILE = path.join(__dirname, '.position-sentinel-alert.json');

// Stop loss and take profit thresholds
const STOP_LOSS_PCT = -5;  // -5% stop loss
const TAKE_PROFIT_PCT = 10; // +10% take profit

function log(msg) {
  console.log(`[${new Date().toISOString()}] [PositionSentinel] ${msg}`);
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

async function checkPositions() {
  try {
    const trades = await apiGet(`/api/v1/trades?boardId=${BOARD_ID}`);
    const activeTrades = trades.trades.filter(t => t.column_name === 'Active');
    
    const alerts = [];
    
    for (const trade of activeTrades) {
      if (!trade.entry_price || !trade.current_price) continue;
      
      const pnlPct = ((trade.current_price - trade.entry_price) / trade.entry_price) * 100;
      
      if (pnlPct <= STOP_LOSS_PCT) {
        alerts.push({
          trade_id: trade.id,
          coin: trade.coin_pair,
          action: 'STOP_LOSS',
          pnl_pct: pnlPct,
          entry: trade.entry_price,
          current: trade.current_price,
        });
      } else if (pnlPct >= TAKE_PROFIT_PCT) {
        alerts.push({
          trade_id: trade.id,
          coin: trade.coin_pair,
          action: 'TAKE_PROFIT',
          pnl_pct: pnlPct,
          entry: trade.entry_price,
          current: trade.current_price,
        });
      }
    }
    
    if (alerts.length > 0) {
      fs.writeFileSync(ALERT_FILE, JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'POSITION_ALERTS',
        alerts,
      }, null, 2));
      log(`⚠️ ${alerts.length} position alerts`);
      alerts.forEach(a => log(`  ${a.coin}: ${a.action} at ${a.pnl_pct.toFixed(2)}%`));
    } else {
      if (fs.existsSync(ALERT_FILE)) {
        fs.unlinkSync(ALERT_FILE);
      }
      log(`✅ ${activeTrades.length} positions healthy`);
    }
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
}

checkPositions();
