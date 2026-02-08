import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createTrade, getTradesForBoard, getBoard } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = request.nextUrl.searchParams.get('boardId');
    if (!boardId) return NextResponse.json({ error: 'boardId required' }, { status: 400 });

    const board = await getBoard(parseInt(boardId), user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const trades = await getTradesForBoard(parseInt(boardId));
    return NextResponse.json({ trades });
  } catch (e) {
    console.error('GET /trades error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { boardId, ...data } = body;
    if (!boardId || !data.coin_pair) {
      return NextResponse.json({ error: 'boardId and coin_pair required' }, { status: 400 });
    }

    const board = await getBoard(parseInt(boardId), user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const trade = await createTrade(parseInt(boardId), user.id, data);
    return NextResponse.json({ trade }, { status: 201 });
  } catch (e) {
    console.error('POST /trades error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
