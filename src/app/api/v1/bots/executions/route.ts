import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getRecentBotExecutionsForUser } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : 10;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10;

    const executions = await getRecentBotExecutionsForUser(user.id, safeLimit);
    return NextResponse.json({ executions });
  } catch (error) {
    console.error('GET /bots/executions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
