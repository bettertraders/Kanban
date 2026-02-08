import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { enterTrade, getBoard, getTrade } from '@/lib/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const entryPrice = body.entry_price ?? null;
    const tradeId = parseInt(id);

    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const updatedTrade = await enterTrade(tradeId, entryPrice, user.id);
    if (!updatedTrade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade: updatedTrade });
  } catch (e) {
    if (e instanceof Error && e.message === 'ENTRY_PRICE_REQUIRED') {
      return NextResponse.json({ error: 'entry_price required' }, { status: 400 });
    }
    console.error('POST /trades/[id]/enter error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
