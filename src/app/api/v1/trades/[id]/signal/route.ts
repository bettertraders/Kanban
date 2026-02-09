import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTrade, updateTradeSignals } from '@/lib/database';

function canEditTrade(trade: any, board: any, userId: number) {
  if (!trade || !board) return false;
  if (trade.created_by === userId) return true;
  if (board.owner_id === userId) return true;
  if (board.user_role === 'admin') return true;
  return false;
}

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

    if (signals.confidence_score !== undefined && typeof signals.confidence_score !== 'number') {
      return NextResponse.json({ error: 'confidence_score must be a number' }, { status: 400 });
    }
    if (signals.rsi_value !== undefined && typeof signals.rsi_value !== 'number') {
      return NextResponse.json({ error: 'rsi_value must be a number' }, { status: 400 });
    }
    if (signals.current_price !== undefined && typeof signals.current_price !== 'number') {
      return NextResponse.json({ error: 'current_price must be a number' }, { status: 400 });
    }

    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!canEditTrade(trade, board, user.id)) {
      return NextResponse.json({ error: 'Only admins or the trade creator can update signals' }, { status: 403 });
    }

    const updatedTrade = await updateTradeSignals(tradeId, signals, user.id);
    if (!updatedTrade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade: updatedTrade });
  } catch (e) {
    console.error('POST /trades/[id]/signal error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
