import { NextResponse } from 'next/server';

type NewsItem = { title: string; link: string; pubDate: string; source: string };
type CachedNews = { timestamp: number; items: NewsItem[] };

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: CachedNews = { timestamp: 0, items: [] };

const SOURCES = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,GC=F&region=US&lang=en-US' },
] as const;

function stripCdata(v: string) { return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1'); }
function decodeEntities(v: string) {
  return v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function extractTag(item: string, tag: string) {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeEntities(stripCdata(m[1].trim())).trim() : '';
}
function parseRss(feed: string, source: string): NewsItem[] {
  return (feed.match(/<item[\s\S]*?<\/item>/gi) ?? [])
    .map(item => ({ title: extractTag(item, 'title'), link: extractTag(item, 'link') || extractTag(item, 'guid'), pubDate: extractTag(item, 'pubDate') || extractTag(item, 'dc:date'), source }))
    .filter(i => i.title && i.link);
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = Date.now();
    if (cache.items.length && now - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ items: cache.items });
    }
    const results = await Promise.allSettled(
      SOURCES.map(async s => { const r = await fetch(s.url); if (!r.ok) throw new Error(); return parseRss(await r.text(), s.name); })
    );
    const items = results
      .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .map(i => ({ ...i, _ts: Date.parse(i.pubDate) || 0 }))
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 10)
      .map(({ _ts, ...i }) => i);
    if (!items.length) return NextResponse.json({ items: [] });
    cache = { timestamp: now, items };
    return NextResponse.json({ items });
  } catch { return NextResponse.json({ items: [] }); }
}
