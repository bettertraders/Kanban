import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTradesForBoard, getBoard, updateTrade, getTrade, createTrade } from '@/lib/database';

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
      trades = trades.filter(t => t.status === 'active' || t.column_name === 'Active');
    } else if (statusFilter === 'closed') {
      trades = trades.filter(t => t.status === 'closed' || t.column_name === 'Wins' || t.column_name === 'Losses');
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

    const trade = await createTrade(boardId, user.id, {
      coin_pair: body.coin_pair || 'UNKNOWN',
      direction: body.direction || 'LONG',
      column_name: body.column_name || 'Watchlist',
      status: body.status || 'watching',
      notes: body.notes || null,
      entry_price: body.entry_price || null,
      position_size: body.position_size || null,
      bot_id: body.bot_id || null,
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

    const allowed = ['column_name', 'notes', 'status', 'stop_loss', 'take_profit', 'priority', 'pause_reason', 'lesson_tag', 'current_price', 'tbo_signal', 'rsi_value', 'confidence_score', 'volume_assessment', 'macd_status', 'entry_price', 'position_size', 'direction', 'bot_id', 'exit_price', 'pnl_dollar', 'pnl_percent'];
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
