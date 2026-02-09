import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createTrade, enterTrade, getBoard } from '@/lib/database';
import { getCurrentPrice } from '@/lib/price-service';

// POST /api/trading/trade/enter — open a paper trade
// Body: { boardId, symbol, side, amount, strategy?, bot_id? }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { boardId, symbol, side, amount, strategy, bot_id } = body;

    if (!boardId || !symbol || !side || !amount) {
      return NextResponse.json({ error: 'boardId, symbol, side, and amount required' }, { status: 400 });
    }

    const board = await getBoard(Number(boardId), user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    // Fetch current price
    const normalized = symbol.replace(/-/g, '/').toUpperCase();
    const pair = normalized.includes('/') ? normalized : `${normalized}/USDT`;
    const snapshot = await getCurrentPrice(pair);
    const currentPrice = snapshot.price;
    const quantity = Number(amount) / currentPrice;

    // Create the trade
    const trade = await createTrade(Number(boardId), user.id, {
      coin_pair: pair,
      direction: side,
      current_price: currentPrice,
      position_size: Number(amount),
      confidence_score: body.confidence ?? null,
      bot_id: bot_id ?? null,
      notes: strategy ? `Strategy: ${strategy}` : null,
      status: 'watching',
      column_name: 'Watchlist',
    });

    // Enter the trade (deducts from paper balance)
    const entered = await enterTrade(trade.id, currentPrice, user.id);

    return NextResponse.json({
      trade: entered,
      entry_price: currentPrice,
      quantity,
      amount: Number(amount),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PAPER_BALANCE') {
      return NextResponse.json({ error: 'Insufficient paper balance' }, { status: 400 });
    }
    console.error('POST /api/trading/trade/enter error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
