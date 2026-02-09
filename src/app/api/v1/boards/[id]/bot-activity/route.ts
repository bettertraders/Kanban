import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getBotActivityForBoard } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const boardId = parseInt(id, 10);
    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    const activity = await getBotActivityForBoard(boardId, Number.isFinite(limit) ? limit : 20);
    return NextResponse.json({ activity });
  } catch (e) {
    console.error('GET /boards/[id]/bot-activity error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
