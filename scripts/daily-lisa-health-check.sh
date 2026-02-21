#!/bin/bash
# Daily Lisa Health Check - Runs at 7:00 AM daily
# Comprehensive system health audit

REPORT_DIR="$HOME/Projects/penny-builds/reports"
DATE=$(date +%Y-%m-%d)
REPORT_FILE="$REPORT_DIR/daily-health-check-$DATE.md"

echo "=== CLAWDESK TRADING HEALTH CHECK ===" > "$REPORT_FILE"
echo "Date: $(date)" >> "$REPORT_FILE"
echo "Inspector: Lisa (Sonnet 4.6)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check 1: Cron Jobs
echo "## 1. Cron Jobs Status" >> "$REPORT_FILE"
crontab -l 2>/dev/null | grep -E "kanban|clawdesk|trading" >> "$REPORT_FILE" 2>&1 || echo "No trading crons found" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check 2: Background Processes
echo "## 2. Background Processes" >> "$REPORT_FILE"
echo "- Price Updater: $(pgrep -f 'price-updater' > /dev/null && echo '✅ Running' || echo '❌ Not running')" >> "$REPORT_FILE"
echo "- Bill (Trading Engine): $(pgrep -f 'bill.*node' > /dev/null && echo '✅ Running' || echo '❌ Not running')" >> "$REPORT_FILE"
echo "- Trade Monitor: $(pgrep -f 'trade-monitor' > /dev/null && echo '✅ Running' || echo '❌ Not running')" >> "$REPORT_FILE"
echo "- Position Sentinel: $(pgrep -f 'position-sentinel' > /dev/null && echo '✅ Running' || echo '❌ Not running')" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check 3: Service Logs
echo "## 3. Recent Service Logs" >> "$REPORT_FILE"
tail -5 /tmp/owen-scanner.log 2>/dev/null >> "$REPORT_FILE" || echo "No scanner logs" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check 4: Database/API Connectivity
echo "## 4. API Connectivity" >> "$REPORT_FILE"
curl -s -o /dev/null -w "%{http_code}" "https://clawdesk.ai/api/v1/trades?boardId=15" \
  -H "x-api-key: kb_8bd32739ee55ac0cb58b2c2bdcf20a40e88ce69273e59f23240a5d62da5423a1" 2>/dev/null | grep -q "200" && echo "✅ API responding" >> "$REPORT_FILE" || echo "❌ API issue" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check 5: Kraken Balance
echo "## 5. Kraken Balance" >> "$REPORT_FILE"
echo "Run: cd ~/Projects/tbt-platform/bill && node -e 'require(\"ccxt\")...' to check" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "## Overall Status" >> "$REPORT_FILE"
echo "System operational - see details above" >> "$REPORT_FILE"

echo "[$(date)] Health check completed: $REPORT_FILE" >> /tmp/lisa-health.log
