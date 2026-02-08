import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTradesForBoard, getTradingStats } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const board = await getBoard(parseInt(id), user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const includeStats = request.nextUrl.searchParams.get('stats') === 'true';
    const trades = await getTradesForBoard(parseInt(id));
    const response: Record<string, unknown> = { trades };

    if (includeStats) {
      response.stats = await getTradingStats(parseInt(id));
    }

    return NextResponse.json(response);
  } catch (e) {
    console.error('GET /boards/[id]/trades error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
