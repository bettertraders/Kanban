import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { addTradeComment, getBoard, getTrade, getTradeComments } from '@/lib/database';

// GET /api/v1/trades/:id/comments - Get comments for a trade
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tradeId = parseInt(id);
    const trade = await getTrade(tradeId);

    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const board = await getBoard(trade.board_id, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const comments = await getTradeComments(tradeId);
    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Error fetching trade comments:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

// POST /api/v1/trades/:id/comments - Add a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tradeId = parseInt(id);
    const trade = await getTrade(tradeId);

    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const board = await getBoard(trade.board_id, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const content = typeof body?.content === 'string' ? body.content.trim() : '';

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const comment = await addTradeComment(tradeId, user.id, content);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error('Error adding trade comment:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
