import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getBoardTradingStats, getEquityCurve } from '@/lib/database';

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

    const stats = await getBoardTradingStats(parseInt(id));
    const equityCurve = await getEquityCurve(parseInt(id));
    return NextResponse.json({ stats: { ...stats, equityCurve } });
  } catch (e) {
    console.error('GET /boards/[id]/stats error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
