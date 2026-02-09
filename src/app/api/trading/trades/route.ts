import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTradesForBoard, getBoard, updateTrade, getTrade } from '@/lib/database';

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

    const allowed = ['column_name', 'notes', 'status', 'stop_loss', 'take_profit', 'priority', 'pause_reason', 'lesson_tag'];
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
