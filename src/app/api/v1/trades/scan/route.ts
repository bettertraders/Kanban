import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, scanTrades } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = body.boardId ?? body.board_id;
    const scans = body.scans;

    if (!boardId) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    if (!Array.isArray(scans)) {
      return NextResponse.json({ error: 'scans array required' }, { status: 400 });
    }

    const board = await getBoard(parseInt(boardId), user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const trades = await scanTrades(parseInt(boardId), scans, user.id);
    return NextResponse.json({ trades });
  } catch (e) {
    console.error('POST /trades/scan error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
