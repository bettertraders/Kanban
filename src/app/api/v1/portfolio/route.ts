import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPortfolioStats, getHarvestState, pool } from '@/lib/database';
import https from 'https';

// Calculate live Kraken portfolio value from active trades + public ticker
async function getKrakenPortfolioValue(userId: number): Promise<number | null> {
  try {
    const result = await pool.query(
      `SELECT coin_pair, position_size, entry_price FROM trades 
       WHERE board_id = 15 AND column_name = 'Active' AND created_by = $1`,
      [userId]
    );
    if (result.rows.length === 0) return null;

    const pairs = result.rows.map((t: { coin_pair: string }) => t.coin_pair.replace('/', '')).join(',');
    const priceData = await new Promise<Record<string, number>>((resolve) => {
      https.get(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const prices: Record<string, number> = {};
            if (json.result) {
              for (const [pair, info] of Object.entries(json.result)) {
                const ticker = info as { c?: string[] };
                if (ticker.c?.[0]) prices[pair] = parseFloat(ticker.c[0]);
              }
            }
            resolve(prices);
          } catch { resolve({}); }
        });
      }).on('error', () => resolve({}));
    });

    let totalValue = 0;
    for (const trade of result.rows) {
      const posSize = parseFloat(trade.position_size) || 0;
      const entryPrice = parseFloat(trade.entry_price) || 0;
      if (posSize <= 0 || entryPrice <= 0) continue;
      const qty = posSize / entryPrice;
      const normalized = trade.coin_pair.replace('/', '');
      let livePrice = 0;
      for (const [pair, price] of Object.entries(priceData)) {
        if (pair.includes(normalized.replace('USD', '')) && pair.includes('USD')) {
          livePrice = price; break;
        }
      }
      totalValue += livePrice > 0 ? qty * livePrice : posSize;
    }
    return totalValue > 0 ? totalValue : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stats = await getPortfolioStats(user.id);

    const summary = { ...stats.summary };
    
    // Get Kraken live portfolio value (source of truth)
    const krakenValue = await getKrakenPortfolioValue(user.id);
    
    // Get paper account for this user specifically
    const boardId = 15;
    const paperRes = await pool.query(
      'SELECT starting_balance FROM paper_accounts WHERE board_id = $1 AND user_id = $2 LIMIT 1',
      [boardId, user.id]
    );
    const dbStartingBalance = paperRes.rows[0]?.starting_balance;
    
    const startingBalance = dbStartingBalance ? parseFloat(dbStartingBalance) : Number(summary.starting_balance || 0);
    const unrealizedPnl = Number(summary.total_unrealized_pnl || 0);
    const totalPnl = Number(summary.total_realized_pnl ?? 0);
    
    // Use Kraken live value as the balance, fall back to DB calculation
    const liveBalance = krakenValue != null 
      ? Math.round(krakenValue * 100) / 100
      : Math.round((startingBalance + unrealizedPnl) * 100) / 100;

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
