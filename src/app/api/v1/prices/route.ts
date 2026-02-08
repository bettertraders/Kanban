import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getMultiplePrices, getTopCoins } from '@/lib/price-service';

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

// GET /api/v1/prices?pairs=BTC-USDT,ETH-USDT
// GET /api/v1/prices?top=10
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pairsParam = request.nextUrl.searchParams.get('pairs');
    const topParam = request.nextUrl.searchParams.get('top');

    if (pairsParam) {
      const pairs = pairsParam
        .split(',')
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map(normalizePair);

      if (!pairs.length) {
        return NextResponse.json({ error: 'pairs required' }, { status: 400 });
      }

      const prices = await getMultiplePrices(pairs);
      return NextResponse.json({ prices });
    }

    if (topParam) {
      const limit = parseInt(topParam, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        return NextResponse.json({ error: 'Invalid top value' }, { status: 400 });
      }

      const coins = await getTopCoins(limit);
      return NextResponse.json({ coins });
    }

    return NextResponse.json({ error: 'pairs or top query required' }, { status: 400 });
  } catch (error) {
    console.error('GET /prices error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
