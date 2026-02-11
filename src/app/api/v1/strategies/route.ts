import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getAllStrategies } from '@/lib/strategies';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const strategies = getAllStrategies().map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      direction: strategy.direction,
      type: strategy.type,
      description: strategy.description,
      indicators: strategy.indicators,
      riskLevels: strategy.riskLevels,
      markets: strategy.markets,
    }));

    return NextResponse.json({ strategies });
  } catch (error) {
    console.error('GET /strategies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
