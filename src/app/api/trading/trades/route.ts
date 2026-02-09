import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTradesForBoard, getBoard } from '@/lib/database';

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
