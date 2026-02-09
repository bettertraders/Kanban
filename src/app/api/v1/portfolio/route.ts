import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPortfolioStats } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stats = await getPortfolioStats(user.id);
    return NextResponse.json(stats);
  } catch (e) {
    console.error('GET /portfolio error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
