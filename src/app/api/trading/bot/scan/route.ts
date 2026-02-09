import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { scanWatchlist } from '@/lib/trading-engine';
import { DEFAULT_WATCHLIST } from '@/lib/coin-scanner';

// POST /api/trading/bot/scan — scan watchlist with trading engine
// Body: { symbols?: string[], timeframe?: string }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const symbols = Array.isArray(body.symbols) && body.symbols.length ? body.symbols : DEFAULT_WATCHLIST;
    const timeframe = body.timeframe || '4h';

    const results = await scanWatchlist(symbols, timeframe);

    return NextResponse.json({
      scanned: results.length,
      timeframe,
      results,
      buys: results.filter(r => r.action === 'buy'),
      sells: results.filter(r => r.action === 'sell'),
      holds: results.filter(r => r.action === 'hold'),
    });
  } catch (error) {
    console.error('POST /api/trading/bot/scan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
