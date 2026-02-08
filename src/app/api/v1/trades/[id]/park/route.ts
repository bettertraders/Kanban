import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTrade, parkTrade } from '@/lib/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const tradeId = parseInt(id);

    if (!body.pause_reason) {
      return NextResponse.json({ error: 'pause_reason required' }, { status: 400 });
    }

    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const updatedTrade = await parkTrade(tradeId, body.pause_reason, user.id);
    if (!updatedTrade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade: updatedTrade });
  } catch (e) {
    if (e instanceof Error && e.message === 'PAUSE_REASON_REQUIRED') {
      return NextResponse.json({ error: 'pause_reason required' }, { status: 400 });
    }
    console.error('POST /trades/[id]/park error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
