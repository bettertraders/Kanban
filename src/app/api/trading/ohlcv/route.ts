import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getOHLCV } from '@/lib/price-service';

export async function GET(request: NextRequest) {
  try {
    // Auth optional — public market data
    let user: any = null;
    try { user = await getAuthenticatedUser(request); } catch {}

    const symbol = request.nextUrl.searchParams.get('symbol');
    const timeframe = request.nextUrl.searchParams.get('timeframe') || '4h';
    const limitParam = request.nextUrl.searchParams.get('limit') || '100';

    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const normalized = symbol.replace(/-/g, '/').replace(/USDT$/, '/USDT').replace(/\/\//, '/').toUpperCase();
    const pair = normalized.includes('/') ? normalized : `${normalized}/USDT`;
    const limit = Math.min(500, Math.max(1, parseInt(limitParam, 10) || 100));

    const candles = await getOHLCV(pair, timeframe, limit);
    return NextResponse.json({ symbol: pair, timeframe, candles });
  } catch (error) {
    console.error('GET /api/trading/ohlcv error:', error);
    return NextResponse.json({ error: 'Failed to fetch OHLCV' }, { status: 500 });
  }
}
