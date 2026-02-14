import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { pool } from '@/lib/database';

// GET /api/v1/leaderboard/traders — leaderboard built from actual trade data
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get all closed trades grouped by trader (user)
    const result = await pool.query(`
      SELECT 
        t.created_by,
        u.name as trader_name,
        b.name as board_name,
        b.id as board_id,
        COUNT(*) FILTER (WHERE t.column_name IN ('Closed','Wins','Losses','Parked','Inactive')) as total_trades,
        COUNT(*) FILTER (WHERE (t.column_name IN ('Closed','Wins') AND COALESCE(t.pnl_dollar, 0) > 0) OR (t.column_name IN ('Parked','Inactive') AND t.pnl_dollar > 0)) as wins,
        COUNT(*) FILTER (WHERE (t.column_name IN ('Closed','Losses') AND COALESCE(t.pnl_dollar, 0) <= 0) OR (t.column_name IN ('Parked','Inactive') AND t.pnl_dollar <= 0)) as losses,
        COUNT(*) FILTER (WHERE t.column_name = 'Active') as open_trades,
        COALESCE(SUM(t.pnl_dollar) FILTER (WHERE t.column_name IN ('Closed','Wins','Losses','Parked','Inactive')), 0) as total_pnl,
        COALESCE(SUM(t.position_size) FILTER (WHERE t.column_name IN ('Closed','Wins','Losses','Parked','Inactive')), 0) as total_volume,
        MAX(t.pnl_dollar) FILTER (WHERE t.column_name IN ('Closed','Wins','Losses','Parked','Inactive')) as best_trade,
        MIN(t.pnl_dollar) FILTER (WHERE t.column_name IN ('Closed','Wins','Losses','Parked','Inactive')) as worst_trade,
        AVG(EXTRACT(EPOCH FROM (t.exited_at - t.entered_at))) FILTER (WHERE t.exited_at IS NOT NULL AND t.entered_at IS NOT NULL) as avg_hold_seconds,
        MAX(t.exited_at) as last_trade_at
      FROM trades t
      JOIN users u ON t.created_by = u.id
      JOIN boards b ON t.board_id = b.id
      WHERE b.board_type = 'trading'
      GROUP BY t.created_by, u.name, b.name, b.id
      ORDER BY COALESCE(SUM(t.pnl_dollar) FILTER (WHERE t.column_name IN ('Closed','Wins','Losses')), 0) DESC
    `);

    const leaderboard = result.rows.map((row, index) => {
      const totalTrades = Number(row.total_trades) || 0;
      const wins = Number(row.wins) || 0;
      const losses = Number(row.losses) || 0;
      const totalPnl = Number(row.total_pnl) || 0;
      const totalVolume = Number(row.total_volume) || 0;

      return {
        rank: index + 1,
        trader_id: row.created_by,
        trader_name: row.trader_name || 'Unknown',
        board_name: row.board_name,
        board_id: row.board_id,
        total_trades: totalTrades,
        wins,
        losses,
        open_trades: Number(row.open_trades) || 0,
        win_rate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
        total_pnl: totalPnl,
        total_volume: totalVolume,
        avg_trade: totalTrades > 0 ? totalPnl / totalTrades : 0,
        best_trade: Number(row.best_trade) || 0,
        worst_trade: Number(row.worst_trade) || 0,
        avg_hold_seconds: Number(row.avg_hold_seconds) || null,
        last_trade_at: row.last_trade_at,
        // Return % based on volume
        return_pct: totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0,
      };
    });

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error('GET /leaderboard/traders error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
