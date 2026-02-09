import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTrade, moveTrade } from '@/lib/database';

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
    const { column, actorType, actorName } = await request.json();
    if (!column || typeof column !== 'string') return NextResponse.json({ error: 'column required' }, { status: 400 });

    const trade = await getTrade(parseInt(id));
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!canEditTrade(trade, board, user.id)) {
      return NextResponse.json({ error: 'Only admins or the trade creator can move trades' }, { status: 403 });
    }

    const updatedTrade = await moveTrade(
      parseInt(id), column,
      actorType || 'user', actorName || user.name || 'Unknown'
    );
    if (!updatedTrade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade: updatedTrade });
  } catch (e) {
    console.error('POST /trades/[id]/move error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
