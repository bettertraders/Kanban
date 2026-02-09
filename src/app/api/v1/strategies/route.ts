import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getAllStrategies } from '@/lib/strategies';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const strategies = getAllStrategies().map((strategy) => ({
      name: strategy.name,
      style: strategy.style,
      subStyle: strategy.subStyle,
      description: strategy.description,
      icon: strategy.icon,
      riskLevel: strategy.riskLevel,
      defaultConfig: strategy.defaultConfig
    }));

    return NextResponse.json({ strategies });
  } catch (error) {
    console.error('GET /strategies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
