import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getPaperAccount, resetPaperBalance } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardIdParam = request.nextUrl.searchParams.get('boardId');
    if (!boardIdParam) return NextResponse.json({ error: 'boardId required' }, { status: 400 });

    const boardId = Number(boardIdParam);
    if (!Number.isFinite(boardId)) return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const account = await getPaperAccount(boardId, user.id);
    return NextResponse.json({ account });
  } catch (e) {
    console.error('GET /paper-account error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = Number(body.boardId);
    if (!Number.isFinite(boardId)) return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const account = await resetPaperBalance(boardId, user.id);
    return NextResponse.json({ account });
  } catch (e) {
    console.error('PATCH /paper-account error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
