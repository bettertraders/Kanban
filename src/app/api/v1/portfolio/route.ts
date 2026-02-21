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

    // Only count realized P&L from trades closed AFTER the current cycle started
    // (previous cycle P&L is already baked into starting_balance via compounding)
    const realizedPnl = Number(summary.cycle_realized_pnl ?? summary.total_realized_pnl ?? 0);

    const liveBalance = Math.round((startingBalance + realizedPnl + unrealizedPnl) * 100) / 100;

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
