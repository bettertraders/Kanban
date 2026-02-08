import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getCurrentPrice, getOHLCV } from '@/lib/price-service';

const SUPPORTED_TIMEFRAMES = new Set(['1h', '4h', '1d']);

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

function isSymbolError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /symbol|market|pair|BadSymbol|ExchangeError/i.test(message);
}

// GET /api/v1/prices/:pair
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pair: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pair } = await params;
    if (!pair) return NextResponse.json({ error: 'Pair required' }, { status: 400 });

    const normalizedPair = normalizePair(pair);
    const history = request.nextUrl.searchParams.get('history');
    const limitParam = request.nextUrl.searchParams.get('limit');

    if (history && !SUPPORTED_TIMEFRAMES.has(history)) {
      return NextResponse.json({ error: 'Unsupported timeframe' }, { status: 400 });
    }

    const limit = limitParam ? parseInt(limitParam, 10) : 24;
    if (!Number.isFinite(limit) || limit <= 0) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }

    const current = await getCurrentPrice(normalizedPair);
    const response: Record<string, unknown> = {
      pair: normalizedPair,
      price: current.price,
      volume24h: current.volume24h,
      change24h: current.change24h,
      timestamp: current.timestamp
    };

    if (history) {
      const ohlcv = await getOHLCV(normalizedPair, history, limit);
      response.ohlcv = ohlcv;
    }

    return NextResponse.json(response);
  } catch (error) {
    if (isSymbolError(error)) {
      return NextResponse.json({ error: 'Pair not found' }, { status: 404 });
    }
    console.error('GET /prices/[pair] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
