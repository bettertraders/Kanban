import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { exitTrade, getBoard, getTrade } from '@/lib/database';

function canEditTrade(trade: any, board: any, userId: number) {
  if (!trade || !board) return false;
  if (trade.created_by === userId) return true;
  if (board.owner_id === userId) return true;
  if (board.user_role === 'admin') return true;
  return false;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const tradeId = parseInt(id);

    if (body.exit_price === undefined || body.exit_price === null) {
      return NextResponse.json({ error: 'exit_price required' }, { status: 400 });
    }
    if (typeof body.exit_price !== 'number') {
      return NextResponse.json({ error: 'exit_price must be a number' }, { status: 400 });
    }

    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!canEditTrade(trade, board, user.id)) {
      return NextResponse.json({ error: 'Only admins or the trade creator can exit trades' }, { status: 403 });
    }

    const updatedTrade = await exitTrade(tradeId, body.exit_price, body.lesson_tag ?? null, user.id);
    if (!updatedTrade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade: updatedTrade });
  } catch (e) {
    if (e instanceof Error && e.message === 'ENTRY_PRICE_REQUIRED') {
      return NextResponse.json({ error: 'entry_price required' }, { status: 400 });
    }
    if (e instanceof Error && e.message === 'EXIT_PRICE_REQUIRED') {
      return NextResponse.json({ error: 'exit_price required' }, { status: 400 });
    }
    console.error('POST /trades/[id]/exit error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
