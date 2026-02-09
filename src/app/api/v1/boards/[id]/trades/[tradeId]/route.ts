import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTrade, updateTrade } from '@/lib/database';

function canEditTrade(trade: any, board: any, userId: number) {
  if (!trade || !board) return false;
  if (trade.created_by === userId) return true;
  if (board.owner_id === userId) return true;
  if (board.user_role === 'admin') return true;
  return false;
}

function isValidCoinPair(value: unknown) {
  return typeof value === 'string' && value.includes('/');
}

function isValidDirection(value: unknown) {
  if (value === undefined || value === null || value === '') return true;
  const normalized = String(value).toUpperCase();
  return normalized === 'LONG' || normalized === 'SHORT';
}

function normalizeDirection(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).toUpperCase();
  return normalized === 'LONG' || normalized === 'SHORT' ? normalized : null;
}

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

function isValidNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return true;
  return Number.isFinite(Number(value));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tradeId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, tradeId } = await params;
    const board = await getBoard(parseInt(id), user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const trade = await getTrade(parseInt(tradeId));
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    if (trade.board_id !== board.id) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    if (!canEditTrade(trade, board, user.id)) {
      return NextResponse.json({ error: 'Only admins or the trade creator can edit trades' }, { status: 403 });
    }

    const body = await request.json();
    if (body.coin_pair !== undefined && !isValidCoinPair(body.coin_pair)) {
      return NextResponse.json({ error: 'coin_pair must contain "/"' }, { status: 400 });
    }
    if (!isValidDirection(body.direction)) {
      return NextResponse.json({ error: 'direction must be LONG or SHORT' }, { status: 400 });
    }
    const numericFields = ['entry_price', 'current_price', 'exit_price', 'stop_loss', 'take_profit', 'position_size', 'rsi_value', 'confidence_score', 'pnl_dollar', 'pnl_percent'];
    for (const field of numericFields) {
      if (!isValidNumber(body?.[field])) {
        return NextResponse.json({ error: `${field} must be a number` }, { status: 400 });
      }
    }
    if (body.coin_pair !== undefined) {
      body.coin_pair = normalizePair(String(body.coin_pair));
    }
    if (body.direction !== undefined) {
      const normalized = normalizeDirection(body.direction);
      if (normalized) {
        body.direction = normalized.toLowerCase();
      }
    }

    const updated = await updateTrade(parseInt(tradeId), body);
    if (!updated) return NextResponse.json({ error: 'Trade not found or no valid fields' }, { status: 404 });

    return NextResponse.json({ trade: updated });
  } catch (e) {
    console.error('PATCH /boards/[id]/trades/[tradeId] error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
