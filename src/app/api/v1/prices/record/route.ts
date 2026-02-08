import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getCurrentPrice } from '@/lib/price-service';
import { recordPriceSnapshot, updateActiveTradePrices } from '@/lib/database';

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

// POST /api/v1/prices/record
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const pairs = body?.pairs;

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json({ error: 'pairs array required' }, { status: 400 });
    }

    const priceMap: Record<string, number> = {};
    let recorded = 0;
    const errors: Array<{ pair: string; error: string }> = [];

    for (const rawPair of pairs) {
      const normalizedPair = normalizePair(String(rawPair));
      try {
        const snapshot = await getCurrentPrice(normalizedPair);
        await recordPriceSnapshot(normalizedPair, snapshot.price, snapshot.volume24h);
        priceMap[normalizedPair] = snapshot.price;
        priceMap[normalizedPair.replace('/', '-')] = snapshot.price;
        recorded += 1;
      } catch (error) {
        console.error(`Price record failed for ${normalizedPair}:`, error);
        errors.push({ pair: normalizedPair, error: 'FETCH_FAILED' });
      }
    }

    const updatedTrades = await updateActiveTradePrices(priceMap);

    return NextResponse.json({ recorded, updatedTrades, errors });
  } catch (error) {
    console.error('POST /prices/record error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
