#!/bin/bash
# Paper Trading Engine — runs every 30 minutes via cron
# Scans watchlist, calculates signals, moves cards, enters/exits trades

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Load env
if [ -f "$HOME/.env.openclaw" ]; then
  set -a; source "$HOME/.env.openclaw"; set +a
fi

cd "$REPO_DIR"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Trading engine starting..."
node scripts/trading-engine.js
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Trading engine complete."
