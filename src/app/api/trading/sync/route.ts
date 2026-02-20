import { NextRequest, NextResponse } from 'next/server';
import {
  ensureTradingTables,
  replaceQueueCoinScores,
  upsertStrategyState,
  upsertTradingAccount,
} from '@/lib/db/trading';

export const dynamic = 'force-dynamic';

type RawScore = {
  symbol?: string;
  score?: number;
  rsi?: number;
  price?: number;
  change24h?: number;
  rank?: number;
};

const toNumber = (value: any, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

function normalizeScores(payload: any): RawScore[] {
  if (!payload) return [];
  const list =
    payload.scores ||
    payload.watchlist ||
    payload.queue ||
    payload.coins ||
    payload.items ||
    [];

  if (!Array.isArray(list)) return [];

  return list
    .map((item: any, index: number) => ({
      symbol: String(item.symbol ?? item.ticker ?? item.pair ?? '').trim(),
      score: toNumber(item.score ?? item.rankScore ?? item.rating ?? 0),
      rsi: toNumber(item.rsi ?? item.rsiValue ?? 0),
      price: toNumber(item.price ?? item.last ?? 0),
      change24h: toNumber(item.change24h ?? item.change_24h ?? item.changePct ?? 0),
      rank: Number.isFinite(Number(item.rank)) ? Number(item.rank) : index + 1,
    }))
    .filter((item: RawScore) => item.symbol);
}

async function getKrakenBalance(): Promise<number | null> {
  try {
    const { default: ccxt } = await import('ccxt');
    const apiKey = process.env.KRAKEN_API_KEY || '';
    const apiSecret = process.env.KRAKEN_API_SECRET || '';

    if (!apiKey || !apiSecret) return null;

    const exchange = new ccxt.kraken({
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
    });

    const balance = await exchange.fetchBalance();
    const b = balance as unknown as Record<string, Record<string, number>>;
    const usd = b.total?.USD || b.free?.USD || b.total?.ZUSD || b.free?.ZUSD || 0;
    const usdt = b.total?.USDT || b.free?.USDT || 0;
    return usd + usdt;
  } catch (error) {
    console.error('Sync Kraken balance error:', error);
    return null;
  }
}

async function fetchScoresFromUrl(url: string) {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Backtester fetch failed: ${res.status}`);
  return res.json();
}

async function runSync(request: NextRequest, body: any) {
  const secret = process.env.TRADING_SYNC_SECRET;
  if (secret && request.headers.get('x-trading-sync-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureTradingTables();

  const userId = Number(
    request.nextUrl.searchParams.get('userId') ||
    body?.userId ||
    body?.user_id ||
    1
  );

  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const exchange = String(body?.exchange || request.nextUrl.searchParams.get('exchange') || 'kraken');

  const result: Record<string, any> = {
    ok: true,
    userId,
    exchange,
  };

  const krakenBalance = await getKrakenBalance();
  if (krakenBalance != null) {
    const account = await upsertTradingAccount({
      userId,
      exchange,
      currentBalance: krakenBalance,
    });
    result.krakenBalance = krakenBalance;
    result.account = {
      base_balance: account.base_balance,
      current_balance: account.current_balance,
      updated_at: account.updated_at,
    };
  } else {
    result.krakenBalance = null;
  }

  let scoresPayload = body?.scores || body?.watchlist || body?.queue_coin_scores;

  if (!scoresPayload) {
    const scoresUrl =
      body?.scoresUrl ||
      body?.scores_url ||
      request.nextUrl.searchParams.get('scoresUrl') ||
      process.env.BACKTESTER_SCORES_URL;

    if (scoresUrl) {
      try {
        const fetched = await fetchScoresFromUrl(scoresUrl);
        scoresPayload = fetched;
      } catch (error) {
        console.error('Backtester fetch error:', error);
      }
    }
  }

  const normalizedScores = normalizeScores(scoresPayload);
  if (normalizedScores.length > 0) {
    await replaceQueueCoinScores(
      userId,
      normalizedScores.map((score) => ({
        symbol: score.symbol || '',
        score: toNumber(score.score),
        rsi: toNumber(score.rsi),
        price: toNumber(score.price),
        change24h: toNumber(score.change24h),
        rank: Number.isFinite(Number(score.rank)) ? Number(score.rank) : null,
      }))
    );
    result.queueCoinScores = normalizedScores.length;
  }

  const queueCoins =
    body?.queueCoins ||
    body?.queue_coins ||
    body?.strategy?.queueCoins ||
    body?.strategy?.queue_coins ||
    (normalizedScores.length ? normalizedScores.map((score) => score.symbol).filter(Boolean) : null);

  const riskParams = body?.riskParams || body?.risk_params || body?.strategy?.riskParams || body?.strategy?.risk_params;

  if (queueCoins || riskParams) {
    await upsertStrategyState({
      userId,
      strategyId: body?.strategyId || body?.strategy_id || 'momentum-long',
      name: body?.name || body?.strategyName || body?.strategy?.name || 'Momentum Long',
      enabled: body?.enabled ?? true,
      direction: body?.direction || body?.strategy?.direction || 'LONG',
      weight: body?.weight ?? 1.5,
      riskParams: riskParams || null,
      queueCoins: Array.isArray(queueCoins) ? queueCoins : null,
    });
    result.strategyStateUpdated = true;
  }

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return runSync(request, null);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return runSync(request, body);
}
