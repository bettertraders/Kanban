#!/usr/bin/env node
/**
 * 🏥 Owen's Health Monitor
 * Runs every 5 min via crontab. Checks all Owen module outputs for freshness,
 * JSON integrity, and API availability.
 *
 * Usage: node scripts/owen-health-monitor.js
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '.owen-health.json');
const STATE_FILE = path.join(__dirname, '.owen-health-state.json');

const MODULES = {
  scanner: { file: '.owen-scanner-results.json', maxAgeMin: 45, label: 'Scanner' },
  marketPulse: { file: '.crash-alert.json', maxAgeMin: 5, label: 'Market Pulse', alertOnly: true },
  positionSentinel: { file: '.position-sentinel-alert.json', maxAgeMin: 5, label: 'Position Sentinel', alertOnly: true },
  macroPulse: { file: '.owen-macro-pulse.json', maxAgeMin: 30, label: 'Macro Pulse' },
  newsScanner: { file: '.owen-news.json', maxAgeMin: 15, label: 'News Scanner' },
};

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

async function checkAPI() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ping', { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch { return false; }
}

async function main() {
  const now = Date.now();
  const state = loadJSON(STATE_FILE) || { apiFailures: 0 };
  const modules = {};
  const alerts = [];
  let staleCount = 0;

  for (const [key, cfg] of Object.entries(MODULES)) {
    const filePath = path.join(__dirname, cfg.file);
    const mod = { status: 'ok', lastRun: null, ageMinutes: null };

    // Check file existence
    if (!fs.existsSync(filePath)) {
      if (cfg.alertOnly) {
        mod.status = 'ok';
        mod.note = 'No recent alerts (normal)';
      } else {
        mod.status = 'missing';
        staleCount++;
        alerts.push(`${cfg.label}: output file missing`);
      }
      modules[key] = mod;
      continue;
    }

    // JSON integrity
    let data;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(raw);
    } catch {
      mod.status = 'corrupt';
      staleCount++;
      alerts.push(`${cfg.label}: JSON parse failed`);
      modules[key] = mod;
      continue;
    }

    // Freshness check
    const ts = data.timestamp || 0;
    const ageMin = Math.round((now - ts) / 60000);
    mod.lastRun = new Date(ts).toISOString();
    mod.ageMinutes = ageMin;

    if (cfg.alertOnly && ageMin > cfg.maxAgeMin) {
      // Alert-only modules: stale just means no recent alerts, that's ok
      mod.status = 'ok';
      mod.note = 'No recent alerts';
    } else if (ageMin > cfg.maxAgeMin) {
      mod.status = 'stale';
      staleCount++;
      alerts.push(`${cfg.label}: ${ageMin}min old (max ${cfg.maxAgeMin}min)`);
    }

    modules[key] = mod;
  }

  // API check
  const apiOk = await checkAPI();
  if (apiOk) {
    state.apiFailures = 0;
  } else {
    state.apiFailures = (state.apiFailures || 0) + 1;
    if (state.apiFailures >= 3) {
      alerts.push(`Binance API: ${state.apiFailures} consecutive failures`);
    }
  }
  atomicWrite(STATE_FILE, state);

  // Overall status
  let status = 'healthy';
  if (!apiOk && state.apiFailures >= 3) status = 'critical';
  else if (staleCount > 2) status = 'critical';
  else if (staleCount > 0 || (!apiOk && state.apiFailures >= 1)) status = 'degraded';

  const output = {
    timestamp: now,
    status,
    modules,
    api: {
      binance: apiOk ? 'ok' : 'down',
      consecutiveFailures: state.apiFailures,
    },
    alerts,
  };

  atomicWrite(OUTPUT_FILE, output);

  if (status !== 'healthy') {
    const icon = status === 'critical' ? '🔴' : '🟡';
    console.log(`[Owen Health] ${icon} ${status.toUpperCase()}: ${alerts.join('; ')}`);
  }
}

main().catch(() => {});
