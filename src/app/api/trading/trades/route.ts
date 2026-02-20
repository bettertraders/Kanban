import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTradesForBoard, getBoard, updateTrade, getTrade, createTrade } from '@/lib/database';
import { verifyOrder, fetchKrakenOpenOrders } from '@/lib/kraken-sync';

const normalizeSide = (value: any) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim().toLowerCase();
  if (!str) return null;
  if (str === 'short') return 'sell';
  if (str === 'long') return 'buy';
  if (str === 'buy' || str === 'sell') return str;
  return null;
};

const isKrakenTrade = (trade: any) => {
  const metadata = trade?.metadata || {};
  if (metadata?.exchange && String(metadata.exchange).toLowerCase() === 'kraken') return true;
  if (metadata?.source && String(metadata.source).toLowerCase() === 'kraken') return true;
  if (metadata?.kraken_trade_id || metadata?.kraken_order_id) return true;
  return false;
};

const getKrakenOrderId = (trade: any) => {
  const metadata = trade?.metadata || {};
  return metadata?.kraken_order_id || metadata?.order_id || metadata?.orderId || null;
};

// GET /api/trading/trades?boardId=X&status=open|closed|all
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = Number(request.nextUrl.searchParams.get('boardId'));
    const statusFilter = request.nextUrl.searchParams.get('status') || 'all';

    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    let trades = await getTradesForBoard(boardId);

    if (statusFilter === 'open') {
      const openOrders = await fetchKrakenOpenOrders();
      const openOrderIds = new Set(openOrders.map((order) => String(order?.id)).filter(Boolean));
      trades = trades.filter((t) => {
        if (!(t.status === 'active' || t.column_name === 'Active')) return false;
        const orderId = getKrakenOrderId(t);
        return orderId && openOrderIds.has(String(orderId));
      });
    } else if (statusFilter === 'closed') {
      trades = trades.filter((t) => {
        const isClosed = t.status === 'closed' || t.column_name === 'Closed' || t.column_name === 'Wins' || t.column_name === 'Losses';
        if (!isClosed) return false;
        if (!isKrakenTrade(t)) return false;
        const side = normalizeSide(t?.metadata?.kraken_side || t?.metadata?.side || t?.metadata?.order_side || t?.direction);
        return side === 'sell';
      });
    }

    return NextResponse.json({ trades });
  } catch (error) {
    console.error('GET /api/trading/trades error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/trading/trades — create a new trade card
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = Number(body?.board_id);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'board_id required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const orderId = body?.order_id || body?.orderId || body?.orderID || null;
    const exchange = String(body?.exchange || body?.source || body?.metadata?.exchange || '').toLowerCase();
    const status = body?.status || 'watching';
    const columnName = body?.column_name || 'Watchlist';
    const isActive = String(status).toLowerCase() === 'active' || String(columnName) === 'Active';

    let orderDetails: any = null;
    if (orderId && (exchange === 'kraken' || !exchange) && isActive) {
      const verification = await verifyOrder(String(orderId), body?.coin_pair);
      if (!verification.eligible) {
        return NextResponse.json({ error: 'Order not filled', order: verification.order }, { status: 409 });
      }
      orderDetails = verification.order;
    }

    const metadata = {
      ...(body?.metadata || {}),
      ...(orderId ? {
        exchange: exchange || 'kraken',
        order_id: String(orderId),
        order_status: orderDetails?.status || null,
        order_filled: orderDetails?.filled ?? null,
        order_remaining: orderDetails?.remaining ?? null,
        order_symbol: orderDetails?.symbol || null,
      } : {})
    };

    const trade = await createTrade(boardId, user.id, {
      coin_pair: body.coin_pair || 'UNKNOWN',
      direction: body.direction || 'LONG',
      column_name: columnName,
      status,
      notes: body.notes || null,
      entry_price: body.entry_price || null,
      position_size: body.position_size || null,
      bot_id: body.bot_id || null,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });

    return NextResponse.json({ trade });
  } catch (error) {
    console.error('POST /api/trading/trades error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/trading/trades — update a trade (column_name, notes, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const tradeId = Number(body?.trade_id);
    if (!Number.isFinite(tradeId)) {
      return NextResponse.json({ error: 'trade_id required' }, { status: 400 });
    }

    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const allowed = ['column_name', 'coin_pair', 'notes', 'status', 'stop_loss', 'take_profit', 'priority', 'pause_reason', 'lesson_tag', 'current_price', 'tbo_signal', 'rsi_value', 'confidence_score', 'volume_assessment', 'macd_status', 'entry_price', 'position_size', 'direction', 'bot_id', 'exit_price', 'pnl_dollar', 'pnl_percent', 'metadata'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await updateTrade(tradeId, updates);
    return NextResponse.json({ trade: updated });
  } catch (error) {
    console.error('PATCH /api/trading/trades error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const tradeId = Number(searchParams.get('trade_id') || body?.trade_id);
    if (!Number.isFinite(tradeId)) {
      return NextResponse.json({ error: 'trade_id required' }, { status: 400 });
    }

    const { pool } = await import('@/lib/database');
    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    await pool.query('DELETE FROM trades WHERE id = $1', [tradeId]);
    return NextResponse.json({ deleted: true, trade_id: tradeId });
  } catch (error) {
    console.error('DELETE /api/trading/trades error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
