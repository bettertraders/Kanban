import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTradeJournalForUser, addJournalEntry, getTrade, getBoard } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : 200;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200;

    const entries = await getTradeJournalForUser(user.id, safeLimit);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('GET /trading/journal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/trading/journal — create a journal entry
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { trade_id, entry_type, content, mood } = body;

    if (!trade_id || !entry_type || !content) {
      return NextResponse.json({ error: 'trade_id, entry_type, and content required' }, { status: 400 });
    }

    const trade = await getTrade(Number(trade_id));
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const entry = await addJournalEntry(Number(trade_id), entry_type, content, mood || null, user.id);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('POST /trading/journal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
