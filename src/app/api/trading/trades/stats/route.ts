import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTradesForBoard } from '@/lib/database';

// GET /api/trading/trades/stats?boardId=X — win rate, total P&L, avg trade, best/worst
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = Number(request.nextUrl.searchParams.get('boardId'));
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const allTrades = await getTradesForBoard(boardId);
    const closed = allTrades.filter(t => t.status === 'closed' || t.column_name === 'Wins' || t.column_name === 'Losses');
    const open = allTrades.filter(t => t.status === 'active' || t.column_name === 'Active');

    const wins = closed.filter(t => Number(t.pnl_dollar) > 0);
    const losses = closed.filter(t => Number(t.pnl_dollar) <= 0);
    const totalPnl = closed.reduce((sum, t) => sum + (Number(t.pnl_dollar) || 0), 0);
    const avgTrade = closed.length ? totalPnl / closed.length : 0;

    const pnls = closed.map(t => Number(t.pnl_dollar) || 0);
    const bestTrade = pnls.length ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length ? Math.min(...pnls) : 0;

    return NextResponse.json({
      total_trades: closed.length,
      open_trades: open.length,
      wins: wins.length,
      losses: losses.length,
      win_rate: closed.length ? (wins.length / closed.length) * 100 : 0,
      total_pnl: totalPnl,
      avg_trade: avgTrade,
      best_trade: bestTrade,
      worst_trade: worstTrade,
    });
  } catch (error) {
    console.error('GET /api/trading/trades/stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
