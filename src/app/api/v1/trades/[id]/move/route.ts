import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTrade, moveTrade } from '@/lib/database';

function canEditTrade(trade: any, board: any, userId: number) {
  if (!trade || !board) return false;
  if (trade.created_by === userId) return true;
  if (board.owner_id === userId) return true;
  if (board.user_role === 'admin') return true;
  return false;
}

const KRAKEN_CLOSE_ERROR =
  'Kraken trades must be closed via /api/trading/trade/exit which sells on Kraken first. Direct column moves are not allowed for exchange-linked trades.';

function parseTradeMetadata(metadata: any) {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
}

function isKrakenLinkedTrade(metadata: any) {
  const exchange = metadata?.exchange;
  return typeof exchange === 'string' && exchange.toLowerCase() === 'kraken';
}

function isClosingColumn(column: string) {
  return String(column).toLowerCase() === 'closed';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { column, actorType, actorName } = await request.json();
    if (!column || typeof column !== 'string') return NextResponse.json({ error: 'column required' }, { status: 400 });

    const trade = await getTrade(parseInt(id));
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!canEditTrade(trade, board, user.id)) {
      return NextResponse.json({ error: 'Only admins or the trade creator can move trades' }, { status: 403 });
    }

    const metadata = parseTradeMetadata(trade?.metadata);
    const isKrakenVerified = request.headers.get('x-kraken-verified')?.toLowerCase() === 'true';
    if (isClosingColumn(column) && isKrakenLinkedTrade(metadata) && !isKrakenVerified && !metadata?.kraken_exit_order_id) {
      return NextResponse.json({ error: KRAKEN_CLOSE_ERROR }, { status: 400 });
    }

    const updatedTrade = await moveTrade(
      parseInt(id), column,
      actorType || 'user', actorName || user.name || 'Unknown'
    );
    if (!updatedTrade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade: updatedTrade });
  } catch (e) {
    console.error('POST /trades/[id]/move error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
