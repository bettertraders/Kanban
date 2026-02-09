import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createTrade, getTradesForBoard, getBoard, pool } from '@/lib/database';

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
    const { boardId, ...data } = body ?? {};
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
    const numericFields = ['entry_price', 'current_price', 'exit_price', 'stop_loss', 'take_profit', 'position_size', 'rsi_value', 'confidence_score', 'pnl_dollar', 'pnl_percent'];
    for (const field of numericFields) {
      if (!isValidNumber(data[field])) {
        return NextResponse.json({ error: `${field} must be a number` }, { status: 400 });
      }
    }

    const board = await getBoard(boardIdNumber, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const normalizedPair = normalizePair(String(data.coin_pair));
    const normalizedDirection = normalizeDirection(data.direction);

    const duplicateResult = await pool.query(
      `SELECT COUNT(*)::int as count FROM trades WHERE board_id = $1 AND UPPER(coin_pair) = $2`,
      [boardIdNumber, normalizedPair.toUpperCase()]
    );
    const duplicateCount = Number(duplicateResult.rows[0]?.count || 0);

    const trade = await createTrade(boardIdNumber, user.id, {
      ...data,
      coin_pair: normalizedPair,
      direction: normalizedDirection ? normalizedDirection.toLowerCase() : data.direction
    });
    return NextResponse.json({ trade, warning: duplicateCount > 0 ? 'Duplicate coin on this board' : null }, { status: 201 });
  } catch (e) {
    console.error('POST /trades error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
