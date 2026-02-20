import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPortfolioStats } from '@/lib/database';
import { fetchKrakenBalances } from '@/lib/kraken-sync';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stats = await getPortfolioStats(user.id);

    const summary = { ...stats.summary };
    const startingBalance = Number(summary.starting_balance || 0);
    const realizedPnl = Number(summary.total_realized_pnl || 0);
    const unrealizedPnl = Number(summary.total_unrealized_pnl || 0);
    const totalPositionSize = Number(summary.total_portfolio_value || 0);

    let krakenUsdBalance: number | null = null;
    const hasKrakenCredentials = Boolean(process.env.KRAKEN_API_KEY && process.env.KRAKEN_API_SECRET);
    if (hasKrakenCredentials) {
      try {
        const balances = await fetchKrakenBalances();
        const usdBalance = balances.USD ?? balances.ZUSD ?? balances.USDC ?? balances.USDT ?? null;
        if (usdBalance !== null && Number.isFinite(usdBalance)) {
          krakenUsdBalance = Number(usdBalance);
        }
      } catch (error) {
        console.error('[portfolio] Kraken balance fetch failed:', error);
      }
    }

    if (krakenUsdBalance !== null) {
      const paperBalance = Number(summary.paper_balance || 0);
      const isStalePaperBalance = paperBalance <= 0 || Math.abs(paperBalance - krakenUsdBalance) > 0.01;
      if (isStalePaperBalance) {
        summary.paper_balance = Math.round(krakenUsdBalance * 100) / 100;
      }
    }

    let liveBalance = Math.round((startingBalance + realizedPnl + unrealizedPnl) * 100) / 100;
    if (krakenUsdBalance !== null) {
      const activePositionValue = totalPositionSize + unrealizedPnl;
      liveBalance = Math.round((krakenUsdBalance + activePositionValue) * 100) / 100;
    }

    return NextResponse.json({
      ...stats,
      summary: { ...summary, live_balance: liveBalance },
    });
  } catch (error) {
    console.error('GET /portfolio error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
