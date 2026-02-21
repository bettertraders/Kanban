import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPortfolioStats, getHarvestState } from '@/lib/database';
import fs from 'fs';
import path from 'path';

const HARVEST_STATE_FILE = path.join(process.env.HOME || '', 'Projects/tbt-platform/compounding/.harvest-state.json');

function getCompoundingBase(): number | null {
  try {
    const data = JSON.parse(fs.readFileSync(HARVEST_STATE_FILE, 'utf8'));
    return data?.stats?.compoundingBase || data?.stats?.currentBalance || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stats = await getPortfolioStats(user.id);

    const summary = { ...stats.summary };
    
    // Use compounding base from harvest state if available (for Cycle 1+), otherwise fall back to DB starting_balance
    const compoundingBase = getCompoundingBase();
    const startingBalance = compoundingBase ?? Number(summary.starting_balance || 0);
    
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
        starting_balance: startingBalance, // Override with compounding base
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
