import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createTrade, getBoard } from '@/lib/database';
import { verifyOrder } from '@/lib/kraken-sync';

export const dynamic = 'force-dynamic';

function normalizePair(pair: string): string {
  return pair.replace(/-/g, '/').toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = Number(body?.board_id || body?.boardId);
    const symbol = normalizePair(body?.symbol || body?.pair || '');
    const side = String(body?.side || '').toLowerCase();
    const type = String(body?.type || 'market').toLowerCase();
    const amount = Number(body?.amount || 0);
    const price = body?.price != null ? Number(body.price) : undefined;

    if (!Number.isFinite(boardId) || !symbol || !side || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'board_id, symbol, side, and amount required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const { default: ccxt } = await import('ccxt');
    const apiKey = process.env.KRAKEN_API_KEY || '';
    const apiSecret = process.env.KRAKEN_API_SECRET || '';

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'Kraken API credentials not configured' }, { status: 500 });
    }

    const kraken = new ccxt.kraken({
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
    });

    const order = await kraken.createOrder(symbol, type, side, amount, price);
    const verification = await verifyOrder(String(order.id), symbol);

    if (!verification.eligible || !verification.order) {
      return NextResponse.json({ error: 'Order not filled', order }, { status: 409 });
    }

    const verified = verification.order;
    const entryPrice = Number(verified.average ?? verified.price ?? 0) || null;
    const filled = Number(verified.filled ?? 0);
    const positionSize = entryPrice && filled ? entryPrice * filled : null;

    const trade = await createTrade(boardId, user.id, {
      coin_pair: symbol,
      direction: side === 'sell' ? 'SHORT' : 'LONG',
      entry_price: entryPrice,
      current_price: entryPrice,
      position_size: positionSize,
      status: 'active',
      column_name: 'Active',
      metadata: {
        exchange: 'kraken',
        order_id: String(order.id),
        order_status: verified.status || null,
        order_filled: verified.filled ?? null,
        order_remaining: verified.remaining ?? null,
        order_symbol: verified.symbol || null,
      },
    });

    return NextResponse.json({ order, trade });
  } catch (error) {
    console.error('POST /api/trading/execute error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
