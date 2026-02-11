import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPortfolioStats } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // One-time fix: reset board-15 accounts still at 10000 default
    const { pool } = await import('@/lib/database');
    await pool.query(`UPDATE paper_accounts SET starting_balance = 1000, current_balance = 1000 WHERE board_id = 15 AND starting_balance = 10000`).catch(() => {});

    const stats = await getPortfolioStats(user.id);
    
    // Compute live_balance: paper_balance + realized_pnl + unrealized_pnl
    const paperBalance = Number(stats.summary?.paper_balance || 0);
    const realizedPnl = Number(stats.summary?.total_realized_pnl || 0);
    const unrealizedPnl = Number(stats.summary?.total_unrealized_pnl || 0);
    const liveBalance = Math.round((paperBalance + realizedPnl + unrealizedPnl) * 100) / 100;
    
    return NextResponse.json({
      ...stats,
      summary: { ...stats.summary, live_balance: liveBalance },
    });
  } catch (error) {
    console.error('GET /portfolio error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
