import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPortfolioStats } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stats = await getPortfolioStats(user.id);

    const summary = { ...stats.summary };
    const startingBalance = Number(summary.starting_balance || 0);
    const realizedPnl = Number(summary.total_realized_pnl || 0);
    const unrealizedPnl = Number(summary.total_unrealized_pnl || 0);

    const liveBalance = Math.round((startingBalance + realizedPnl + unrealizedPnl) * 100) / 100;

    return NextResponse.json({
      ...stats,
      summary: { ...summary, live_balance: liveBalance },
    });
  } catch (error) {
    console.error('GET /portfolio error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
