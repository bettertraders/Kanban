#!/usr/bin/env node
/**
 * 📰 Owen's News Scanner
 * Runs every 5 min via crontab. Scans RSS feeds for crypto-relevant headlines.
 * Silent when no new articles (cron-friendly).
 *
 * Usage: node scripts/owen-news-scanner.js
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '.owen-news.json');
const SEEN_FILE = path.join(__dirname, '.owen-news-seen.json');
const MAX_SEEN = 200;

const FEEDS = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'coindesk' },
  { url: 'https://cointelegraph.com/rss', source: 'cointelegraph' },
];

const KEYWORDS = [
  'hack', 'exploit', 'ban', 'regulation', 'SEC', 'ETF', 'crash', 'surge',
  'halving', 'approval', 'blackrock', 'fed', 'rates', 'liquidation',
  'war', 'sanctions', 'lawsuit', 'exchange', 'adoption',
];

const HIGH = /hack|exploit|ban|crash|sanctions|lawsuit|war/i;
const MEDIUM = /SEC|regulation|fed|rates/i;
// Everything else matched = low

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

function classifySeverity(keyword) {
  if (HIGH.test(keyword)) return 'high';
  if (MEDIUM.test(keyword)) return 'medium';
  return 'low';
}

function extractItems(xml, source) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    if (title) items.push({ title: title.trim(), publishedAt: pubDate.trim(), source });
  }
  return items;
}

async function fetchFeed(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    return await res.text();
  } catch { return ''; }
}

async function main() {
  const seen = loadJSON(SEEN_FILE) || { titles: [] };
  const seenSet = new Set(seen.titles);
  const articles = [];

  for (const feed of FEEDS) {
    const xml = await fetchFeed(feed.url);
    const items = extractItems(xml, feed.source);
    for (const item of items) {
      if (seenSet.has(item.title)) continue;
      const titleLower = item.title.toLowerCase();
      for (const kw of KEYWORDS) {
        if (titleLower.includes(kw.toLowerCase())) {
          articles.push({
            title: item.title,
            keyword: kw,
            source: item.source,
            publishedAt: item.publishedAt,
            severity: classifySeverity(kw),
          });
          break; // one keyword match per article
        }
      }
      seenSet.add(item.title);
      seen.titles.push(item.title);
    }
  }

  // Keep seen list bounded
  if (seen.titles.length > MAX_SEEN) {
    seen.titles = seen.titles.slice(-MAX_SEEN);
  }
  atomicWrite(SEEN_FILE, seen);

  const highRiskCount = articles.filter(a => a.severity === 'high').length;
  const output = {
    timestamp: Date.now(),
    articles,
    highRiskCount,
    summary: articles.length > 0
      ? `${highRiskCount} high-risk, ${articles.length} total headlines detected`
      : 'No new relevant headlines',
  };

  atomicWrite(OUTPUT_FILE, output);

  if (articles.length > 0) {
    console.log(`[Owen News] 📰 ${output.summary}`);
    for (const a of articles) {
      const icon = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🟢';
      console.log(`  ${icon} [${a.source}] ${a.title} (${a.keyword})`);
    }
  }
}

main().catch(() => {});
