import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTradeJournalForUser } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : 200;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200;

    const entries = await getTradeJournalForUser(user.id, safeLimit);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('GET /trading/journal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
