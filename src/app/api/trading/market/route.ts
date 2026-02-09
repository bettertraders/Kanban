import { NextResponse } from 'next/server';

// In-memory cache
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

async function fetchJSON(url: string) {
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

async function fetchMarketData() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.data;

  const [markets, trending, global, fng] = await Promise.all([
    fetchJSON(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false&price_change_percentage=24h,7d'
    ),
    fetchJSON('https://api.coingecko.com/api/v3/search/trending'),
    fetchJSON('https://api.coingecko.com/api/v3/global'),
    fetchJSON('https://api.alternative.me/fng/?limit=1').catch(() => ({ data: [{ value: '50', value_classification: 'Neutral' }] })),
  ]);

  // BTC & ETH
  const btc = markets.find((c: any) => c.id === 'bitcoin');
  const eth = markets.find((c: any) => c.id === 'ethereum');

  // Top gainers/losers
  const withChange = markets.filter((c: any) => c.price_change_percentage_24h_in_currency != null);
  const sorted = [...withChange].sort(
    (a: any, b: any) => b.price_change_percentage_24h_in_currency - a.price_change_percentage_24h_in_currency
  );
  const gainers = sorted.slice(0, 5);
  const losers = sorted.slice(-5).reverse();

  // Most volatile (biggest absolute swing)
  const volatile = [...withChange]
    .sort((a: any, b: any) => Math.abs(b.price_change_percentage_24h_in_currency) - Math.abs(a.price_change_percentage_24h_in_currency))
    .slice(0, 5);

  // Top volume (excluding BTC/ETH)
  const topVolume = markets
    .filter((c: any) => c.id !== 'bitcoin' && c.id !== 'ethereum')
    .sort((a: any, b: any) => (b.total_volume || 0) - (a.total_volume || 0))
    .slice(0, 5);

  // Top market cap (excluding BTC/ETH)
  const topMcap = markets
    .filter((c: any) => c.id !== 'bitcoin' && c.id !== 'ethereum')
    .slice(0, 5);

  const data = {
    overview: {
      btc: coinSummary(btc),
      eth: coinSummary(eth),
      totalMarketCap: global.data?.total_market_cap?.usd ?? 0,
      btcDominance: global.data?.market_cap_percentage?.btc ?? 0,
      fearGreed: {
        value: parseInt(fng.data?.[0]?.value ?? '50'),
        label: fng.data?.[0]?.value_classification ?? 'Neutral',
      },
    },
    movers: {
      gainers: gainers.map(coinSummary),
      losers: losers.map(coinSummary),
      volatile: volatile.map(coinSummary),
    },
    discovery: {
      trending: (trending.coins || []).slice(0, 7).map((t: any) => ({
        name: t.item?.name,
        symbol: t.item?.symbol,
        thumb: t.item?.thumb,
        marketCapRank: t.item?.market_cap_rank,
        priceBtc: t.item?.price_btc,
      })),
      topVolume: topVolume.map(coinSummary),
      topMarketCap: topMcap.map(coinSummary),
    },
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: now };
  return data;
}

function coinSummary(c: any) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    symbol: c.symbol?.toUpperCase(),
    image: c.image,
    price: c.current_price,
    change24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h,
    change7d: c.price_change_percentage_7d_in_currency ?? null,
    marketCap: c.market_cap,
    volume: c.total_volume,
  };
}

export async function GET() {
  try {
    const data = await fetchMarketData();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Market API error:', err);
    // Return cached data if available even if stale
    if (cache?.data) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
