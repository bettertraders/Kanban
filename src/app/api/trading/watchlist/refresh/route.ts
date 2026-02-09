import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';

const BOARD_ID = 15;
const STABLECOINS = new Set([
  'tether', 'usd-coin', 'dai', 'binance-usd', 'trueusd', 'first-digital-usd',
  'usdd', 'frax', 'paxos-standard', 'gemini-dollar', 'paypal-usd',
]);
const STABLECOIN_SYMBOLS = new Set([
  'usdt', 'usdc', 'dai', 'busd', 'tusd', 'fdusd', 'usdd', 'frax', 'usdp', 'gusd', 'pyusd',
]);

function isStablecoin(coin: { id: string; symbol: string }): boolean {
  return STABLECOINS.has(coin.id) || STABLECOIN_SYMBOLS.has(coin.symbol.toLowerCase());
}

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
  market_cap_rank: number;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatPct(pct: number | null): string {
  if (pct == null) return 'N/A';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

async function fetchCoins(perPage: number): Promise<CoinData[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&sparkline=false&price_change_percentage=24h,7d`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
  return res.json();
}

function filterStables(coins: CoinData[]): CoinData[] {
  return coins.filter(c => !isStablecoin(c));
}

function findCoin(coins: CoinData[], id: string): CoinData | undefined {
  return coins.find(c => c.id === id);
}

async function selectCoins(riskLevel: string): Promise<CoinData[]> {
  const perPage = riskLevel === 'aggressive' ? 100 : riskLevel === 'moderate' ? 30 : 10;
  const allCoins = await fetchCoins(perPage);
  const tradeable = filterStables(allCoins);

  const btc = findCoin(tradeable, 'bitcoin') ?? tradeable[0];
  const eth = findCoin(tradeable, 'ethereum') ?? tradeable[1];

  const remaining = tradeable.filter(c => c.id !== btc.id && c.id !== eth.id);
  let picks: CoinData[];

  switch (riskLevel) {
    case 'aggressive': {
      // Top 3 highest 24h gainers (excluding BTC/ETH)
      const sorted = [...remaining].sort(
        (a, b) => (b.price_change_percentage_24h_in_currency ?? -999) - (a.price_change_percentage_24h_in_currency ?? -999)
      );
      picks = sorted.slice(0, 3);
      break;
    }
    case 'moderate': {
      // Top 20 by market cap, then best 24h performers
      const top20 = remaining.slice(0, 18); // already sorted by market cap
      const sorted = [...top20].sort(
        (a, b) => (b.price_change_percentage_24h_in_currency ?? -999) - (a.price_change_percentage_24h_in_currency ?? -999)
      );
      picks = sorted.slice(0, 3);
      break;
    }
    default: {
      // Conservative: top 5 by market cap
      picks = remaining.slice(0, 3);
      break;
    }
  }

  return [btc, eth, ...picks].slice(0, 5);
}

function getPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway.internal') ? false : { rejectUnauthorized: false },
  });
}

export async function POST(request: NextRequest) {
  const pool = getPool();
  try {
    const body = await request.json().catch(() => ({}));
    const riskLevel: string = body.riskLevel || 'conservative';

    if (!['conservative', 'moderate', 'aggressive'].includes(riskLevel)) {
      return NextResponse.json({ error: 'Invalid riskLevel. Use: conservative, moderate, aggressive' }, { status: 400 });
    }

    // 1. Fetch coins based on risk level
    const coins = await selectCoins(riskLevel);

    // 2. Delete all existing watchlist tasks on board 15
    await pool.query('DELETE FROM tasks WHERE board_id = $1', [BOARD_ID]);

    // 3. Create 5 new cards
    const created = [];
    for (let i = 0; i < coins.length; i++) {
      const coin = coins[i];
      const isPinned = coin.id === 'bitcoin' || coin.id === 'ethereum';
      const title = `${coin.symbol.toUpperCase()} - ${coin.name}`;
      const description = [
        `Price: ${formatPrice(coin.current_price)}`,
        `24h: ${formatPct(coin.price_change_percentage_24h_in_currency)}`,
        `7d: ${formatPct(coin.price_change_percentage_7d_in_currency)}`,
      ].join('\n');

      const result = await pool.query(
        `INSERT INTO tasks (board_id, title, description, column_name, priority, labels, created_by, position)
         VALUES ($1, $2, $3, 'Watchlist', $4, $5, 3, $6) RETURNING *`,
        [
          BOARD_ID,
          title,
          description,
          isPinned ? 'High' : 'Medium',
          JSON.stringify(['watchlist', riskLevel]),
          i,
        ]
      );
      created.push(result.rows[0]);
    }

    return NextResponse.json({
      success: true,
      riskLevel,
      coins: coins.map(c => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        price: c.current_price,
        change24h: c.price_change_percentage_24h_in_currency,
        change7d: c.price_change_percentage_7d_in_currency,
      })),
      cardsCreated: created.length,
    });
  } catch (error: any) {
    console.error('Watchlist refresh error:', error);
    return NextResponse.json({ error: error.message || 'Failed to refresh watchlist' }, { status: 500 });
  } finally {
    await pool.end();
  }
}
