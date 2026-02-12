import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { 
  STRATEGY_CATALOG, 
  getActiveStrategies, 
  getAllocation, 
  MARKETS,
  type MarketRegime 
} from '@/lib/strategies';
import { pool } from '@/lib/database';

/**
 * GET /api/trading/strategies?boardId=X
 * Returns strategy catalog with dynamic active/inactive state based on market conditions
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const boardId = Number(url.searchParams.get('boardId') || 15);
    const riskLevel = (url.searchParams.get('riskLevel') || 'bold') as 'safe' | 'balanced' | 'bold';

    // Get current market conditions from bot_stats or latest analysis
    let marketRegime: MarketRegime = 'ranging';
    let fearGreedIndex = 50;
    
    try {
      const botRes = await pool.query(
        `SELECT metadata FROM trading_bots WHERE board_id = $1 ORDER BY id LIMIT 1`,
        [boardId]
      );
      if (botRes.rows[0]?.metadata) {
        const meta = typeof botRes.rows[0].metadata === 'string' 
          ? JSON.parse(botRes.rows[0].metadata) 
          : botRes.rows[0].metadata;
        if (meta.market_regime) marketRegime = meta.market_regime;
        if (meta.fear_greed_index != null) fearGreedIndex = meta.fear_greed_index;
      }
    } catch {}

    // Count trades per strategy from actual trade data
    const tradeCounts: Record<string, { total: number; wins: number; avgHold: number }> = {};
    try {
      const tradesRes = await pool.query(
        `SELECT t.metadata, t.column_name, t.created_at, t.updated_at
         FROM tasks t 
         JOIN columns c ON t.column_id = c.id 
         WHERE c.board_id = $1 AND t.metadata IS NOT NULL`,
        [boardId]
      );
      for (const row of tradesRes.rows) {
        const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        const reason = meta?.entry_reason || meta?.strategy || '';
        if (!reason) continue;
        // Map entry_reason to strategy id
        const stratId = reason;
        if (!tradeCounts[stratId]) tradeCounts[stratId] = { total: 0, wins: 0, avgHold: 0 };
        tradeCounts[stratId].total++;
        if (row.column_name === 'Wins' || row.column_name === 'Closed') tradeCounts[stratId].wins++;
      }
    } catch {}

    // Get active strategies with market-aware state
    const strategies = getActiveStrategies(riskLevel, marketRegime, fearGreedIndex);
    
    // Enrich with trade counts
    for (const s of strategies) {
      const counts = tradeCounts[s.id];
      if (counts) {
        s.tradeCount = counts.total;
      } else {
        s.tradeCount = 0;
      }
    }

    // Get allocation for this risk level
    const allocation = getAllocation(riskLevel);

    return NextResponse.json({
      engine: {
        name: 'TBO Trading Engine',
        version: '2.0',
      },
      riskLevel,
      marketRegime,
      fearGreedIndex,
      strategies,
      allocation,
      markets: MARKETS,
    });
  } catch (error) {
    console.error('GET /api/trading/strategies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
