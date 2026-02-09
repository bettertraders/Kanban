import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { checkAlerts, getBoard } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = body.boardId ? parseInt(String(body.boardId), 10) : NaN;
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const prices = body.prices && typeof body.prices === 'object' ? body.prices : {};
    const triggered = await checkAlerts(boardId, prices);
    return NextResponse.json({ triggered });
  } catch (e) {
    console.error('POST /alerts/check error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
