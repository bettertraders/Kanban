#!/usr/bin/env node
/**
 * 🌍 Owen's Macro Pulse Monitor
 * Runs every 15 minutes via crontab. Monitors macro/fundamental conditions.
 * Fear & Greed, BTC dominance, gold, market cap, news headlines.
 * Silent when no alerts (cron-friendly).
 *
 * Usage: node scripts/owen-macro-pulse.js
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '.owen-macro-pulse.json');
const HISTORY_FILE = path.join(__dirname, '.macro-pulse-history.json');

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  return null;
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function fetchJSON(url, timeoutMs = 8000) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function fetchText(url, timeoutMs = 8000) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// ── Fear & Greed Index ──
async function getFearGreed() {
  try {
    const data = await fetchJSON('https://api.alternative.me/fng/?limit=2');
    const entries = data?.data;
    if (!entries || entries.length < 2) return null;
    const current = parseInt(entries[0].value);
    const previous = parseInt(entries[1].value);
    return {
      value: current,
      label: entries[0].value_classification,
      change24h: current - previous,
    };
  } catch {
    return null;
  }
}

// ── CoinGecko Global Data (BTC dominance + market cap) ──
async function getGlobalData() {
  try {
    const data = await fetchJSON('https://api.coingecko.com/api/v3/global');
    const g = data?.data;
    if (!g) return null;
    return {
      btcDominance: g.market_cap_percentage?.btc || null,
      totalMarketCapUsd: g.total_market_cap?.usd || null,
      marketCapChange24h: g.market_cap_change_percentage_24h_usd || null,
    };
  } catch {
    return null;
  }
}

// ── Gold (PAXG) + BTC from Binance ──
async function getGoldAndBtc(exchange) {
  try {
    const [paxg, btc] = await Promise.all([
      exchange.fetchTicker('PAXG/USDT'),
      exchange.fetchTicker('BTC/USDT'),
    ]);
    return {
      paxgPrice: paxg?.last || null,
      paxgChange24h: paxg?.percentage || null,
      btcPrice: btc?.last || null,
      btcChange24h: btc?.percentage || null,
    };
  } catch {
    return null;
  }
}

// ── News Headlines via RSS ──
async function getNewsFlags() {
  const keywords = ['war', 'regulation', 'hack', 'sec', 'ban', 'crash', 'rally', 'fed', 'rate', 'etf', 'lawsuit', 'sanctions', 'inflation', 'recession'];
  const feeds = [
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
    { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
  ];

  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const flags = [];

  for (const feed of feeds) {
    try {
      const xml = await fetchText(feed.url);
      // Extract items with title and link
      const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(xml)) !== null) {
        const itemXml = itemMatch[1];
        const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/i);
        const pubDateMatch = itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i);

        if (!titleMatch) continue;
        const title = titleMatch[1].trim();
        const link = linkMatch ? linkMatch[1].trim() : '';

        // Check if recent (within 2 hours)
        if (pubDateMatch) {
          const pubDate = new Date(pubDateMatch[1].trim()).getTime();
          if (pubDate && pubDate < twoHoursAgo) continue;
        }

        // Keyword scan
        const titleLower = title.toLowerCase();
        for (const kw of keywords) {
          if (titleLower.includes(kw)) {
            flags.push({ source: feed.source, title, keyword: kw.toUpperCase(), url: link });
            break; // one keyword per headline
          }
        }
      }
    } catch {
      // RSS feed down — skip
    }
  }

  return flags;
}

async function main() {
  const exchange = new ccxt.binance({ enableRateLimit: false, timeout: 5000 });
  const now = Date.now();
  const history = loadJSON(HISTORY_FILE) || {};
  const alerts = [];

  // Fetch all data sources in parallel
  const [fearGreed, globalData, goldBtc, newsFlags] = await Promise.all([
    getFearGreed(),
    getGlobalData(),
    getGoldAndBtc(exchange),
    getNewsFlags(),
  ]);

  // ── Build output ──
  const output = { timestamp: now, alerts: [] };

  // Fear & Greed
  if (fearGreed) {
    output.fearGreed = fearGreed;
    if (Math.abs(fearGreed.change24h) > 8) {
      const dir = fearGreed.change24h < 0 ? 'dropped' : 'jumped';
      alerts.push({
        type: 'fear_shift',
        message: `Fear & Greed ${dir} ${Math.abs(fearGreed.change24h)} points in 24h — now ${fearGreed.label} (${fearGreed.value})`,
      });
    }
  }

  // BTC Dominance
  if (globalData?.btcDominance != null) {
    const prevDom = history.btcDominance || null;
    const trend = prevDom != null
      ? (globalData.btcDominance > prevDom + 0.3 ? 'rising' : globalData.btcDominance < prevDom - 0.3 ? 'falling' : 'stable')
      : 'unknown';
    output.btcDominance = {
      current: Math.round(globalData.btcDominance * 100) / 100,
      trend,
    };
    if (prevDom != null && Math.abs(globalData.btcDominance - prevDom) > 1) {
      const dir = globalData.btcDominance > prevDom ? 'rising' : 'falling';
      const implication = dir === 'rising' ? 'alt bleed likely' : 'alt season vibes';
      alerts.push({
        type: `dominance_${dir}`,
        message: `BTC dominance ${dir} to ${globalData.btcDominance.toFixed(1)}% — ${implication}`,
      });
    }
    // Save for next comparison
    history.btcDominance = globalData.btcDominance;
  }

  // Total Market Cap
  if (globalData?.totalMarketCapUsd != null) {
    output.totalMarketCap = {
      usd: Math.round(globalData.totalMarketCapUsd),
      change24h: globalData.marketCapChange24h != null ? Math.round(globalData.marketCapChange24h * 100) / 100 : null,
    };
    if (globalData.marketCapChange24h != null && globalData.marketCapChange24h <= -5) {
      alerts.push({
        type: 'market_cap_drop',
        message: `Total crypto market cap down ${Math.abs(globalData.marketCapChange24h).toFixed(1)}% in 24h — macro event`,
      });
    }
  }

  // Gold (PAXG) vs BTC
  if (goldBtc?.paxgPrice != null) {
    const paxgUp = goldBtc.paxgChange24h > 2;
    const btcDown = goldBtc.btcChange24h < -2;
    const correlation = (paxgUp && btcDown) ? 'inverse' : (paxgUp && goldBtc.btcChange24h > 2) ? 'correlated' : 'neutral';

    // Use history for 1h/4h changes
    const prev1h = history.paxgPrice1h || null;
    const prev4h = history.paxgPrice4h || null;
    const change1h = prev1h ? ((goldBtc.paxgPrice - prev1h) / prev1h) * 100 : null;
    const change4h = prev4h ? ((goldBtc.paxgPrice - prev4h) / prev4h) * 100 : null;

    output.gold = {
      paxgPrice: Math.round(goldBtc.paxgPrice * 100) / 100,
      change1h: change1h != null ? Math.round(change1h * 100) / 100 : null,
      change4h: change4h != null ? Math.round(change4h * 100) / 100 : null,
      btcCorrelation: correlation,
    };

    // Update rolling history (every 15 min, so ~4 calls = 1h, ~16 calls = 4h)
    if (!history.paxgPriceLog) history.paxgPriceLog = [];
    history.paxgPriceLog.push({ price: goldBtc.paxgPrice, ts: now });
    // Keep only 4h of data
    history.paxgPriceLog = history.paxgPriceLog.filter(e => now - e.ts <= 4 * 60 * 60 * 1000);
    // Find 1h and 4h ago prices
    const oneHourAgo = now - 60 * 60 * 1000;
    const fourHoursAgo = now - 4 * 60 * 60 * 1000;
    const closest1h = history.paxgPriceLog.reduce((best, e) => (!best || Math.abs(e.ts - oneHourAgo) < Math.abs(best.ts - oneHourAgo) ? e : best), null);
    const closest4h = history.paxgPriceLog.reduce((best, e) => (!best || Math.abs(e.ts - fourHoursAgo) < Math.abs(best.ts - fourHoursAgo) ? e : best), null);
    if (closest1h && now - closest1h.ts < 75 * 60 * 1000) history.paxgPrice1h = closest1h.price;
    if (closest4h && now - closest4h.ts < 4.5 * 60 * 60 * 1000) history.paxgPrice4h = closest4h.price;

    // Flight to safety alert
    if (paxgUp && btcDown) {
      alerts.push({
        type: 'flight_to_safety',
        message: `Gold (PAXG) up ${goldBtc.paxgChange24h.toFixed(1)}% while BTC down ${Math.abs(goldBtc.btcChange24h).toFixed(1)}% — flight to safety`,
      });
    }
  }

  // News
  if (newsFlags.length > 0) {
    output.newsFlags = newsFlags;
    for (const nf of newsFlags) {
      alerts.push({
        type: 'news_keyword',
        message: `[${nf.source}] "${nf.title}" (keyword: ${nf.keyword})`,
      });
    }
  } else {
    output.newsFlags = [];
  }

  output.alerts = alerts;

  // Save output
  saveJSON(OUTPUT_FILE, output);
  saveJSON(HISTORY_FILE, history);

  // Log alerts to stdout (silent if none)
  if (alerts.length > 0) {
    for (const a of alerts) {
      console.log(`[MacroPulse] ${a.type}: ${a.message}`);
    }
  }
}

main().catch(() => {
  // Never crash — cron must stay clean
});
