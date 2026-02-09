import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

type CachedNews = {
  timestamp: number;
  items: NewsItem[];
};

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: CachedNews = { timestamp: 0, items: [] };

const SOURCES = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,GC=F&region=US&lang=en-US' },
] as const;

function stripCdata(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTag(item: string, tag: string) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = item.match(regex);
  if (!match) return '';
  const cleaned = stripCdata(match[1].trim());
  return decodeEntities(cleaned).trim();
}

function parseRss(feed: string, source: string) {
  const items = feed.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const parsed: NewsItem[] = [];

  items.forEach((item) => {
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link') || extractTag(item, 'guid');
    const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'dc:date');

    if (!title || !link) return;
    parsed.push({ title, link, pubDate, source });
  });

  return parsed;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = Date.now();
    if (cache.items.length && now - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ items: cache.items });
    }

    const results = await Promise.allSettled(
      SOURCES.map(async (source) => {
        const res = await fetch(source.url);
        if (!res.ok) throw new Error(`Failed to fetch ${source.name}`);
        const text = await res.text();
        return parseRss(text, source.name);
      })
    );

    const items = results
      .filter((result): result is PromiseFulfilledResult<NewsItem[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value);

    const sorted = items
      .map((item) => {
        const timestamp = Date.parse(item.pubDate);
        return { ...item, _ts: Number.isFinite(timestamp) ? timestamp : 0 } as NewsItem & { _ts: number };
      })
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 10)
      .map(({ _ts, ...item }) => item);

    if (!sorted.length) {
      return NextResponse.json({ error: 'No news available' }, { status: 502 });
    }

    cache = { timestamp: now, items: sorted };
    return NextResponse.json({ items: sorted });
  } catch (error) {
    console.error('GET /news error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
