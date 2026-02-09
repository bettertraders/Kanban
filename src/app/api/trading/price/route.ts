import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getCurrentPrice } from '@/lib/price-service';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const symbol = request.nextUrl.searchParams.get('symbol');
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const normalized = symbol.replace(/-/g, '/').replace(/USDT$/, '/USDT').replace(/\/\//, '/').toUpperCase();
    const pair = normalized.includes('/') ? normalized : `${normalized}/USDT`;

    const snapshot = await getCurrentPrice(pair);
    return NextResponse.json({
      symbol: pair,
      price: snapshot.price,
      change24h: snapshot.change24h,
      volume24h: snapshot.volume24h,
      high24h: snapshot.high24h,
      low24h: snapshot.low24h,
      timestamp: snapshot.timestamp,
    });
  } catch (error) {
    console.error('GET /api/trading/price error:', error);
    return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 });
  }
}
