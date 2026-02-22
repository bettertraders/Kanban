import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPortfolioStats, getHarvestState, pool } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stats = await getPortfolioStats(user.id);

    const summary = { ...stats.summary };
    
    // Get compounding base from paper_accounts (synced from harvest state)
    // This works on Railway because it reads from PostgreSQL, not local file
    const boardId = 15; // Live trading board
    const paperRes = await pool.query(
      'SELECT starting_balance FROM paper_accounts WHERE board_id = $1 ORDER BY id LIMIT 1',
      [boardId]
    );
    const dbStartingBalance = paperRes.rows[0]?.starting_balance;
    
    // Use DB value if available, otherwise fall back to summary
    const startingBalance = dbStartingBalance ? parseFloat(dbStartingBalance) : Number(summary.starting_balance || 0);
    
    const unrealizedPnl = Number(summary.total_unrealized_pnl || 0);

    // Cycle P&L: only trades closed AFTER cycle start (for display/slider)
    // But do NOT add total_realized_pnl to starting_balance — it's already baked in
    // starting_balance comes from Kraken balance (or compounding reset) which includes past gains
    const cyclePnl = Number(summary.cycle_realized_pnl ?? 0);
    const totalPnl = Number(summary.total_realized_pnl ?? 0);
    
    // live_balance = starting_balance + ONLY this cycle's realized P&L + unrealized
    // Previous cycles' P&L is already in starting_balance
    const liveBalance = Math.round((startingBalance + cyclePnl + unrealizedPnl) * 100) / 100;

    // Get harvest/cycle state for UI
    let harvestState = { cycleNumber: 0, cycleRegime: 'NONE', cycleTarget: 8, cycleGain: 0, cycleActive: false };
    try {
      harvestState = await getHarvestState();
    } catch { /* defaults */ }

    return NextResponse.json({
      ...stats,
      summary: {
        ...summary,
        live_balance: liveBalance,
        starting_balance: startingBalance, // Use DB compounding base
        cycle_number: harvestState.cycleNumber,
        cycle_regime: harvestState.cycleRegime,
        cycle_target: harvestState.cycleTarget,
        cycle_gain: harvestState.cycleGain,
        cycle_active: harvestState.cycleActive,
      },
    });
  } catch (error) {
    console.error('GET /portfolio error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
