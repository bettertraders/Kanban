#!/usr/bin/env node
/**
 * 🔄 Kraken Sync - Syncs trade history every 5 minutes
 * Fetches actual trades from Kraken and updates the dashboard
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://clawdesk.ai';
const BOARD_ID = 15;

function log(msg) {
  console.log(`[${new Date().toISOString()}] [KrakenSync] ${msg}`);
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

async function syncKraken() {
  try {
    log('Starting Kraken sync...');
    const result = await apiPost('/api/trading/sync-kraken', {
      boardId: BOARD_ID,
      mode: 'refresh', // Don't reset, just update
    });
    log(`✅ Synced: ${result.created || 0} created, ${result.updated || 0} updated`);
  } catch (err) {
    log(`❌ Sync failed: ${err.message}`);
  }
}

syncKraken();
