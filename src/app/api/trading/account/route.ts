import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPaperAccount, getPortfolioStats, pool } from '@/lib/database';

// GET /api/trading/account?boardId=X — get paper balance and stats
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = Number(request.nextUrl.searchParams.get('boardId'));
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    const account = await getPaperAccount(boardId, user.id);
    const stats = await getPortfolioStats(user.id);

    return NextResponse.json({ account, stats });
  } catch (error) {
    console.error('GET /api/trading/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/trading/account — create paper account with initial balance
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = Number(body.boardId);
    const initialBalance = Number(body.initialBalance) || 10000;

    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    const account = await getPaperAccount(boardId, user.id, initialBalance);
    return NextResponse.json({ account });
  } catch (error) {
    console.error('POST /api/trading/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
