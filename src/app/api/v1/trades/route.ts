import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createTrade, getTradesForBoard, getBoard } from '@/lib/database';

function isValidCoinPair(value: unknown) {
  return typeof value === 'string' && value.includes('/');
}

function isValidDirection(value: unknown) {
  if (value === undefined || value === null || value === '') return true;
  const normalized = String(value).toUpperCase();
  return normalized === 'LONG' || normalized === 'SHORT';
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = request.nextUrl.searchParams.get('boardId');
    if (!boardId) return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    const boardIdNumber = Number(boardId);
    if (!Number.isFinite(boardIdNumber)) return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });

    const board = await getBoard(boardIdNumber, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const trades = await getTradesForBoard(boardIdNumber);
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
    const boardIdNumber = Number(boardId);
    if (!Number.isFinite(boardIdNumber)) return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });
    if (!isValidCoinPair(data.coin_pair)) {
      return NextResponse.json({ error: 'coin_pair must contain "/"' }, { status: 400 });
    }
    if (!isValidDirection(data.direction)) {
      return NextResponse.json({ error: 'direction must be LONG or SHORT' }, { status: 400 });
    }

    const board = await getBoard(boardIdNumber, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const trade = await createTrade(boardIdNumber, user.id, data);
    return NextResponse.json({ trade }, { status: 201 });
  } catch (e) {
    console.error('POST /trades error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
