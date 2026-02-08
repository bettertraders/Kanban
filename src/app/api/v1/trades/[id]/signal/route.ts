import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTrade, updateTradeSignals } from '@/lib/database';

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

    const signals = {
      tbo_signal: body.tbo_signal,
      rsi_value: body.rsi_value,
      macd_status: body.macd_status,
      volume_assessment: body.volume_assessment,
      confidence_score: body.confidence_score,
      current_price: body.current_price
    };

    const hasSignal = Object.values(signals).some((value) => value !== undefined);
    if (!hasSignal) {
      return NextResponse.json({ error: 'No signal fields provided' }, { status: 400 });
    }

    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const updatedTrade = await updateTradeSignals(tradeId, signals, user.id);
    if (!updatedTrade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade: updatedTrade });
  } catch (e) {
    console.error('POST /trades/[id]/signal error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
