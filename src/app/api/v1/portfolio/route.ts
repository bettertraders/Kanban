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

    const totalPnl = Number(summary.total_realized_pnl ?? 0);
    
    // starting_balance is set from Kraken balance — it ALREADY includes historical P&L
    // Trades on the board from before this cycle are "history" — their P&L is baked in
    // Only unrealized P&L from open positions should adjust the live balance
    // When bill closes a NEW trade (this cycle), it updates current_balance via account API
    // For now: live_balance = starting_balance + unrealized only
    // TODO: bill should PATCH /api/trading/account with Kraken balance after every trade
    const liveBalance = Math.round((startingBalance + unrealizedPnl) * 100) / 100;

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
