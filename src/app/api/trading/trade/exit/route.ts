import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { exitTrade, getBoard, getTrade } from '@/lib/database';
import { getCurrentPrice } from '@/lib/price-service';

// POST /api/trading/trade/exit — close a paper trade
// Body: { trade_id }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { trade_id } = body;

    if (!trade_id) {
      return NextResponse.json({ error: 'trade_id required' }, { status: 400 });
    }

    const trade = await getTrade(Number(trade_id));
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    // Fetch current price for exit
    const pair = trade.coin_pair;
    const snapshot = await getCurrentPrice(pair);
    const exitPrice = snapshot.price;

    const exited = await exitTrade(Number(trade_id), exitPrice, null, user.id);

    return NextResponse.json({
      trade: exited,
      exit_price: exitPrice,
      pnl_dollar: exited?.pnl_dollar,
      pnl_percent: exited?.pnl_percent,
    });
  } catch (error) {
    console.error('POST /api/trading/trade/exit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
