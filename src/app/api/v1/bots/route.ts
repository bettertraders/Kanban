import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createBot, getBoard, getBotsByBoard, getBotsByUser, getPaperAccount } from '@/lib/database';
import { getStrategy } from '@/lib/strategies';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = request.nextUrl.searchParams.get('boardId');
    if (boardId) {
      const boardIdNumber = Number(boardId);
      if (!Number.isFinite(boardIdNumber)) {
        return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });
      }
      const board = await getBoard(boardIdNumber, user.id);
      if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

      const bots = await getBotsByBoard(boardIdNumber);
      return NextResponse.json({ bots });
    }

    const bots = await getBotsByUser(user.id);
    return NextResponse.json({ bots });
  } catch (error) {
    console.error('GET /bots error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const name = normalizeString(body?.name);
    const boardId = Number(body?.board_id);
    const strategyStyle = normalizeString(body?.strategy_style);
    const strategySubstyle = normalizeString(body?.strategy_substyle);

    if (!name || !Number.isFinite(boardId) || !strategyStyle || !strategySubstyle) {
      return NextResponse.json({ error: 'name, board_id, strategy_style, strategy_substyle required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    if (board.board_type !== 'trading') {
      return NextResponse.json({ error: 'Bots can only be created on trading boards' }, { status: 400 });
    }

    const strategy = getStrategy(strategyStyle as any, strategySubstyle);
    if (!strategy) {
      return NextResponse.json({ error: 'Invalid strategy style/substyle' }, { status: 400 });
    }

    const bot = await createBot({
      name,
      board_id: boardId,
      user_id: user.id,
      strategy_style: strategyStyle,
      strategy_substyle: strategySubstyle,
      strategy_config: body?.strategy_config ?? strategy.defaultConfig,
      auto_trade: Boolean(body?.auto_trade),
      rebalancer_enabled: Boolean(body?.rebalancer_enabled),
      rebalancer_config: body?.rebalancer_config ?? {}
    });

    await getPaperAccount(boardId, user.id, 10000);

    return NextResponse.json({ bot }, { status: 201 });
  } catch (error) {
    console.error('POST /bots error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
