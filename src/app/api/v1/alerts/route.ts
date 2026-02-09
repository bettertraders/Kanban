import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createAlert, getAlertsForBoard, getBoard } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardIdParam = request.nextUrl.searchParams.get('boardId');
    const boardId = boardIdParam ? parseInt(boardIdParam, 10) : NaN;
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const alerts = await getAlertsForBoard(boardId);
    return NextResponse.json({ alerts });
  } catch (e) {
    console.error('GET /alerts error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = body.board_id ? parseInt(String(body.board_id), 10) : NaN;
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'board_id required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const tradeId = body.trade_id ? parseInt(String(body.trade_id), 10) : null;
    const alertType = String(body.alert_type || '').trim();
    if (!alertType) {
      return NextResponse.json({ error: 'alert_type required' }, { status: 400 });
    }

    const conditionValue = body.condition_value !== undefined && body.condition_value !== null
      ? parseFloat(String(body.condition_value))
      : null;
    const conditionOperator = body.condition_operator ? String(body.condition_operator) : null;
    const message = body.message ? String(body.message) : null;

    const alert = await createAlert(
      boardId,
      Number.isFinite(tradeId) ? tradeId : null,
      alertType,
      Number.isFinite(conditionValue ?? NaN) ? conditionValue : null,
      conditionOperator,
      message,
      user.id
    );

    return NextResponse.json({ alert });
  } catch (e) {
    console.error('POST /alerts error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
