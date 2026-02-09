#!/bin/bash
# Called by Owen's cron job to refresh the watchlist
# Usage: ./refresh-watchlist.sh [conservative|moderate|aggressive]
RISK=${1:-conservative}
echo "Refreshing watchlist with risk level: $RISK"
curl -s -X POST "https://clawdesk.ai/api/trading/watchlist/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"riskLevel\": \"$RISK\"}" | python3 -m json.tool
